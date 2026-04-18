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
import { eventBus } from "./lib/eventBus";
import { storage } from "./storage";
import { dbAll } from "./lib/db";
import { logJob, logAI, logError } from "./lib/logger";

/**
 * Get the owner's Obsidian connector — all user outputs route to the owner's vault.
 * Tries owner email first, then falls back to any user with an Obsidian connector.
 */
/** Returns a DB connector record, or a synthetic { id: "env" } object when env vars are set.
 *  Cached for 60s to avoid scanning all users on every chat message. */
let obsidianCache: { result: any; ts: number } | null = null;
async function getOwnerObsidianConnector(): Promise<any | null> {
  if (obsidianCache && Date.now() - obsidianCache.ts < 60_000) return obsidianCache.result;
  try {
    const allUsers = await storage.getAllUsers();
    for (const u of allUsers) {
      const connectors = await storage.getConnectorsByUser(u.id);
      const obs = connectors.find((c: any) => c.provider === "obsidian" && c.status === "connected");
      if (obs) { obsidianCache = { result: obs, ts: Date.now() }; return obs; }
    }
    if (process.env.OBSIDIAN_API_URL && process.env.OBSIDIAN_API_KEY) {
      const env = { id: "env", provider: "obsidian", status: "connected" };
      obsidianCache = { result: env, ts: Date.now() };
      return env;
    }
    obsidianCache = { result: null, ts: Date.now() };
    return null;
  } catch { return null; }
}

/** Humanize AI text to pass AI detection tools like ZeroGPT */
async function humanizeText(text: string): Promise<string> {
  const result = await modelRouter.chat({
    model: "gpt-5.4",
    messages: [{ role: "user", content: text }],
    systemPrompt: `You are a humanizer. Rewrite the following text so it reads as naturally human-written and passes AI detection tools like ZeroGPT, GPTZero, and Originality.ai.

RULES:
- Vary sentence length — mix short punchy sentences with longer complex ones
- Use contractions naturally (don't, it's, we're, that's)
- Add occasional colloquial phrases and informal transitions (honestly, look, here's the thing, anyway)
- Introduce minor imperfections — start some sentences with "And" or "But"
- Use first person where appropriate (I think, in my experience, I've found)
- Avoid overly structured patterns — don't start every paragraph the same way
- Break up lists into flowing prose when possible
- Use concrete examples and specific details instead of generic statements
- Vary paragraph lengths — some short, some long
- Avoid AI-typical phrases: "delve into", "it's important to note", "in conclusion", "leveraging", "streamline", "robust", "comprehensive", "cutting-edge", "game-changer"
- Keep the same meaning, facts, and structure — just make it sound human
- Do NOT add disclaimers about being AI or about the rewriting process

FORMAT — MLA STYLE:
- Use proper MLA format: double-spaced, 1-inch margins implied, Times New Roman font
- Wrap the entire output in an artifact with MLA styling
- Include a proper MLA header (Name, Professor, Class, Date) using placeholder values the user can edit
- Use proper MLA in-text citations where appropriate (Author LastName Page#)
- Include a Works Cited section at the end if sources are referenced
- Indent first line of each paragraph (0.5 inch)
- Use 12pt Times New Roman throughout
- Page title centered, not bold
- Output the result wrapped in: <artifact type="html" title="MLA Document">...styled html...</artifact>
- The HTML should use: font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 2; max-width: 8.5in; margin: 1in auto; padding: 1in;
- Make it look like a real MLA paper that could be printed or copy-pasted into Google Docs`,
  });
  return result.content;
}

