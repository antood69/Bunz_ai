import { v4 as uuidv4 } from "uuid";
import { modelRouter, runAgentChat, runAgentChatWithUserKey } from "./ai";
import { isImageGenerationModel } from "./lib/modelRouter";
import { classifyTier } from "./lib/tierClassifier";
import { getDefaultModel } from "./lib/modelDefaults";
import { redis } from "./lib/redis";
import { type WorkerType } from "./queues";
import { storage } from "./storage";
import { collectIntelligence } from "./auth";
import { WORKER_PROMPTS } from "./workers/prompts";
import { runCoderAgent, CODER_SYSTEM_PROMPT, CODER_DEFAULT_MODEL } from "./agents/coder";
import { runArtAgent, ART_SYSTEM_PROMPT, ART_DEFAULT_MODEL } from "./agents/art";
import { runReasoningAgent, REASONING_SYSTEM_PROMPT, REASONING_DEFAULT_MODEL } from "./agents/reasoning";
import type { AgentType } from "./agents";

// ── Boss System Prompt ──────────────────────────────────────────────────────────

const BOSS_ROUTING_PROMPT = `You are The Boss, the central AI orchestrator for Bunz. You receive user requests and either handle them directly or delegate to specialist agents.

Available specialist agents (use the dispatch_to_agent function to delegate):
- coder: For any programming, code generation, debugging, refactoring, or technical tasks
- art: For image generation, visual content creation, design, illustrations
- reasoning: For complex analysis, math, logic, research, multi-step reasoning

DECISION RULES:
- Simple questions, greetings, definitions, quick answers → respond directly (do NOT call dispatch_to_agent)
- Coding tasks (write code, debug, review, refactor) → dispatch to coder
- Image/art requests (generate image, create logo, draw, design visual) → dispatch to art
- Complex analysis, math, logic, research → dispatch to reasoning
- For multi-part requests needing multiple specialists → call dispatch_to_agent multiple times

When dispatching, write a brief message to the user first (e.g. "Let me get my Coder agent on this...") then call the function.

When you receive agent results, present them clearly with attribution (e.g. "Here's what the Coder produced:" or "The Art agent generated this image:").

AVAILABLE TOOLS (legacy — for Fiverr):
- create_fiverr_order: Create a new Fiverr order
- list_fiverr_orders: List all Fiverr orders

TO USE FIVERR TOOLS: Include this JSON block:
\`\`\`json
{"action":"tool","tool":"create_fiverr_order","args":{"gigTitle":"...","buyerName":"...","specs":"...","dueDate":"YYYY-MM-DD","price":50}}
\`\`\`

ALSO AVAILABLE (legacy delegation for research/writing/analysis):
- researcher, coder (legacy), writer, analyst, reviewer, artgen, browser

TO USE LEGACY DELEGATION: Include this JSON block:
\`\`\`json
{"action":"delegate","workers":[{"type":"researcher","task":"Research the top 5 AI platforms"}]}
\`\`\`

PREFER using dispatch_to_agent for coder/art/reasoning tasks. Use legacy delegation only for researcher, writer, analyst, reviewer, browser tasks.`;

// ── OpenAI function calling schema for dispatch_to_agent ─────────────────────

const DISPATCH_FUNCTION = {
  name: "dispatch_to_agent",
  description: "Dispatch a task to a specialist agent. Use this when the user's request requires a specialist (coding, image generation, or complex reasoning).",
  parameters: {
    type: "object" as const,
    properties: {
      agent: {
        type: "string" as const,
        enum: ["coder", "art", "reasoning"],
        description: "Which specialist agent to use: coder for programming tasks, art for image generation, reasoning for complex analysis",
      },
      task: {
        type: "string" as const,
        description: "The specific task/instructions for the agent. Be detailed and include all relevant requirements.",
      },
      context: {
        type: "string" as const,
        description: "Any additional context from the conversation that helps the agent",
      },
    },
    required: ["agent", "task"],
  },
};

// ── Parse delegation from Boss response (legacy) ────────────────────────────────

interface DelegationPlan {
  workers: Array<{
    type: WorkerType;
    task: string;
    depends_on?: number;
  }>;
}

// ── Tool execution (legacy Fiverr tools) ─────────────────────────────────────

interface ToolCall {
  tool: string;
  args: Record<string, any>;
}

function parseToolCall(text: string): { toolCall: ToolCall | null; message: string } {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*?"action"\s*:\s*"tool"[\s\S]*?\})/);
  if (!jsonMatch) return { toolCall: null, message: text };

  try {
    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    if (parsed.action !== "tool" || !parsed.tool) return { toolCall: null, message: text };
    const message = text.slice(0, text.indexOf(jsonMatch[0])).trim() || "";
    return { toolCall: { tool: parsed.tool, args: parsed.args || {} }, message };
  } catch {
    return { toolCall: null, message: text };
  }
}

