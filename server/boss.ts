/**
 * Boss AI — The central orchestrator. Refactored for v2.
 *
 * Changes from v1:
 * - 4 departments (Research, Coder, Artist, Writer) replace 3 agents + legacy workers
 * - Intelligence levels (entry/medium/max) replace model picker
 * - eventBus replaces Redis pub/sub (no more dropped SSE events)
 * - Prompt refinement: Boss rewrites user input into precise department prompts
 * - Stripped: legacy delegation, Fiverr tools, worker JSON formats
 */

import { v4 as uuidv4 } from "uuid";
import { modelRouter } from "./ai";
import { isImageGenerationModel } from "./lib/modelRouter";
import { eventBus } from "./lib/eventBus";
import { storage } from "./storage";
import {
  type DepartmentId, type IntelligenceLevel,
  INTELLIGENCE_TIERS, DEPARTMENTS, detectDepartments, estimateComplexity,
} from "./departments/types";
import { executeDepartment, type DepartmentTask, type DepartmentResult } from "./departments/executor";

// ── Boss System Prompt ──────────────────────────────────────────────────────

const BOSS_SYSTEM_PROMPT = `You are The Boss, the central AI orchestrator for Bunz. You receive user requests and either answer directly or delegate to specialist departments.

DEPARTMENTS:
- research: Web research, data gathering, analysis, fact-finding, comparisons
- coder: Programming, debugging, code review, GitHub operations, file access
- artist: Image generation, visual content, design, illustrations
- writer: Content creation, copywriting, documentation, emails, articles

DECISION RULES:
1. Simple questions, greetings, quick facts → answer directly (NO dispatch)
2. Tasks requiring specialist work → dispatch to the right department(s)
3. Multi-part requests → dispatch to MULTIPLE departments

WHEN DISPATCHING, respond with ONLY this JSON (no other text):
\`\`\`json
{
  "action": "dispatch",
  "departments": [
    {"id": "research", "task": "Detailed, precise task description for the research team"},
    {"id": "writer", "task": "Detailed, precise task description for the writing team"}
  ]
}
\`\`\`

CRITICAL — PROMPT REFINEMENT:
When writing the "task" for each department, DO NOT just copy the user's message. REWRITE it into a precise, detailed, AI-optimized prompt. Add specifics the user implied but didn't state. Example:

User says: "write me a blog about ai"
BAD task: "write a blog about ai"
GOOD task: "Write a 1200-word blog post about current AI trends in 2026. Structure: intro paragraph, 5-7 sections with h2 headers covering major developments (LLMs, agents, open source, enterprise adoption, regulation), conclusion with forward-looking statement. Tone: professional but accessible. Include specific company names and product references where relevant."

Always enhance vague requests into detailed, actionable prompts.`;

// ── Parse Boss dispatch decision ────────────────────────────────────────────

interface DispatchPlan {
  departments: Array<{ id: DepartmentId; task: string }>;
}

function parseDispatch(text: string): { plan: DispatchPlan | null; message: string } {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ||
    text.match(/(\{[\s\S]*?"action"\s*:\s*"dispatch"[\s\S]*?\})/);
  if (!jsonMatch) return { plan: null, message: text };

  try {
    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    if (parsed.action !== "dispatch" || !Array.isArray(parsed.departments)) {
      return { plan: null, message: text };
    }
    const validDepts: DepartmentId[] = ["research", "coder", "artist", "writer"];
    const departments = parsed.departments.filter(
      (d: any) => validDepts.includes(d.id) && d.task
    );
    if (departments.length === 0) return { plan: null, message: text };

    const planningMessage = text.slice(0, text.indexOf(jsonMatch[0])).trim() ||
      `Dispatching to ${departments.map((d: any) => d.id).join(", ")}...`;

    return { plan: { departments }, message: planningMessage };
  } catch {
    return { plan: null, message: text };
  }
}

// ── Active abort controllers ────────────────────────────────────────────────

const activeAbortControllers = new Map<string, AbortController>();

export function cancelConversation(conversationId: string): boolean {
  const controller = activeAbortControllers.get(conversationId);
  if (controller) {
    controller.abort();
    activeAbortControllers.delete(conversationId);
    return true;
  }
  return false;
}

// ── Main Boss Chat Handler ──────────────────────────────────────────────────

