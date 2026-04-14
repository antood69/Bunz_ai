/**
 * modelRouter.ts — Unified multi-provider AI chat interface.
 *
 * All AI calls go through modelRouter.chat(). Supports:
 * - Anthropic (Claude), OpenAI (GPT), Google (Gemini), Perplexity (Sonar), OpenRouter (300+)
 * - BYOK with encrypted keys
 * - AbortSignal for cancellation (kill switch)
 * - Provider fallback chains (auto-retry on 429/500/502/503)
 * - Streaming mode via async iterator
 * - Consistent Usage normalization across providers
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getFallbackChain } from "./modelDefaults";
import { decrypt } from "./crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  provider: string;
  costEstimate?: number;
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  stream?: boolean;
  signal?: AbortSignal;
  /** Encrypted BYOK key — will be decrypted before use */
  encryptedApiKey?: string;
  /** Provider hint for BYOK (if key doesn't match a known pattern) */
  providerHint?: string;
  /** Max tokens for response */
  maxTokens?: number;
}

export interface ChatResult {
  content: string;
  usage: Usage;
  fallbackUsed?: string; // If a fallback model was used, its name
  /** For image generation models — contains the base64 data URL or image URL */
  imageUrl?: string;
  /** Response type: "text" (default) or "image" */
  type?: "text" | "image";
}

export interface StreamChunk {
  text: string;
  done: boolean;
}

const SYSTEM_DEFAULT =
  "You are a focused AI agent inside Bunz, an AI orchestration platform. Be concise, action-oriented, and helpful.";

// ── Parameter Detection ──────────────────────────────────────────────────────

/**
 * Determines whether a model requires `max_completion_tokens` instead of `max_tokens`.
 * GPT-5.x and gpt-image models require this parameter.
 */
export function useMaxCompletionTokens(model: string): boolean {
  const m = model.includes("/") ? model.split("/").pop()! : model;
  return (
    m.startsWith("gpt-5") ||
    m.startsWith("gpt-image")
  );
}

// ── Provider Detection ────────────────────────────────────────────────────────

export type Provider = "anthropic" | "openai" | "google" | "perplexity" | "groq" | "mistral" | "openrouter";

const PROVIDER_PATTERNS: Array<{ test: (model: string) => boolean; provider: Provider }> = [
  { test: (m) => m.startsWith("claude-"), provider: "anthropic" },
  { test: (m) => m.startsWith("gpt-") || m.startsWith("gpt-image"), provider: "openai" },
  { test: (m) => m.startsWith("gemini-") || m.startsWith("gemma-") || m.startsWith("imagen-"), provider: "google" },
  { test: (m) => m.startsWith("sonar"), provider: "perplexity" },
  { test: (m) => m.startsWith("mistral-") || m.startsWith("ministral-") || m.startsWith("codestral-"), provider: "mistral" },
  // Groq models: bare llama-* IDs, openai/gpt-oss-*, meta-llama/llama-4-scout on Groq, qwen/qwen3-32b
  { test: (m) => m.startsWith("llama-") || m.startsWith("openai/gpt-oss") || m === "meta-llama/llama-4-scout-17b-16e-instruct" || m === "qwen/qwen3-32b", provider: "groq" },
];

export function detectProvider(model: string, hint?: string): Provider {
  if (hint && ["anthropic", "openai", "google", "perplexity", "groq", "mistral", "openrouter"].includes(hint)) {
    return hint as Provider;
  }
  for (const { test, provider } of PROVIDER_PATTERNS) {
    if (test(model)) return provider;
  }
  // Everything else routes through OpenRouter (Tier 2 gateway)
  return "openrouter";
}

// ── Client factories ──────────────────────────────────────────────────────────

function anthropicClient(apiKey?: string): Anthropic {
  return new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
}

function openaiClient(apiKey?: string): OpenAI {
  return new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY });
}

function perplexityClient(apiKey?: string): OpenAI {
  return new OpenAI({
    apiKey: apiKey || process.env.PERPLEXITY_API_KEY,
    baseURL: "https://api.perplexity.ai",
  });
}

function openrouterClient(apiKey?: string): OpenAI {
  return new OpenAI({
    apiKey: apiKey || process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://bunz.io",
      "X-Title": "Bunz",
    },
  });
}