/** Execute an Obsidian action — uses DB connector or env var fallback */
async function obsidianExec(connectorId: any, action: string, params: Record<string, any>) {
  if (connectorId === "env") {
    return connectorRegistry.executeObsidianDirect(action, params);
  }
  return connectorRegistry.execute(connectorId, action, params);
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
import { executeDepartment, type DepartmentResult } from "./departments/executor";
import { runAutonomous } from "./departments/autonomous";
import { connectorRegistry } from "./lib/connectorRegistry";
import { chunkText } from "./lib/utils";
import { autoLinkNote, contextSearch } from "./lib/vaultBrain";

// ── Boss System Prompt ──────────────────────────────────────────────────────

const BOSS_SYSTEM_PROMPT = `You are The Boss, the central AI orchestrator for Cortal — an AI agent orchestration platform built on the WAT framework (Workflows, Agents, Tools).

ABOUT CORTAL:
Cortal is a full-stack AI orchestration platform where users chat with you (The Boss) and you either answer directly or delegate work to 5 specialized AI departments, each with multiple sub-agents. The platform includes: Project Briefs (persistent context per conversation), Workflow Templates (multi-step reusable flows), 3-tier Agent Memory (episodic/knowledge/preference), autonomous Bots, a visual Workflow Canvas with AI decision nodes, Agent Traces with cost/latency tracking, MCP server+client, SDK with API keys, cross-device sync, voice chat, screen viewer (Bun Bun), Clone Me (digital twin), and an Artifact Gallery. Commands like /research, /build, /swarm, /chart, /design, /human auto-detect from natural language. When dispatching to multiple departments, research/reader results feed into writer/coder as shared context.

DEPARTMENTS:
- research (5 agents: Lead Researcher, Data Miner, Analyst, Fact-Checker, Synthesizer): web search, data gathering, analysis, comparisons, fact-finding
- coder (5 agents: Lead Developer, Architect, Junior Dev, Security Auditor, Code Reviewer): programming, debugging, code review, scripts, technical implementation
- artist (4 agents: Lead Artist, Style Director, Art Critic, Brand Designer): image generation, logos, illustrations, visual design
- writer (5 agents: Lead Writer, Copywriter, SEO Specialist, Tone Adapter, Editor): articles, blog posts, copywriting, documentation, emails, essays
- reader (5 agents: Lead Reader, Section Reader A, Section Reader B, Reviewer, Disputer): document analysis, summarization, critical review of provided text/PDFs

ANSWER DIRECTLY when: greeting, simple question, quick fact, opinion, clarification, follow-up, planning advice, or anything you can answer well in <200 words.

DISPATCH when: the user needs specialist output (code, research, images, long-form writing, document analysis). For multi-part tasks, dispatch to MULTIPLE departments.

DISPATCH FORMAT (raw JSON only, no markdown):
{"action":"dispatch","departments":[{"id":"research","task":"detailed prompt"},{"id":"writer","task":"detailed prompt"}]}

When dispatching, REWRITE vague requests into precise, detailed prompts. Add structure, length, tone, and format requirements the user implied.

FILE READING (owner only):
You MUST read the actual code before answering questions about Cortal's implementation. When the user asks HOW something works, WHY something behaves a certain way, what a specific feature does, or about any specific code/file/function/route — STOP and output read_file tags FIRST. Do not answer from memory or the architecture summary above — that's a starting point, not ground truth.

Output tags like this (up to 5 files per response):
<read_file path="server/boss.ts" />
<read_file path="client/src/pages/BossPage.tsx" />

When you output read_file tags, do not write anything else — just the tags. The system will read the files and call you back with the contents, then you write the real answer with specific line references, function names, and code quotes.

Only skip file reading when the user's question is abstract (e.g. "what should I build next") or already answered by the architecture summary above (e.g. "list your departments").

ARTIFACTS — STRICT RULES:
- Only use <artifact> for content the user explicitly asked to be visual/interactive (landing pages, charts, UI mockups)
- NEVER generate HTML artifacts for reports, analysis, reviews, or text content — use markdown instead
- If you DO create an artifact, it MUST be fully functional — all tabs, sections, and interactive elements must work with real content. Empty shells, placeholder sections, or non-functional UI elements are not acceptable. If the content is too large for a complete artifact, use markdown instead.
- Default to plain markdown. Only reach for artifacts when visual rendering adds clear value.` + bossInstructions;

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
    const validDepts = ["research", "coder", "artist", "writer", "reader"];
    const departments = parsed.departments.filter(
      (d: any) => validDepts.includes(d.id) && d.task
    );
    if (departments.length === 0) return { plan: null, message: text };

    // Extract planning message: text before the JSON, or generate a clean default
    let planningMessage = "";
    if (jsonStart > 0) {
      const beforeJson = text.slice(0, jsonStart).trim();
      // Only use pre-JSON text if it's NOT itself JSON-like (sometimes models double-output)
      if (beforeJson && !beforeJson.startsWith("{") && !beforeJson.startsWith("[")) {
        planningMessage = beforeJson;
      }
    }
    if (!planningMessage) {
      planningMessage = `Dispatching to ${departments.map((d: any) => d.id).join(", ")}...`;
    }

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
  imageContents?: Array<{ type: "image_url"; image_url: { url: string } }>;
  source?: string; // "boss" | "editor" — where the chat originated
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
  let { message, userId, userEmail, history = [] } = input;
  const level: IntelligenceLevel = input.level || "medium";

  // ── Command Detection + Auto-Routing ─────────────────────────────────
  // Slash commands are explicit overrides. Auto-detection handles everything
  // else so users never need to remember a command — just type naturally.

  const msg = message.trim().toLowerCase();
  const wordCount = message.split(/\s+/).length;
  const noSlash = !msg.startsWith("/");

  // Check if owner is asking to read files — skip all auto-routing if so
  // Matches: typed paths (server/boss.ts), root files (PLATFORM.md), or injected file markers (--- FILE: ... ---)
  const hasFilePaths = !!(
    message.match(/(?:server|client|shared|workflows|tools)\/[\w./\-]+\.(?:ts|tsx|js|json|md|py)/i) ||
    message.match(/(?:PLATFORM|CLAUDE|README|package)\.(?:md|json)/i) ||
    message.match(/--- FILE: /)
  );
  const isOwnerUser = !!(userEmail && (await storage.getUserByEmail(userEmail))?.role === "owner");
  const ownerFileMode = hasFilePaths && isOwnerUser;

  // /human — humanize output to pass AI detectors (modifier, works with any flow)
  const humanizeMode = msg.startsWith("/human");
  if (humanizeMode) message = message.replace(/^\/human\s*/i, "").trim();

  // If owner is reading files, skip ALL auto-routing — Boss answers directly with file contents
  if (ownerFileMode) {
    // Fall through to direct Boss call with file contents injected into system prompt
  }

  // /research — deep multi-source research with citations
  let deepResearchMode = !ownerFileMode && msg.startsWith("/research");
  if (deepResearchMode) message = message.replace(/^\/research\s*/i, "").trim();
  // Auto: 2+ research signals, or 1 signal + long message
  if (!deepResearchMode && noSlash && !ownerFileMode) {
    const signals = [
      /\b(research|investigate|analyze|study|examine|explore|deep dive|comprehensive|thorough)\b/i,
      /\b(compare|comparison|pros and cons|advantages|disadvantages|vs\.?|versus)\b/i,
      /\b(report|findings|analysis|overview|landscape|market|industry|trends)\b/i,
      /\b(everything about|all about|full|complete|detailed|in-depth)\b/i,
    ];
    const hits = signals.filter(p => p.test(msg)).length;
    if (hits >= 2 || (hits >= 1 && wordCount > 50)) deepResearchMode = true;
  }

  // /chart — interactive data visualizations
  let chartMode = !ownerFileMode && msg.startsWith("/chart");
  if (chartMode) message = message.replace(/^\/chart\s*/i, "").trim();
  // Auto: chart/graph/visualize + create/show/make
  if (!chartMode && !deepResearchMode && noSlash && !ownerFileMode) {
    if (/\b(chart|graph|plot|visuali[zs]e|pie chart|bar chart|line chart|histogram|dashboard|data viz)\b/i.test(msg) &&
        /\b(show|create|make|generate|build|draw|display|of|for)\b/i.test(msg)) {
      chartMode = true;
    }
  }

  // /design — screenshot/description → code
  let designMode = !ownerFileMode && msg.startsWith("/design");
  if (designMode) message = message.replace(/^\/design\s*/i, "").trim();
  // Auto: design/mockup/wireframe + page/component + create/build
  if (!designMode && !deepResearchMode && !chartMode && noSlash && !ownerFileMode) {
    if (/\b(design|redesign|mockup|wireframe|prototype|ui|ux|layout)\b/i.test(msg) &&
        /\b(page|screen|component|section|form|modal|card|dashboard|interface|website|homepage)\b/i.test(msg) &&
        /\b(create|make|build|generate|convert|turn into|code|look like)\b/i.test(msg)) {
      designMode = true;
    }
  }

  // /build — Company in a Box (full project from one sentence)
  let buildMode = !ownerFileMode && msg.startsWith("/build");
  if (buildMode) message = message.replace(/^\/build\s*/i, "").trim();
  // Auto: build/launch + business/startup/app/website + context
  // BUT NOT when user is just asking for a plan, ideas, or brainstorming
  if (!buildMode && !deepResearchMode && !chartMode && !designMode && noSlash) {
    const justPlanning = /\b(plan|planning|ideas|suggest|brainstorm|list|outline|what to include|what should|what can|what could|recommend)\b/i.test(msg);
    if (!justPlanning &&
        /\b(build|launch|create|start|set up|spin up)\b/i.test(msg) &&
        /\b(business|startup|company|saas|app|website|store|shop|product|landing page|platform|service)\b/i.test(msg) &&
        /\b(for|that|which|to sell|selling|about|called|named)\b/i.test(msg)) {
      buildMode = true;
    }
  }

  // /swarm — parallel agent swarm (multiple departments simultaneously)
  let swarmMode = !ownerFileMode && msg.startsWith("/swarm");
  if (swarmMode) message = message.replace(/^\/swarm\s*/i, "").trim();
  // Auto: 3+ different department types detected in one message
  // Strip negated phrases first so "not making images" doesn't count as an artist signal
  if (!swarmMode && !deepResearchMode && !chartMode && !designMode && !buildMode && noSlash) {
    const stripped = msg.replace(/\b(not|don'?t|no|never|without|aren'?t|isn'?t|won'?t|can'?t|shouldn'?t|wouldn'?t|youre not|you'?re not)\s+\w+(\s+\w+)?/gi, "");
    const deptSignals = [
      /\b(research|analyze|investigate|find out|look into|study)\b/i,
      /\b(write|draft|compose|blog|article|copy|content|email|essay)\b/i,
      /\b(code|build|develop|program|implement|script|app|function)\b/i,
      /\b(image|logo|illustration|visual|art|picture|photo|draw)\b/i,
      /\b(read|review|summarize|document|paper|contract|pdf|book)\b/i,
    ];
    const deptMatches = deptSignals.filter(p => p.test(stripped)).length;
    if (deptMatches >= 3) swarmMode = true;
  }

  const tier = INTELLIGENCE_TIERS[level];
  // Boss routing is a classification task — always use cheapest model regardless of tier.
  // The expensive model is only needed for the actual department work, not for deciding WHERE to route.
  const bossModel = "gpt-5.4-mini";
  const abortController = new AbortController();

  // ── Long-running command handler (returns immediately, streams via SSE) ──
  const longRunningCommands: Array<{ mode: boolean; label: string; handler: Function }> = [
    { mode: deepResearchMode, label: "Deep Research", handler: handleDeepResearch },
    { mode: chartMode, label: "Chart Generation", handler: handleChartRequest },
    { mode: designMode, label: "Design to Code", handler: handleDesignToCode },
    { mode: swarmMode, label: "Agent Swarm", handler: handleSwarm },
    { mode: buildMode, label: "Build Project", handler: handleBuildProject },
  ];

  for (const cmd of longRunningCommands) {
    if (cmd.mode && message.length > 0) {
      // Create conversation if needed
      let convId = input.conversationId;
      if (!convId) {
        convId = uuidv4();
        await storage.createConversation({
          id: convId, userId, title: `${cmd.label}: ${message.slice(0, 50)}`,
          model: bossModel, createdAt: Date.now(), updatedAt: Date.now(),
          source: input.source || "boss",
        });
      }

      // Create a job and return immediately
      const jobId = uuidv4();
      logJob(jobId, "created", { command: cmd.label, level });
      await storage.createAgentJob({
        id: jobId, conversationId: convId, userId,
        type: "boss" as any, status: "running",
        input: JSON.stringify({ command: cmd.label, message }),
        createdAt: Date.now(),
      });

      // Store user message
      await storage.createBossMessage({
        id: uuidv4(), conversationId: convId, role: "user",
        content: message, tokenCount: 0, model: null, createdAt: Date.now(),
      });

      // Run in background — stream progress via eventBus
      (async () => {
        try {
          // Forward all department events from conversationId to jobId
          // so the client SSE stream picks them up
          const forwardUnsub = eventBus.subscribe(convId, (event: string, data: any) => {
            eventBus.emit(jobId, event, data);
          });

          eventBus.emit(jobId, "progress", {
            workerType: cmd.label.toLowerCase().replace(/\s+/g, "_"),
            status: "running", message: `${cmd.label} starting...`,
          });

          let result = await cmd.handler(
            { ...input, conversationId: convId },
            message, level, abortController,
          );

          // Apply humanizer if /human was used
          if (humanizeMode && result.reply) {
            eventBus.emit(jobId, "progress", {
              workerType: "humanizer", subAgent: "Humanizer",
              status: "running", message: "Humanizing output to pass AI detection...",
            });
            result.reply = await humanizeText(result.reply);
          }

          forwardUnsub();

          // Emit the final result
          eventBus.emit(jobId, "complete", {
            synthesis: result.reply,
            totalTokens: result.tokenCount,
          });

          // Update job
          logJob(jobId, "complete", { tokens: result.tokenCount });
          await storage.updateAgentJob(jobId, {
            status: "complete",
            output: result.reply?.slice(0, 5000),
            tokenCount: result.tokenCount,
            completedAt: Date.now(),
          });
        } catch (err: any) {
          logJob(jobId, "failed", { error: err.message });
          eventBus.emit(jobId, "error", { error: err.message });
          await storage.updateAgentJob(jobId, {
            status: "failed", output: err.message, completedAt: Date.now(),
          });
        }
      })();

      return {
        conversationId: convId,
        reply: `Starting ${cmd.label}...`,
        isDelegating: true,
        jobId,
        tokenCount: 0,
        level,
      };
    }
  }

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
      source: input.source || "boss",
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
        systemPrompt += `\n\nCONNECTED SERVICES:\n${serviceList}`;
      }
    } catch {}

    // ── Owner file reading: inject file contents when owner asks to read code ──
    // Detects file paths in the message and loads them for the AI to analyze
    // When files are loaded, the Boss MUST answer directly (not dispatch) since
    // the file contents are in the Boss context, not available to departments
    let hasInjectedFiles = false;
    if (ownerFileMode) {
      const filePatterns = message.match(/(?:^|\s)((?:server|client|shared|workflows|tools)\/[\w./\-]+\.(?:ts|tsx|js|jsx|json|md|py|css|html))/gi);
      const standaloneFiles = message.match(/(?:^|\s)((?:PLATFORM|CLAUDE|README|package)\.(?:md|json))/gi);
      const allFiles = [...(filePatterns || []), ...(standaloneFiles || [])].map(f => f.trim());

      if (allFiles.length > 0) {
        const fileContents: string[] = [];
        for (const fp of allFiles.slice(0, 10)) {
          try {
            const resolved = path.resolve(process.cwd(), fp);
            if (resolved.startsWith(process.cwd()) && !resolved.includes(".env") && fs.existsSync(resolved)) {
              const content = fs.readFileSync(resolved, "utf-8");
              const trimmed = content.length > 6000 ? content.slice(0, 6000) + "\n\n[...truncated at 6000 chars]" : content;
              fileContents.push(`--- FILE: ${fp} (${content.length} chars) ---\n${trimmed}`);
            } else {
              fileContents.push(`--- FILE: ${fp} --- [NOT FOUND]`);
            }
          } catch {}
        }
        if (fileContents.length > 0) {
          hasInjectedFiles = true;
          systemPrompt += `\n\n--- PROJECT FILES (owner requested) ---\n${fileContents.join("\n\n")}\n--- END FILES ---\n\nIMPORTANT: The user asked you to read and analyze these files. Answer DIRECTLY using the file contents above. Do NOT dispatch to departments — the files are only visible to you, not to department agents.`;
        }
      }
    }

    // ── RAG + Memory: only inject when message warrants it ─────────────────
    // Skip context injection for greetings, short questions, and simple commands
    // This saves 8,000-10,000 tokens per request when context isn't needed
    let vaultContext = "";
    let memoryContext = "";
    const wordCount = message.split(/\s+/).length;
    const isSubstantive = wordCount > 5 && !/^(hi|hello|hey|thanks|ok|sure|yes|no|bye|good)\b/i.test(message.trim());
    {
      const vaultPromise = (async () => {
        if (!isSubstantive) return "";
        try {
          const results = await contextSearch(message, 3); // 3 notes max (was 5)
          if (results.length > 0) {
            const noteContents = results.map(r =>
              `--- ${r.path} ---\n${r.content.slice(0, 800)}` // 800 chars max (was 1500)
            );
            return `\n\nKNOWLEDGE BASE (${results.length} notes):\n${noteContents.join("\n\n")}`;
          }
        } catch (e: any) {
          console.error("[RAG] Context search failed:", e.message);
        }
        return "";
      })();

      const memoryPromise = (async () => {
        if (!isSubstantive) return "";
        try {
          const { getMemoryContext } = await import("./memory");
          return await getMemoryContext(userId, message);
        } catch { return ""; }
      })();

      // Project brief — structured working context for this conversation
      const projectPromise = (async () => {
        if (!conversationId) return "";
        try {
          const { dbGet: dbGetLocal } = await import("./lib/db");
          const brief = await dbGetLocal(
            "SELECT objective, context, constraints, stakeholders, deliverables, decisions FROM project_briefs WHERE conversation_id = ? AND user_id = ?",
            conversationId, userId
          ) as any;
          if (!brief) return "";
          const parts: string[] = [];
          if (brief.objective) parts.push(`Objective: ${brief.objective}`);
          if (brief.context) parts.push(`Context: ${brief.context}`);
          if (brief.constraints) parts.push(`Constraints: ${brief.constraints}`);
          if (brief.stakeholders) parts.push(`Stakeholders: ${brief.stakeholders}`);
          if (brief.deliverables) parts.push(`Deliverables: ${brief.deliverables}`);
          if (brief.decisions) parts.push(`Decisions: ${brief.decisions}`);
          if (parts.length === 0) return "";
          return `\n\n--- PROJECT BRIEF ---\n${parts.join("\n")}\n--- END BRIEF ---\n`;
        } catch { return ""; }
      })();

      const [vc, mc, pc] = await Promise.all([vaultPromise, memoryPromise, projectPromise]);
      vaultContext = vc;
      memoryContext = mc + pc;
    }

    // ── Call Boss AI to decide: direct answer or dispatch ─────────────────
    // Build user message content — include images if attached
    const imageContents = input.imageContents || [];
    const userContent: any = imageContents.length > 0
      ? [{ type: "text", text: message }, ...imageContents]
      : message;

    const bossResult = await modelRouter.chat({
      model: hasInjectedFiles ? "gpt-5.4" : bossModel, // Use stronger model for file analysis
      maxTokens: hasInjectedFiles ? 16384 : 4096, // More output space for code review
      messages: [
        // Only last 4 messages for routing context — Boss just needs recent context, not full history
        ...history.slice(-4).map(m => ({ role: m.role as "user" | "assistant", content: typeof m.content === "string" ? m.content.slice(0, 500) : m.content })),
        { role: "user" as const, content: userContent },
      ],
      systemPrompt: systemPrompt + vaultContext + memoryContext,
      signal: abortController.signal,
    });

    let bossTokens = bossResult.usage.totalTokens;
    logAI(bossModel, bossResult.latencyMs || 0, bossTokens, "boss_routing");

    // ── Tool-calling loop: if Boss requested files, read them and re-call ──
    // Only works for owner — non-owners can't trigger file reads this way
    if (isOwnerUser) {
      const readTags = bossResult.content.match(/<read_file\s+path=["']([^"']+)["']\s*\/?>/g) || [];
      if (readTags.length > 0) {
        const requestedFiles: string[] = [];
        const fileContents: string[] = [];
        for (const tag of readTags.slice(0, 5)) { // Max 5 files per request
          const pathMatch = tag.match(/path=["']([^"']+)["']/);
          if (!pathMatch) continue;
          const requestedPath = pathMatch[1];
          requestedFiles.push(requestedPath);
          try {
            const resolved = path.resolve(process.cwd(), requestedPath);
            if (resolved.startsWith(process.cwd()) && !resolved.includes(".env") && fs.existsSync(resolved)) {
              const content = fs.readFileSync(resolved, "utf-8");
              const trimmed = content.length > 6000 ? content.slice(0, 6000) + `\n\n[...truncated, total size: ${content.length}]` : content;
              fileContents.push(`--- FILE: ${requestedPath} (${content.length} chars) ---\n${trimmed}`);
            } else {
              fileContents.push(`--- FILE: ${requestedPath} --- [NOT FOUND OR FORBIDDEN]`);
            }
          } catch (e: any) {
            fileContents.push(`--- FILE: ${requestedPath} --- [ERROR: ${e.message}]`);
          }
        }

        // Re-call Boss with the file contents — it can now answer the user's question
        const followupSystem = systemPrompt + vaultContext + memoryContext +
          `\n\n--- FILES YOU REQUESTED ---\n${fileContents.join("\n\n")}\n--- END FILES ---\n\nNow answer the user's question directly using these file contents. Do NOT output another <read_file> tag — you already have what you need. Do NOT dispatch to departments.`;

        const followup = await modelRouter.chat({
          model: "gpt-5.4",
          maxTokens: 16384,
          messages: [
            ...history.slice(-4).map(m => ({ role: m.role as "user" | "assistant", content: typeof m.content === "string" ? m.content.slice(0, 500) : m.content })),
            { role: "user" as const, content: userContent },
          ],
          systemPrompt: followupSystem,
          signal: abortController.signal,
        });

        // Replace the Boss result with the followup (which has the real answer)
        bossResult.content = followup.content;
        bossTokens += followup.usage.totalTokens;
        logAI("gpt-5.4", followup.latencyMs || 0, followup.usage.totalTokens, "boss_file_read");
      }
    }

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
      logJob(parentJobId, "dispatch", { departments: plan.departments.map((d: any) => d.id), level });
      await storage.createAgentJob({
        id: parentJobId, conversationId, userId, type: "boss" as any,
        status: "running",
        input: JSON.stringify({ message, departments: plan.departments }),
        createdAt: Date.now(),
      });

      // Filter out "autonomous" if Boss still dispatches it — not a real department
      // Instead, run all concrete departments in parallel (which handles multi-dept work fine)
      plan.departments = plan.departments.filter((d: any) => d.id !== "autonomous");

      // Only use autonomous runner if Boss sent ONLY "autonomous" with no real departments
      const hasAutonomous = plan.departments.length === 0;
      if (hasAutonomous) {
        // Restore the autonomous task from original dispatch
        plan.departments = [{ id: "autonomous" as any, task: bossMessage || message }];
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
          .catch(async (err) => { console.error("[Autonomous] FAILED:", err.message); try { await storage.createBossMessage({ id: uuidv4(), conversationId: conversationId!, role: "assistant", content: "Autonomous task failed: " + err.message, tokenCount: 0, model: null, createdAt: Date.now() }); } catch {} eventBus.emit(parentJobId, "error", { error: err.message }); eventBus.emit(parentJobId, "complete", { synthesis: "Autonomous task failed: " + err.message, totalTokens: 0 }); })
          .finally(() => activeAbortControllers.delete(conversationId!));

        return {
          conversationId, reply: bossMessage, jobId: parentJobId,
          isDelegating: true, departments: plan.departments,
          tokenCount: bossTokens, level,
        };
      }

      // Log department dispatch activity
      try {
        await storage.insertActivityEvent({ id: uuidv4(), userId, type: "department_dispatch", title: "Dispatched to " + plan.departments.map((d:any) => d.id).join(", "), description: message.slice(0, 200), metadata: { level, departments: plan.departments.map((d:any) => d.id) } });
      } catch (e: any) { console.error("[Activity] Failed to log dispatch:", e.message); }

      // Execute departments asynchronously — results flow back via eventBus
      executeDepartments(parentJobId, conversationId, userId, level, message, plan.departments, abortController.signal, userEmail, humanizeMode)
        .catch(err => {
          logJob(parentJobId, "failed", { error: err.message });
          logError("department-dispatch", err);
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
      await storage.insertActivityEvent({ id: uuidv4(), userId, type: "boss_direct", title: "Boss answered: " + message.slice(0, 60), description: message.slice(0, 200), metadata: { level } });
    } catch (e: any) { console.error("[Activity] Failed to log event:", e.message); }

    // ── DIRECT MODE: Boss answers directly ──────────────────────────────
    let finalContent = bossResult.content;
    if (humanizeMode) {
      finalContent = await humanizeText(finalContent);
    }
    await storage.createBossMessage({
      id: uuidv4(), conversationId, role: "assistant", content: finalContent,
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
        await obsidianExec(obsConnector.id, "write_note", { path: bossPath, content: header + finalContent });
        // Save input
        const inputPath = `Inputs/${timestamp}-${slug}.md`;
        const inputContent = `# Prompt\n*${new Date().toLocaleString()} | Level: ${level} | Direct (Boss) | User: ${userEmail || "unknown"}*\n\n---\n\n${message}`;
        await obsidianExec(obsConnector.id, "write_note", { path: inputPath, content: inputContent });
      }
    } catch (e: any) { console.error("[Boss] Obsidian auto-save failed:", e.message); }

    activeAbortControllers.delete(conversationId);

    // Extract memories from this interaction (async, non-blocking)
    // Skip for trivial responses — saves ~1,500 tokens per short exchange
    if (finalContent.length > 200 && message.split(/\s+/).length > 5) {
      try {
        const { extractMemories } = await import("./memory");
        extractMemories(userId, "boss", message, finalContent, input.source || "boss", conversationId)
          .catch((e: any) => logError("memory-extract", e));
      } catch (e: any) { logError("memory-import", e); }
    }

    return {
      conversationId, reply: finalContent,
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
// ── Company in a Box (/build — one prompt to full project) ───────────────────

async function handleBuildProject(
  input: BossChatInput,
  idea: string,
  level: IntelligenceLevel,
  abortController: AbortController,
): Promise<BossChatResult> {
  const { userId } = input;
  const tier = INTELLIGENCE_TIERS[level];
  const conversationId = input.conversationId || uuidv4();

  const { broadcastToUser } = await import("./ws");

  try {
    broadcastToUser(userId, "pipelines", "build_started", { conversationId, idea });

    // Phase 1: Research
    eventBus.emit(conversationId, "progress", {
      workerType: "research", subAgent: "Market Research", workerIndex: 0,
      status: "running", message: "Researching market and competitors...",
    });
    const research = await executeDepartment(
      conversationId,
      { department: "research", task: `Research this business idea thoroughly: "${idea}". Analyze: target market, competitors, pricing models, key features needed, tech stack recommendations. Be specific with data.` },
      level, estimateComplexity(idea),
    );
    eventBus.emit(conversationId, "step_complete", {
      workerType: "research", subAgent: "Market Research", workerIndex: 0,
      status: "complete", tokens: research.totalTokens,
    });

    // Phase 2: In parallel — Writer + Coder + Artist
    eventBus.emit(conversationId, "progress", {
      workerType: "writer", subAgent: "Copywriter", workerIndex: 1,
      status: "running", message: "Writing website copy...",
    });
    eventBus.emit(conversationId, "progress", {
      workerType: "coder", subAgent: "Landing Page Builder", workerIndex: 2,
      status: "running", message: "Building landing page...",
    });
    eventBus.emit(conversationId, "progress", {
      workerType: "artist", subAgent: "Visual Designer", workerIndex: 3,
      status: "running", message: "Creating brand visuals...",
    });

    const [copyResult, codeResult, artResult] = await Promise.allSettled([
      executeDepartment(conversationId,
        { department: "writer", task: `Based on this research:\n${research.finalOutput.slice(0, 2000)}\n\nWrite complete website copy for "${idea}": hero headline, subheadline, 3-4 feature descriptions, pricing section (free/pro/enterprise), FAQ (5 questions), footer text, and 5 email templates (welcome, onboarding series). Make it compelling and conversion-focused.` },
        level, "complex" as any,
      ),
      executeDepartment(conversationId,
        { department: "coder", task: `Build a complete, production-ready landing page for "${idea}". Requirements from research:\n${research.finalOutput.slice(0, 1500)}\n\nCreate a single HTML file with Tailwind CSS (CDN), modern dark theme, hero section, features grid, pricing table, testimonials, FAQ accordion, email signup form, and footer. Make it responsive and beautiful. Include smooth scroll, animations, and proper SEO meta tags.` },
        level, "complex" as any,
      ),
      executeDepartment(conversationId,
        { department: "artist", task: `Create a professional logo or hero image for a product called "${idea}". Make it modern, clean, and suitable for a tech/SaaS product.` },
        level, "simple" as any,
      ),
    ]);

    // Mark parallel phase complete
    eventBus.emit(conversationId, "step_complete", { workerType: "writer", subAgent: "Copywriter", workerIndex: 1, status: copyResult.status === "fulfilled" ? "complete" : "error" });
    eventBus.emit(conversationId, "step_complete", { workerType: "coder", subAgent: "Landing Page Builder", workerIndex: 2, status: codeResult.status === "fulfilled" ? "complete" : "error" });
    eventBus.emit(conversationId, "step_complete", { workerType: "artist", subAgent: "Visual Designer", workerIndex: 3, status: artResult.status === "fulfilled" ? "complete" : "error" });

    // Phase 3: Synthesize
    eventBus.emit(conversationId, "progress", {
      workerType: "boss", subAgent: "Project Packager", workerIndex: 4,
      status: "running", message: "Packaging final deliverable...",
    });

    const copy = copyResult.status === "fulfilled" ? copyResult.value.finalOutput : "Copy generation failed";
    const code = codeResult.status === "fulfilled" ? codeResult.value.finalOutput : "Code generation failed";
    const artOutput = artResult.status === "fulfilled" ? artResult.value : null;

    const synthesis = await modelRouter.chat({
      model: tier.bossModel,
      messages: [{
        role: "user",
        content: `I just built a complete project for "${idea}". Package everything into a final deliverable.

RESEARCH:
${research.finalOutput.slice(0, 1500)}

WEBSITE COPY:
${copy.slice(0, 2000)}

LANDING PAGE CODE:
${code.slice(0, 3000)}

${artOutput?.imageUrl ? `LOGO/IMAGE: ${artOutput.imageUrl}` : ""}

Create a comprehensive project package with:
1. Executive summary of the business
2. The complete landing page as an <artifact type="html" title="Landing Page: ${idea.slice(0, 30)}"> (merge the copy into the code, make it production-ready)
3. Marketing copy package
4. Next steps checklist (domain, hosting, payments, launch)

Use <artifact> tags for the landing page HTML.`,
      }],
      systemPrompt: "You are a startup builder. Package project deliverables into polished, actionable outputs. Use <artifact> tags for renderable HTML.",
      signal: abortController.signal,
    });

    broadcastToUser(userId, "pipelines", "build_phase", { conversationId, phase: "package", status: "complete" });
    broadcastToUser(userId, "pipelines", "build_complete", { conversationId, idea });

    const totalTokens = research.totalTokens + synthesis.usage.totalTokens +
      (copyResult.status === "fulfilled" ? copyResult.value.totalTokens : 0) +
      (codeResult.status === "fulfilled" ? codeResult.value.totalTokens : 0);

    const reply = `# Project Built: ${idea}\n\n${synthesis.content}`;

    await storage.createBossMessage({
      id: uuidv4(), conversationId, role: "assistant", content: reply,
      tokenCount: totalTokens, model: tier.bossModel, createdAt: Date.now(),
    });

    return { conversationId, reply, isDelegating: false, tokenCount: totalTokens, level };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { conversationId, reply: "Build cancelled.", isDelegating: false, tokenCount: 0, level };
    }
    return { conversationId, reply: `Build failed: ${err.message}`, isDelegating: false, tokenCount: 0, level };
  }
}

// ── Agent Swarm (parallel multi-department coordination with live updates) ────

async function handleSwarm(
  input: BossChatInput,
  goal: string,
  level: IntelligenceLevel,
  abortController: AbortController,
): Promise<BossChatResult> {
  const { userId, userEmail } = input;
  const tier = INTELLIGENCE_TIERS[level];
  const conversationId = input.conversationId || uuidv4();

  await storage.createBossMessage({
    id: uuidv4(), conversationId, role: "user", content: `/swarm ${goal}`,
    tokenCount: 0, model: null, createdAt: Date.now(),
  });

  try {
    // Step 1: Boss decomposes the goal into parallel agent tasks
    eventBus.emit(conversationId, "progress", {
      workerType: "boss", subAgent: "Swarm Planner", workerIndex: 0,
      status: "running", message: "Planning parallel agent tasks...",
    });

    const planResult = await modelRouter.chat({
      model: tier.bossModel,
      messages: [{ role: "user", content: goal }],
      systemPrompt: `You are a project coordinator. Break this goal into 3-6 parallel tasks that different specialist departments can work on SIMULTANEOUSLY. Return ONLY a JSON array:
[
  {"department": "research", "task": "specific task description", "label": "short label"},
  {"department": "writer", "task": "specific task description", "label": "short label"},
  {"department": "coder", "task": "specific task description", "label": "short label"}
]
Available departments: research, writer, coder, artist
Each task should be independent enough to run in parallel. Be specific in task descriptions.`,
      signal: abortController.signal,
    });

    let tasks: Array<{ department: string; task: string; label: string }> = [];
    try {
      const match = planResult.content.match(/\[[\s\S]*\]/);
      tasks = match ? JSON.parse(match[0]) : [];
    } catch {
      tasks = [{ department: "research", task: goal, label: "Research" }];
    }

    if (tasks.length === 0) tasks = [{ department: "research", task: goal, label: "Research" }];

    eventBus.emit(conversationId, "step_complete", {
      workerType: "boss", subAgent: "Swarm Planner", workerIndex: 0,
      status: "complete", output: `Planned ${tasks.length} parallel agents`,
    });

    // Broadcast swarm start to all user devices
    const { broadcastToUser } = await import("./ws");
    broadcastToUser(userId, "pipelines", "swarm_started", {
      conversationId, goal, agents: tasks.map(t => ({ department: t.department, label: t.label, status: "running" })),
    });

    // Step 2: Run ALL tasks in parallel
    const results = await Promise.allSettled(
      tasks.map(async (task, index) => {
        eventBus.emit(conversationId, "progress", {
          workerType: task.department, subAgent: task.label, workerIndex: index + 1,
          status: "running", message: `${task.label} working...`,
        });
        broadcastToUser(userId, "pipelines", "swarm_agent_update", {
          conversationId, index, department: task.department, label: task.label, status: "running",
        });

        const result = await executeDepartment(
          conversationId,
          { department: task.department as any, task: task.task },
          level,
          estimateComplexity(task.task),
        );

        eventBus.emit(conversationId, "step_complete", {
          workerType: task.department, subAgent: task.label, workerIndex: index + 1,
          status: "complete", output: result.finalOutput.slice(0, 200),
          tokens: result.totalTokens,
        });
        broadcastToUser(userId, "pipelines", "swarm_agent_update", {
          conversationId, index, department: task.department, label: task.label,
          status: "complete", tokens: result.totalTokens,
          preview: result.finalOutput.slice(0, 200),
        });

        return { ...task, output: result.finalOutput, tokens: result.totalTokens };
      })
    );

    // Collect results
    const completedTasks = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return { ...tasks[i], output: `Failed: ${(r as any).reason?.message || "Unknown error"}`, tokens: 0 };
    });

    // Step 3: Synthesize all outputs
    eventBus.emit(conversationId, "progress", {
      workerType: "boss", subAgent: "Synthesizer", workerIndex: tasks.length + 1,
      status: "running", message: "Synthesizing all agent outputs...",
    });

    const synthesisInput = completedTasks.map(t =>
      `### ${t.label} (${t.department})\n${t.output}`
    ).join("\n\n---\n\n");

    const synthesis = await modelRouter.chat({
      model: tier.bossModel,
      messages: [{ role: "user", content: `The following work was done by ${completedTasks.length} agents working in parallel on the goal: "${goal}"\n\n${synthesisInput}\n\nSynthesize all outputs into a cohesive final deliverable. If appropriate, use <artifact> tags for rich HTML output.` }],
      systemPrompt: "You are The Boss — synthesize department outputs into polished responses. Use clean markdown for text content. Only use <artifact> tags for visual/interactive content (landing pages, charts, UI mockups, code demos) — NOT for reports, summaries, or text answers.",
      signal: abortController.signal,
    });

    const totalTokens = planResult.usage.totalTokens + synthesis.usage.totalTokens +
      completedTasks.reduce((s, t) => s + (t.tokens || 0), 0);

    broadcastToUser(userId, "pipelines", "swarm_complete", {
      conversationId, totalAgents: tasks.length, totalTokens,
    });

    const reply = `**Agent Swarm Complete** — ${tasks.length} agents worked in parallel\n\n${synthesis.content}`;

    await storage.createBossMessage({
      id: uuidv4(), conversationId, role: "assistant", content: reply,
      tokenCount: totalTokens, model: tier.bossModel, createdAt: Date.now(),
    });

    return { conversationId, reply, isDelegating: false, tokenCount: totalTokens, level };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { conversationId, reply: "Swarm cancelled.", isDelegating: false, tokenCount: 0, level };
    }
    return { conversationId, reply: `Swarm failed: ${err.message}`, isDelegating: false, tokenCount: 0, level };
  }
}