export interface BossChatInput {
  conversationId?: string;
  message: string;
  level?: IntelligenceLevel;
  userId: number;
  userEmail?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface BossChatResult {
  conversationId: string;
  reply: string;
  jobId?: string;
  isDelegating: boolean;
  departments?: Array<{ id: string; task: string }>;
  tokenCount: number;
  level: IntelligenceLevel;
  type?: "text" | "image";
  imageUrl?: string;
}

export async function handleBossChat(input: BossChatInput): Promise<BossChatResult> {
  const { message, userId, userEmail, history = [] } = input;
  const level: IntelligenceLevel = input.level || "medium";
  const tier = INTELLIGENCE_TIERS[level];
  const bossModel = tier.bossModel;
  const abortController = new AbortController();

  // ── Art request detection → skip Boss routing, go straight to Artist ────
  const ART_PATTERNS = [
    /\b(make|create|generate|draw|paint|design|render|produce|show me)\b.*\b(picture|image|photo|illustration|logo|icon|art|drawing|painting|portrait|poster|banner|thumbnail|avatar|wallpaper|visual|graphic|sketch)\b/i,
    /\b(picture|image|photo|illustration|logo|icon|art|drawing|painting)\b.*\b(of|for|about|depicting|showing|featuring)\b/i,
  ];
  const isArtRequest = ART_PATTERNS.some(p => p.test(message));

  if (isArtRequest) {
    return handleArtShortCircuit(input, level, abortController);
  }

  // ── Ensure conversation exists ─────────────────────────────────────────
  let conversationId = input.conversationId;
  if (!conversationId) {
    conversationId = uuidv4();
    await storage.createConversation({
      id: conversationId, userId, title: message.slice(0, 80),
      model: bossModel, createdAt: Date.now(), updatedAt: Date.now(),
    });
  }
  activeAbortControllers.set(conversationId, abortController);

  // Store user message
  await storage.createBossMessage({
    id: uuidv4(), conversationId, role: "user", content: message,
    tokenCount: 0, model: null, createdAt: Date.now(),
  });

  try {
    // ── Call Boss AI to decide: direct answer or dispatch ─────────────────
    const bossResult = await modelRouter.chat({
      model: bossModel,
      messages: [
        ...history.slice(-20).map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: message },
      ],
      systemPrompt: BOSS_SYSTEM_PROMPT,
      signal: abortController.signal,
    });

    const bossTokens = bossResult.usage.totalTokens;

    // Record Boss token usage
    await storage.recordTokenUsage({
      userId, model: bossModel,
      inputTokens: bossResult.usage.promptTokens,
      outputTokens: bossResult.usage.completionTokens,
      totalTokens: bossTokens, endpoint: "boss_routing",
    });

    // ── Try to parse dispatch ────────────────────────────────────────────
    const { plan, message: bossMessage } = parseDispatch(bossResult.content);

    if (plan && plan.departments.length > 0) {
      // ── DISPATCH MODE: send to departments ────────────────────────────
      await storage.createBossMessage({
        id: uuidv4(), conversationId, role: "assistant", content: bossMessage,
        tokenCount: bossTokens, model: bossModel, createdAt: Date.now(),
      });

      const parentJobId = uuidv4();
      await storage.createAgentJob({
        id: parentJobId, conversationId, userId, type: "boss" as any,
        status: "running",
        input: JSON.stringify({ message, departments: plan.departments }),
        createdAt: Date.now(),
      });

      // Execute departments asynchronously — results flow back via eventBus
      executeDepartments(parentJobId, conversationId, userId, level, message, plan.departments, abortController.signal)
        .catch(err => {
          console.error("[Boss] Department dispatch error:", err.message);
          eventBus.emit(parentJobId, "error", { error: err.message });
        })
        .finally(() => activeAbortControllers.delete(conversationId));

      return {
        conversationId, reply: bossMessage, jobId: parentJobId,
        isDelegating: true, departments: plan.departments,
        tokenCount: bossTokens, level,
      };
    }

    // ── DIRECT MODE: Boss answers directly ──────────────────────────────
    await storage.createBossMessage({
      id: uuidv4(), conversationId, role: "assistant", content: bossResult.content,
      tokenCount: bossTokens, model: bossModel, createdAt: Date.now(),
    });
    activeAbortControllers.delete(conversationId);

    return {
      conversationId, reply: bossResult.content,
      isDelegating: false, tokenCount: bossTokens, level,
    };

  } catch (err: any) {
    activeAbortControllers.delete(conversationId);
    if (err?.name === "AbortError") {
      return { conversationId, reply: "Request cancelled.", isDelegating: false, tokenCount: 0, level };
    }
    throw err;
  }
}

// ── Art Short-Circuit (skip Boss routing for obvious image requests) ─────────

