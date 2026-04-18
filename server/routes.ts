import type { Express } from "express";
import { createServer, type Server } from "http";
import fs from "fs";
import path from "path";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { storage } from "./storage";
import { dbRun, dbGet, dbAll } from "./lib/db";
import { insertWorkflowSchema, insertAgentSchema, insertJobSchema, insertMessageSchema, insertAuditReviewSchema } from "@shared/schema";
import { runAgentChat } from "./ai";
import { registerStripeRoutes } from "./stripe";
import { createAuthRouter, createOwnerRouter, authMiddleware, collectIntelligence } from "./auth";
import { createConnectorsRouter, createWebhookInboundRouter } from "./connectors";
import { createPipelineRouter } from "./pipelines";
import { createBotRouter } from "./bots";
import { createWorkshopRouter } from "./workshop";
import { createPluginsRouter } from "./plugins";
import githubRouter from "./routes/github";
import cookieParser from "cookie-parser";
import { handleBossChat, cancelConversation } from "./boss";
import { handleSSEStream } from "./sse";
import { eventBus } from "./lib/eventBus";
import { encrypt, decrypt, maskKey } from "./lib/crypto";
import { MODEL_DEFAULTS, FALLBACK_CHAINS } from "./lib/modelDefaults";
import { CODER_SYSTEM_PROMPT } from "./agents/coder";
import { ART_SYSTEM_PROMPT } from "./agents/art";
const REASONING_SYSTEM_PROMPT = "You are a reasoning agent. Think step by step.";
import { classifyTier } from "./lib/tierClassifier";
import { TIER_CREDIT_LIMITS, requireCredits } from "./lib/rateLimiter";
import { INTELLIGENCE_TIERS } from "./departments/types";
import { broadcastToUser } from "./ws";
import { createTracesRouter } from "./traces";
import { createMemoryRouter } from "./memory";
import { createMcpRouter } from "./mcp";
import { createArtifactsRouter } from "./artifacts";
import { createEvalsRouter } from "./evals";
import { createWorkspacesRouter } from "./workspaces";
import { createApiKeyRouter, createSdkRouter } from "./sdk";
import { createCloneRouter } from "./clone";
import { createPulseRouter } from "./pulse";

// In-memory cache for dashboard stats (60s TTL, avoids Redis dependency)
const statsCache = new Map<string, { data: any; ts: number }>();