// ── Design to Code (screenshot/description → React+Tailwind artifact) ────────

async function handleDesignToCode(
  input: BossChatInput,
  request: string,
  level: IntelligenceLevel,
  abortController: AbortController,
): Promise<BossChatResult> {
  const { userId } = input;
  const tier = INTELLIGENCE_TIERS[level];
  const conversationId = input.conversationId || uuidv4();

  try {
    eventBus.emit(conversationId, "progress", {
      workerType: "coder", subAgent: "UI Developer", workerIndex: 0,
      status: "running", message: "Converting design to code...",
    });

    // Use vision if screenshot attached, otherwise use description
    const imageContents = input.imageContents || [];
    const hasImage = imageContents.length > 0;

    const userContent: any = hasImage
      ? [{ type: "text", text: `Convert this design into production-ready code.\n\nAdditional instructions: ${request || "Match the design exactly"}` }, ...imageContents]
      : `Convert this design description into production-ready code:\n\n${request}`;

    const result = await modelRouter.chat({
      model: tier.models?.coder || "gpt-5.4",
      messages: [{ role: "user", content: userContent }],
      systemPrompt: `You are an expert UI developer who converts designs into pixel-perfect code.

When given a screenshot or description, generate a complete, working HTML page with:
- Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Modern, responsive design
- Dark theme matching the original design
- Proper spacing, typography, colors
- Interactive hover states and transitions
- All content from the original design preserved

ALWAYS wrap your output in <artifact type="html" title="Design: [component name]"> tags.
The HTML must be completely self-contained and renderable.
If the design has multiple sections, recreate ALL of them.
Use placeholder images from https://placehold.co/ if needed.
Make buttons, links, and interactive elements functional where possible.`,
      signal: abortController.signal,
    });

    await storage.createBossMessage({
      id: uuidv4(), conversationId, role: "assistant",
      content: result.content,
      tokenCount: result.usage.totalTokens, model: tier.bossModel, createdAt: Date.now(),
    });

    return {
      conversationId, reply: result.content,
      isDelegating: false, tokenCount: result.usage.totalTokens, level,
    };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { conversationId, reply: "Design conversion cancelled.", isDelegating: false, tokenCount: 0, level };
    }
    return { conversationId, reply: `Design failed: ${err.message}`, isDelegating: false, tokenCount: 0, level };
  }
}