async function executeToolCall(toolCall: ToolCall, userId: number): Promise<string> {
  const { storage } = await import("./storage");

  if (toolCall.tool === "create_fiverr_order") {
    const { gigTitle, buyerName, specs, dueDate, price } = toolCall.args;
    const orderId = uuidv4();
    await storage.createFiverrOrderV2({
      id: orderId,
      userId,
      gigTitle: gigTitle || "Untitled Order",
      buyerName: buyerName || "Unknown",
      specs: specs || "",
      dueDate: dueDate || null,
      priceCents: Math.round((price || 0) * 100),
      status: "intake",
      createdAt: new Date().toISOString(),
    });
    return `Fiverr order created successfully!\n- **Order ID**: ${orderId}\n- **Gig**: ${gigTitle}\n- **Buyer**: ${buyerName}\n- **Price**: $${price || 0}\n- **Status**: intake\n\nThe order is now in the intake queue and ready for generation.`;
  }

  if (toolCall.tool === "list_fiverr_orders") {
    const orders = await storage.getFiverrOrdersV2(userId);
    if (!orders || orders.length === 0) return "No Fiverr orders found.";
    const lines = orders.slice(0, 20).map((o: any) =>
      `- **${o.gigTitle || "Untitled"}** (${o.status}) — ${o.buyerName || "N/A"} — $${((o.priceCents || 0) / 100).toFixed(2)}`
    );
    return `**Fiverr Orders** (${orders.length} total):\n${lines.join("\n")}`;
  }

  return `Unknown tool: ${toolCall.tool}`;
}

const VALID_WORKERS: WorkerType[] = ["researcher", "coder", "writer", "analyst", "reviewer", "artgen", "browser"];

function parseDelegation(text: string): { plan: DelegationPlan | null; planningMessage: string } {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*?"action"\s*:\s*"delegate"[\s\S]*?\})/);

  if (!jsonMatch) {
    return { plan: null, planningMessage: text };
  }

  try {
    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    if (parsed.action !== "delegate" || !Array.isArray(parsed.workers)) {
      return { plan: null, planningMessage: text };
    }

    for (const w of parsed.workers) {
      if (!VALID_WORKERS.includes(w.type) || !w.task) {
        return { plan: null, planningMessage: text };
      }
    }

    const planningMessage = text.slice(0, text.indexOf(jsonMatch[0])).trim() ||
      `I'm delegating this to my team. Stand by...`;

    return { plan: { workers: parsed.workers }, planningMessage };
  } catch {
    return { plan: null, planningMessage: text };
  }
}

// ── Publish SSE event ───────────────────────────────────────────────────────────

async function publishEvent(jobId: string, event: string, data: any) {
  await redis.publish(
    `job:${jobId}:tokens`,
    JSON.stringify({ event, data })
  );
}

// ── Compressed handoff (summarize if output > 4000 tokens) ──────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function compressIfNeeded(text: string, model: string, signal?: AbortSignal): Promise<string> {
  if (estimateTokens(text) <= 4000) return text;

  const result = await modelRouter.chat({
    model,
    messages: [{ role: "user", content: text }],
    systemPrompt: "Summarize the following text concisely, preserving all key facts, data points, and conclusions. Keep it under 1000 words.",
    signal,
  });
  return result.content;
}

// ── Active abort controllers for kill switch ──────────────────────────────────

const activeAbortControllers = new Map<string, AbortController>();

export function getActiveAbortController(conversationId: string): AbortController | undefined {
  return activeAbortControllers.get(conversationId);
}

export function cancelConversation(conversationId: string): boolean {
  const controller = activeAbortControllers.get(conversationId);
  if (controller) {
    controller.abort();
    activeAbortControllers.delete(conversationId);
    return true;
  }
  return false;
}

// ── Get custom agent config (user overrides for model/prompt) ────────────────

async function getAgentModel(userId: number, agentType: AgentType): Promise<string> {
  try {
    const config = await storage.getAgentConfig(userId, agentType);
    if (config?.model) return config.model;
  } catch {}

  switch (agentType) {
    case "coder": return CODER_DEFAULT_MODEL;
    case "art": return ART_DEFAULT_MODEL;
    case "reasoning": return REASONING_DEFAULT_MODEL;
    default: return "gpt-5.4-mini";
  }
}

async function getAgentSystemPrompt(userId: number, agentType: AgentType): Promise<string | undefined> {
  try {
    const config = await storage.getAgentConfig(userId, agentType);
    if (config?.systemPrompt) return config.systemPrompt;
  } catch {}
  return undefined;
}

// ── Function calling: call Boss with OpenAI function calling ──────────────────

interface FunctionCallResult {
  type: "direct" | "dispatch" | "tool_call" | "legacy_delegate";
  message: string;
  dispatches?: Array<{ agent: AgentType; task: string; context?: string }>;
  toolCall?: ToolCall;
  legacyDelegation?: DelegationPlan;
  bossTokens: number;
}

async function callBossWithFunctionCalling(
  model: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  message: string,
  encryptedApiKey?: string,
  provider?: string,
  signal?: AbortSignal,
): Promise<FunctionCallResult> {
  // Try OpenAI function calling for OpenAI/compatible models
  // For non-OpenAI models, fall back to text-based dispatch detection
  const isOpenAIModel = model.startsWith("gpt-") || model.startsWith("openai/");

  if (isOpenAIModel) {
    return callBossOpenAIFunctions(model, history, message, encryptedApiKey, signal);
  }

  // For Anthropic and other models, use text-based routing (existing approach)
  // but with enhanced prompt that mentions dispatch_to_agent
  return callBossTextBased(model, history, message, encryptedApiKey, provider, signal);
}