function googleClient(apiKey?: string): GoogleGenerativeAI {
  const key = apiKey || process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_AI_KEY;
  if (!key) {
    throw new Error("Google AI API key not configured. Set GOOGLE_AI_API_KEY environment variable.");
  }
  return new GoogleGenerativeAI(key);
}

// ── Provider call implementations ─────────────────────────────────────────────

function isRetryableError(err: any): boolean {
  const status = err?.status || err?.statusCode || err?.response?.status;
  if ([429, 500, 502, 503].includes(status)) return true;
  if (err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND" || err?.code === "ETIMEDOUT") return true;
  const msg = String(err?.message || "").toLowerCase();
  if (msg.includes("rate limit") || msg.includes("overloaded") || msg.includes("service unavailable")) return true;
  return false;
}

// ── Image Model Detection ────────────────────────────────────────────────────

// All known image generation model ID prefixes (direct and OpenRouter)
const IMAGE_MODEL_PREFIXES = [
  "gpt-image",       // OpenAI direct: gpt-image-1, gpt-image-1-mini
  "imagen-",         // Google direct: imagen-3.0-generate-002
  "gpt-5-image",     // OpenRouter: openai/gpt-5-image, openai/gpt-5-image-mini
  "flux.",           // OpenRouter: black-forest-labs/flux.2-*
  "seedream-",       // OpenRouter: bytedance-seed/seedream-4.5
];

const IMAGE_MODEL_PATTERNS = [
  /gemini-.*-image/,  // OpenRouter: google/gemini-*-image-*
];

/** Checks if a model is an image generation model needing special API routing. */
export function isImageGenerationModel(model: string): boolean {
  const base = model.includes("/") ? model.split("/").pop()! : model;
  if (IMAGE_MODEL_PREFIXES.some(p => base.startsWith(p))) return true;
  if (IMAGE_MODEL_PATTERNS.some(p => p.test(base))) return true;
  return false;
}

// ── Image Generation Implementations ─────────────────────────────────────────

/** Call OpenAI v1/responses endpoint for gpt-image models. */
async function callOpenAIImage(opts: ChatOptions, apiKey?: string): Promise<ChatResult> {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI API key not configured");
  const lastUserMsg = [...opts.messages].reverse().find(m => m.role === "user");
  const prompt = lastUserMsg?.content || "";
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      input: prompt,
      tools: [{ type: "image_generation", quality: "medium", size: "1024x1024" }],
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI Responses API error (${res.status}): ${errBody}`);
  }
  const data = await res.json();
  let imageBase64 = "";
  if (data.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === "image_generation_call" && item.result) { imageBase64 = item.result; break; }
    }
  }
  if (!imageBase64) throw new Error("No image data in OpenAI Responses API response");
  return {
    content: prompt,
    type: "image",
    imageUrl: `data:image/png;base64,${imageBase64}`,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, model: opts.model, provider: "openai" },
  };
}

/** Call Google Imagen API for imagen-* models. */
async function callGoogleImagen(opts: ChatOptions, apiKey?: string): Promise<ChatResult> {
  const key = apiKey || process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_AI_KEY;
  if (!key) throw new Error("Google AI API key not configured");
  const lastUserMsg = [...opts.messages].reverse().find(m => m.role === "user");
  const prompt = lastUserMsg?.content || "";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:predict?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: "1:1" } }),
    }
  );
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Google Imagen API error (${res.status}): ${errBody}`);
  }
  const data = await res.json();
  let imageBase64 = "";
  if (data.predictions?.[0]?.bytesBase64Encoded) imageBase64 = data.predictions[0].bytesBase64Encoded;
  if (!imageBase64) throw new Error("No image data in Google Imagen API response");
  const mimeType = data.predictions[0].mimeType || "image/png";
  return {
    content: prompt,
    type: "image",
    imageUrl: `data:${mimeType};base64,${imageBase64}`,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, model: opts.model, provider: "google" },
  };
}