async function handleArtShortCircuit(
  input: BossChatInput,
  level: IntelligenceLevel,
  abortController: AbortController,
): Promise<BossChatResult> {
  const { message, userId } = input;
  let conversationId = input.conversationId;
  if (!conversationId) {
    conversationId = uuidv4();
    await storage.createConversation({
      id: conversationId, userId, title: message.slice(0, 80),
      model: "gpt-image-1", createdAt: Date.now(), updatedAt: Date.now(),
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
    status: "running",
    input: JSON.stringify({ message, departments: [{ id: "artist", task: message }] }),
    createdAt: Date.now(),
  });

  executeDepartments(parentJobId, conversationId, userId, level, message,
    [{ id: "artist" as DepartmentId, task: message }], abortController.signal)
    .catch(err => {
      console.error("[Boss] Art dispatch error:", err.message);
      eventBus.emit(parentJobId, "error", { error: err.message });
    })
    .finally(() => activeAbortControllers.delete(conversationId));

  return {
    conversationId, reply: "Sending to the Artist department...",
    jobId: parentJobId, isDelegating: true,
    departments: [{ id: "artist", task: message }],
    tokenCount: 0, level,
  };
}

// ── Execute Departments (async, results flow via eventBus) ──────────────────

async function executeDepartments(
  parentJobId: string,
  conversationId: string,
  userId: number,
  level: IntelligenceLevel,
  originalMessage: string,
  departments: Array<{ id: DepartmentId; task: string }>,
  signal?: AbortSignal,
) {
  const bossModel = INTELLIGENCE_TIERS[level].bossModel;
  const complexity = estimateComplexity(originalMessage);
  let totalTokens = 0;
  const deptResults: DepartmentResult[] = [];

  try {
    // Get GitHub token for coder department
    let github: { token: string; repo: string } | undefined;
    if (departments.some(d => d.id === "coder")) {
      try {
        const ghToken = await storage.getGitHubToken(userId);
        if (ghToken) {
          const repoMatch = originalMessage.match(/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/)?.[1];
          if (repoMatch?.includes("/")) {
            github = { token: ghToken, repo: repoMatch };
          }
        }
      } catch {}
    }

    // Execute all departments in parallel
    const results = await Promise.all(
      departments.map(dept =>
        executeDepartment(parentJobId, { department: dept.id, task: dept.task }, level, complexity, signal,
          dept.id === "coder" ? github : undefined)
          .catch(err => {
            console.error(`[Boss] ${dept.id} department failed:`, err.message);
            return {
              department: dept.id, finalOutput: `[${dept.id} department error: ${err.message}]`,
              subAgentResults: [], totalTokens: 0, totalDurationMs: 0,
            } as DepartmentResult;
          })
      )
    );

    for (const r of results) {
      deptResults.push(r);
      totalTokens += r.totalTokens;
    }

    // ── Boss Synthesis: combine all department outputs ───────────────────
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    eventBus.emit(parentJobId, "progress", {
      workerType: "boss", status: "synthesizing", message: "Boss is synthesizing results...",
    });

    const outputSummaries = deptResults.map(r => {
      let summary = `--- ${r.department.toUpperCase()} DEPARTMENT ---\n${r.finalOutput}`;
      if (r.imageUrl) summary += `\n[Image generated]`;
      return summary;
    }).join("\n\n");

    const synthesisPrompt = `You are The Boss. Your departments have completed their work. Present the results to the user.

USER'S ORIGINAL REQUEST:
${originalMessage}

DEPARTMENT RESULTS:
${outputSummaries}

Present each department's output clearly. For code, keep it in code blocks. For images, mention they were generated. Be thorough but concise. Use markdown.`;

    const synthesis = await modelRouter.chat({
      model: bossModel,
      messages: [{ role: "user", content: synthesisPrompt }],
      systemPrompt: "You are The Boss — synthesize department outputs into a polished final response.",
      signal,
    });
    totalTokens += synthesis.usage.totalTokens;

    // Record synthesis tokens
    await storage.recordTokenUsage({
      userId, model: bossModel,
      inputTokens: synthesis.usage.promptTokens,
      outputTokens: synthesis.usage.completionTokens,
      totalTokens: synthesis.usage.totalTokens,
      endpoint: "boss_synthesis",
    });

    // Stream synthesis to client
    const chunks = chunkText(synthesis.content, 30);
    for (const chunk of chunks) {
      eventBus.emit(parentJobId, "token", { workerType: "boss", text: chunk, isSynthesis: true });
    }

    // Build final content with image markers
    let finalContent = synthesis.content;
    const imageResults = deptResults.filter(r => r.imageUrl);
    if (imageResults.length > 0) {
      finalContent += imageResults.map(r => `<!--agent-image:${r.imageUrl}-->`).join("");
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
        departmentCount: departments.length,
        departments: deptResults.map(r => ({ id: r.department, imageUrl: r.imageUrl, type: r.type })),
      }),
      tokenCount: totalTokens, completedAt: Date.now(),
    });

    // Update user plan tokens
    const plan = await storage.getUserPlan(userId);
    if (plan) await storage.updateUserPlan(plan.id, { tokensUsed: plan.tokensUsed + totalTokens });

    // ── Emit completion ─────────────────────────────────────────────────
    eventBus.emit(parentJobId, "complete", {
      synthesis: finalContent, totalTokens,
      departmentCount: departments.length,
      departments: deptResults.map(r => ({ id: r.department, imageUrl: r.imageUrl, type: r.type })),
    });

  } catch (err: any) {
    if (err?.name === "AbortError") {
      eventBus.emit(parentJobId, "cancelled", { message: "Cancelled by user", totalTokens });
      await storage.updateAgentJob(parentJobId, {
        status: "failed", output: JSON.stringify({ error: "Cancelled" }), completedAt: Date.now(),
      });
      return;
    }
    console.error("[Boss] Department execution error:", err.message);
    await storage.updateAgentJob(parentJobId, {
      status: "failed", output: JSON.stringify({ error: err.message }), completedAt: Date.now(),
    });
    eventBus.emit(parentJobId, "error", { error: err.message });
  }
}

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}