async function callBossOpenAIFunctions(
  model: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  message: string,
  encryptedApiKey?: string,
  signal?: AbortSignal,
): Promise<FunctionCallResult> {
  const OpenAI = (await import("openai")).default;
  const { decrypt } = await import("./lib/crypto");

  let apiKey: string | undefined;
  if (encryptedApiKey) {
    try { apiKey = decrypt(encryptedApiKey); } catch {}
  }
  const client = new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY });

  const messages: any[] = [
    { role: "system", content: BOSS_ROUTING_PROMPT },
    ...history.slice(-20).map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  const response = await client.chat.completions.create({
    model,
    max_completion_tokens: 2048,
    messages,
    tools: [{ type: "function", function: DISPATCH_FUNCTION }],
    tool_choice: "auto",
  }, { signal });

  const choice = response.choices[0];
  const bossTokens = (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0);
  const textContent = choice?.message?.content || "";
  const toolCalls = choice?.message?.tool_calls;

  // If there are function calls to dispatch_to_agent
  if (toolCalls && toolCalls.length > 0) {
    const dispatches: Array<{ agent: AgentType; task: string; context?: string }> = [];
    for (const tc of toolCalls) {
      if (tc.function.name === "dispatch_to_agent") {
        try {
          const args = JSON.parse(tc.function.arguments);
          dispatches.push({
            agent: args.agent as AgentType,
            task: args.task,
            context: args.context,
          });
        } catch {}
      }
    }

    if (dispatches.length > 0) {
      return {
        type: "dispatch",
        message: textContent || `Dispatching to ${dispatches.map(d => d.agent).join(", ")}...`,
        dispatches,
        bossTokens,
      };
    }
  }

  // Check for legacy tool calls (Fiverr)
  const { toolCall, message: toolMessage } = parseToolCall(textContent);
  if (toolCall) {
    return { type: "tool_call", message: toolMessage, toolCall, bossTokens };
  }

  // Check for legacy delegation
  const { plan, planningMessage } = parseDelegation(textContent);
  if (plan) {
    return { type: "legacy_delegate", message: planningMessage, legacyDelegation: plan, bossTokens };
  }

  // Direct answer
  return { type: "direct", message: textContent, bossTokens };
}

async function callBossTextBased(
  model: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  message: string,
  encryptedApiKey?: string,
  provider?: string,
  signal?: AbortSignal,
): Promise<FunctionCallResult> {
  // Enhanced prompt for text-based models that includes dispatch_to_agent JSON format
  const textBasedPrompt = BOSS_ROUTING_PROMPT + `

TO DISPATCH TO SPECIALIST AGENTS (preferred for coder/art/reasoning):
Include this JSON block in your response:
\`\`\`json
{"action":"dispatch","dispatches":[{"agent":"coder","task":"Write a Python function that...","context":"optional context"}]}
\`\`\`

You can dispatch to multiple agents:
\`\`\`json
{"action":"dispatch","dispatches":[{"agent":"coder","task":"..."},{"agent":"reasoning","task":"..."}]}
\`\`\``;

  const result = encryptedApiKey
    ? await runAgentChatWithUserKey(model, textBasedPrompt, history, message, encryptedApiKey, provider, signal)
    : await runAgentChat(model, textBasedPrompt, history, message, signal);

  const bossTokens = result.totalTokens;
  const text = result.reply;

  // Check for new dispatch format
  const dispatchMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*?"action"\s*:\s*"dispatch"[\s\S]*?\})/);
  if (dispatchMatch) {
    try {
      const parsed = JSON.parse(dispatchMatch[1] || dispatchMatch[0]);
      if (parsed.action === "dispatch" && Array.isArray(parsed.dispatches)) {
        const dispatches = parsed.dispatches.filter(
          (d: any) => ["coder", "art", "reasoning"].includes(d.agent) && d.task
        );
        if (dispatches.length > 0) {
          const planningMessage = text.slice(0, text.indexOf(dispatchMatch[0])).trim() ||
            `Dispatching to ${dispatches.map((d: any) => d.agent).join(", ")}...`;
          return {
            type: "dispatch",
            message: planningMessage,
            dispatches,
            bossTokens,
          };
        }
      }
    } catch {}
  }

  // Check for legacy tool calls (Fiverr)
  const { toolCall, message: toolMessage } = parseToolCall(text);
  if (toolCall) {
    return { type: "tool_call", message: toolMessage, toolCall, bossTokens };
  }

  // Check for legacy delegation
  const { plan, planningMessage } = parseDelegation(text);
  if (plan) {
    return { type: "legacy_delegate", message: planningMessage, legacyDelegation: plan, bossTokens };
  }

  return { type: "direct", message: text, bossTokens };
}

// ── Main Boss Chat Handler ──────────────────────────────────────────────────────