/** Call OpenRouter for image models — standard chat completions with image extraction. */
async function callOpenRouterImage(opts: ChatOptions, apiKey?: string): Promise<ChatResult> {
  const client = openrouterClient(apiKey);
  const lastUserMsg = [...opts.messages].reverse().find(m => m.role === "user");
  const prompt = lastUserMsg?.content || "";
  const response = await client.chat.completions.create({
    model: opts.model,
    max_tokens: opts.maxTokens || 4096,
    messages: [{ role: "user", content: prompt }],
  } as any);
  const content = response.choices[0]?.message?.content ?? "";
  const base64Match = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
  const urlMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
  const rawUrlMatch = !base64Match && !urlMatch ? content.match(/(https?:\/\/\S+\.(?:png|jpg|jpeg|webp|gif))/i) : null;
  const imageUrl = base64Match?.[0] || urlMatch?.[1] || rawUrlMatch?.[1] || "";
  if (imageUrl) {
    return {
      content: prompt, type: "image", imageUrl,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0, completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0),
        model: opts.model, provider: "openrouter",
      },
    };
  }
  return {
    content,
    usage: {
      promptTokens: response.usage?.prompt_tokens ?? 0, completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0),
      model: opts.model, provider: "openrouter",
    },
  };
}

async function callAnthropic(opts: ChatOptions, apiKey?: string): Promise<ChatResult> {
  const client = anthropicClient(apiKey);
  const system = opts.systemPrompt?.trim() || SYSTEM_DEFAULT;
  const msgs = opts.messages.map((m) => ({ role: m.role, content: m.content }));

  const response = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens || 4096,
    system,
    messages: msgs,
  });

  const block = response.content[0];
  const content = block.type === "text" ? block.text : "[No response]";

  return {
    content,
    usage: {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      model: opts.model,
      provider: "anthropic",
    },
  };
}

async function callOpenAI(opts: ChatOptions, apiKey?: string): Promise<ChatResult> {
  const client = openaiClient(apiKey);
  const system = opts.systemPrompt?.trim() || SYSTEM_DEFAULT;
  const tokens = opts.maxTokens || 4096;

  // Newer OpenAI models require max_completion_tokens instead of max_tokens
  const tokenParam = useMaxCompletionTokens(opts.model)
    ? { max_completion_tokens: tokens }
    : { max_tokens: tokens };

  const response = await client.chat.completions.create({
    model: opts.model,
    ...tokenParam,
    messages: [
      { role: "system", content: system },
      ...opts.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ],
  });

  return {
    content: response.choices[0]?.message?.content ?? "[No response]",
    usage: {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0),
      model: opts.model,
      provider: "openai",
    },
  };
}

async function callPerplexity(opts: ChatOptions, apiKey?: string): Promise<ChatResult> {
  const client = perplexityClient(apiKey);
  const system = opts.systemPrompt?.trim() || SYSTEM_DEFAULT;

  // Perplexity enforces strict user/assistant alternation — deduplicate
  const dedupedMsgs: ChatMessage[] = [];
  for (const m of opts.messages) {
    const last = dedupedMsgs[dedupedMsgs.length - 1];
    if (last && last.role === m.role) {
      last.content += "\n" + m.content;
    } else {
      dedupedMsgs.push({ ...m });
    }
  }
  if (dedupedMsgs[0]?.role === "assistant") dedupedMsgs.shift();

  const response = await client.chat.completions.create({
    model: opts.model.startsWith("sonar") ? opts.model : "sonar-pro",
    max_tokens: opts.maxTokens || 4096,
    messages: [
      { role: "system", content: system },
      ...dedupedMsgs.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ],
  } as any);

  return {
    content: (response as any).choices[0]?.message?.content ?? "[No response]",
    usage: {
      promptTokens: (response as any).usage?.prompt_tokens ?? 0,
      completionTokens: (response as any).usage?.completion_tokens ?? 0,
      totalTokens: ((response as any).usage?.prompt_tokens ?? 0) + ((response as any).usage?.completion_tokens ?? 0),
      model: opts.model,
      provider: "perplexity",
    },
  };
}

async function callGoogle(opts: ChatOptions, apiKey?: string): Promise<ChatResult> {
  const genAI = googleClient(apiKey);
  const system = opts.systemPrompt?.trim() || SYSTEM_DEFAULT;
  const genModel = genAI.getGenerativeModel({ model: opts.model, systemInstruction: system });

  const chatHistory = opts.messages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const lastMsg = opts.messages[opts.messages.length - 1];
  const chat = genModel.startChat({ history: chatHistory });
  const result = await chat.sendMessage(lastMsg?.content || "");
  const content = result.response.text();
  const usage = result.response.usageMetadata;

  return {
    content,
    usage: {
      promptTokens: usage?.promptTokenCount ?? 0,
      completionTokens: usage?.candidatesTokenCount ?? 0,
      totalTokens: (usage?.promptTokenCount ?? 0) + (usage?.candidatesTokenCount ?? 0),
      model: opts.model,
      provider: "google",
    },
  };
}