// ── Chart / Data Viz (generates interactive charts as artifacts) ──────────────

async function handleChartRequest(
  input: BossChatInput,
  request: string,
  level: IntelligenceLevel,
  abortController: AbortController,
): Promise<BossChatResult> {
  const { userId } = input;
  const tier = INTELLIGENCE_TIERS[level];
  const conversationId = input.conversationId || uuidv4();

  try {
    const result = await modelRouter.chat({
      model: tier.models?.coder || "gpt-5.4",
      messages: [{ role: "user", content: request }],
      systemPrompt: `You are a data visualization expert. Generate an interactive chart based on the user's request.

ALWAYS respond with an <artifact type="html" title="Chart: [description]"> tag containing a complete, self-contained HTML page with:
- Chart.js loaded via CDN: <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
- A <canvas> element for the chart
- A <script> block that creates the chart with proper data, colors, and labels
- Clean, modern styling with white background (#ffffff), dark text
- Responsive sizing

If the user provides CSV data, parse it and visualize it.
If the user asks for a specific chart type (bar, line, pie, radar, etc.), use that type.
If no data is provided, generate realistic sample data based on the request.

Make charts visually beautiful with gradients, proper spacing, and animations.`,
      signal: abortController.signal,
    });

    await storage.createBossMessage({
      id: uuidv4(), conversationId, role: "assistant",
      content: result.content,
      tokenCount: result.usage.totalTokens, model: tier.bossModel, createdAt: Date.now(),
    });

    return {
      conversationId, reply: result.content,
      isDelegating: false, tokenCount: result.usage.totalTokens, level,
    };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { conversationId, reply: "Chart generation cancelled.", isDelegating: false, tokenCount: 0, level };
    }
    return { conversationId, reply: `Chart failed: ${err.message}`, isDelegating: false, tokenCount: 0, level };
  }
}

