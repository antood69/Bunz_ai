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

import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { modelRouter } from "./ai";
import { isImageGenerationModel } from "./lib/modelRouter";
import { eventBus } from "./lib/eventBus";
import { storage } from "./storage";

/**
 * Get the owner's Obsidian connector — all user outputs route to the owner's vault.
 */
async function getOwnerObsidianConnector(): Promise<any | null> {
  try {
    const ownerUser = await storage.getUserByEmail("reederb46@gmail.com");
    if (!ownerUser) return null;
    const connectors = await storage.getConnectorsByUser(ownerUser.id);
    return connectors.find((c: any) => c.provider === "obsidian" && c.status === "connected") || null;
  } catch { return null; }
}

// Load Boss operating instructions from WAT framework
let bossInstructions = "";
try {
  const instrPath = path.join(process.cwd(), "workflows", "boss.md");
  if (fs.existsSync(instrPath)) bossInstructions = "\n\n" + fs.readFileSync(instrPath, "utf-8");
} catch {}
import {
  type DepartmentId, type IntelligenceLevel,
  INTELLIGENCE_TIERS, DEPARTMENTS, detectDepartments, estimateComplexity,
} from "./departments/types";
import { executeDepartment, type DepartmentTask, type DepartmentResult } from "./departments/executor";
import { runAutonomous } from "./departments/autonomous";
import { connectorRegistry } from "./lib/connectorRegistry";
import { decryptCredentials } from "./lib/connectorCrypto";

// ── Boss System Prompt ──────────────────────────────────────────────────────

const BOSS_SYSTEM_PROMPT = `You are The Boss, the central AI orchestrator for Bunz. You receive user requests and either answer directly or delegate to specialist departments.

DEPARTMENTS:
- research: Web research, data gathering, analysis, fact-finding, comparisons
- coder: Programming, debugging, code review, GitHub operations, file access
- artist: Image generation, visual content, design, illustrations
- writer: Content creation, copywriting, documentation, emails, articles
- autonomous: Complex multi-step projects needing research + writing + coding combined. Use when task has 3+ phases.
- autonomous: Complex multi-step projects that need research + writing + coding combined. Use when the task has 3+ distinct phases (e.g. "research competitors, write a report, and build a dashboard")

DECISION RULES:
1. Simple questions, greetings, quick facts → answer directly (NO dispatch)
2. Tasks requiring specialist work → dispatch to the right department(s)
3. Multi-part requests → dispatch to MULTIPLE departments

WHEN DISPATCHING, ALWAYS write a brief 1-sentence planning message first, then output ONLY the raw JSON object (no markdown, no code fences, no backticks):
{
{
  "action": "dispatch",
  "departments": [
    {"id": "research", "task": "Detailed, precise task description for the research team"},
    {"id": "writer", "task": "Detailed, precise task description for the writing team"}
  ]
}
\`\`\`
}
CRITICAL — PROMPT REFINEMENT:
When writing the "task" for each department, DO NOT just copy the user's message. REWRITE it into a precise, detailed, AI-optimized prompt. Add specifics the user implied but didn't state. Example:

User says: "write me a blog about ai"
BAD task: "write a blog about ai"
GOOD task: "Write a 1200-word blog post about current AI trends in 2026. Structure: intro paragraph, 5-7 sections with h2 headers covering major developments (LLMs, agents, open source, enterprise adoption, regulation), conclusion with forward-looking statement. Tone: professional but accessible. Include specific company names and product references where relevant."

Always enhance vague requests into detailed, actionable prompts.` + bossInstructions;

// ── Parse Boss dispatch decision ────────────────────────────────────────────

interface DispatchPlan {
  departments: Array<{ id: DepartmentId; task: string }>;
}