function groqClient(apiKey?: string): OpenAI {
  return new OpenAI({
    apiKey: apiKey || process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });
}

function mistralClient(apiKey?: string): OpenAI {
  return new OpenAI({
    apiKey: apiKey || process.env.MISTRAL_API_KEY,
    baseURL: "https://api.mistral.ai/v1",
  });
}

async function callGroq(opts: ChatOptions, apiKey?: string): Promise<ChatResult> {
  const client = groqClient(apiKey);
  const system = opts.systemPrompt?.trim() || SYSTEM_DEFAULT;

  const response = await client.chat.completions.create({
    model: opts.model,
    max_completion_tokens: opts.maxTokens || 4096,
    messages: [
      { role: "system", content: system },
      ...opts.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ],
  } as any);

  return {
    content: response.choices[0]?.message?.content ?? "[No response]",
    usage: {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0),
      model: opts.model,
      provider: "groq",
    },
  };
}

async function callMistral(opts: ChatOptions, apiKey?: string): Promise<ChatResult> {
  const client = mistralClient(apiKey);
  const system = opts.systemPrompt?.trim() || SYSTEM_DEFAULT;

  const response = await client.chat.completions.create({
    model: opts.model,
    max_tokens: opts.maxTokens || 4096,
    messages: [
      { role: "system", content: system },
      ...opts.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ],
  } as any);

  return {
    content: response.choices[0]?.message?.content ?? "[No response]",
    usage: {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0),
      model: opts.model,
      provider: "mistral",
    },
  };
}

async function callOpenRouter(opts: ChatOptions, apiKey?: string): Promise<ChatResult> {
  const client = openrouterClient(apiKey);
  const system = opts.systemPrompt?.trim() || SYSTEM_DEFAULT;
  const tokens = opts.maxTokens || 4096;

  // OpenRouter uses OpenAI-compatible format — apply same max_completion_tokens logic
  const tokenParam = useMaxCompletionTokens(opts.model)
    ? { max_completion_tokens: tokens }
    : { max_tokens: tokens };

  const response = await client.chat.completions.create({
    model: opts.model,
    ...tokenParam,
    messages: [
      { role: "system", content: system },
      ...opts.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ],
  } as any);

  return {
    content: response.choices[0]?.message?.content ?? "[No response]",
    usage: {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0),
      model: opts.model,
      provider: "openrouter",
    },
  };
}

// ── Main Router ───────────────────────────────────────────────────────────────