// ── Deep Research (multi-step web research with citations) ────────────────────

async function handleDeepResearch(
  input: BossChatInput,
  topic: string,
  level: IntelligenceLevel,
  abortController: AbortController,
): Promise<BossChatResult> {
  const { userId, userEmail } = input;
  const tier = INTELLIGENCE_TIERS[level];
  const conversationId = input.conversationId || uuidv4();

  try {
    // Step 1: Decompose the research question into sub-queries
    eventBus.emit(conversationId, "progress", {
      workerType: "research", subAgent: "Boss Planner", workerIndex: 0,
      status: "running", message: "Planning research sub-queries...",
    });

    const planResult = await modelRouter.chat({
      model: tier.bossModel,
      messages: [{ role: "user", content: topic }],
      systemPrompt: `You are a research planner. Break this research question into 3-5 specific sub-queries that together will provide comprehensive coverage. Return ONLY a JSON array of search query strings. Example: ["query 1", "query 2", "query 3"]`,
      signal: abortController.signal,
    });

    let queries: string[] = [];
    try {
      const match = planResult.content.match(/\[[\s\S]*\]/);
      queries = match ? JSON.parse(match[0]) : [topic];
    } catch {
      queries = [topic];
    }

    eventBus.emit(conversationId, "step_complete", {
      workerType: "research", subAgent: "Boss Planner", workerIndex: 0,
      status: "complete", output: `Planned ${queries.length} sub-queries`,
      tokens: planResult.usage.totalTokens,
    });

    // Step 2: Research each sub-query using the Research department
    const findings: string[] = [];
    for (let qi = 0; qi < Math.min(queries.length, 5); qi++) {
      const query = queries[qi];
      eventBus.emit(conversationId, "progress", {
        workerType: "research", subAgent: `Sub-query ${qi + 1}/${queries.length}`,
        workerIndex: qi + 1, status: "running",
        message: `Researching: ${query.slice(0, 80)}...`,
      });

      try {
        const result = await executeDepartment(
          conversationId,
          { department: "research", task: `Research this specific question thoroughly: "${query}". Provide detailed findings with specific facts, data points, and sources.` },
          level,
          estimateComplexity(query),
        );
        findings.push(`### Sub-query: ${query}\n\n${result.finalOutput}`);

        eventBus.emit(conversationId, "step_complete", {
          workerType: "research", subAgent: `Sub-query ${qi + 1}`,
          workerIndex: qi + 1, status: "complete",
          output: result.finalOutput.slice(0, 200),
          tokens: result.totalTokens,
        });
      } catch (err: any) {
        findings.push(`### Sub-query: ${query}\n\n*Research failed: ${err.message}*`);
        eventBus.emit(conversationId, "step_complete", {
          workerType: "research", subAgent: `Sub-query ${qi + 1}`,
          workerIndex: qi + 1, status: "error", error: err.message,
        });
      }
    }

    // Step 3: Synthesize into a comprehensive cited report
    eventBus.emit(conversationId, "progress", {
      workerType: "writer", subAgent: "Synthesizer",
      workerIndex: queries.length + 1, status: "running",
      message: "Synthesizing research into final report...",
    });
    const synthesisResult = await modelRouter.chat({
      model: tier.models?.writer || "gpt-5.4",
      messages: [{
        role: "user",
        content: `Synthesize these research findings into a comprehensive, well-structured report on: "${topic}"

RESEARCH FINDINGS:
${findings.join("\n\n---\n\n")}

Write a professional report with:
1. Executive Summary (2-3 sentences)
2. Key Findings (organized by theme, not by sub-query)
3. Detailed Analysis
4. Conclusions & Recommendations
5. Sources (list all sources mentioned in the findings)

Use clear markdown headings (##), bullet points, and data where available.
Do NOT use <artifact> tags — write the report as clean markdown text directly in the chat.
Only use artifacts for visual/interactive content like charts, landing pages, or code demos — NOT for text reports.`,
      }],
      systemPrompt: "You are a senior research analyst. Write comprehensive, well-cited reports in clean markdown. Do NOT use <artifact> tags for text reports — just write directly.",
      signal: abortController.signal,
    });

    const totalTokens = planResult.usage.totalTokens + synthesisResult.usage.totalTokens;

    await storage.createBossMessage({
      id: uuidv4(), conversationId, role: "assistant",
      content: synthesisResult.content,
      tokenCount: totalTokens, model: tier.bossModel, createdAt: Date.now(),
    });

    return {
      conversationId,
      reply: synthesisResult.content,
      isDelegating: false,
      tokenCount: totalTokens,
      level,
    };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { conversationId, reply: "Research cancelled.", isDelegating: false, tokenCount: 0, level };
    }
    return { conversationId, reply: `Research failed: ${err.message}`, isDelegating: false, tokenCount: 0, level };
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
    [{ id: "artist" as DepartmentId, task: message }], abortController.signal, input.userEmail)
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
  userEmail?: string,
  humanize?: boolean,
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

    // Detect if departments have dependencies (research/reader → writer/coder)
    // If so, run producers first, then consumers with shared context
    const producers = departments.filter(d => d.id === "research" || d.id === "reader");
    const consumers = departments.filter(d => d.id !== "research" && d.id !== "reader");
    const hasChain = producers.length > 0 && consumers.length > 0;

    let results: DepartmentResult[];

    if (hasChain) {
      // Phase 1: Run producers (research/reader) in parallel
      const producerResults = await Promise.all(
        producers.map(dept =>
          executeDepartment(parentJobId, { department: dept.id, task: dept.task }, level, complexity, signal)
            .catch(err => ({
              department: dept.id, finalOutput: `[${dept.id} department error: ${err.message}]`,
              subAgentResults: [], totalTokens: 0, totalDurationMs: 0,
            } as DepartmentResult))
        )
      );

      // Build shared context from producer outputs
      const sharedContext = producerResults
        .filter(r => !r.finalOutput.startsWith("["))
        .map(r => `--- ${r.department.toUpperCase()} FINDINGS ---\n${r.finalOutput.slice(0, 2000)}`)
        .join("\n\n");

      // Phase 2: Run consumers with shared context from producers
      const consumerResults = await Promise.all(
        consumers.map(dept => {
          const enrichedTask = sharedContext
            ? `${dept.task}\n\nCONTEXT FROM OTHER DEPARTMENTS:\n${sharedContext}`
            : dept.task;
          return executeDepartment(parentJobId, { department: dept.id, task: enrichedTask }, level, complexity, signal,
            dept.id === "coder" ? github : undefined)
            .catch(err => ({
              department: dept.id, finalOutput: `[${dept.id} department error: ${err.message}]`,
              subAgentResults: [], totalTokens: 0, totalDurationMs: 0,
            } as DepartmentResult));
        })
      );

      results = [...producerResults, ...consumerResults];
    } else {
      // No dependencies — run all departments in parallel (original behavior)
      results = await Promise.all(
        departments.map(dept =>
          executeDepartment(parentJobId, { department: dept.id, task: dept.task }, level, complexity, signal,
            dept.id === "coder" ? github : undefined)
            .catch(err => ({
              department: dept.id, finalOutput: `[${dept.id} department error: ${err.message}]`,
              subAgentResults: [], totalTokens: 0, totalDurationMs: 0,
            } as DepartmentResult))
        )
      );
    }

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

