// ── AI Provider & Model Registry ─────────────────────────────────────────────
// Single source of truth for all providers and their available models.
// Used by ModelSelector, SettingsPage, and any page needing provider info.
// Last verified: April 13, 2026 — all model IDs confirmed against live APIs.

export type ModelType = "reasoning" | "general" | "fast" | "search" | "research" | "image";
export type ModelBadge = "reasoning" | "code" | "fast" | "cheap" | "vision" | "long-context" | "web-search" | "open-source" | "image" | "agentic" | "multimodal" | "edge" | "free";
export type CostTier = "$" | "$$" | "$$$" | "FREE";

export interface AIModel {
  id: string;
  name: string;
  type?: ModelType;
  context?: string;
  tier?: "flagship" | "standard" | "fast" | "legacy";
  badges?: ModelBadge[];
  costTier?: CostTier;
  featured?: boolean;
  /** If true, API calls use max_completion_tokens instead of max_tokens */
  useMaxCompletionTokens?: boolean;
}

export interface AIProvider {
  id: string;
  name: string;
  icon: string;
  description: string;
  keyPlaceholder: string;
  models: AIModel[];
  isTier2?: boolean; // OpenRouter — routes through gateway
}

export const AI_PROVIDERS: AIProvider[] = [
  // ── OpenAI Direct ──────────────────────────────────────────────────────────
  {
    id: "openai",
    name: "OpenAI",
    icon: "🟢",
    description: "GPT-5.4 and image generation models",
    keyPlaceholder: "sk-...",
    models: [
      // Chat / Reasoning
      { id: "gpt-5.4", name: "GPT-5.4", type: "reasoning", context: "1M", tier: "flagship", badges: ["reasoning", "code", "agentic"], costTier: "$$$", featured: true, useMaxCompletionTokens: true },
      { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", type: "reasoning", context: "400K", tier: "standard", badges: ["reasoning", "fast", "code"], costTier: "$$", featured: true, useMaxCompletionTokens: true },
      { id: "gpt-5.4-nano", name: "GPT-5.4 Nano", type: "fast", context: "400K", tier: "fast", badges: ["fast", "cheap"], costTier: "$", useMaxCompletionTokens: true },
      // Image Generation (Responses API only — NOT chat/completions)
      { id: "gpt-image-1", name: "GPT Image 1", type: "image", tier: "standard", badges: ["image"], costTier: "$$", useMaxCompletionTokens: true },
      { id: "gpt-image-1-mini", name: "GPT Image 1 Mini", type: "image", tier: "fast", badges: ["image", "cheap"], costTier: "$", useMaxCompletionTokens: true },
    ],
  },

  // ── Anthropic ──────────────────────────────────────────────────────────────
  {
    id: "anthropic",
    name: "Anthropic",
    icon: "🟠",
    description: "Claude Opus, Sonnet, and Haiku models",
    keyPlaceholder: "sk-ant-...",
    models: [
      { id: "claude-opus-4-6", name: "Claude Opus 4.6", type: "reasoning", context: "1M", tier: "flagship", badges: ["reasoning", "code", "agentic"], costTier: "$$$", featured: true },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", type: "general", context: "200K", tier: "standard", badges: ["reasoning", "code"], costTier: "$$", featured: true },
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", type: "fast", context: "200K", tier: "fast", badges: ["fast", "cheap"], costTier: "$", featured: true },
    ],
  },

  // ── Google AI ──────────────────────────────────────────────────────────────
  {
    id: "google",
    name: "Google AI",
    icon: "🔵",
    description: "Gemini 3.1 Pro, Flash, and Imagen models",
    keyPlaceholder: "AIza...",
    models: [
      // Chat / Reasoning
      { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", type: "reasoning", context: "1M", tier: "flagship", badges: ["reasoning", "agentic", "code"], costTier: "$$$", featured: true },
      { id: "gemini-3-flash", name: "Gemini 3 Flash", type: "fast", context: "1M", tier: "fast", badges: ["fast", "multimodal"], costTier: "$", featured: true },
      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite", type: "fast", context: "1M", tier: "fast", badges: ["fast", "cheap"], costTier: "$" },
      // Image Generation (Imagen API — separate predict endpoint)
      { id: "imagen-3.0-generate-002", name: "Imagen 3", type: "image", tier: "standard", badges: ["image"], costTier: "$$" },
    ],
  },

  // ── Groq (Ultra-fast inference) ────────────────────────────────────────────
  {
    id: "groq",
    name: "Groq",
    icon: "⚡",
    description: "Ultra-fast inference — GPT OSS, Llama, Qwen",
    keyPlaceholder: "gsk_...",
    models: [
      { id: "openai/gpt-oss-120b", name: "GPT OSS 120B", type: "general", context: "131K", tier: "flagship", badges: ["fast", "open-source"], costTier: "$", featured: true },
      { id: "openai/gpt-oss-20b", name: "GPT OSS 20B", type: "fast", context: "131K", tier: "fast", badges: ["fast", "cheap"], costTier: "$" },
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", type: "general", context: "131K", tier: "standard", badges: ["fast", "open-source"], costTier: "$" },
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", type: "fast", context: "131K", tier: "fast", badges: ["fast", "cheap"], costTier: "$" },
      { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout", type: "general", context: "131K", tier: "standard", badges: ["fast", "open-source"], costTier: "$" },
      { id: "qwen/qwen3-32b", name: "Qwen 3 32B", type: "general", context: "131K", tier: "standard", badges: ["open-source"], costTier: "$" },
    ],
  },

  // ── Mistral ────────────────────────────────────────────────────────────────
  {
    id: "mistral",
    name: "Mistral",
    icon: "🟣",
    description: "Mistral Large, Small, and Ministral models",
    keyPlaceholder: "...",
    models: [
      { id: "mistral-large-latest", name: "Mistral Large 3", type: "reasoning", context: "256K", tier: "flagship", badges: ["reasoning", "multimodal"], costTier: "$$" },
      { id: "mistral-small-2603", name: "Mistral Small 4", type: "general", context: "256K", tier: "standard", badges: ["code", "reasoning", "fast"], costTier: "$" },
      { id: "ministral-3b-latest", name: "Ministral 3B", type: "fast", context: "128K", tier: "fast", badges: ["fast", "cheap", "edge"], costTier: "$" },
    ],
  },

  // ── OpenRouter (Gateway) ───────────────────────────────────────────────────
  {
    id: "openrouter",
    name: "OpenRouter",
    icon: "🌐",
    description: "300+ models from all providers via gateway",
    keyPlaceholder: "sk-or-...",
    isTier2: true,
    models: [
      // ── Chat (via OpenRouter) ──
      { id: "openai/gpt-5.4", name: "GPT-5.4 (via OR)", type: "reasoning", context: "400K", tier: "flagship", badges: ["reasoning", "code"], costTier: "$$$", featured: true },
      { id: "anthropic/claude-sonnet-4-6", name: "Claude Sonnet 4.6 (via OR)", type: "general", context: "200K", tier: "standard", badges: ["reasoning", "code"], costTier: "$$" },
      { id: "google/gemini-3-flash", name: "Gemini 3 Flash (via OR)", type: "fast", context: "1M", tier: "fast", badges: ["fast"], costTier: "$" },
      { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B (via OR)", type: "general", context: "131K", tier: "standard", badges: ["open-source"], costTier: "$" },

      // ── Image Generation (via OpenRouter) — VERIFIED IDs ──
      { id: "openai/gpt-5-image", name: "GPT-5 Image", type: "image", tier: "flagship", badges: ["image"], costTier: "$$$", featured: true },
      { id: "openai/gpt-5-image-mini", name: "GPT-5 Image Mini", type: "image", tier: "standard", badges: ["image"], costTier: "$$" },
      { id: "google/gemini-2.5-flash-image", name: "Nano Banana", type: "image", tier: "fast", badges: ["image", "cheap"], costTier: "$" },
      { id: "google/gemini-3.1-flash-image-preview", name: "Nano Banana 2", type: "image", tier: "standard", badges: ["image"], costTier: "$$" },
      { id: "google/gemini-3-pro-image-preview", name: "Nano Banana Pro", type: "image", tier: "flagship", badges: ["image"], costTier: "$$$" },
      { id: "bytedance-seed/seedream-4.5", name: "Seedream 4.5", type: "image", tier: "standard", badges: ["image"], costTier: "$$" },
      { id: "black-forest-labs/flux.2-klein-4b", name: "FLUX.2 Klein 4B", type: "image", tier: "fast", badges: ["image", "fast", "cheap"], costTier: "$" },
      { id: "black-forest-labs/flux.2-flex", name: "FLUX.2 Flex", type: "image", tier: "standard", badges: ["image"], costTier: "$$" },
      { id: "black-forest-labs/flux.2-pro", name: "FLUX.2 Pro", type: "image", tier: "flagship", badges: ["image"], costTier: "$$$" },
      { id: "black-forest-labs/flux.2-max", name: "FLUX.2 Max", type: "image", tier: "flagship", badges: ["image"], costTier: "$$$" },

      // ── Open Source: Coding Specialists ──
      { id: "qwen/qwen3-coder", name: "Qwen3 Coder 480B", type: "reasoning", context: "262K", tier: "flagship", badges: ["code", "reasoning"], costTier: "$" },
      { id: "qwen/qwen3-coder:free", name: "Qwen3 Coder 480B (Free)", type: "reasoning", context: "262K", tier: "flagship", badges: ["code", "reasoning", "free"], costTier: "FREE" },
      { id: "qwen/qwen3-coder-next", name: "Qwen3 Coder Next", type: "fast", context: "262K", tier: "standard", badges: ["code", "fast"], costTier: "$" },
      { id: "mistralai/devstral-2512", name: "Devstral 2", type: "general", context: "262K", tier: "standard", badges: ["code", "agentic"], costTier: "$" },
      { id: "xiaomi/mimo-v2-flash", name: "MiMo-V2-Flash", type: "fast", context: "262K", tier: "fast", badges: ["code", "reasoning"], costTier: "$" },

      // ── Open Source: Reasoning / General ──
      { id: "qwen/qwen3.5-122b-a10b", name: "Qwen3.5 122B", type: "reasoning", context: "262K", tier: "flagship", badges: ["reasoning", "open-source"], costTier: "$" },
      { id: "qwen/qwen3.5-397b-a17b", name: "Qwen3.5 397B", type: "reasoning", context: "262K", tier: "flagship", badges: ["reasoning", "open-source"], costTier: "$$" },
      { id: "deepseek/deepseek-v3.2", name: "DeepSeek V3.2", type: "general", context: "164K", tier: "standard", badges: ["code", "open-source"], costTier: "$" },
      { id: "deepseek/deepseek-v3.2-speciale", name: "DeepSeek V3.2 Speciale", type: "reasoning", context: "164K", tier: "standard", badges: ["reasoning", "open-source"], costTier: "$" },
      { id: "deepseek/deepseek-r1-0528", name: "DeepSeek R1", type: "reasoning", context: "164K", tier: "flagship", badges: ["reasoning", "open-source"], costTier: "$" },
      { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick", type: "general", context: "1M", tier: "standard", badges: ["multimodal", "open-source"], costTier: "$" },
      { id: "meta-llama/llama-4-scout", name: "Llama 4 Scout", type: "fast", context: "328K", tier: "fast", badges: ["fast", "open-source"], costTier: "$" },
      { id: "nvidia/nemotron-3-super-120b-a12b", name: "Nemotron 3 Super", type: "general", context: "262K", tier: "flagship", badges: ["agentic", "open-source"], costTier: "$" },
      { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nemotron 3 Super (Free)", type: "general", context: "262K", tier: "flagship", badges: ["agentic", "open-source", "free"], costTier: "FREE" },
      { id: "xiaomi/mimo-v2-pro", name: "MiMo-V2-Pro", type: "reasoning", context: "1M", tier: "flagship", badges: ["reasoning", "code"], costTier: "$$" },

      // ── Open Source: Small / Fast / Free ──
      { id: "google/gemma-4-31b-it:free", name: "Gemma 4 31B (Free)", type: "general", context: "262K", tier: "standard", badges: ["multimodal", "open-source", "free"], costTier: "FREE" },
      { id: "google/gemma-4-26b-a4b-it:free", name: "Gemma 4 26B MoE (Free)", type: "general", context: "262K", tier: "standard", badges: ["open-source", "free"], costTier: "FREE" },
      { id: "qwen/qwen3-next-80b-a3b-instruct:free", name: "Qwen3 Next 80B (Free)", type: "general", context: "262K", tier: "standard", badges: ["agentic", "open-source", "free"], costTier: "FREE" },
      { id: "nvidia/nemotron-3-nano-30b-a3b:free", name: "Nemotron 3 Nano (Free)", type: "fast", context: "256K", tier: "fast", badges: ["agentic", "fast", "open-source", "free"], costTier: "FREE" },
      { id: "qwen/qwen3.5-9b", name: "Qwen3.5 9B", type: "fast", context: "256K", tier: "fast", badges: ["fast", "cheap", "edge"], costTier: "$" },
    ],
  },

  // ── Perplexity ─────────────────────────────────────────────────────────────
  {
    id: "perplexity",
    name: "Perplexity",
    icon: "🔍",
    description: "Sonar — real-time web search and deep research",
    keyPlaceholder: "pplx-...",
    models: [
      { id: "sonar", name: "Sonar", type: "search", context: "128K", tier: "standard", badges: ["web-search", "fast"], costTier: "$" },
      { id: "sonar-pro", name: "Sonar Pro", type: "search", context: "200K", tier: "flagship", badges: ["web-search"], costTier: "$$", featured: true },
      { id: "sonar-reasoning-pro", name: "Sonar Reasoning Pro", type: "reasoning", context: "128K", tier: "flagship", badges: ["reasoning", "web-search"], costTier: "$$" },
      { id: "sonar-deep-research", name: "Sonar Deep Research", type: "research", context: "128K", tier: "flagship", badges: ["web-search", "reasoning"], costTier: "$$$" },
    ],
  },

  // ── Ollama (Local) ─────────────────────────────────────────────────────────
  {
    id: "ollama",
    name: "Ollama (Local)",
    icon: "🏠",
    description: "Run models locally — no API key needed",
    keyPlaceholder: "http://localhost:11434",
    models: [
      { id: "qwen3:32b", name: "Qwen 3 32B", type: "general", context: "128K", tier: "flagship", badges: ["open-source"], costTier: "$" },
      { id: "qwen3:8b", name: "Qwen 3 8B", type: "fast", context: "128K", tier: "fast", badges: ["fast", "open-source"], costTier: "$" },
      { id: "llama3.1:70b", name: "Llama 3.1 70B", type: "general", context: "128K", tier: "flagship", badges: ["open-source"], costTier: "$" },
      { id: "llama3.1:8b", name: "Llama 3.1 8B", type: "general", context: "128K", tier: "standard", badges: ["open-source"], costTier: "$" },
      { id: "deepseek-r1:8b", name: "DeepSeek R1 8B", type: "reasoning", context: "128K", tier: "standard", badges: ["reasoning", "open-source"], costTier: "$" },
      { id: "codellama:34b", name: "Code Llama 34B", type: "general", context: "128K", tier: "standard", badges: ["code", "open-source"], costTier: "$" },
      { id: "mistral:7b", name: "Mistral 7B", type: "fast", context: "128K", tier: "fast", badges: ["fast", "open-source"], costTier: "$" },
    ],
  },
];

// Helper: check if a model is an image generation model
export function isImageModel(model: AIModel): boolean {
  return model.type === "image";
}

// Get all image generation models across all providers
export function getImageModels(): Array<{ provider: AIProvider; model: AIModel }> {
  const results: Array<{ provider: AIProvider; model: AIModel }> = [];
  for (const provider of AI_PROVIDERS) {
    for (const model of provider.models) {
      if (isImageModel(model)) results.push({ provider, model });
    }
  }
  return results;
}

// Featured models — top of the selector across all providers
export const FEATURED_MODELS: AIModel[] = [
  { id: "auto", name: "Auto (Smart Routing)", badges: ["reasoning"], costTier: "$", featured: true },
  ...AI_PROVIDERS.flatMap(p => p.models.filter(m => m.featured)),
];

// Badge display config
export const BADGE_CONFIG: Record<ModelBadge, { label: string; color: string }> = {
  reasoning: { label: "Reasoning", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  code: { label: "Code", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  fast: { label: "Fast", color: "bg-green-500/10 text-green-400 border-green-500/20" },
  cheap: { label: "Cheap", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  vision: { label: "Vision", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  "long-context": { label: "Long Context", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  "web-search": { label: "Web Search", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  "open-source": { label: "Open Source", color: "bg-gray-500/10 text-gray-400 border-gray-500/20" },
  image: { label: "Image", color: "bg-pink-500/10 text-pink-400 border-pink-500/20" },
  agentic: { label: "Agentic", color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
  multimodal: { label: "Multimodal", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  edge: { label: "Edge", color: "bg-teal-500/10 text-teal-400 border-teal-500/20" },
  free: { label: "Free", color: "bg-green-500/10 text-green-300 border-green-500/20" },
};

export const COST_TIER_CONFIG: Record<CostTier, { label: string; color: string }> = {
  "FREE": { label: "Free", color: "text-green-300" },
  "$": { label: "$", color: "text-green-400" },
  "$$": { label: "$$", color: "text-yellow-400" },
  "$$$": { label: "$$$", color: "text-orange-400" },
};

// Helper to get a flat list of model IDs for a provider
export function getModelsForProvider(providerId: string): string[] {
  const provider = AI_PROVIDERS.find(p => p.id === providerId);
  return provider ? provider.models.map(m => m.id) : [];
}

// Helper to get provider by ID
export function getProvider(providerId: string): AIProvider | undefined {
  return AI_PROVIDERS.find(p => p.id === providerId);
}

// Find a model across all providers
export function findModel(modelId: string): { provider: AIProvider; model: AIModel } | undefined {
  for (const provider of AI_PROVIDERS) {
    const model = provider.models.find(m => m.id === modelId);
    if (model) return { provider, model };
  }
  return undefined;
}