async function callProvider(opts: ChatOptions): Promise<ChatResult> {
  // Resolve BYOK key
  let apiKey: string | undefined;
  if (opts.encryptedApiKey) {
    try {
      apiKey = decrypt(opts.encryptedApiKey);
    } catch (err) {
      console.error("[modelRouter] Failed to decrypt BYOK key:", err);
    }
  }

  const provider = detectProvider(opts.model, opts.providerHint);

  // Check for abort before calling
  if (opts.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  // Route image generation models to their dedicated endpoints
  if (isImageGenerationModel(opts.model)) {
    const base = opts.model.includes("/") ? opts.model.split("/").pop()! : opts.model;
    if (provider === "openrouter") {
      return callOpenRouterImage(opts, apiKey);
    } else if (base.startsWith("gpt-image") || base.startsWith("gpt-5-image")) {
      return callOpenAIImage(opts, apiKey);
    } else if (base.startsWith("imagen-")) {
      return callGoogleImagen(opts, apiKey);
    }
  }

  switch (provider) {
    case "anthropic":
      return callAnthropic(opts, apiKey);
    case "openai":
      return callOpenAI(opts, apiKey);
    case "perplexity":
      return callPerplexity(opts, apiKey);
    case "google":
      return callGoogle(opts, apiKey);
    case "groq":
      return callGroq(opts, apiKey);
    case "mistral":
      return callMistral(opts, apiKey);
    case "openrouter":
      return callOpenRouter(opts, apiKey);
    default:
      throw new Error(`Unknown provider for model: ${opts.model}`);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const modelRouter = {
  /**
   * Unified chat interface with provider fallback chains.
   * All workers/boss should use this.
   */
  async chat(opts: ChatOptions): Promise<ChatResult> {
    const fallbackChain = getFallbackChain(opts.model);
    const modelsToTry = [opts.model, ...fallbackChain.slice(0, 2)]; // max 2 fallbacks
    let lastError: any;

    for (let i = 0; i < modelsToTry.length; i++) {
      const currentModel = modelsToTry[i];
      try {
        if (opts.signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }

        const result = await callProvider({ ...opts, model: currentModel });

        if (i > 0) {
          // Fallback was used
          console.log(`[modelRouter] Fallback: ${opts.model} → ${currentModel} (attempt ${i + 1})`);
          result.fallbackUsed = currentModel;
        }

        return result;
      } catch (err: any) {
        lastError = err;

        // Don't retry on abort
        if (err?.name === "AbortError") throw err;

        // Only retry on retryable errors
        if (!isRetryableError(err) || i === modelsToTry.length - 1) {
          throw err;
        }

        console.warn(
          `[modelRouter] ${currentModel} failed (${err?.status || err?.message}), trying fallback ${modelsToTry[i + 1]}...`
        );
      }
    }

    throw lastError;
  },
};

// ── Backward-compatible wrapper ───────────────────────────────────────────────
// So existing code like runAgentChat() can be migrated incrementally

export async function runAgentChat(
  model: string,
  systemPrompt: string | null | undefined,
  history: ChatMessage[],
  userMessage: string,
  signal?: AbortSignal
): Promise<{ reply: string; inputTokens: number; outputTokens: number; totalTokens: number; type?: "text" | "image"; imageUrl?: string }> {
  const msgs: ChatMessage[] = [
    ...history.slice(-20),
    { role: "user", content: userMessage },
  ];

  // Map legacy/retired model names to current ones
  const modelMap: Record<string, string> = {
    "claude-sonnet": "claude-sonnet-4-6",
    "claude-opus": "claude-opus-4-6",
    "gpt-4o": "gpt-5.4",
    "gpt-4o-mini": "gpt-5.4-mini",
    "gpt-4.1": "gpt-5.4",
    "gpt-4.1-mini": "gpt-5.4-mini",
    "gpt-4.1-nano": "gpt-5.4-nano",
    "o3": "gpt-5.4",
    "o4-mini": "gpt-5.4-mini",
    "dall-e-3": "gpt-image-1",
    "dall-e-2": "gpt-image-1",
    "perplexity": "sonar-pro",
  };
  const resolvedModel = modelMap[model] || model;

  const result = await modelRouter.chat({
    model: resolvedModel,
    messages: msgs,
    systemPrompt: systemPrompt || undefined,
    signal,
  });

  return {
    reply: result.content,
    inputTokens: result.usage.promptTokens,
    outputTokens: result.usage.completionTokens,
    totalTokens: result.usage.totalTokens,
    type: result.type,
    imageUrl: result.imageUrl,
  };
}

export async function runAgentChatWithUserKey(
  model: string,
  systemPrompt: string | null | undefined,
  history: ChatMessage[],
  userMessage: string,
  encryptedApiKey?: string,
  providerHint?: string,
  signal?: AbortSignal
): Promise<{ reply: string; inputTokens: number; outputTokens: number; totalTokens: number; type?: "text" | "image"; imageUrl?: string }> {
  if (!encryptedApiKey) return runAgentChat(model, systemPrompt, history, userMessage, signal);

  const msgs: ChatMessage[] = [
    ...history.slice(-20),
    { role: "user", content: userMessage },
  ];

  const modelMap: Record<string, string> = {
    "claude-sonnet": "claude-sonnet-4-6",
    "claude-opus": "claude-opus-4-6",
    "gpt-4o": "gpt-5.4",
    "perplexity": "sonar-pro",
  };
  const resolvedModel = modelMap[model] || model;

  const result = await modelRouter.chat({
    model: resolvedModel,
    messages: msgs,
    systemPrompt: systemPrompt || undefined,
    encryptedApiKey,
    providerHint,
    signal,
  });

  return {
    reply: result.content,
    inputTokens: result.usage.promptTokens,
    outputTokens: result.usage.completionTokens,
    totalTokens: result.usage.totalTokens,
    type: result.type,
    imageUrl: result.imageUrl,
  };
}