export interface BossChatInput {
  conversationId?: string;
  message: string;
  model?: string;
  userId: number;
  userEmail?: string;
  provider?: string;
  userKeyId?: string;
  encryptedApiKey?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface BossChatResult {
  conversationId: string;
  reply: string;
  jobId?: string;
  isDelegating: boolean;
  workers?: Array<{ type: string; task: string }>;
  /** New: specialist agent dispatches */
  agentDispatches?: Array<{ agent: string; task: string }>;
  tokenCount: number;
  tierInfo?: { tier: number; label: string; model: string; reason: string };
  /** For image generation responses */
  type?: "text" | "image";
  imageUrl?: string;
}

export async function handleBossChat(input: BossChatInput): Promise<BossChatResult> {
  const {
    message,
    userId,
    userEmail,
    provider,
    userKeyId,
    encryptedApiKey,
    history = [],
  } = input;

  let model = input.model || "gpt-5.4-mini";

  // ── 4-Tier Auto Routing ──────────────────────────────────────────────────
  let tierInfo: BossChatResult["tierInfo"];
  if (model === "auto") {
    const tier = classifyTier(message);
    model = tier.model;
    tierInfo = tier;
  }

  // Map legacy/retired model names to current ones
  const modelMap: Record<string, string> = {
    "claude-sonnet": "claude-sonnet-4-6",
    "claude-opus": "claude-opus-4-6",
    "gpt-4o": "gpt-5.4",
    "gpt-4o-mini": "gpt-5.4-mini",
    "gpt-4.1": "gpt-5.4",
    "gpt-4.1-mini": "gpt-5.4-mini",
    "gpt-4.1-nano": "gpt-5.4-nano",
    "dall-e-3": "gpt-image-1",
    "dall-e-2": "gpt-image-1",
    "perplexity": "sonar-pro",
  };
  model = modelMap[model] || model;

  // Create abort controller for kill switch
  const abortController = new AbortController();

  // ── Art request detection: force-dispatch to Art agent ─────────────────────
  // When the user asks for image generation but is on a text model,
  // skip the LLM routing and go straight to the Art agent.
  const ART_REQUEST_PATTERNS = [
    /\b(make|create|generate|draw|paint|design|render|produce|show me)\b.*\b(picture|image|photo|illustration|logo|icon|art|drawing|painting|portrait|poster|banner|thumbnail|avatar|wallpaper|visual|graphic|sketch)\b/i,
    /\b(picture|image|photo|illustration|logo|icon|art|drawing|painting|portrait|poster|banner|thumbnail|avatar|wallpaper|visual|graphic|sketch)\b.*\b(of|for|about|depicting|showing|featuring)\b/i,
  ];
  const looksLikeArtRequest = !isImageGenerationModel(model) && ART_REQUEST_PATTERNS.some(p => p.test(message));

  if (looksLikeArtRequest) {
    // Force delegation to Art agent instead of letting the LLM respond with text
    let conversationId = input.conversationId;
    if (!conversationId) {
      conversationId = uuidv4();
      await storage.createConversation({
        id: conversationId, userId, title: message.slice(0, 80),
        model, createdAt: Date.now(), updatedAt: Date.now(),
      });
    }
    activeAbortControllers.set(conversationId, abortController);

    await storage.createBossMessage({
      id: uuidv4(), conversationId, role: "user", content: message,
      tokenCount: 0, model: null, createdAt: Date.now(),
    });

    const parentJobId = uuidv4();
    await storage.createAgentJob({
      id: parentJobId, conversationId, userId, type: "boss" as any,
      status: "running", input: JSON.stringify({ message, dispatches: [{ agent: "art", task: message }] }),
      createdAt: Date.now(),
    });

    // Fire and forget — the delegation function handles SSE streaming
    executeAgentDispatches(
      parentJobId, conversationId, userId, model, message,
      [{ agent: "art" as AgentType, task: message }],
      abortController.signal,
    )
      .catch(err => {
        console.error("[Boss] Art force-dispatch failed:", err.message);
        publishEvent(parentJobId, "error", { error: err.message });
      })
      .finally(() => {
        activeAbortControllers.delete(conversationId);
      });

    return {
      conversationId,
      reply: "Dispatching to Art agent...",
      jobId: parentJobId,
      isDelegating: true,
      agentDispatches: [{ agent: "art", task: message }],
      tokenCount: 0,
      tierInfo,
    };
  }

  // ── Image model short-circuit ──────────────────────────────────────────────
  // Image models go directly to their API — no boss routing/delegation needed
  if (isImageGenerationModel(model)) {
    let conversationId = input.conversationId;
    if (!conversationId) {
      conversationId = uuidv4();
      await storage.createConversation({
        id: conversationId, userId, title: message.slice(0, 80),
        model, createdAt: Date.now(), updatedAt: Date.now(),
      });
    }
    await storage.createBossMessage({
      id: uuidv4(), conversationId, role: "user", content: message,
      tokenCount: 0, model: null, createdAt: Date.now(),
    });
    try {
      const result = await modelRouter.chat({
        model,
        messages: [{ role: "user", content: message }],
        encryptedApiKey,
        providerHint: provider,
        signal: abortController.signal,
      });
      const replyContent = result.type === "image"
        ? `Generated image for: "${message}"`
        : result.content;
      await storage.createBossMessage({
        id: uuidv4(), conversationId, role: "assistant", content: replyContent,
        tokenCount: result.usage.totalTokens, model, createdAt: Date.now(),
      });
      await storage.recordTokenUsage({
        userId, model, inputTokens: result.usage.promptTokens,
        outputTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens, endpoint: "boss_image",
      });
      const plan = await storage.getUserPlan(userId);
      if (plan) await storage.updateUserPlan(plan.id, { tokensUsed: plan.tokensUsed + result.usage.totalTokens });
      return {
        conversationId, reply: replyContent, isDelegating: false,
        tokenCount: result.usage.totalTokens, tierInfo,
        type: result.type, imageUrl: result.imageUrl,
      };
    } catch (err: any) {
      return {
        conversationId, reply: `Image generation failed: ${err.message}`,
        isDelegating: false, tokenCount: 0, tierInfo,
      };
    }
  }

  // Ensure conversation exists
  let conversationId = input.conversationId;
  if (!conversationId) {
    conversationId = uuidv4();
    await storage.createConversation({
      id: conversationId,
      userId,
      title: message.slice(0, 80),
      model,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  // Register abort controller for this conversation
  activeAbortControllers.set(conversationId, abortController);

  // Store user message
  await storage.createBossMessage({
    id: uuidv4(),
    conversationId,
    role: "user",
    content: message,
    tokenCount: 0,
    model: null,
    createdAt: Date.now(),
  });

  try {
    // Call Boss AI with function calling to decide: direct, dispatch, or legacy delegate
    const bossResult = await callBossWithFunctionCalling(
      model, history, message, encryptedApiKey, provider, abortController.signal
    );

    // Record Boss overhead tokens
    await storage.recordTokenUsage({
      userId,
      model,
      inputTokens: Math.floor(bossResult.bossTokens * 0.7), // estimate split
      outputTokens: Math.floor(bossResult.bossTokens * 0.3),
      totalTokens: bossResult.bossTokens,
      endpoint: "boss_routing",
    });

    // Update user plan
    const plan = await storage.getUserPlan(userId);
    if (plan) {
      await storage.updateUserPlan(plan.id, { tokensUsed: plan.tokensUsed + bossResult.bossTokens });
    }

    // Intelligence collection
    collectIntelligence({
      userId,
      userEmail,
      eventType: "boss_chat",
      model,
      inputData: JSON.stringify({ message }),
      outputData: JSON.stringify({ type: bossResult.type, reply: bossResult.message.substring(0, 2000) }),
      tokensUsed: bossResult.bossTokens,
    });

    // ── Handle Fiverr tool calls ──────────────────────────────────────────────
    if (bossResult.type === "tool_call" && bossResult.toolCall) {
      const toolResult = await executeToolCall(bossResult.toolCall, userId);
      const fullReply = bossResult.message ? `${bossResult.message}\n\n${toolResult}` : toolResult;

      await storage.createBossMessage({
        id: uuidv4(), conversationId, role: "assistant", content: fullReply,
        tokenCount: bossResult.bossTokens, model, createdAt: Date.now(),
      });

      activeAbortControllers.delete(conversationId);
      return { conversationId, reply: fullReply, isDelegating: false, tokenCount: bossResult.bossTokens, tierInfo };
    }

    // ── Handle new-style dispatch to specialist agents ───────────────────────
    if (bossResult.type === "dispatch" && bossResult.dispatches && bossResult.dispatches.length > 0) {
      // Store planning message
      await storage.createBossMessage({
        id: uuidv4(), conversationId, role: "assistant", content: bossResult.message,
        tokenCount: bossResult.bossTokens, model, createdAt: Date.now(),
      });

      // Create parent job for SSE tracking
      const parentJobId = uuidv4();
      await storage.createAgentJob({
        id: parentJobId, conversationId, userId, type: "boss",
        status: "running", input: JSON.stringify({ message, dispatches: bossResult.dispatches }),
        createdAt: Date.now(),
      });

      // Execute agent dispatches asynchronously
      executeAgentDispatches(
        parentJobId, conversationId, userId, model, message,
        bossResult.dispatches, abortController.signal
      )
        .catch((err) => {
          console.error("[Boss] Agent dispatch error:", err.message);
          publishEvent(parentJobId, "error", { error: err.message });
        })
        .finally(() => {
          activeAbortControllers.delete(conversationId);
        });

      return {
        conversationId,
        reply: bossResult.message,
        jobId: parentJobId,
        isDelegating: true,
        agentDispatches: bossResult.dispatches.map(d => ({ agent: d.agent, task: d.task })),
        tokenCount: bossResult.bossTokens,
        tierInfo,
      };
    }

    // ── Handle legacy worker delegation ──────────────────────────────────────
    if (bossResult.type === "legacy_delegate" && bossResult.legacyDelegation) {
      const delegation = bossResult.legacyDelegation;

      await storage.createBossMessage({
        id: uuidv4(), conversationId, role: "assistant", content: bossResult.message,
        tokenCount: bossResult.bossTokens, model, createdAt: Date.now(),
      });

      const parentJobId = uuidv4();
      await storage.createAgentJob({
        id: parentJobId, conversationId, userId, type: "boss",
        status: "running", input: JSON.stringify({ message, plan: delegation }),
        createdAt: Date.now(),
      });

      const workerJobIds: string[] = [];
      for (const w of delegation.workers) {
        const wJobId = uuidv4();
        workerJobIds.push(wJobId);
        await storage.createAgentJob({
          id: wJobId, conversationId, userId, type: w.type,
          status: "pending", input: JSON.stringify({ task: w.task }),
          parentJobId, createdAt: Date.now(),
        });
      }

      const levels = buildExecutionLevels(delegation.workers);

      executeWorkerFlow(parentJobId, conversationId, userId, model, message, delegation.workers, workerJobIds, levels, abortController.signal)
        .catch((err) => {
          console.error("[Boss] Flow execution error:", err.message);
          publishEvent(parentJobId, "error", { error: err.message });
        })
        .finally(() => {
          activeAbortControllers.delete(conversationId);
        });

      return {
        conversationId,
        reply: bossResult.message,
        jobId: parentJobId,
        isDelegating: true,
        workers: delegation.workers.map((w) => ({ type: w.type, task: w.task })),
        tokenCount: bossResult.bossTokens,
        tierInfo,
      };
    }

    // ── Direct answer ────────────────────────────────────────────────────────
    await storage.createBossMessage({
      id: uuidv4(), conversationId, role: "assistant", content: bossResult.message,
      tokenCount: bossResult.bossTokens, model, createdAt: Date.now(),
    });

    activeAbortControllers.delete(conversationId);
    return {
      conversationId,
      reply: bossResult.message,
      isDelegating: false,
      tokenCount: bossResult.bossTokens,
      tierInfo,
    };
  } catch (err: any) {
    activeAbortControllers.delete(conversationId);

    if (err?.name === "AbortError") {
      return { conversationId, reply: "Request cancelled.", isDelegating: false, tokenCount: 0, tierInfo };
    }
    throw err;
  }
}

// ── Execute specialist agent dispatches ──────────────────────────────────────

async function executeAgentDispatches(
  parentJobId: string,
  conversationId: string,
  userId: number,
  bossModel: string,
  originalMessage: string,
  dispatches: Array<{ agent: AgentType; task: string; context?: string }>,
  signal?: AbortSignal,
) {
  const outputs: Array<{ agent: AgentType; content: string; imageUrl?: string; type?: string; tokens: number }> = [];
  let totalTokens = 0;

  try {
    // Execute all dispatches in parallel
    const results = await Promise.all(
      dispatches.map(async (dispatch, idx) => {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

        const agentModel = await getAgentModel(userId, dispatch.agent);

        // Create job record
        const jobId = uuidv4();
        await storage.createAgentJob({
          id: jobId, conversationId, userId, type: dispatch.agent as any,
          status: "running", input: JSON.stringify({ task: dispatch.task }),
          parentJobId, createdAt: Date.now(),
        });

        // Publish progress
        await publishEvent(parentJobId, "progress", {
          workerType: dispatch.agent,
          workerIndex: idx,
          status: "running",
          message: `${dispatch.agent} agent is working on: ${dispatch.task.slice(0, 100)}`,
          model: agentModel,
        });

        const startTime = Date.now();

        try {
          let result: { content: string; usage: any; imageUrl?: string; type?: string };

          switch (dispatch.agent) {
            case "coder": {
              // Fetch GitHub token for real repo access
              let githubCtx: { token: string; repo: string } | undefined;
              try {
                const ghToken = await storage.getGitHubToken(userId);
                if (ghToken) {
                  // Try to extract repo from task/context (e.g. "owner/repo")
                  const repoMatch = (dispatch.task + " " + (dispatch.context || ""))
                    .match(/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/)?.[1];
                  if (repoMatch && repoMatch.includes("/")) {
                    githubCtx = { token: ghToken, repo: repoMatch };
                  }
                }
              } catch (e) {
                console.warn("[Boss] Failed to get GitHub token for coder:", e);
              }
              const r = await runCoderAgent({
                task: dispatch.task,
                context: dispatch.context,
                model: agentModel,
                signal,
                github: githubCtx,
                onProgress: async (event, data) => {
                  await publishEvent(parentJobId, "tool_use", {
                    workerType: "coder",
                    workerIndex: idx,
                    event,
                    ...data,
                  });
                },
              });
              // Include commit/PR info in the output
              let extraInfo = "";
              if (r.commits?.length) {
                extraInfo += "\n\n**Commits:**\n" + r.commits.map(c => `- [${c.sha.slice(0,7)}](${c.url}) ${c.message}`).join("\n");
              }
              if (r.pullRequests?.length) {
                extraInfo += "\n\n**Pull Requests:**\n" + r.pullRequests.map(pr => `- [#${pr.number}](${pr.url}) ${pr.title}`).join("\n");
              }
              result = { content: r.content + extraInfo, usage: r.usage };
              break;
            }
            case "art": {
              const r = await runArtAgent({
                task: dispatch.task,
                context: dispatch.context,
                model: agentModel,
                signal,
              });
              result = { content: r.content, usage: r.usage, imageUrl: r.imageUrl, type: r.type };
              break;
            }
            case "reasoning": {
              const r = await runReasoningAgent({
                task: dispatch.task,
                context: dispatch.context,
                model: agentModel,
                signal,
              });
              result = { content: r.content, usage: r.usage };
              break;
            }
            default:
              throw new Error(`Unknown agent type: ${dispatch.agent}`);
          }

          const durationMs = Date.now() - startTime;

          // Stream output tokens
          const chunks = chunkText(result.content, 30);
          for (const chunk of chunks) {
            await publishEvent(parentJobId, "token", {
              workerType: dispatch.agent,
              workerIndex: idx,
              text: chunk,
            });
          }

          // If it's an image, emit special image event
          if (result.imageUrl) {
            await publishEvent(parentJobId, "agent_image", {
              workerType: dispatch.agent,
              workerIndex: idx,
              imageUrl: result.imageUrl,
              prompt: dispatch.task,
            });
          }

          // Update job
          await storage.updateAgentJob(jobId, {
            status: "complete",
            output: JSON.stringify({ text: result.content, imageUrl: result.imageUrl, type: result.type }),
            tokenCount: result.usage.totalTokens,
            durationMs,
            completedAt: Date.now(),
          });

          // Record per-agent token usage
          await storage.recordTokenUsage({
            userId,
            model: result.usage.model || agentModel,
            inputTokens: result.usage.promptTokens,
            outputTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
            endpoint: `agent_${dispatch.agent}`,
          });

          await publishEvent(parentJobId, "step_complete", {
            workerType: dispatch.agent,
            workerIndex: idx,
            output: result.content.slice(0, 500),
            imageUrl: result.imageUrl,
            type: result.type,
            tokens: result.usage.totalTokens,
            durationMs,
            model: result.usage.model || agentModel,
          });

          return {
            agent: dispatch.agent,
            content: result.content,
            imageUrl: result.imageUrl,
            type: result.type,
            tokens: result.usage.totalTokens,
          };
        } catch (err: any) {
          const durationMs = Date.now() - startTime;

          await storage.updateAgentJob(jobId, {
            status: "failed",
            output: JSON.stringify({ error: err.message }),
            durationMs,
            completedAt: Date.now(),
          });

          await publishEvent(parentJobId, "step_complete", {
            workerType: dispatch.agent,
            workerIndex: idx,
            status: "error",
            error: err.message,
            durationMs,
          });

          return {
            agent: dispatch.agent,
            content: `[${dispatch.agent} agent error: ${err.message}]`,
            tokens: 0,
          };
        }
      })
    );

    for (const r of results) {
      outputs.push(r);
      totalTokens += r.tokens;
    }

    // ── Boss synthesis: combine all agent outputs ─────────────────────────

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    await publishEvent(parentJobId, "progress", {
      workerType: "boss",
      status: "synthesizing",
      message: "Boss is synthesizing the results...",
    });

    // Build synthesis with agent attribution
    const outputSummaries = outputs.map(o => {
      let summary = `--- ${o.agent.toUpperCase()} AGENT ---\n${o.content}`;
      if (o.imageUrl) {
        summary += `\n[Image generated: ${o.imageUrl.startsWith("data:") ? "base64 image data" : o.imageUrl}]`;
      }
      return summary;
    }).join("\n\n");

    const synthesisPrompt = `You are The Boss. Your specialist agents have completed their tasks. Present the results to the user.

USER'S ORIGINAL REQUEST:
${originalMessage}

AGENT RESULTS:
${outputSummaries}

Present each agent's output clearly with attribution. For code, keep it in code blocks. For images, mention they were generated. Be thorough but concise. Use markdown formatting.`;

    const synthesis = await modelRouter.chat({
      model: bossModel,
      messages: [{ role: "user", content: synthesisPrompt }],
      systemPrompt: WORKER_PROMPTS.boss,
      signal,
    });
    totalTokens += synthesis.usage.totalTokens;

    await storage.recordTokenUsage({
      userId,
      model: synthesis.usage.model,
      inputTokens: synthesis.usage.promptTokens,
      outputTokens: synthesis.usage.completionTokens,
      totalTokens: synthesis.usage.totalTokens,
      endpoint: "boss_synthesis",
    });

    // Stream synthesis tokens
    const chunks = chunkText(synthesis.content, 30);
    for (const chunk of chunks) {
      await publishEvent(parentJobId, "token", {
        workerType: "boss",
        text: chunk,
        isSynthesis: true,
      });
    }

    // Build final content that includes image URLs for the client
    let finalContent = synthesis.content;
    const imageOutputs = outputs.filter(o => o.imageUrl);
    if (imageOutputs.length > 0) {
      // Append image data as a hidden marker the client can parse
      const imageMarkers = imageOutputs.map(o =>
        `<!--agent-image:${o.imageUrl}-->`
      ).join("");
      finalContent += imageMarkers;
    }

    // Store final response
    await storage.createBossMessage({
      id: uuidv4(), conversationId, role: "assistant", content: finalContent,
      tokenCount: totalTokens, model: bossModel, createdAt: Date.now(),
    });

    await storage.updateAgentJob(parentJobId, {
      status: "complete",
      output: JSON.stringify({
        synthesis: synthesis.content,
        agentCount: dispatches.length,
        agentOutputs: outputs.map(o => ({ agent: o.agent, imageUrl: o.imageUrl, type: o.type })),
      }),
      tokenCount: totalTokens,
      completedAt: Date.now(),
    });

    const userPlan = await storage.getUserPlan(userId);
    if (userPlan) {
      await storage.updateUserPlan(userPlan.id, { tokensUsed: userPlan.tokensUsed + totalTokens });
    }

    await publishEvent(parentJobId, "complete", {
      synthesis: finalContent,
      totalTokens,
      agentCount: dispatches.length,
      agentOutputs: outputs.map(o => ({ agent: o.agent, imageUrl: o.imageUrl, type: o.type })),
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      await publishEvent(parentJobId, "cancelled", { message: "Cancelled by user", totalTokens });
      await storage.updateAgentJob(parentJobId, {
        status: "failed", output: JSON.stringify({ error: "Cancelled by user" }),
        completedAt: Date.now(),
      });
      return;
    }

    console.error("[Boss] Agent dispatch error:", err.message);
    await storage.updateAgentJob(parentJobId, {
      status: "failed", output: JSON.stringify({ error: err.message }),
      completedAt: Date.now(),
    });
    await publishEvent(parentJobId, "error", { error: err.message });
  }
}

// ── Execution levels (topological sort) — for legacy worker flow ─────────────

function buildExecutionLevels(
  workers: Array<{ type: WorkerType; task: string; depends_on?: number }>
): number[][] {
  const n = workers.length;
  const levels: number[][] = [];
  const completed = new Set<number>();

  let maxIter = n * 2;
  while (completed.size < n && maxIter > 0) {
    maxIter--;
    const ready: number[] = [];
    for (let i = 0; i < n; i++) {
      if (completed.has(i)) continue;
      const dep = workers[i].depends_on;
      if (dep === undefined || dep === null || completed.has(dep)) {
        ready.push(i);
      }
    }
    if (ready.length === 0) break;
    levels.push(ready);
    for (const idx of ready) completed.add(idx);
  }

  return levels;
}

// ── Execute the legacy worker flow asynchronously ────────────────────────────

async function executeWorkerFlow(
  parentJobId: string,
  conversationId: string,
  userId: number,
  model: string,
  originalMessage: string,
  workers: Array<{ type: WorkerType; task: string; depends_on?: number }>,
  workerJobIds: string[],
  levels: number[][],
  signal?: AbortSignal
) {
  const outputs: string[] = new Array(workers.length).fill("");
  let totalTokens = 0;

  try {
    for (const level of levels) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      const results = await Promise.all(
        level.map(async (idx) => {
          const w = workers[idx];
          const jobId = workerJobIds[idx];

          let context = "";
          if (w.depends_on !== undefined && w.depends_on !== null) {
            context = await compressIfNeeded(outputs[w.depends_on], model, signal);
          }

          const workerModel = getDefaultModel(w.type);

          await storage.updateAgentJob(jobId, { status: "running" });
          await publishEvent(parentJobId, "progress", {
            workerType: w.type,
            workerIndex: idx,
            status: "running",
            message: `${w.type} is working on: ${w.task.slice(0, 100)}`,
            model: workerModel,
          });

          const startTime = Date.now();
          const systemPrompt = WORKER_PROMPTS[w.type];
          const fullPrompt = context
            ? `${w.task}\n\nContext from previous steps:\n${context}`
            : w.task;

          const result = await modelRouter.chat({
            model: workerModel,
            messages: [{ role: "user", content: fullPrompt }],
            systemPrompt,
            signal,
          });

          const durationMs = Date.now() - startTime;

          if (result.fallbackUsed) {
            await publishEvent(parentJobId, "fallback", {
              workerType: w.type,
              workerIndex: idx,
              originalModel: workerModel,
              fallbackModel: result.fallbackUsed,
              reason: "Provider error — switched to fallback",
            });
          }

          const chunks = chunkText(result.content, 30);
          for (const chunk of chunks) {
            await publishEvent(parentJobId, "token", {
              workerType: w.type,
              workerIndex: idx,
              text: chunk,
            });
          }

          await storage.updateAgentJob(jobId, {
            status: "complete",
            output: JSON.stringify({ text: result.content }),
            tokenCount: result.usage.totalTokens,
            durationMs,
            completedAt: Date.now(),
          });

          await storage.recordTokenUsage({
            userId,
            model: result.usage.model,
            inputTokens: result.usage.promptTokens,
            outputTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
            endpoint: `boss_worker_${w.type}`,
          });

          await publishEvent(parentJobId, "step_complete", {
            workerType: w.type,
            workerIndex: idx,
            output: result.content.slice(0, 500),
            tokens: result.usage.totalTokens,
            durationMs,
            model: result.usage.model,
          });

          return { idx, output: result.content, tokens: result.usage.totalTokens };
        })
      );

      for (const r of results) {
        outputs[r.idx] = r.output;
        totalTokens += r.tokens;
      }
    }

    // ── Synthesis ─────────────────────────────────────────────────────────

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    await publishEvent(parentJobId, "progress", {
      workerType: "boss",
      status: "synthesizing",
      message: "Boss is synthesizing the results...",
    });

    const synthesisPrompt = `You are The Boss. Workers have completed their tasks. Synthesize the results into a cohesive, polished final response.

USER'S ORIGINAL REQUEST:
${originalMessage}

WORKER RESULTS:
${workers.map((w, i) => `--- ${w.type.toUpperCase()} (Task: ${w.task}) ---\n${outputs[i]}`).join("\n\n")}

Provide a well-structured final response combining all worker outputs. Use markdown formatting. Be thorough but concise.`;

    const synthesis = await modelRouter.chat({
      model,
      messages: [{ role: "user", content: synthesisPrompt }],
      systemPrompt: WORKER_PROMPTS.boss,
      signal,
    });
    totalTokens += synthesis.usage.totalTokens;

    await storage.recordTokenUsage({
      userId,
      model: synthesis.usage.model,
      inputTokens: synthesis.usage.promptTokens,
      outputTokens: synthesis.usage.completionTokens,
      totalTokens: synthesis.usage.totalTokens,
      endpoint: "boss_synthesis",
    });

    const chunks = chunkText(synthesis.content, 30);
    for (const chunk of chunks) {
      await publishEvent(parentJobId, "token", {
        workerType: "boss",
        text: chunk,
        isSynthesis: true,
      });
    }

    await storage.createBossMessage({
      id: uuidv4(), conversationId, role: "assistant", content: synthesis.content,
      tokenCount: totalTokens, model, createdAt: Date.now(),
    });

    await storage.updateAgentJob(parentJobId, {
      status: "complete",
      output: JSON.stringify({ synthesis: synthesis.content, workerCount: workers.length }),
      tokenCount: totalTokens,
      durationMs: Date.now() - (await storage.getAgentJob(parentJobId))!.createdAt,
      completedAt: Date.now(),
    });

    const plan = await storage.getUserPlan(userId);
    if (plan) {
      await storage.updateUserPlan(plan.id, { tokensUsed: plan.tokensUsed + totalTokens });
    }

    await publishEvent(parentJobId, "complete", {
      synthesis: synthesis.content,
      totalTokens,
      workerCount: workers.length,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      await publishEvent(parentJobId, "cancelled", { message: "Jobs cancelled by user", totalTokens });
      await storage.updateAgentJob(parentJobId, {
        status: "failed", output: JSON.stringify({ error: "Cancelled by user" }),
        completedAt: Date.now(),
      });
      return;
    }

    console.error("[Boss] Workflow error:", err.message);
    await storage.updateAgentJob(parentJobId, {
      status: "failed", output: JSON.stringify({ error: err.message }),
      completedAt: Date.now(),
    });
    await publishEvent(parentJobId, "error", { error: err.message });
  }
}

function chunkText(text: string, charsPerChunk: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += charsPerChunk) {
    chunks.push(text.slice(i, i + charsPerChunk));
  }
  return chunks;
}