/** Wrap async route handlers to catch unhandled errors and forward to Express error handler */
type AsyncHandler = (req: any, res: any, next?: any) => Promise<any>;
function asyncHandler(fn: AsyncHandler) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // === HEALTH (no auth) — verifies DB connectivity ===
  app.get("/api/health", async (_req, res) => {
    let dbOk = false;
    try {
      await dbGet("SELECT 1");
      dbOk = true;
    } catch {}
    const status = dbOk ? "ok" : "degraded";
    res.status(dbOk ? 200 : 503).json({
      status,
      timestamp: Date.now(),
      version: "2.0.0",
      database: dbOk ? "connected" : "error",
      uptime: Math.round(process.uptime()),
    });
  });

  // === SDK API (own auth via API keys, before session auth) ===
  app.use("/api/sdk", createSdkRouter());

  // === COOKIE PARSER + AUTH ===
  app.use(cookieParser());
  app.use("/api/auth", createAuthRouter());
  app.use(authMiddleware);
  app.use("/api/owner", createOwnerRouter());
  app.use("/api/connectors", createConnectorsRouter());
  app.use("/api/pipelines", createPipelineRouter());
  app.use("/api/workshop", createWorkshopRouter());
  app.use("/api/plugins", createPluginsRouter());
  app.use("/api/bots", createBotRouter());
  app.use("/api/webhooks/inbound", createWebhookInboundRouter());
  app.use("/api/github", githubRouter);
  app.use("/api/traces", createTracesRouter());
  app.use("/api/memory", createMemoryRouter());
  app.use("/api/mcp", createMcpRouter());
  app.use("/api/artifacts", createArtifactsRouter());
  app.use("/api/evals", createEvalsRouter());
  app.use("/api/workspaces", createWorkspacesRouter());
  app.use("/api/keys", createApiKeyRouter());
  app.use("/api/clone", createCloneRouter());
  app.use("/api/pulse", createPulseRouter());

  // ── Local File System Access (for Editor) ───────────────────────────────
  // READ: owner-only in production, anyone in dev
  // WRITE: dev only (never in production)
  const IS_PROD = process.env.NODE_ENV === "production";
  const ALLOWED_ROOT = path.resolve(process.cwd());

  /** Validate a file path is within the allowed root and not a secret file */
  function isPathSafe(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(ALLOWED_ROOT)) return false;
    // Block .env files, credentials, tokens, and secrets
    const base = path.basename(resolved).toLowerCase();
    if (base === ".env" || base.startsWith(".env.") || base === "credentials.json" || base === "token.json") return false;
    return true;
  }

  /** Check if user is the owner account */
  function isOwner(req: any): boolean {
    return req.user?.role === "owner";
  }

  app.get("/api/local/tree", async (req, res) => {
    // In production, only owner can browse files
    if (IS_PROD && !isOwner(req)) return res.status(403).json({ error: "Owner access required" });
    const rootPath = path.resolve((req.query.root as string) || process.cwd());
    if (!isPathSafe(rootPath)) return res.status(403).json({ error: "Path not allowed" });
    if (!fs.existsSync(rootPath)) return res.status(404).json({ error: "Path not found" });

    const ignored = new Set(["node_modules", ".git", "dist", ".tmp", ".next", "__pycache__", ".venv", "venv", "uploads"]);
    const walk = (dir: string, prefix = ""): Array<{ path: string; type: "blob" | "tree" }> => {
      const entries: Array<{ path: string; type: "blob" | "tree" }> = [];
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          if (item.name.startsWith(".")) continue; // Skip all dotfiles in tree
          if (ignored.has(item.name)) continue;
          const rel = prefix ? `${prefix}/${item.name}` : item.name;
          if (item.isDirectory()) {
            entries.push({ path: rel, type: "tree" });
            entries.push(...walk(path.join(dir, item.name), rel));
          } else {
            entries.push({ path: rel, type: "blob" });
          }
        }
      } catch {}
      return entries;
    };
    res.json({ tree: walk(rootPath), root: rootPath });
  });

  app.get("/api/local/file", async (req, res) => {
    // In production, only owner can read files
    if (IS_PROD && !isOwner(req)) return res.status(403).json({ error: "Owner access required" });
    const filePath = path.resolve(req.query.path as string || "");
    if (!isPathSafe(filePath)) return res.status(403).json({ error: "Path not allowed" });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: `Not found: ${filePath}` });
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      res.json({ content, path: filePath });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/local/file", async (req, res) => {
    // Write access: NEVER in production, dev only
    if (IS_PROD) return res.status(403).json({ error: "File writing disabled in production" });
    const { path: rawPath, content } = req.body;
    if (!rawPath || content === undefined) return res.status(400).json({ error: "path and content required" });
    const filePath = path.resolve(rawPath);
    if (!isPathSafe(filePath)) return res.status(403).json({ error: "Path not allowed" });
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, "utf-8");
    res.json({ ok: true, path: filePath });
  });

  // === WORKFLOWS ===
  app.get("/api/workflows", asyncHandler(async (_req, res) => {
    const data = await storage.getWorkflows();
    res.json(data);
  }));

  app.get("/api/workflows/:id", asyncHandler(async (req, res) => {
    const w = await storage.getWorkflow(Number(req.params.id));
    if (!w) return res.status(404).json({ error: "Not found" });
    res.json(w);
  }));

  app.post("/api/workflows", asyncHandler(async (req, res) => {
    const parsed = insertWorkflowSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const w = await storage.createWorkflow(parsed.data);
    res.status(201).json(w);
  }));

  app.patch("/api/workflows/:id", asyncHandler(async (req, res) => {
    const w = await storage.updateWorkflow(Number(req.params.id), req.body);
    if (!w) return res.status(404).json({ error: "Not found" });
    res.json(w);
  }));

  app.delete("/api/workflows/:id", asyncHandler(async (req, res) => {
    await storage.deleteWorkflow(Number(req.params.id));
    res.status(204).end();
  }));

  // === CANVAS STATE ===
  app.get("/api/workflows/:id/canvas", async (req, res) => {
    const w = await storage.getWorkflow(Number(req.params.id));
    if (!w) return res.status(404).json({ error: "Not found" });
    res.json({ canvasState: w.canvasState ? JSON.parse(w.canvasState) : null });
  });

  app.put("/api/workflows/:id/canvas", async (req, res) => {
    const id = Number(req.params.id);
    const w = await storage.getWorkflow(id);
    if (!w) return res.status(404).json({ error: "Not found" });
    const canvasJson = JSON.stringify(req.body.canvasState);
    await storage.updateWorkflow(id, { canvasState: canvasJson } as any);
    // Auto-create version snapshot
    const versions = await storage.getWorkflowVersions(id);
    const nextVersion = versions.length > 0 ? versions[0].versionNumber + 1 : 1;
    await storage.createWorkflowVersion({
      workflowId: id,
      versionNumber: nextVersion,
      graphState: canvasJson,
      label: req.body.label || null,
    });
    res.json({ saved: true, version: nextVersion });
  });

  // === VERSION HISTORY ===
  app.get("/api/workflows/:id/versions", async (req, res) => {
    const versions = await storage.getWorkflowVersions(Number(req.params.id));
    res.json(versions);
  });

  app.get("/api/workflows/:id/versions/:vid", async (req, res) => {
    const v = await storage.getWorkflowVersion(Number(req.params.vid));
    if (!v) return res.status(404).json({ error: "Version not found" });
    res.json(v);
  });

  app.post("/api/workflows/:id/restore/:vid", async (req, res) => {
    const v = await storage.getWorkflowVersion(Number(req.params.vid));
    if (!v) return res.status(404).json({ error: "Version not found" });
    await storage.updateWorkflow(Number(req.params.id), { canvasState: v.graphState } as any);
    res.json({ restored: true, version: v.versionNumber });
  });

  // === TEMPLATES ===
  app.get("/api/templates", async (_req, res) => {
    const templates = await storage.getPublicTemplates();
    res.json(templates);
  });

  app.post("/api/workflows/:id/export-template", async (req, res) => {
    const w = await storage.getWorkflow(Number(req.params.id));
    if (!w) return res.status(404).json({ error: "Not found" });
    res.json({
      name: w.name,
      description: w.description,
      canvasState: w.canvasState ? JSON.parse(w.canvasState) : null,
      templateCategory: w.templateCategory,
    });
  });

  app.post("/api/workflows/import-template", async (req, res) => {
    const { name, description, canvasState, templateCategory } = req.body;
    const w = await storage.createWorkflow({
      name: name || "Imported Workflow",
      description: description || "",
      status: "draft",
      priority: "medium",
      canvasState: canvasState ? JSON.stringify(canvasState) : null,
      templateCategory: templateCategory || null,
    } as any);
    res.status(201).json(w);
  });

  // === AGENTS ===
  app.get("/api/agents", async (_req, res) => {
    const data = await storage.getAgents();
    res.json(data);
  });

  app.get("/api/agents/:id", async (req, res) => {
    const a = await storage.getAgent(Number(req.params.id));
    if (!a) return res.status(404).json({ error: "Not found" });
    res.json(a);
  });

  app.get("/api/workflows/:id/agents", async (req, res) => {
    const data = await storage.getAgentsByWorkflow(Number(req.params.id));
    res.json(data);
  });

  app.post("/api/agents", async (req, res) => {
    const parsed = insertAgentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const a = await storage.createAgent(parsed.data);
    res.status(201).json(a);
  });

  app.patch("/api/agents/:id", async (req, res) => {
    const a = await storage.updateAgent(Number(req.params.id), req.body);
    if (!a) return res.status(404).json({ error: "Not found" });
    res.json(a);
  });

  app.delete("/api/agents/:id", async (req, res) => {
    await storage.deleteAgent(Number(req.params.id));
    res.status(204).end();
  });

  // === JOBS ===
  app.get("/api/jobs", async (_req, res) => {
    const data = await storage.getJobs();
    res.json(data);
  });

  app.get("/api/workflows/:id/jobs", async (req, res) => {
    const data = await storage.getJobsByWorkflow(Number(req.params.id));
    res.json(data);
  });

  app.post("/api/jobs", async (req, res) => {
    const parsed = insertJobSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const j = await storage.createJob(parsed.data);
    res.status(201).json(j);
  });

  app.patch("/api/jobs/:id", async (req, res) => {
    const j = await storage.updateJob(Number(req.params.id), req.body);
    if (!j) return res.status(404).json({ error: "Not found" });
    res.json(j);
  });

  // === MESSAGES (Agent Chat) ===
  app.get("/api/agents/:id/messages", async (req, res) => {
    const data = await storage.getMessagesByAgent(Number(req.params.id));
    res.json(data);
  });

  app.post("/api/agents/:id/messages", requireCredits(), async (req, res) => {
    const agentId = Number(req.params.id);
    const { content, role } = req.body;

    // Only trigger AI when the user sends a message
    if (role !== "user") {
      const parsed = insertMessageSchema.safeParse({ agentId, role, content });
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const m = await storage.createMessage(parsed.data);
      return res.status(201).json(m);
    }

    // Save user message first
    const userMsg = await storage.createMessage({ agentId, role: "user", content });

    // Fetch agent info + conversation history
    const agent = await storage.getAgent(agentId);
    const history = await storage.getMessagesByAgent(agentId);

    // Call AI
    try {
      await storage.updateAgent(agentId, { status: "working" });
      const { reply, inputTokens, outputTokens, totalTokens } = await runAgentChat(
        agent?.model || "claude-sonnet",
        agent?.systemPrompt,
        history.slice(-8).map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
        content
      );
      await storage.updateAgent(agentId, { status: "idle" });

      const currentUserId = req.user?.id || 1;
      await storage.recordTokenUsage({
        userId: currentUserId,
        model: agent?.model || "claude-sonnet",
        inputTokens,
        outputTokens,
        totalTokens,
        endpoint: "agent_chat",
      });
      const plan = await storage.getUserPlan(currentUserId);
      if (plan) await storage.updateUserPlan(plan.id, { tokensUsed: plan.tokensUsed + totalTokens });

      // Owner intelligence collection
      collectIntelligence({
        userId: currentUserId,
        userEmail: req.user?.email,
        eventType: "agent_chat",
        model: agent?.model || "claude-sonnet",
        inputData: JSON.stringify({ agentId, content }),
        outputData: JSON.stringify({ reply: reply.substring(0, 2000) }),
        tokensUsed: totalTokens,
        metadata: JSON.stringify({ agentRole: agent?.role }),
      });

      const assistantMsg = await storage.createMessage({ agentId, role: "assistant", content: reply });
      return res.status(201).json({ userMessage: userMsg, assistantMessage: assistantMsg });
    } catch (err: any) {
      await storage.updateAgent(agentId, { status: "error" });
      const errMsg = await storage.createMessage({
        agentId,
        role: "assistant",
        content: `Error: ${err?.message || "AI call failed"}`,
      });
      return res.status(201).json({ userMessage: userMsg, assistantMessage: errMsg });
    }
  });

  // === AUDIT REVIEWS ===
  app.get("/api/audit-reviews", async (_req, res) => {
    const data = await storage.getAuditReviews();
    res.json(data);
  });

  app.get("/api/jobs/:id/audit-reviews", async (req, res) => {
    const data = await storage.getAuditReviewsByJob(Number(req.params.id));
    res.json(data);
  });

  app.post("/api/audit-reviews", async (req, res) => {
    const parsed = insertAuditReviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const r = await storage.createAuditReview(parsed.data);
    res.status(201).json(r);
  });

  // === STATS (Dashboard KPIs) — uses COUNT aggregates instead of loading full tables ===
  app.get("/api/stats", async (_req, res) => {
    const [
      totalWorkflows, activeWorkflows, totalAgents, workingAgents,
      totalJobs, completedJobs, failedJobs, totalReviews, passedReviews,
    ] = await Promise.all([
      dbGet("SELECT COUNT(*) as c FROM workflows") as Promise<any>,
      dbGet("SELECT COUNT(*) as c FROM workflows WHERE status = 'active'") as Promise<any>,
      dbGet("SELECT COUNT(*) as c FROM agents") as Promise<any>,
      dbGet("SELECT COUNT(*) as c FROM agents WHERE status = 'working'") as Promise<any>,
      dbGet("SELECT COUNT(*) as c FROM jobs") as Promise<any>,
      dbGet("SELECT COUNT(*) as c FROM jobs WHERE status = 'completed'") as Promise<any>,
      dbGet("SELECT COUNT(*) as c FROM jobs WHERE status = 'failed'") as Promise<any>,
      dbGet("SELECT COUNT(*) as c FROM audit_reviews") as Promise<any>,
      dbGet("SELECT COUNT(*) as c FROM audit_reviews WHERE verdict = 'pass'") as Promise<any>,
    ]);
    res.json({
      totalWorkflows: totalWorkflows?.c || 0,
      activeWorkflows: activeWorkflows?.c || 0,
      totalAgents: totalAgents?.c || 0,
      workingAgents: workingAgents?.c || 0,
      totalJobs: totalJobs?.c || 0,
      completedJobs: completedJobs?.c || 0,
      failedJobs: failedJobs?.c || 0,
      totalReviews: totalReviews?.c || 0,
      passedReviews: passedReviews?.c || 0,
    });
  });

  // === ESCALATIONS ===
  app.get("/api/escalations", async (_req, res) => {
    const data = await storage.getEscalations();
    res.json(data);
  });
  app.patch("/api/escalations/:id", async (req, res) => {
    const e = await storage.updateEscalation(Number(req.params.id), req.body);
    if (!e) return res.status(404).json({ error: "Not found" });
    res.json(e);
  });

  // === BOSS CHAT (v2: intelligence levels + department dispatch) ===
  app.post("/api/boss/chat", requireCredits(), async (req, res) => {
    const { message, conversationId, history, level, attachments, imageBase64 } = req.body as {
      message: string;
      conversationId?: string;
      history?: { role: "user" | "assistant"; content: string }[];
      level?: string;
      attachments?: Array<{ id: string; url: string; mimeType: string; name: string }>;
      imageBase64?: string; // Direct base64 screenshot from Bun Bun mode
    };
    // Allow empty message if there are attachments
    if (!message && !attachments?.length && !imageBase64) {
      return res.status(400).json({ error: "message or attachment required" });
    }

    try {
      const userId = req.user?.id || 1;
      const validLevels = ["entry", "medium", "max"];
      const intelligenceLevel = validLevels.includes(level || "") ? level as any : "medium";

      // Build image content for vision models
      let imageContents: Array<{ type: "image_url"; image_url: { url: string } }> = [];
      // PDF document blocks for Claude native document input
      let documentContents: Array<{ type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string }; name?: string }> = [];
      // Text file contents to append to the message
      let textFileContents = "";

      // 5,000-word essays ≈ 30K chars. Claude has 200K context — leave room for system prompts,
      // sub-agent outputs, and history. 150K per file is generous without risking context overflow.
      const TEXT_FILE_CHAR_CAP = 150_000;

      // Direct base64 screenshot (from Bun Bun screen viewer)
      if (imageBase64 && imageBase64.startsWith("data:image/")) {
        imageContents.push({ type: "image_url", image_url: { url: imageBase64 } });
      }

      if (attachments?.length) {
        for (const att of attachments) {
          try {
            const fileId = att.id || att.url?.split("/").pop();
            const row = await dbGet("SELECT storage_path, mime_type, original_name FROM uploaded_files WHERE id = ?", fileId) as any;
            if (!row) continue;
            const filePath = path.resolve(process.cwd(), "uploads", row.storage_path);
            if (!fs.existsSync(filePath)) continue;

            const mime = (row.mime_type || att.mimeType || "").toLowerCase();
            const name = row.original_name || att.name || "";

            if (mime.startsWith("image/")) {
              // Images: convert to base64 for vision models
              const data = fs.readFileSync(filePath);
              const b64 = `data:${row.mime_type};base64,${data.toString("base64")}`;
              imageContents.push({ type: "image_url", image_url: { url: b64 } });
            } else if (mime === "application/pdf" || /\.pdf$/i.test(name)) {
              // PDFs: send natively to Claude as a document content block
              const data = fs.readFileSync(filePath);
              documentContents.push({
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: data.toString("base64") },
                name,
              });
            } else if (/\.docx$/i.test(name) || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
              // .docx: unzip, pull word/document.xml, strip XML tags to get plain text
              try {
                const JSZip = (await import("jszip")).default;
                const data = fs.readFileSync(filePath);
                const zip = await JSZip.loadAsync(data);
                const docXml = await zip.file("word/document.xml")?.async("string");
                if (docXml) {
                  // Preserve paragraph breaks, then strip all tags
                  const text = docXml
                    .replace(/<w:p[^>]*>/g, "\n")
                    .replace(/<w:br[^>]*\/>/g, "\n")
                    .replace(/<w:tab[^>]*\/>/g, "\t")
                    .replace(/<[^>]+>/g, "")
                    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
                    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
                    .replace(/\n{3,}/g, "\n\n")
                    .trim();
                  const trimmed = text.length > TEXT_FILE_CHAR_CAP
                    ? text.slice(0, TEXT_FILE_CHAR_CAP) + `\n\n[...truncated at ${TEXT_FILE_CHAR_CAP} chars, original size: ${text.length}]`
                    : text;
                  textFileContents += `\n\n--- FILE: ${name} ---\n${trimmed}`;
                }
              } catch (e: any) {
                console.error("[Upload] docx extraction failed:", e.message);
              }
            } else {
              // Plain text / source code files: read as UTF-8 and inline into the message
              const isTextFile = /\.(ts|tsx|js|jsx|json|md|py|html|css|txt|csv|yaml|yml|toml|ini|xml|sh|sql|go|rs|java|cpp|c|h|hpp|rb|php|swift|kt|scala|vue|svelte|env\.example|rtf|log)$/i.test(name);
              if (isTextFile) {
                const content = fs.readFileSync(filePath, "utf-8");
                const trimmed = content.length > TEXT_FILE_CHAR_CAP
                  ? content.slice(0, TEXT_FILE_CHAR_CAP) + `\n\n[...truncated at ${TEXT_FILE_CHAR_CAP} chars, original size: ${content.length}]`
                  : content;
                textFileContents += `\n\n--- FILE: ${name} ---\n${trimmed}`;
              }
            }
          } catch {}
        }
      }

      // Append text file contents to the message so the AI can see them
      const effectiveMessage = textFileContents
        ? (message || "Please review the attached files.") + textFileContents
        : message;

      const result = await handleBossChat({
        conversationId,
        message: effectiveMessage,
        level: intelligenceLevel,
        userId,
        userEmail: req.user?.email,
        userRole: req.user?.role,
        history: Array.isArray(history) ? history : [],
        imageContents,
        documentContents,
        source: req.body.source || "boss",
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // === KILL SWITCH ===
  app.post("/api/jobs/cancel", async (req, res) => {
    const { conversationId } = req.body as { conversationId: string };
    if (!conversationId) return res.status(400).json({ error: "conversationId required" });

    try {
      // Abort in-flight AI calls via AbortSignal
      const aborted = cancelConversation(conversationId);

      // Move all active BullMQ jobs for this conversation to failed
      const activeJobs = await storage.getAgentJobsByStatus(conversationId, "running");
      const pendingJobs = await storage.getAgentJobsByStatus(conversationId, "pending");
      const allJobs = [...activeJobs, ...pendingJobs];

      for (const job of allJobs) {
        await storage.updateAgentJob(job.id, {
          status: "failed",
          output: JSON.stringify({ error: "Cancelled by user" }),
          completedAt: Date.now(),
        });
      }

      res.json({ ok: true, aborted, cancelledJobs: allJobs.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // === MODEL ROUTING INFO (for frontend) ===
  app.get("/api/models/defaults", (_req, res) => {
    res.json({ defaults: MODEL_DEFAULTS, fallbacks: FALLBACK_CHAINS });
  });

  app.post("/api/models/classify-tier", (req, res) => {
    const { message } = req.body as { message: string };
    if (!message) return res.status(400).json({ error: "message required" });
    const result = classifyTier(message);
    res.json(result);
  });

  // === SSE STREAMING ===
  app.get("/api/agent/stream/:jobId", handleSSEStream);

  // Check if a job is still running (for reconnection after navigation)
  app.get("/api/agent/job/:jobId/status", async (req, res) => {
    const job = await dbGet("SELECT id, status, output, token_count FROM agent_jobs WHERE id = ?", req.params.jobId) as any;
    if (!job) return res.json({ status: "not_found" });
    res.json({ status: job.status, output: job.output, tokenCount: job.token_count });
  });

  // === PROJECT BRIEFS — persistent working context per conversation ===
  app.get("/api/briefs/:conversationId", asyncHandler(async (req, res) => {
    const userId = req.user?.id || 1;
    const brief = await dbGet(
      "SELECT * FROM project_briefs WHERE conversation_id = ? AND user_id = ?",
      req.params.conversationId, userId
    );
    res.json(brief || null);
  }));

  app.put("/api/briefs/:conversationId", asyncHandler(async (req, res) => {
    const userId = req.user?.id || 1;
    const convId = req.params.conversationId;
    const { objective, context, constraints, stakeholders, deliverables, decisions, pinned_refs } = req.body;

    const existing = await dbGet("SELECT * FROM project_briefs WHERE conversation_id = ? AND user_id = ?", convId, userId) as any;

    if (existing) {
      // Save version snapshot before update
      const versionId = uuidv4();
      await dbRun(
        "INSERT INTO brief_versions (id, brief_id, version, snapshot, change_summary, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        versionId, existing.id, existing.version,
        JSON.stringify({ objective: existing.objective, context: existing.context, constraints: existing.constraints, stakeholders: existing.stakeholders, deliverables: existing.deliverables, decisions: existing.decisions }),
        req.body.change_summary || "Updated",
        Date.now()
      );

      await dbRun(
        `UPDATE project_briefs SET objective=?, context=?, constraints=?, stakeholders=?, deliverables=?, decisions=?, pinned_refs=?, version=version+1, updated_at=? WHERE id=?`,
        objective ?? existing.objective, context ?? existing.context, constraints ?? existing.constraints,
        stakeholders ?? existing.stakeholders, deliverables ?? existing.deliverables, decisions ?? existing.decisions,
        pinned_refs ? JSON.stringify(pinned_refs) : existing.pinned_refs,
        Date.now(), existing.id
      );
      const updated = await dbGet("SELECT * FROM project_briefs WHERE id = ?", existing.id);
      res.json(updated);
    } else {
      const id = uuidv4();
      await dbRun(
        `INSERT INTO project_briefs (id, conversation_id, user_id, objective, context, constraints, stakeholders, deliverables, decisions, pinned_refs, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        id, convId, userId,
        objective || "", context || "", constraints || "", stakeholders || "", deliverables || "", decisions || "",
        JSON.stringify(pinned_refs || []),
        Date.now(), Date.now()
      );
      const created = await dbGet("SELECT * FROM project_briefs WHERE id = ?", id);
      res.json(created);
    }
  }));

  app.get("/api/briefs/:conversationId/versions", asyncHandler(async (req, res) => {
    const brief = await dbGet("SELECT id FROM project_briefs WHERE conversation_id = ?", req.params.conversationId) as any;
    if (!brief) return res.json([]);
    const versions = await dbAll(
      "SELECT * FROM brief_versions WHERE brief_id = ? ORDER BY version DESC LIMIT 20",
      brief.id
    );
    res.json(versions);
  }));

  // === WORKFLOW TEMPLATES — multi-step reusable flows ===
  app.get("/api/workflow-templates", asyncHandler(async (req, res) => {
    const userId = req.user?.id || 1;
    const rows = await dbAll(
      "SELECT * FROM workflow_templates WHERE user_id = ? OR is_public = 1 ORDER BY use_count DESC, created_at DESC LIMIT 50",
      userId
    );
    res.json(rows.map((r: any) => ({
      ...r,
      variables: JSON.parse(r.variables || "[]"),
      steps: JSON.parse(r.steps || "[]"),
    })));
  }));

  app.post("/api/workflow-templates", asyncHandler(async (req, res) => {
    const userId = req.user?.id || 1;
    const { name, description, icon, category, variables, steps } = req.body;
    if (!name || !steps?.length) return res.status(400).json({ error: "name and steps required" });
    const id = uuidv4();
    await dbRun(
      `INSERT INTO workflow_templates (id, user_id, name, description, icon, category, variables, steps, is_public, use_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      id, userId, name, description || "", icon || "git-branch", category || "general",
      JSON.stringify(variables || []), JSON.stringify(steps), Date.now(), Date.now()
    );
    res.json({ id });
  }));

  app.delete("/api/workflow-templates/:id", asyncHandler(async (req, res) => {
    const userId = req.user?.id || 1;
    await dbRun("DELETE FROM workflow_templates WHERE id = ? AND user_id = ?", req.params.id, userId);
    res.json({ ok: true });
  }));

  // Execute a workflow template — runs steps sequentially via Boss
  app.post("/api/workflow-templates/:id/run", requireCredits(), asyncHandler(async (req, res) => {
    const userId = req.user?.id || 1;
    const userEmail = req.user?.email;
    const template = await dbGet("SELECT * FROM workflow_templates WHERE id = ?", req.params.id) as any;
    if (!template) return res.status(404).json({ error: "Template not found" });

    const variables = req.body.variables || {};
    const steps = JSON.parse(template.steps || "[]");
    const level = req.body.level || "medium";

    // Substitute variables in step prompts
    const resolvedSteps = steps.map((s: any) => {
      let prompt = s.prompt;
      for (const [key, value] of Object.entries(variables)) {
        prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value as string);
      }
      return { ...s, prompt };
    });

    // Create conversation and job
    const convId = uuidv4();
    await storage.createConversation({
      id: convId, userId, title: `${template.name}: ${Object.values(variables)[0] || ""}`.slice(0, 80),
      model: "gpt-5.4-mini", createdAt: Date.now(), updatedAt: Date.now(), source: "boss",
    });

    const jobId = uuidv4();
    await storage.createAgentJob({
      id: jobId, conversationId: convId, userId,
      type: "boss" as any, status: "running",
      input: JSON.stringify({ template: template.name, variables, steps: resolvedSteps.length }),
      createdAt: Date.now(),
    });

    // Store user message
    await storage.createBossMessage({
      id: uuidv4(), conversationId: convId, role: "user",
      content: `Running workflow: ${template.name}\n\n${Object.entries(variables).map(([k, v]) => `**${k}**: ${v}`).join("\n")}`,
      tokenCount: 0, model: null, createdAt: Date.now(),
    });

    // Increment use count
    await dbRun("UPDATE workflow_templates SET use_count = use_count + 1 WHERE id = ?", template.id);

    // Execute steps sequentially in background
    const { executeDepartment } = await import("./departments/executor");
    const { estimateComplexity } = await import("./departments/types");
    const { chunkText } = await import("./lib/utils");

    (async () => {
      let previousOutput = "";
      let totalTokens = 0;

      try {
        for (let i = 0; i < resolvedSteps.length; i++) {
          const step = resolvedSteps[i];

          eventBus.emit(jobId, "progress", {
            workerType: step.department,
            subAgent: step.label || `Step ${i + 1}`,
            workerIndex: i,
            status: "running",
            message: `Step ${i + 1}/${resolvedSteps.length}: ${step.label || step.department}...`,
          });

          // Inject previous step output as context
          const taskWithContext = previousOutput
            ? `${step.prompt}\n\nPrevious step output:\n${previousOutput.slice(0, 3000)}`
            : step.prompt;

          const complexity = estimateComplexity(taskWithContext);
          const result = await executeDepartment(
            jobId,
            { department: step.department, task: taskWithContext },
            level as any,
            complexity,
          );

          totalTokens += result.totalTokens;
          previousOutput = result.finalOutput;

          // Stream output
          const chunks = chunkText(result.finalOutput, 40);
          for (const chunk of chunks) {
            eventBus.emit(jobId, "token", {
              workerType: step.department, subAgent: step.label, text: chunk,
            });
          }

          eventBus.emit(jobId, "step_complete", {
            workerType: step.department,
            subAgent: step.label || `Step ${i + 1}`,
            workerIndex: i,
            output: result.finalOutput.slice(0, 500),
            tokens: result.totalTokens,
            durationMs: result.totalDurationMs,
          });
        }

        // Save final output
        await storage.createBossMessage({
          id: uuidv4(), conversationId: convId, role: "assistant",
          content: previousOutput,
          tokenCount: totalTokens, model: null, createdAt: Date.now(),
        });

        await storage.updateAgentJob(jobId, {
          status: "complete", output: previousOutput.slice(0, 5000),
          tokenCount: totalTokens, completedAt: Date.now(),
        });

        // Update avg tokens
        await dbRun(
          "UPDATE workflow_templates SET avg_tokens = CASE WHEN use_count > 0 THEN (avg_tokens * (use_count - 1) + ?) / use_count ELSE ? END WHERE id = ?",
          totalTokens, totalTokens, template.id
        );

        eventBus.emit(jobId, "complete", {
          synthesis: previousOutput, totalTokens,
        });
      } catch (err: any) {
        eventBus.emit(jobId, "error", { error: err.message });
        await storage.updateAgentJob(jobId, {
          status: "failed", output: err.message, completedAt: Date.now(),
        });
      }
    })();

    res.json({
      conversationId: convId,
      jobId,
      reply: `Running ${template.name} (${resolvedSteps.length} steps)...`,
      isDelegating: true,
      tokenCount: 0,
    });
  }));

  // === TASK TEMPLATES — reusable saved prompts ===
  app.get("/api/task-templates", asyncHandler(async (req, res) => {
    const userId = req.user?.id || 1;
    const rows = await dbAll(
      "SELECT * FROM task_templates WHERE user_id = ? OR is_public = 1 ORDER BY use_count DESC, created_at DESC LIMIT 50",
      userId
    );
    res.json(rows);
  }));

  app.post("/api/task-templates", asyncHandler(async (req, res) => {
    const userId = req.user?.id || 1;
    const { name, prompt, category, icon } = req.body;
    if (!name || !prompt) return res.status(400).json({ error: "name and prompt required" });
    const id = uuidv4();
    await dbRun(
      "INSERT INTO task_templates (id, user_id, name, prompt, category, icon, is_public, use_count, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)",
      id, userId, name, prompt, category || "general", icon || "zap", Date.now()
    );
    res.json({ id });
  }));

  app.post("/api/task-templates/:id/use", asyncHandler(async (req, res) => {
    await dbRun("UPDATE task_templates SET use_count = use_count + 1 WHERE id = ?", req.params.id);
    const template = await dbGet("SELECT * FROM task_templates WHERE id = ?", req.params.id) as any;
    res.json(template);
  }));

  app.delete("/api/task-templates/:id", asyncHandler(async (req, res) => {
    const userId = req.user?.id || 1;
    await dbRun("DELETE FROM task_templates WHERE id = ? AND user_id = ?", req.params.id, userId);
    res.json({ ok: true });
  }));

  // === CONVERSATIONS ===
  app.get("/api/conversations", async (req, res) => {
    const userId = req.user?.id || 1;
    const source = req.query.source as string | undefined;
    let convs = await storage.getConversationsByUser(userId);
    if (source) {
      // "boss" matches null/undefined/boss (all legacy conversations)
      // "editor" only matches explicitly tagged editor conversations
      if (source === "boss") {
        convs = convs.filter((c: any) => !c.source || c.source === "boss");
      } else {
        convs = convs.filter((c: any) => c.source === source);
      }
    }
    res.json(convs);
  });

  app.get("/api/conversations/:id/messages", async (req, res) => {
    const msgs = await storage.getBossMessagesByConversation(req.params.id);
    res.json(msgs);
  });

  // Delete a single conversation
  app.delete("/api/conversations/:id", async (req, res) => {
    const id = req.params.id as string;
    try {
      await dbRun("DELETE FROM boss_messages WHERE conversation_id = ?", id);
      await dbRun("DELETE FROM conversations WHERE id = ?", id);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Delete all conversations for the user
  app.delete("/api/conversations", async (req, res) => {
    const userId = req.user?.id || 1;
    try {
      const convs = await storage.getConversationsByUser(userId);
      for (const c of convs) {
        await dbRun("DELETE FROM boss_messages WHERE conversation_id = ?", c.id);
      }
      await dbRun("DELETE FROM conversations WHERE user_id = ?", userId);
      res.json({ ok: true, deleted: convs.length });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // === TIME MACHINE: Fork & Rewind Conversations ===

  // Fork a conversation at a specific message — creates a new conversation
  // with all messages up to that point, ready to take a different path
  app.post("/api/conversations/:id/fork", async (req, res) => {
    const userId = req.user?.id || 1;
    const { atMessageId } = req.body;
    const sourceId = req.params.id as string;

    try {
      const sourceConv = await storage.getConversation(sourceId);
      if (!sourceConv) return res.status(404).json({ error: "Conversation not found" });

      const allMessages = await storage.getBossMessagesByConversation(sourceId);

      // Find the cutoff point
      let messagesToCopy = allMessages;
      if (atMessageId) {
        const idx = allMessages.findIndex((m: any) => m.id === atMessageId);
        if (idx >= 0) messagesToCopy = allMessages.slice(0, idx + 1);
      }

      // Create new conversation
      const newId = uuidv4();
      await storage.createConversation({
        id: newId, userId,
        title: `Fork: ${(sourceConv as any).title}`,
        model: (sourceConv as any).model,
        createdAt: Date.now(), updatedAt: Date.now(),
        source: (sourceConv as any).source || "boss",
      });

      // Copy messages
      for (const msg of messagesToCopy) {
        await storage.createBossMessage({
          id: uuidv4(),
          conversationId: newId,
          role: (msg as any).role,
          content: (msg as any).content,
          tokenCount: (msg as any).token_count || 0,
          model: (msg as any).model,
          createdAt: (msg as any).created_at,
        });
      }

      res.json({ ok: true, forkedConversationId: newId, messagesCopied: messagesToCopy.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Rewind — delete all messages after a specific message ID
  app.post("/api/conversations/:id/rewind", async (req, res) => {
    const { toMessageId } = req.body;
    const convId = req.params.id as string;

    try {
      const allMessages = await storage.getBossMessagesByConversation(convId);
      const idx = allMessages.findIndex((m: any) => m.id === toMessageId);
      if (idx < 0) return res.status(404).json({ error: "Message not found" });

      // Delete all messages after the target
      const toDelete = allMessages.slice(idx + 1);
      for (const msg of toDelete) {
        await dbRun("DELETE FROM boss_messages WHERE id = ?", (msg as any).id);
      }

      res.json({ ok: true, deleted: toDelete.length, remaining: idx + 1 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // === AGENT JOBS ===
  app.get("/api/jobs", async (req, res) => {
    const { conversationId, status } = req.query as { conversationId?: string; status?: string };
    if (conversationId && status) {
      const jobs = await storage.getAgentJobsByStatus(conversationId, status);
      return res.json(jobs);
    }
    if (conversationId) {
      const jobs = await storage.getAgentJobsByConversation(conversationId);
      return res.json(jobs);
    }
    const userId = req.user?.id || 1;
    const jobs = await storage.getRunningJobsByUser(userId);
    res.json(jobs);
  });

  app.get("/api/jobs/:id", async (req, res) => {
    const job = await storage.getAgentJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    const children = await storage.getChildJobs(job.id);
    res.json({ job, children });
  });

  // === TOKEN ECONOMY ===

  // Get current user's plan + usage summary
  app.get("/api/tokens/status", async (req, res) => {
    const userId = req.user?.id || 1;
    let plan = await storage.getUserPlan(userId);
    if (!plan) {
      // Auto-create free plan
      const now = new Date();
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      plan = await storage.createUserPlan({
        userId,
        tier: "free",
        monthlyTokens: TIER_CREDIT_LIMITS.free,
        tokensUsed: 0,
        periodStart: now.toISOString(),
        periodEnd: periodEnd.toISOString(),
      });
    }

    // Check if period needs reset
    if (new Date(plan.periodEnd) < new Date()) {
      const now = new Date();
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      plan = await storage.updateUserPlan(plan.id, {
        tokensUsed: 0,
        periodStart: now.toISOString(),
        periodEnd: periodEnd.toISOString(),
      }) || plan;
    }

    const packs = await storage.getTokenPacksByUser(userId);
    const bonusTokens = packs
      .filter(p => p.status === "active")
      .reduce((sum, p) => sum + p.tokensRemaining, 0);

    const TIER_LIMITS = TIER_CREDIT_LIMITS;

    res.json({
      plan: {
        tier: plan.tier,
        monthlyTokens: plan.monthlyTokens,
        tokensUsed: plan.tokensUsed,
        tokensRemaining: Math.max(0, plan.monthlyTokens - plan.tokensUsed) + bonusTokens,
        bonusTokens,
        periodEnd: plan.periodEnd,
      },
      tierLimits: TIER_LIMITS,
    });
  });

  // Get usage history
  app.get("/api/tokens/usage", async (req, res) => {
    const userId = req.user?.id || 1;
    const usage = await storage.getTokenUsageByUser(userId);
    res.json(usage);
  });

  // Get usage summary (current period)
  app.get("/api/tokens/summary", async (req, res) => {
    const userId = req.user?.id || 1;
    const plan = await storage.getUserPlan(userId);
    const since = plan?.periodStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const summary = await storage.getTokenUsageSummary(userId, since);
    res.json(summary);
  });

  // Buy token pack (creates Stripe payment intent for one-time purchase)
  app.post("/api/tokens/buy", async (req, res) => {
    const { packSize } = req.body as { packSize: "5k" | "10k" | "20k" };
    const PACKS: Record<string, { tokens: number; price: number; label: string }> = {
      "5k":  { tokens: 5000,   price: 500,  label: "5K Credits (Starter)" },
      "10k": { tokens: 10000,  price: 500,  label: "10K Credits (Pro)" },
      "20k": { tokens: 20000,  price: 500,  label: "20K Credits (Agency)" },
    };

    const pack = PACKS[packSize];
    if (!pack) return res.status(400).json({ error: "Invalid pack size" });

    try {
      const { stripe } = await import("./stripe");
      const origin = req.headers.origin || `https://${req.headers.host}`;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: `Cortal — ${pack.label}` },
            unit_amount: pack.price,
          },
          quantity: 1,
        }],
        success_url: `${origin}/#/usage?bought=${packSize}`,
        cancel_url: `${origin}/#/usage?canceled=1`,
        metadata: { type: "token_pack", packSize, tokens: String(pack.tokens) },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // === NOTIFICATIONS ===
  app.get("/api/notifications", async (req, res) => {
    const userId = req.user?.id || 1;
    const notifs = await storage.getNotifications(userId, 50);
    const unread = await storage.getUnreadNotificationCount(userId);
    res.json({ notifications: notifs, unreadCount: unread });
  });

  app.post("/api/notifications/:id/read", async (req, res) => {
    await storage.markNotificationRead(Number(req.params.id));
    res.json({ ok: true });
  });

  app.post("/api/notifications/read-all", async (req, res) => {
    const userId = req.user?.id || 1;
    await storage.markAllNotificationsRead(userId);
    res.json({ ok: true });
  });

  // ── Tools Management ──────────────────────────────────────────────────────────
  app.get("/api/tools", async (req, res) => {
    const userId = req.user?.id || 1;
    const tools = await storage.getToolsByOwner(userId);
    res.json(tools);
  });

  app.post("/api/tools", async (req, res) => {
    const { name, description, toolType, endpoint, method, headers, authType, authConfig, inputSchema, outputSchema } = req.body;
    if (!name || !description) return res.status(400).json({ error: "Name and description required" });
    const userId = req.user?.id || 1;
    const tool = await storage.createTool({
      ownerId: userId,
      name, description, toolType: toolType || 'rest_api',
      endpoint, method, headers, authType, authConfig, inputSchema, outputSchema
    });
    res.status(201).json(tool);
  });

  app.get("/api/tools/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const tool = await storage.getTool(req.params.id);
    if (!tool || tool.ownerId !== userId) return res.status(404).json({ error: "Tool not found" });
    res.json(tool);
  });

  app.put("/api/tools/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const tool = await storage.getTool(req.params.id);
    if (!tool || tool.ownerId !== userId) return res.status(403).json({ error: "Not authorized" });
    const updated = await storage.updateTool(req.params.id, req.body);
    res.json(updated);
  });

  app.delete("/api/tools/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const tool = await storage.getTool(req.params.id);
    if (!tool || tool.ownerId !== userId) return res.status(403).json({ error: "Not authorized" });
    await storage.deleteTool(req.params.id);
    res.json({ ok: true });
  });

  // ── User Preferences / Customization ────────────────────────────────────
  // Export all user data
  app.get("/api/user/export", async (req, res) => {
    const userId = req.user?.id || 1;
    try {
      const conversations = await storage.getConversationsByUser(userId);
      const pipelines = await storage.getPipelinesByUser(userId);
      const bots = await storage.getBotsByUser(userId);
      const connectors = await storage.getConnectorsByUser(userId);
      const prefs = await storage.getUserPreferences(userId);
      const plan = await storage.getUserPlan(userId);
      res.json({
        exportDate: new Date().toISOString(),
        user: { id: userId, email: req.user?.email },
        conversations,
        workflows: pipelines,
        bots,
        connectors: connectors.map((c: any) => ({ id: c.id, provider: c.provider, name: c.name, status: c.status })),
        preferences: prefs,
        plan,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/preferences", async (req, res) => {
    const userId = req.user?.id || 1;
    const prefs = await storage.getUserPreferences(userId);
    res.json(prefs);
  });

  app.put("/api/preferences", async (req, res) => {
    const userId = req.user?.id || 1;
    const prefs = await storage.updateUserPreferences(userId, req.body);
    res.json(prefs);
  });

  // === STRIPE ===
  registerStripeRoutes(app);

  // ── User API Keys (Phase 2: encrypted BYOK) ────────────────────────────────
  app.get("/api/user-api-keys", async (req, res) => {
    const userId = req.user?.id || 1;
    const keys = await storage.getUserApiKeys(userId);
    // Never return full keys — only masked versions
    const masked = keys.map(k => {
      let maskedKey: string | null = null;
      if ((k as any).encryptedKey) {
        try {
          maskedKey = maskKey(decrypt((k as any).encryptedKey));
        } catch { maskedKey = "****...****"; }
      } else if ((k as any).apiKey) {
        maskedKey = maskKey((k as any).apiKey);
      }
      return {
        id: k.id,
        provider: k.provider,
        apiKey: maskedKey, // masked for backward compat with frontend
        endpointUrl: (k as any).endpointUrl || null,
        defaultModel: (k as any).defaultModel || null,
        label: (k as any).label || null,
        isDefault: (k as any).isDefault || 0,
        isActive: (k as any).isActive ?? 1,
        createdAt: k.createdAt,
      };
    });
    res.json(masked);
  });

  app.post("/api/user-api-keys", async (req, res) => {
    const userId = req.user?.id || 1;
    const { provider, apiKey, endpointUrl, defaultModel, isDefault, label } = req.body;
    if (!provider) return res.status(400).json({ error: "provider is required" });

    // Encrypt the API key before storing
    const encryptedKey = apiKey ? encrypt(apiKey) : undefined;

    const key = await storage.createUserApiKey({
      userId,
      provider,
      apiKey: encryptedKey, // stored encrypted
      endpointUrl,
      defaultModel,
      isDefault: isDefault ? 1 : 0,
    });
    // Return masked version
    res.status(201).json({
      ...key,
      apiKey: apiKey ? maskKey(apiKey) : null,
    });
  });

  app.patch("/api/user-api-keys/:id", async (req, res) => {
    const { provider, apiKey, endpointUrl, defaultModel, isDefault, isActive } = req.body;
    const updates: any = {};
    if (provider !== undefined) updates.provider = provider;
    if (apiKey !== undefined) updates.apiKey = encrypt(apiKey); // encrypt on update
    if (endpointUrl !== undefined) updates.endpointUrl = endpointUrl;
    if (defaultModel !== undefined) updates.defaultModel = defaultModel;
    if (isDefault !== undefined) updates.isDefault = isDefault ? 1 : 0;
    if (isActive !== undefined) updates.isActive = isActive ? 1 : 0;
    const updated = await storage.updateUserApiKey(req.params.id, updates);
    if (!updated) return res.status(404).json({ error: "not found" });
    res.json({ ...updated, apiKey: updated.apiKey ? maskKey("encrypted") : null });
  });

  app.delete("/api/user-api-keys/:id", async (req, res) => {
    await storage.deleteUserApiKey(req.params.id);
    res.json({ ok: true });
  });

  app.post("/api/user-api-keys/:id/test", async (req, res) => {
    const key = await storage.getUserApiKey(req.params.id);
    if (!key) return res.status(404).json({ error: "not found" });
    try {
      // Decrypt key for testing
      let rawKey = (key as any).apiKey || "";
      if ((key as any).encryptedKey) {
        rawKey = decrypt((key as any).encryptedKey);
      } else if (rawKey && rawKey.includes(":")) {
        // Might be encrypted in old apiKey field
        try { rawKey = decrypt(rawKey); } catch { /* use as-is */ }
      }

      let success = false;
      if (key.provider === "openai") {
        const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${rawKey}` } });
        success = r.ok;
      } else if (key.provider === "anthropic") {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": rawKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
          body: JSON.stringify({ model: "claude-3-haiku-20240307", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
        });
        success = r.ok;
      } else if (key.provider === "google") {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${rawKey}`);
        success = r.ok;
      } else if (key.provider === "groq") {
        const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${rawKey}` } });
        success = r.ok;
      } else if (key.provider === "mistral") {
        const r = await fetch("https://api.mistral.ai/v1/models", { headers: { Authorization: `Bearer ${rawKey}` } });
        success = r.ok;
      } else if (key.provider === "openrouter") {
        const r = await fetch("https://openrouter.ai/api/v1/models", { headers: { Authorization: `Bearer ${rawKey}` } });
        success = r.ok;
      } else if (key.provider === "perplexity") {
        const r = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${rawKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "sonar", messages: [{ role: "user", content: "test" }], max_tokens: 1 }),
        });
        success = r.ok;
      } else if (key.provider === "ollama") {
        const url = (key as any).endpointUrl || "http://localhost:11434";
        const r = await fetch(`${url}/api/tags`);
        success = r.ok;
      }
      res.json({ success });
    } catch (err: any) {
      res.json({ success: false, error: err.message });
    }
  });

  app.get("/api/user-api-keys/default", async (req, res) => {
    const userId = req.user?.id || 1;
    const key = await storage.getDefaultApiKey(userId);
    if (!key) return res.json(null);
    let maskedKey: string | null = null;
    if ((key as any).encryptedKey) {
      try { maskedKey = maskKey(decrypt((key as any).encryptedKey)); } catch { maskedKey = "****"; }
    } else if ((key as any).apiKey) {
      maskedKey = maskKey((key as any).apiKey);
    }
    res.json({ ...key, apiKey: maskedKey });
  });
  // ── Activity Feed (Dashboard) ────────────────────────────────────────────
  app.get("/api/activity-feed", async (req, res) => {
    try {
      const userId = req.user?.id || 1;
      const trades = await storage.getTradesByUser(userId, { limit: 5 });
      const bots = await storage.getTradingBots(userId);
      const orders = await storage.getFiverrOrders(userId);
      const apps = await storage.getGeneratedApps(userId);
      const deployments = await storage.getBotDeployments(userId);
      const keys = await storage.getUserApiKeys(userId);
      const brokers = await storage.getBrokerConnections(userId);

      res.json({
        recentTrades: trades.slice(0, 5),
        activeBots: bots.filter((b: any) => b.status === "generated" || b.status === "running").length,
        openOrders: orders.filter((o: any) => o.status === "pending").length,
        totalApps: apps.length,
        activeDeployments: deployments.filter((d: any) => d.status === "running").length,
        connectedProviders: keys.filter((k: any) => k.isActive).length,
        connectedBrokers: brokers.filter((b: any) => b.isActive).length,
        totalBots: bots.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // === AGENT CONFIGS (per-user model/prompt customization) ===
  app.get("/api/agent-configs", async (req, res) => {
    const userId = req.user?.id || 1;
    const configs = await storage.getAgentConfigs(userId);
    res.json(configs);
  });

  app.put("/api/agent-configs/:agentType", async (req, res) => {
    const userId = req.user?.id || 1;
    const { agentType } = req.params;
    const { model, models, systemPrompt } = req.body;
    const validTypes = ["researcher", "coder", "writer", "analyst", "reviewer", "artgen", "browser", "art", "reasoning", "boss"];
    if (!validTypes.includes(agentType)) {
      return res.status(400).json({ error: "Invalid agent type" });
    }
    // Support both legacy single model and new multi-model array
    const modelsArray: string[] = Array.isArray(models) ? models : (model ? [model] : []);
    const modelsJson = modelsArray.length > 0 ? JSON.stringify(modelsArray) : null;
    const config = await storage.upsertAgentConfig({
      id: `${userId}-${agentType}`,
      userId,
      agentType,
      model: modelsArray[0] || null, // keep legacy field as first model
      models: modelsJson,
      systemPrompt: systemPrompt || null,
      isActive: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    res.json(config);
  });

  // === INTELLIGENCE LEVELS (v2 — replaces model picker) ===
  app.get("/api/intelligence-levels", (_req, res) => {
    res.json(INTELLIGENCE_TIERS);
  });

  // === AGENT SYSTEM PROMPT DEFAULTS ===
  app.get("/api/agent-prompts/defaults", (_req, res) => {
    res.json({
      coder: { model: "claude-sonnet-4-6", systemPrompt: CODER_SYSTEM_PROMPT, label: "Coder Agent" },
      art: { model: "gpt-image-1", systemPrompt: ART_SYSTEM_PROMPT, label: "Art Agent" },
      reasoning: { model: "gpt-5.4", systemPrompt: REASONING_SYSTEM_PROMPT, label: "Reasoning Agent" },
      boss: { model: "gpt-5.4-mini", systemPrompt: "", label: "Boss (Orchestrator)" },
    });
  });

  // === AGENT JOBS SUMMARY — single GROUP BY query instead of O(n²) filter ===
  app.get("/api/agent-jobs/summary", async (req, res) => {
    const userId = req.user?.id || 1;
    try {
      const rows = await dbAll(
        `SELECT type, status, COUNT(*) as cnt,
         COALESCE(SUM(token_count), 0) as total_tokens,
         COALESCE(AVG(CASE WHEN status = 'complete' THEN duration_ms END), 0) as avg_duration
         FROM agent_jobs WHERE user_id = ? GROUP BY type, status`,
        userId
      ) as any[];

      // Aggregate into per-type summaries
      const byType = new Map<string, { totalJobs: number; completedJobs: number; totalTokens: number; avgDurationMs: number }>();
      for (const r of rows) {
        const existing = byType.get(r.type) || { totalJobs: 0, completedJobs: 0, totalTokens: 0, avgDurationMs: 0 };
        existing.totalJobs += r.cnt;
        existing.totalTokens += r.total_tokens;
        if (r.status === "complete") {
          existing.completedJobs += r.cnt;
          existing.avgDurationMs = Math.round(r.avg_duration || 0);
        }
        byType.set(r.type, existing);
      }
      const summaries = Array.from(byType.entries()).map(([type, data]) => ({ type, ...data }));
      res.json(summaries);
    } catch {
      res.json([]);
    }
  });

  // ── Dashboard Stats (real DB queries with period-over-period deltas) ────
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const userId = req.user?.id || 1;

      // Try in-memory cache first (60s TTL) — avoids Redis dependency
      const cacheKey = `dashboard:stats:${userId}`;
      const cached = statsCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < 60_000) return res.json(cached.data);

      const stats = await storage.getDashboardStats(userId);
      statsCache.set(cacheKey, { data: stats, ts: Date.now() });

      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Token Usage Chart Data (7d daily) ───────────────────────────────────
  app.get("/api/dashboard/token-usage", async (req, res) => {
    const userId = req.user?.id || 1;
    const days = parseInt(req.query.days as string) || 7;
    const data = await storage.getTokenUsageByDay(userId, days);
    res.json(data);
  });

  // ── Workflow Run Chart Data (30d daily) ─────────────────────────────────
  app.get("/api/dashboard/workflow-runs", async (req, res) => {
    const userId = req.user?.id || 1;
    const days = parseInt(req.query.days as string) || 30;
    const data = await storage.getWorkflowRunsByDay(userId, days);
    res.json(data);
  });

  // ── Model Usage Breakdown ───────────────────────────────────────────────
  app.get("/api/dashboard/model-usage", async (req, res) => {
    const userId = req.user?.id || 1;
    const data = await storage.getModelUsageBreakdown(userId);
    res.json(data);
  });

  // ── Department Performance Stats ────────────────────────────────────────
  app.get("/api/dashboard/department-stats", async (req, res) => {
    const userId = req.user?.id || 1;
    const data = await storage.getDepartmentStats(userId);
    res.json(data);
  });

  // ── Cost Estimation ───────────────────────────────────────────────────────
  app.get("/api/dashboard/cost-estimate", async (req, res) => {
    const userId = req.user?.id || 1;
    const modelUsage = await storage.getModelUsageBreakdown(userId);
    // Approximate cost per 1M tokens by model family
    const COST_PER_M: Record<string, number> = {
      "claude-opus": 75, "claude-sonnet": 15, "claude-haiku": 1.25,
      "gpt-5.4": 10, "gpt-5.4-mini": 0.6, "gpt-4.1": 8, "gpt-4.1-mini": 1.6,
      "sonar-pro": 3, "sonar": 1, "gpt-image-1": 20,
      "gemini-2.5-pro": 7, "gemini-2.5-flash": 0.5, "gemma-4": 0.3,
      "llama-": 0.2, "mistral-": 2, "ministral-": 0.4,
    };
    let totalCost = 0;
    const breakdown = modelUsage.map(m => {
      const key = Object.keys(COST_PER_M).find(k => m.model.includes(k)) || "";
      const rate = COST_PER_M[key] || 5; // default $5/M
      const cost = (m.tokens / 1_000_000) * rate;
      totalCost += cost;
      return { model: m.model, tokens: m.tokens, costUsd: Math.round(cost * 100) / 100 };
    });
    res.json({ totalCostUsd: Math.round(totalCost * 100) / 100, breakdown });
  });

  // ── Dashboard Layout Persistence ────────────────────────────────────────
  app.get("/api/dashboard/layout", async (req, res) => {
    const userId = req.user?.id || 1;
    const layout = await storage.getDashboardLayout(userId);
    res.json(layout || { layout: null });
  });

  app.put("/api/dashboard/layout", async (req, res) => {
    const userId = req.user?.id || 1;
    const { layout } = req.body;
    if (!Array.isArray(layout)) return res.status(400).json({ error: "layout must be an array" });
    const saved = await storage.upsertDashboardLayout(userId, layout);
    res.json(saved);
  });

  // ── Activity Events Feed ────────────────────────────────────────────────
  app.get("/api/activity", async (req, res) => {
    const userId = req.user?.id || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const events = await storage.getActivityEvents(userId, limit);
    res.json(events);
  });

  // ── System Health ───────────────────────────────────────────────────────
  app.get("/api/dashboard/health", async (req, res) => {
    try {
      let redisStatus = "disconnected";
      try {
        const { redis } = await import("./lib/redis");
        const pong = await redis.ping();
        redisStatus = pong === "PONG" ? "connected" : "error";
      } catch (_) {}

      const dbSizeRow = await dbGet("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()") as any;
      const dbSize = dbSizeRow?.size || 0;

      const uptime = process.uptime();

      res.json({
        redis: redisStatus,
        database: "connected",
        dbSizeBytes: dbSize,
        uptimeSeconds: Math.round(uptime),
        nodeVersion: process.version,
        memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // === FILE UPLOAD/DOWNLOAD ===
  // Ensure uploads directory exists
  const uploadsDir = path.resolve(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const uploadStorage = multer.diskStorage({
    destination: (_req: any, _file: any, cb: any) => cb(null, uploadsDir),
    filename: (_req: any, file: any, cb: any) => {
      const ext = path.extname(file.originalname);
      cb(null, `${uuidv4()}${ext}`);
    },
  });

  const upload = multer({
    storage: uploadStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  });

  app.post("/api/chat/upload", upload.single("file"), async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const fileId = uuidv4();
    const storagePath = req.file.filename;
    const conversationId = req.body?.conversationId || null;

    try {
      await dbRun(
        "INSERT INTO uploaded_files (id, user_id, original_name, mime_type, size, storage_path, conversation_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        fileId, userId, req.file.originalname, req.file.mimetype, req.file.size, storagePath, conversationId
      );

      res.json({
        id: fileId,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url: `/api/files/${fileId}`,
        thumbnailUrl: req.file.mimetype.startsWith("image/") ? `/api/files/${fileId}/thumbnail` : null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/files/:id", async (req, res) => {
    try {
      const file = await dbGet("SELECT * FROM uploaded_files WHERE id = ?", req.params.id) as any;
      if (!file) return res.status(404).json({ error: "File not found" });
      const filePath = path.join(uploadsDir, file.storage_path);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found on disk" });
      res.setHeader("Content-Type", file.mime_type);
      res.setHeader("Content-Disposition", `inline; filename="${file.original_name}"`);
      fs.createReadStream(filePath).pipe(res);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/files/:id/thumbnail", async (req, res) => {
    try {
      const file = await dbGet("SELECT * FROM uploaded_files WHERE id = ?", req.params.id) as any;
      if (!file) return res.status(404).json({ error: "File not found" });
      const filePath = path.join(uploadsDir, file.storage_path);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
      // For now, serve the original image as thumbnail (could add sharp/resize later)
      res.setHeader("Content-Type", file.mime_type);
      fs.createReadStream(filePath).pipe(res);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // === ACTIVE AGENTS (v2: from database, not BullMQ) ===
  app.get("/api/dashboard/active-agents", async (req, res) => {
    try {
      const userId = req.user?.id || 1;
      const showAll = req.query.status === "all";
      let jobs: any[];
      if (showAll) {
        try { jobs = await storage.getRecentJobsByUser(userId, 30); } catch { jobs = await storage.getRunningJobsByUser(userId); }
      } else {
        jobs = await storage.getRunningJobsByUser(userId);
      }
      const activeJobs = jobs.map((j: any) => ({
        jobId: j.id,
        type: j.type || "boss",
        status: j.status,
        taskDescription: (() => { try { const d = JSON.parse(j.input || "{}"); return d.message || d.task || "Processing..."; } catch { return "Processing..."; } })(),
        startedAt: j.createdAt,
        tokens: j.tokenCount || 0,
      }));
      res.json(activeJobs);
    } catch (err: any) {
      res.json([]);
    }
  });

  app.post("/api/dashboard/active-agents/:jobId/stop", async (req, res) => {
    try {
      await storage.updateAgentJob(req.params.jobId, { status: "failed", output: JSON.stringify({ error: "Stopped by user" }), completedAt: Date.now() });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/dashboard/active-agents/:jobId/clear", async (req, res) => {
    try {
      try { await dbRun("DELETE FROM agent_jobs WHERE id = ?", req.params.jobId); } catch {}
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}