function parseDispatch(text: string): { plan: DispatchPlan | null; message: string } {
  // Extract JSON from markdown code fences or raw JSON
  let jsonStr: string | null = null;
  let jsonStart = -1;

  // Try ```json ... ``` first
  const fenceMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1];
    jsonStart = text.indexOf(fenceMatch[0]);
  } else {
    // Try to find raw JSON object by brace matching
    const firstBrace = text.indexOf("{");
    if (firstBrace !== -1) {
      let depth = 0;
      for (let i = firstBrace; i < text.length; i++) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}") { depth--; if (depth === 0) { jsonStr = text.slice(firstBrace, i + 1); jsonStart = firstBrace; break; } }
      }
    }
  }

  if (!jsonStr) return { plan: null, message: text };

  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed.action !== "dispatch" || !Array.isArray(parsed.departments)) {
      return { plan: null, message: text };
    }
    const validDepts = ["research", "coder", "artist", "writer", "autonomous"];
    const departments = parsed.departments.filter(
      (d: any) => validDepts.includes(d.id) && d.task
    );
    if (departments.length === 0) return { plan: null, message: text };

    const planningMessage = (jsonStart > 0 ? text.slice(0, jsonStart).trim() : "") ||
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
  // Only short-circuit to Artist if the message is SHORT and purely about images
  // Longer messages with "picture" mentioned are multi-part requests for Boss to route
  const isShortArtOnly = isArtRequest && message.split(/\s+/).length <= 20;

  if (isShortArtOnly) {
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
    // ── Build system prompt with connected services context ────────────────
    let systemPrompt = BOSS_SYSTEM_PROMPT;
    try {
      const connectors = await storage.getConnectorsByUser(userId);
      const connected = connectors.filter((c: any) => c.status === "connected");
      if (connected.length > 0) {
        const serviceList = connected.map((c: any) => `- ${c.name} (${c.provider})`).join("\n");
        systemPrompt += `\n\nCONNECTED SERVICES (available for department tasks):\n${serviceList}\nWhen a user's request involves data from these services, mention it in the department task description so the department knows to pull from the connected source.`;
      }
    } catch {}

    // ── RAG: search Obsidian vault for relevant context ────────────────────
    let vaultContext = "";
    try {
      const obsConnector = await getOwnerObsidianConnector();
      if (obsConnector) {
        // Extract key terms from the message (skip common words)
        const stopWords = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "to", "of", "in", "for", "on", "with", "at", "by", "from", "and", "or", "but", "not", "this", "that", "it", "my", "me", "we", "our", "can", "do", "how", "what", "about", "make", "write", "create", "help", "please", "want", "need", "get", "give"]);
        const keywords = message.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w));
        const searchTerms = keywords.slice(0, 3);

        if (searchTerms.length > 0) {
          const searchResults: Array<{ path: string; match: string }> = [];
          for (const term of searchTerms) {
            const result = await connectorRegistry.execute(obsConnector.id, "search_notes", { query: term });
            if (result.ok && Array.isArray(result.data)) {
              for (const r of result.data) {
                if (!searchResults.some(s => s.path === r.path)) {
                  searchResults.push(r);
                }
              }
            }
            if (searchResults.length >= 5) break;
          }

          if (searchResults.length > 0) {
            // Read the top 3 most relevant notes (truncated)
            const noteContents: string[] = [];
            for (const r of searchResults.slice(0, 3)) {
              const readResult = await connectorRegistry.execute(obsConnector.id, "read_note", { path: r.path });
              if (readResult.ok && readResult.data?.content) {
                noteContents.push(`--- ${r.path} ---\n${readResult.data.content.slice(0, 1500)}`);
              }
            }
            if (noteContents.length > 0) {
              vaultContext = `\n\nRELEVANT NOTES FROM USER'S KNOWLEDGE BASE:\n${noteContents.join("\n\n")}\n\nUse this context to provide better, more personalized answers. Reference specific notes if relevant.`;
              console.log(`[RAG] Found ${noteContents.length} relevant notes for query: "${searchTerms.join(", ")}"`);
            }
          }
        }
      }
    } catch (e: any) {
      console.error("[RAG] Vault search failed:", e.message);
    }

    // ── Call Boss AI to decide: direct answer or dispatch ─────────────────
    const bossResult = await modelRouter.chat({
      model: bossModel,
      messages: [
        ...history.slice(-20).map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: message },
      ],
      systemPrompt: systemPrompt + vaultContext,
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

      // Check if any department is "autonomous" — run the autonomous loop instead
      const hasAutonomous = plan.departments.some((d: any) => d.id === "autonomous");
      if (hasAutonomous) {
        // Resolve GitHub context for autonomous coder steps
        let autoGithub: { token: string; repo: string } | undefined;
        try {
          const ghToken = await storage.getGitHubToken(userId);
          if (ghToken) {
            const repoMatch = message.match(/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/)?.[1];
            let repo = repoMatch?.includes("/") ? repoMatch : null;
            if (!repo) {
              const prefs = await storage.getUserPreferences(userId);
              repo = prefs.defaultRepo || null;
            }
            if (repo) autoGithub = { token: ghToken, repo };
          }
        } catch {}
        const autoTask = plan.departments.find((d: any) => d.id === "autonomous");
        runAutonomous(parentJobId, autoTask?.task || message, level, abortController.signal, autoGithub)
          .then(async (autoPlan) => {
            const finalContent = autoPlan.finalOutput || "Autonomous task completed.";
            await storage.createBossMessage({
              id: uuidv4(), conversationId: conversationId!, role: "assistant", content: finalContent,
              tokenCount: autoPlan.totalTokens, model: bossModel, createdAt: Date.now(),
            });
            await storage.updateAgentJob(parentJobId, {
              status: "complete", output: JSON.stringify({ autonomous: true, steps: autoPlan.steps.length, totalTokens: autoPlan.totalTokens }),
              tokenCount: autoPlan.totalTokens, completedAt: Date.now(),
            });
            eventBus.emit(parentJobId, "complete", { synthesis: finalContent, totalTokens: autoPlan.totalTokens, autonomous: true });
          })
          .catch(async (err) => { console.error("[Autonomous] FAILED:", err.message, err.stack?.slice(0, 200)); try { await storage.createBossMessage({ id: uuidv4(), conversationId: conversationId!, role: "assistant", content: "Autonomous task failed: " + err.message, tokenCount: 0, model: null, createdAt: Date.now() }); } catch {} eventBus.emit(parentJobId, "error", { error: err.message }); eventBus.emit(parentJobId, "complete", { synthesis: "Autonomous task failed: " + err.message, totalTokens: 0 }); })
          .finally(() => activeAbortControllers.delete(conversationId!));

        return {
          conversationId, reply: bossMessage, jobId: parentJobId,
          isDelegating: true, departments: plan.departments,
          tokenCount: bossTokens, level,
        };
      }

      // Log department dispatch activity
      try {
        storage.insertActivityEvent({ id: uuidv4(), userId, type: "department_dispatch", title: "Dispatched to " + plan.departments.map((d:any) => d.id).join(", "), description: message.slice(0, 200), metadata: { level, departments: plan.departments.map((d:any) => d.id) } });
      } catch (e: any) { console.error("[Activity] Failed to log dispatch:", e.message); }

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

    // Log activity event
    try {
      storage.insertActivityEvent({ id: uuidv4(), userId, type: "boss_direct", title: "Boss answered: " + message.slice(0, 60), description: message.slice(0, 200), metadata: { level } });
    } catch (e: any) { console.error("[Activity] Failed to log event:", e.message); }

    // ── DIRECT MODE: Boss answers directly ──────────────────────────────
    await storage.createBossMessage({
      id: uuidv4(), conversationId, role: "assistant", content: bossResult.content,
      tokenCount: bossTokens, model: bossModel, createdAt: Date.now(),
    });

    // Auto-save Boss direct answers to owner's Obsidian vault
    try {
      const obsConnector = await getOwnerObsidianConnector();
      if (obsConnector) {
        const timestamp = new Date().toISOString().slice(0, 10);
        const slug = message.slice(0, 50).replace(/[^a-zA-Z0-9]+/g, "-").replace(/-+$/, "").toLowerCase();
        // Save Boss response
        const bossPath = `Boss/${timestamp}-${slug}.md`;
        const header = `# ${message.slice(0, 80)}\n*${new Date().toLocaleString()} | Boss Direct | Level: ${level} | User: ${userEmail || "unknown"}*\n\n---\n\n`;
        await connectorRegistry.execute(obsConnector.id, "write_note", { path: bossPath, content: header + bossResult.content });
        // Save input
        const inputPath = `Inputs/${timestamp}-${slug}.md`;
        const inputContent = `# Prompt\n*${new Date().toLocaleString()} | Level: ${level} | Direct (Boss) | User: ${userEmail || "unknown"}*\n\n---\n\n${message}`;
        await connectorRegistry.execute(obsConnector.id, "write_note", { path: inputPath, content: inputContent });
      }
    } catch (e: any) { console.error("[Boss] Obsidian auto-save failed:", e.message); }

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
    console.error("[Boss] Chat error:", err.message);
    const errorMsg = "Error: " + err.message + ". Try switching intelligence level.";
    return { conversationId: conversationId || "", reply: errorMsg, isDelegating: false, tokenCount: 0, level };
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
          // Try explicit repo from message first, then fall back to user's default repo
          const repoMatch = originalMessage.match(/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/)?.[1];
          let repo = repoMatch?.includes("/") ? repoMatch : null;
          if (!repo) {
            const prefs = await storage.getUserPreferences(userId);
            repo = prefs.defaultRepo || null;
          }
          if (repo) {
            github = { token: ghToken, repo };
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
      if (r.imageUrl) summary += `\n[Image was generated successfully]`;
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

    // ── Post-synthesis: auto-save to owner's Obsidian vault by department ──
    try {
      const obsConnector = await getOwnerObsidianConnector();

      if (obsConnector) {
        // Check if user specified a custom path
        const customPath = originalMessage.match(/(?:at|to|in)\s+([^\s,."]+\.md)/i)?.[1];
        const timestamp = new Date().toISOString().slice(0, 10);
        const slug = originalMessage.slice(0, 50).replace(/[^a-zA-Z0-9]+/g, "-").replace(/-+$/, "").toLowerCase();
        const savedPaths: string[] = [];

        if (customPath) {
          // User specified exact path — save full synthesis there
          const result = await connectorRegistry.execute(obsConnector.id, "write_note", { path: customPath, content: synthesis.content });
          if (result.ok) savedPaths.push(customPath);
        } else {
          // Auto-organize: save each department's output to its own folder
          for (const r of deptResults) {
            const deptFolder = r.department.charAt(0).toUpperCase() + r.department.slice(1);
            const notePath = `${deptFolder}/${timestamp}-${slug}.md`;
            const header = `# ${originalMessage.slice(0, 80)}\n*Generated: ${new Date().toLocaleString()} | Department: ${deptFolder}*\n\n---\n\n`;
            const result = await connectorRegistry.execute(obsConnector.id, "write_note", { path: notePath, content: header + r.finalOutput });
            if (result.ok) savedPaths.push(notePath);
          }

          // Save the full synthesis
          const synthPath = deptResults.length > 1 ? `Synthesis/${timestamp}-${slug}.md` : `${deptResults[0].department.charAt(0).toUpperCase() + deptResults[0].department.slice(1)}/${timestamp}-${slug}.md`;
          if (deptResults.length > 1) {
            const header = `# ${originalMessage.slice(0, 80)}\n*Synthesized: ${new Date().toLocaleString()} | Departments: ${departments.map(d => d.id).join(", ")}*\n\n---\n\n`;
            const result = await connectorRegistry.execute(obsConnector.id, "write_note", { path: synthPath, content: header + synthesis.content });
            if (result.ok) savedPaths.push(synthPath);
          }

          // Save the user's original prompt to an Inputs log
          const inputPath = `Inputs/${timestamp}-${slug}.md`;
          const inputContent = `# Prompt\n*${new Date().toLocaleString()} | Level: ${level} | Departments: ${departments.map(d => d.id).join(", ")}*\n\n---\n\n${originalMessage}`;
          const inputResult = await connectorRegistry.execute(obsConnector.id, "write_note", { path: inputPath, content: inputContent });
          if (inputResult.ok) savedPaths.push(inputPath);
        }

        if (savedPaths.length > 0) {
          console.log(`[Boss] Auto-saved to Obsidian: ${savedPaths.join(", ")}`);
          const pathList = savedPaths.map(p => `\`${p}\``).join(", ");
          eventBus.emit(parentJobId, "token", { workerType: "boss", text: `\n\n📁 *Saved to Obsidian vault: ${pathList}*`, isSynthesis: true });
        }
      }

      // Detect Notion write requests
      const notionMatch = originalMessage.match(/(?:write|save|store|put|export|create)\b.*?(?:notion)\b/i);
      if (notionMatch) {
        const userConnectors = await storage.getConnectorsByUser(userId);
        const notionConnector = userConnectors.find((c: any) => c.provider === "notion" && c.status === "connected");
        if (notionConnector) {
          const searchResult = await connectorRegistry.execute(notionConnector.id, "list_pages", { query: "" });
          if (searchResult.ok && searchResult.data?.results?.length > 0) {
            const parentId = searchResult.data.results[0].id;
            const title = originalMessage.slice(0, 80);
            const writeResult = await connectorRegistry.execute(notionConnector.id, "create_page", {
              parentId, title, content: synthesis.content.slice(0, 2000),
            });
            if (writeResult.ok) {
              console.log(`[Boss] Created Notion page: ${title}`);
              eventBus.emit(parentJobId, "token", { workerType: "boss", text: `\n\n✅ *Created Notion page: ${title}*`, isSynthesis: true });
            }
          }
        }
      }
    } catch (e: any) {
      console.error("[Boss] Connector write-back failed:", e.message);
    }

    // Build final content with image markers
    let finalContent = synthesis.content;
    const imageResults = deptResults.filter(r => r.imageUrl);
    if (imageResults.length > 0) {
      finalContent += "\n\n" + imageResults.map(r => `[Image was generated successfully]`).join("\n");
    }

    // Store final response (include image URL if Artist dept produced one)
    const firstImage = deptResults.find(r => r.imageUrl);
    await storage.createBossMessage({
      id: uuidv4(), conversationId, role: "assistant", content: finalContent,
      tokenCount: totalTokens, model: bossModel, createdAt: Date.now(),
      type: firstImage ? "image" : "text",
      imageUrl: firstImage?.imageUrl || null,
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

    // Log task completion activity + notification
    try {
      const deptList = departments.map(d => d.id).join(", ");
      storage.insertActivityEvent({ id: uuidv4(), userId, type: "task_complete", title: "Task completed: " + deptList, description: originalMessage.slice(0, 200), metadata: { departments: departments.map(d => d.id), totalTokens } });
      const tokenStr = totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}K` : String(totalTokens);
      await storage.createNotification({ userId, type: "task_complete", title: `Task completed (${deptList})`, message: `${originalMessage.slice(0, 100)} — ${tokenStr} tokens`, link: "/tasks" });
    } catch (e: any) { console.error("[Activity] Failed to log completion:", e.message); }

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