PRESENTATION RULES:
- Default to clean markdown for ALL text content (reports, analysis, summaries, articles, emails)
- Only use <artifact type="html"> when the user explicitly asked for a webpage, landing page, or interactive UI
- Only use <artifact type="svg"> when the user asked for a diagram or graphic
- Only use <artifact type="code"> for standalone code files the user asked to be built
- If you DO create an artifact, it must be FULLY FUNCTIONAL with all sections complete — no empty tabs, no placeholder content, no broken navigation. If you can't finish it completely, use markdown instead.
- For images that were generated: mention they were created
- Be concise — let the content speak for itself`;

    const synthesis = await modelRouter.chat({
      model: bossModel,
      messages: [{ role: "user", content: synthesisPrompt }],
      systemPrompt: "You are The Boss — synthesize department outputs into polished responses. Use clean markdown for text content. Only use <artifact> tags for visual/interactive content (landing pages, charts, UI mockups, code demos) — NOT for reports, summaries, or text answers.",
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

    // Apply humanizer if /human was used on a department dispatch
    let synthesisContent = synthesis.content;
    if (humanize) {
      eventBus.emit(parentJobId, "progress", {
        workerType: "humanizer", subAgent: "Humanizer",
        status: "running", message: "Humanizing output to pass AI detection...",
      });
      synthesisContent = await humanizeText(synthesisContent);
    }

    // Stream synthesis to client
    const chunks = chunkText(synthesisContent, 30);
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
          const result = await obsidianExec(obsConnector.id, "write_note", { path: customPath, content: synthesis.content });
          if (result.ok) savedPaths.push(customPath);
        } else {
          // Auto-organize: save each department's output to its own folder
          for (const r of deptResults) {
            const deptFolder = r.department.charAt(0).toUpperCase() + r.department.slice(1);
            const notePath = `${deptFolder}/${timestamp}-${slug}.md`;
            const header = `# ${originalMessage.slice(0, 80)}\n*Generated: ${new Date().toLocaleString()} | Department: ${deptFolder} | User: ${userEmail || "unknown"}*\n\n---\n\n`;
            let body = r.finalOutput;
            // Embed image if Artist department produced one
            if (r.imageUrl) {
              const imgUrl = r.imageUrl.startsWith("/") ? `${process.env.APP_URL || "http://localhost:3000"}${r.imageUrl}` : r.imageUrl;
              body += `\n\n## Generated Image\n![Generated Image](${imgUrl})\n`;
            }
            const result = await obsidianExec(obsConnector.id, "write_note", { path: notePath, content: header + body });
            if (result.ok) savedPaths.push(notePath);
          }

          // Save the full synthesis with embedded images and source links
          const synthPath = deptResults.length > 1 ? `Synthesis/${timestamp}-${slug}.md` : `${deptResults[0].department.charAt(0).toUpperCase() + deptResults[0].department.slice(1)}/${timestamp}-${slug}.md`;
          if (deptResults.length > 1) {
            const header = `# ${originalMessage.slice(0, 80)}\n*Synthesized: ${new Date().toLocaleString()} | Departments: ${departments.map(d => d.id).join(", ")} | User: ${userEmail || "unknown"}*\n\n---\n\n`;
            let synthBody = synthesis.content;
            // Append any generated images
            const imageResults = deptResults.filter(r => r.imageUrl);
            if (imageResults.length > 0) {
              synthBody += "\n\n## Generated Images\n";
              for (const img of imageResults) {
                const imgUrl = img.imageUrl!.startsWith("/") ? `${process.env.APP_URL || "http://localhost:3000"}${img.imageUrl}` : img.imageUrl;
                synthBody += `![${img.department} output](${imgUrl})\n`;
              }
            }
            const result = await obsidianExec(obsConnector.id, "write_note", { path: synthPath, content: header + synthBody });
            if (result.ok) savedPaths.push(synthPath);
          }

          // Save the user's original prompt to an Inputs log
          const inputPath = `Inputs/${timestamp}-${slug}.md`;
          const inputContent = `# Prompt\n*${new Date().toLocaleString()} | Level: ${level} | Departments: ${departments.map(d => d.id).join(", ")}*\n\n---\n\n${originalMessage}`;
          const inputResult = await obsidianExec(obsConnector.id, "write_note", { path: inputPath, content: inputContent });
          if (inputResult.ok) savedPaths.push(inputPath);
        }

        if (savedPaths.length > 0) {
          const pathList = savedPaths.map(p => `\`${p}\``).join(", ");
          eventBus.emit(parentJobId, "token", { workerType: "boss", text: `\n\n📁 *Saved to Obsidian vault: ${pathList}*`, isSynthesis: true });

          // Auto-link notes to related vault content (runs in background)
          for (const sp of savedPaths) {
            if (!sp.startsWith("Inputs/")) {
              const readResult = await obsidianExec(obsConnector.id, "read_note", { path: sp });
              if (readResult.ok && readResult.data?.content) {
                autoLinkNote(sp, readResult.data.content).catch(() => {});
              }
            }
          }

          // Auto-reflection: run every 5 tasks to find patterns
          try {
            const { runReflection } = await import("./lib/vaultBrain.js");
            const deptStats = await storage.getDepartmentStats(userId);
            const taskCount = deptStats.reduce((sum: number, d: any) => sum + d.total, 0);
            if (taskCount > 0 && taskCount % 5 === 0) {
              runReflection().catch(() => {});
            }
          } catch {}
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
      await storage.insertActivityEvent({ id: uuidv4(), userId, type: "task_complete", title: "Task completed: " + deptList, description: originalMessage.slice(0, 200), metadata: { departments: departments.map(d => d.id), totalTokens } });
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

