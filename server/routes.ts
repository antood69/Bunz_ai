import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, sqlite } from "./storage";
import { insertWorkflowSchema, insertAgentSchema, insertJobSchema, insertMessageSchema, insertAuditReviewSchema } from "@shared/schema";
import { runAgentChat } from "./ai";
import { registerStripeRoutes } from "./stripe";
import { createAuthRouter, createOwnerRouter, authMiddleware, ownerOnly, collectIntelligence } from "./auth";
import { createConnectorsRouter, createWebhookInboundRouter } from "./connectors";
import githubRouter from "./routes/github";
import cookieParser from "cookie-parser";
import { handleBossChat, cancelConversation } from "./boss";
import { handleSSEStream } from "./sse";
import { encrypt, decrypt, maskKey } from "./lib/crypto";
import { MODEL_DEFAULTS, FALLBACK_CHAINS } from "./lib/modelDefaults";
import { CODER_SYSTEM_PROMPT } from "./agents/coder";
import { ART_SYSTEM_PROMPT } from "./agents/art";
import { REASONING_SYSTEM_PROMPT } from "./agents/reasoning";
import { classifyTier } from "./lib/tierClassifier";
import { TIER_CREDIT_LIMITS, requireCredits, checkTokenBudget } from "./lib/rateLimiter";
import { INTELLIGENCE_TIERS } from "./departments/types";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // === HEALTH (no auth) ===
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now(), version: "2.0.0" });
  });

  // === COOKIE PARSER + AUTH ===
  app.use(cookieParser());
  app.use("/api/auth", createAuthRouter());
  app.use(authMiddleware);
  app.use("/api/owner", createOwnerRouter());
  app.use("/api/connectors", createConnectorsRouter());
  app.use("/api/webhooks/inbound", createWebhookInboundRouter());
  app.use("/api/github", githubRouter);

  // === WORKFLOWS ===
  app.get("/api/workflows", async (_req, res) => {
    const data = await storage.getWorkflows();
    res.json(data);
  });

  app.get("/api/workflows/:id", async (req, res) => {
    const w = await storage.getWorkflow(Number(req.params.id));
    if (!w) return res.status(404).json({ error: "Not found" });
    res.json(w);
  });

  app.post("/api/workflows", async (req, res) => {
    const parsed = insertWorkflowSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const w = await storage.createWorkflow(parsed.data);
    res.status(201).json(w);
  });

  app.patch("/api/workflows/:id", async (req, res) => {
    const w = await storage.updateWorkflow(Number(req.params.id), req.body);
    if (!w) return res.status(404).json({ error: "Not found" });
    res.json(w);
  });

  app.delete("/api/workflows/:id", async (req, res) => {
    await storage.deleteWorkflow(Number(req.params.id));
    res.status(204).end();
  });

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
        history.slice(-20).map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
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

  // === STATS (Dashboard KPIs) ===
  app.get("/api/stats", async (_req, res) => {
    const allWorkflows = await storage.getWorkflows();
    const allAgents = await storage.getAgents();
    const allJobs = await storage.getJobs();
    const allReviews = await storage.getAuditReviews();
    res.json({
      totalWorkflows: allWorkflows.length,
      activeWorkflows: allWorkflows.filter(w => w.status === "active").length,
      totalAgents: allAgents.length,
      workingAgents: allAgents.filter(a => a.status === "working").length,
      totalJobs: allJobs.length,
      completedJobs: allJobs.filter(j => j.status === "completed").length,
      failedJobs: allJobs.filter(j => j.status === "failed").length,
      totalReviews: allReviews.length,
      passedReviews: allReviews.filter(r => r.verdict === "pass").length,
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

  // === TRADE JOURNAL ===
  app.get("/api/trade-journal", async (_req, res) => {
    const data = await storage.getTradeJournalEntries();
    res.json(data);
  });
  app.post("/api/trade-journal", async (req, res) => {
    const entry = await storage.createTradeJournalEntry(req.body);
    res.status(201).json(entry);
  });
  app.patch("/api/trade-journal/:id", async (req, res) => {
    const e = await storage.updateTradeJournalEntry(Number(req.params.id), req.body);
    if (!e) return res.status(404).json({ error: "Not found" });
    res.json(e);
  });

  // === BOT CHALLENGES ===
  app.get("/api/bot-challenges", async (_req, res) => {
    const data = await storage.getBotChallenges();
    res.json(data);
  });
  app.post("/api/bot-challenges", async (req, res) => {
    const c = await storage.createBotChallenge(req.body);
    res.status(201).json(c);
  });
  app.patch("/api/bot-challenges/:id", async (req, res) => {
    const c = await storage.updateBotChallenge(Number(req.params.id), req.body);
    if (!c) return res.status(404).json({ error: "Not found" });
    res.json(c);
  });

  // === BOSS CHAT (v2: intelligence levels + department dispatch) ===
  app.post("/api/boss/chat", requireCredits(), async (req, res) => {
    const { message, conversationId, history, level } = req.body as {
      message: string;
      conversationId?: string;
      history?: { role: "user" | "assistant"; content: string }[];
      level?: string;
    };
    if (!message) return res.status(400).json({ error: "message required" });

    try {
      const userId = req.user?.id || 1;
      const validLevels = ["entry", "medium", "max"];
      const intelligenceLevel = validLevels.includes(level || "") ? level as any : "medium";

      const result = await handleBossChat({
        conversationId,
        message,
        level: intelligenceLevel,
        userId,
        userEmail: req.user?.email,
        history: Array.isArray(history) ? history : [],
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

  // === CONVERSATIONS ===
  app.get("/api/conversations", async (req, res) => {
    const userId = req.user?.id || 1;
    const convs = await storage.getConversationsByUser(userId);
    res.json(convs);
  });

  app.get("/api/conversations/:id/messages", async (req, res) => {
    const msgs = await storage.getBossMessagesByConversation(req.params.id);
    res.json(msgs);
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

  // === WORKFLOW RUNS (Orchestrator) ===

  // Get all runs for a workflow
  app.get("/api/workflows/:id/runs", async (req, res) => {
    const runs = await storage.getWorkflowRuns(Number(req.params.id));
    res.json(runs);
  });

  // Get a specific run with its executions
  app.get("/api/runs/:id", async (req, res) => {
    const run = await storage.getWorkflowRun(Number(req.params.id));
    if (!run) return res.status(404).json({ error: "Run not found" });
    const executions = await storage.getAgentExecutions(run.id);
    res.json({ run, executions });
  });

  // Start a new workflow run
  app.post("/api/workflows/:id/run", requireCredits(), async (req, res) => {
    const workflowId = Number(req.params.id);
    const { prompt, model } = req.body as { prompt: string; model?: string };

    if (!prompt) return res.status(400).json({ error: "prompt is required" });

    const workflow = await storage.getWorkflow(workflowId);
    if (!workflow) return res.status(404).json({ error: "Workflow not found" });

    // Token budget already checked by requireCredits() middleware

    // Create the run
    const run = await storage.createWorkflowRun({
      workflowId,
      userId: 1,
      status: "pending",
      executionMode: "boss",
      inputData: JSON.stringify({ prompt }),
    });

    // Start orchestration in the background (don't block the response)
    executeWorkflowRun(run.id, prompt, model || "claude-sonnet").catch(err => {
      console.error(`[orchestrator] Run ${run.id} failed:`, err.message);
    });

    res.status(201).json(run);
  });

  // Kill a running workflow
  app.post("/api/runs/:id/kill", async (req, res) => {
    const run = await storage.getWorkflowRun(Number(req.params.id));
    if (!run) return res.status(404).json({ error: "Run not found" });
    if (run.status !== "running" && run.status !== "pending") {
      return res.status(400).json({ error: "Run is not active" });
    }
    await storage.updateWorkflowRun(run.id, { status: "killed", completedAt: new Date().toISOString() });
    res.json({ status: "killed" });
  });

  // Get latest run for a workflow (convenience)
  app.get("/api/workflows/:id/latest-run", async (req, res) => {
    const runs = await storage.getWorkflowRuns(Number(req.params.id));
    if (!runs.length) return res.json(null);
    const latestRun = runs[0]; // already ordered by desc id
    const executions = await storage.getAgentExecutions(latestRun.id);
    res.json({ run: latestRun, executions });
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
            product_data: { name: `Bunz — ${pack.label}` },
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

  // ── Trading Journal ──────────────────────────────────────────────────────────────────
  app.get("/api/trades", async (req, res) => {
    const userId = req.user?.id || 1;
    const trades = await storage.getTradesByUser(userId, {
      symbol: req.query.symbol as string | undefined,
      direction: req.query.direction as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : 100,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });
    res.json(trades);
  });

  app.get("/api/trades/stats", async (req, res) => {
    const userId = req.user?.id || 1;
    const stats = await storage.getTradingStats(userId);
    res.json(stats);
  });

  app.get("/api/trades/equity-curve", async (req, res) => {
    const userId = req.user?.id || 1;
    const curve = await storage.getEquityCurve(userId);
    res.json(curve);
  });

  app.get("/api/trades/monthly-pnl", async (req, res) => {
    const userId = req.user?.id || 1;
    const monthly = await storage.getMonthlyPnl(userId);
    res.json(monthly);
  });

  app.get("/api/trades/by-symbol", async (req, res) => {
    const userId = req.user?.id || 1;
    const bySymbol = await storage.getPnlBySymbol(userId);
    res.json(bySymbol);
  });

  app.get("/api/trades/by-day", async (req, res) => {
    const userId = req.user?.id || 1;
    const byDay = await storage.getPnlByDayOfWeek(userId);
    res.json(byDay);
  });

  app.post("/api/trades/import", async (req, res) => {
    const userId = req.user?.id || 1;
    const { trades } = req.body;
    if (!Array.isArray(trades)) return res.status(400).json({ error: "trades must be an array" });
    const results = [];
    for (const t of trades) {
      const trade = await storage.createTrade({ ...t, userId, importSource: 'csv_import' });
      results.push(trade);
    }
    res.status(201).json({ imported: results.length, trades: results });
  });

  app.post("/api/trades", async (req, res) => {
    const userId = req.user?.id || 1;
    try {
      const trade = await storage.createTrade({ ...req.body, userId });
      res.status(201).json(trade);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/trades/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const trade = await storage.getTrade(req.params.id);
    if (!trade || trade.userId !== userId) return res.status(404).json({ error: "Trade not found" });
    res.json(trade);
  });

  app.put("/api/trades/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const trade = await storage.getTrade(req.params.id);
    if (!trade || trade.userId !== userId) return res.status(403).json({ error: "Not authorized" });
    const updated = await storage.updateTrade(req.params.id, req.body);
    res.json(updated);
  });

  app.delete("/api/trades/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const trade = await storage.getTrade(req.params.id);
    if (!trade || trade.userId !== userId) return res.status(403).json({ error: "Not authorized" });
    await storage.deleteTrade(req.params.id);
    res.json({ ok: true });
  });

  app.post("/api/trades/:id/close", async (req, res) => {
    const userId = req.user?.id || 1;
    const { exitPrice, exitTime, fees } = req.body;
    const trade = await storage.getTrade(req.params.id);
    if (!trade || trade.userId !== userId) return res.status(403).json({ error: "Not authorized" });
    const closed = await storage.closeTrade(req.params.id, exitPrice, exitTime || new Date().toISOString(), fees || 0);
    res.json(closed);
  });

  // ── Broker Connections ────────────────────────────────────────────────
  app.get("/api/broker-connections", async (req, res) => {
    const userId = req.user?.id || 1;
    const connections = await storage.getBrokerConnections(userId);
    // Mask secrets before returning
    res.json(
      connections.map((c) => ({
        ...c,
        apiSecret: c.apiSecret ? "••••••" + c.apiSecret.slice(-4) : null,
      }))
    );
  });

  app.post("/api/broker-connections", async (req, res) => {
    const userId = req.user?.id || 1;
    const { broker, label, apiKey, apiSecret, isPaper } = req.body;
    if (!broker || !apiKey || !apiSecret) {
      return res.status(400).json({ error: "Broker, API key, and secret are required" });
    }
    try {
      const { getBroker } = await import("./broker");
      const b = getBroker({ broker, apiKey, apiSecret, isPaper: isPaper ? 1 : 0 });
      const account = await b.getAccount();

      const connection = await storage.createBrokerConnection({
        userId,
        broker,
        label: label || `${broker} ${isPaper ? "Paper" : "Live"}`,
        apiKey,
        apiSecret,
        isPaper: isPaper ? 1 : 0,
        accountId: account.id,
        accountInfo: JSON.stringify(account),
      });

      res.status(201).json({
        ...connection,
        apiSecret: connection.apiSecret ? "••••••" + connection.apiSecret.slice(-4) : null,
      });
    } catch (err: any) {
      res.status(400).json({ error: `Failed to connect: ${err.message}` });
    }
  });

  app.delete("/api/broker-connections/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const conn = await storage.getBrokerConnection(req.params.id);
    if (!conn || conn.userId !== userId) return res.status(404).json({ error: "Not found" });
    await storage.deleteBrokerConnection(req.params.id);
    res.json({ ok: true });
  });

  // Get live account info
  app.get("/api/broker-connections/:id/account", async (req, res) => {
    const userId = req.user?.id || 1;
    const conn = await storage.getBrokerConnection(req.params.id);
    if (!conn || conn.userId !== userId) return res.status(404).json({ error: "Not found" });
    try {
      const { getBroker } = await import("./broker");
      const broker = getBroker(conn);
      const account = await broker.getAccount();
      res.json(account);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get live positions
  app.get("/api/broker-connections/:id/positions", async (req, res) => {
    const userId = req.user?.id || 1;
    const conn = await storage.getBrokerConnection(req.params.id);
    if (!conn || conn.userId !== userId) return res.status(404).json({ error: "Not found" });
    try {
      const { getBroker } = await import("./broker");
      const broker = getBroker(conn);
      const positions = await broker.getPositions();
      res.json(positions);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Place order (LIVE TRADING)
  app.post("/api/broker-connections/:id/orders", async (req, res) => {
    const userId = req.user?.id || 1;
    const conn = await storage.getBrokerConnection(req.params.id);
    if (!conn || conn.userId !== userId) return res.status(404).json({ error: "Not found" });
    try {
      const { getBroker } = await import("./broker");
      const broker = getBroker(conn);
      const order = await broker.placeOrder(req.body);
      res.json(order);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Close position
  app.delete("/api/broker-connections/:id/positions/:symbol", async (req, res) => {
    const userId = req.user?.id || 1;
    const conn = await storage.getBrokerConnection(req.params.id);
    if (!conn || conn.userId !== userId) return res.status(404).json({ error: "Not found" });
    try {
      const { getBroker } = await import("./broker");
      const broker = getBroker(conn);
      const result = await broker.closePosition(req.params.symbol);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Sync trades from broker
  app.post("/api/broker-connections/:id/sync", async (req, res) => {
    const userId = req.user?.id || 1;
    const conn = await storage.getBrokerConnection(req.params.id);
    if (!conn || conn.userId !== userId) return res.status(404).json({ error: "Not found" });
    try {
      const { syncTrades } = await import("./broker");
      const result = await syncTrades(req.params.id, userId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Forex Calendar ─────────────────────────────────────────────────────────
  let forexCalendarCache: { data: any; fetchedAt: number } | null = null;
  app.get("/api/forex-calendar", async (_req, res) => {
    const FIVE_MIN = 5 * 60 * 1000;
    if (forexCalendarCache && Date.now() - forexCalendarCache.fetchedAt < FIVE_MIN) {
      return res.json(forexCalendarCache.data);
    }
    try {
      const resp = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json");
      const data = await resp.json();
      forexCalendarCache = { data, fetchedAt: Date.now() };
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

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

  // ── Account Stacks ────────────────────────────────────────────────────────
  app.get("/api/account-stacks", async (req, res) => {
    const userId = req.user?.id || 1;
    const stacks = await storage.getAccountStacks(userId);
    const result = [];
    for (const stack of stacks) {
      const followers = await storage.getStackFollowers(stack.id);
      result.push({ ...stack, followers });
    }
    res.json(result);
  });

  app.post("/api/account-stacks", async (req, res) => {
    const userId = req.user?.id || 1;
    const { name, leaderConnectionId, copyMode, sizeMultiplier, followerConnectionIds } = req.body;
    if (!name || !leaderConnectionId) return res.status(400).json({ error: "name and leaderConnectionId required" });
    const stack = await storage.createAccountStack({ userId, name, leaderConnectionId, copyMode, sizeMultiplier });
    if (Array.isArray(followerConnectionIds)) {
      for (const cid of followerConnectionIds) {
        await storage.addStackFollower({ stackId: stack.id, connectionId: cid });
      }
    }
    const followers = await storage.getStackFollowers(stack.id);
    res.status(201).json({ ...stack, followers });
  });

  app.delete("/api/account-stacks/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const stack = await storage.getAccountStack(req.params.id);
    if (!stack || stack.userId !== userId) return res.status(404).json({ error: "Not found" });
    await storage.deleteAccountStack(req.params.id);
    res.json({ ok: true });
  });

  app.post("/api/account-stacks/:id/followers", async (req, res) => {
    const userId = req.user?.id || 1;
    const stack = await storage.getAccountStack(req.params.id);
    if (!stack || stack.userId !== userId) return res.status(404).json({ error: "Not found" });
    const { connectionId, sizeMultiplier } = req.body;
    if (!connectionId) return res.status(400).json({ error: "connectionId required" });
    const follower = await storage.addStackFollower({ stackId: req.params.id, connectionId, sizeMultiplier });
    res.status(201).json(follower);
  });

  app.delete("/api/account-stacks/:id/followers/:fid", async (req, res) => {
    const userId = req.user?.id || 1;
    const stack = await storage.getAccountStack(req.params.id);
    if (!stack || stack.userId !== userId) return res.status(404).json({ error: "Not found" });
    await storage.removeStackFollower(req.params.fid);
    res.json({ ok: true });
  });

  // ── Trading Bots ──────────────────────────────────────────────────────────
  app.get("/api/trading-bots", async (req, res) => {
    const userId = req.user?.id || 1;
    const bots = await storage.getTradingBots(userId);
    res.json(bots);
  });

  app.post("/api/trading-bots", async (req, res) => {
    const userId = req.user?.id || 1;
    const bot = await storage.createTradingBot({ ...req.body, userId });
    res.status(201).json(bot);
  });

  app.put("/api/trading-bots/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const bot = await storage.getTradingBot(req.params.id);
    if (!bot || bot.userId !== userId) return res.status(404).json({ error: "Not found" });
    const updated = await storage.updateTradingBot(req.params.id, req.body);
    res.json(updated);
  });

  app.delete("/api/trading-bots/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const bot = await storage.getTradingBot(req.params.id);
    if (!bot || bot.userId !== userId) return res.status(404).json({ error: "Not found" });
    await storage.deleteTradingBot(req.params.id);
    res.json({ ok: true });
  });

  app.post("/api/trading-bots/:id/generate", async (req, res) => {
    const userId = req.user?.id || 1;
    const bot = await storage.getTradingBot(req.params.id);
    if (!bot || bot.userId !== userId) return res.status(404).json({ error: "Not found" });
    try {
      const { runAgentChatWithUserKey } = await import("./ai");
      const { provider, model } = req.body || {};
      let aiModel = "claude-sonnet";
      let userKeyId: string | undefined;
      if (provider && model) {
        const keys = await storage.getUserApiKeys(userId);
        const key = keys.find(k => k.provider === provider && k.isActive);
        if (key) { userKeyId = key.id; aiModel = model; }
      }
      const systemPrompt = `You are an expert algorithmic trading strategy designer. Given a trading strategy description, generate specific: indicators (technical indicators to use), entry_rules (when to enter a trade), exit_rules (when to exit a trade), and risk_rules (position sizing, stop losses). Format your response as JSON with keys: indicators, entryRules, exitRules, riskRules. Each should be a clear, actionable string.`;
      const prompt = `Strategy: ${bot.name}\nDescription: ${bot.description || 'No description'}\nTimeframe: ${bot.timeframe}\nSymbols: ${bot.symbols}\n\nGenerate trading rules for this strategy.`;
      const { reply } = await runAgentChatWithUserKey(aiModel, systemPrompt, [], prompt, userKeyId);
      let parsed: any = {};
      try {
        const jsonMatch = reply.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch { parsed = { indicators: reply, entryRules: '', exitRules: '', riskRules: '' }; }
      const updated = await storage.updateTradingBot(req.params.id, {
        indicators: parsed.indicators || reply,
        entryRules: parsed.entryRules || parsed.entry_rules || '',
        exitRules: parsed.exitRules || parsed.exit_rules || '',
        riskRules: parsed.riskRules || parsed.risk_rules || '',
        status: 'generated',
      } as any);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Bot Deployments ───────────────────────────────────────────────────────
  app.get("/api/bot-deployments", async (req, res) => {
    const userId = req.user?.id || 1;
    const deployments = await storage.getBotDeployments(userId);
    res.json(deployments);
  });

  app.post("/api/bot-deployments", async (req, res) => {
    const userId = req.user?.id || 1;
    const deployment = await storage.createBotDeployment({ ...req.body, userId });
    res.status(201).json(deployment);
  });

  app.put("/api/bot-deployments/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const dep = await storage.getBotDeployment(req.params.id);
    if (!dep || dep.userId !== userId) return res.status(404).json({ error: "Not found" });
    const updated = await storage.updateBotDeployment(req.params.id, req.body);
    res.json(updated);
  });

  app.delete("/api/bot-deployments/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const dep = await storage.getBotDeployment(req.params.id);
    if (!dep || dep.userId !== userId) return res.status(404).json({ error: "Not found" });
    await storage.deleteBotDeployment(req.params.id);
    res.json({ ok: true });
  });

  // ── Fiverr Gigs ───────────────────────────────────────────────────────────
  app.get("/api/fiverr-gigs", async (req, res) => {
    const userId = req.user?.id || 1;
    const gigs = await storage.getFiverrGigs(userId);
    res.json(gigs);
  });

  app.post("/api/fiverr-gigs", async (req, res) => {
    const userId = req.user?.id || 1;
    const gig = await storage.createFiverrGig({ ...req.body, userId });
    res.status(201).json(gig);
  });

  app.get("/api/fiverr-gigs/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const gig = await storage.getFiverrGig(req.params.id);
    if (!gig || gig.userId !== userId) return res.status(404).json({ error: "Not found" });
    res.json(gig);
  });

  app.put("/api/fiverr-gigs/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const gig = await storage.getFiverrGig(req.params.id);
    if (!gig || gig.userId !== userId) return res.status(404).json({ error: "Not found" });
    const updated = await storage.updateFiverrGig(req.params.id, req.body);
    res.json(updated);
  });

  app.delete("/api/fiverr-gigs/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const gig = await storage.getFiverrGig(req.params.id);
    if (!gig || gig.userId !== userId) return res.status(404).json({ error: "Not found" });
    await storage.deleteFiverrGig(req.params.id);
    res.json({ ok: true });
  });

  // ── Fiverr Orders ─────────────────────────────────────────────────────────
  app.get("/api/fiverr-orders", async (req, res) => {
    const userId = req.user?.id || 1;
    const orders = await storage.getFiverrOrders(userId);
    res.json(orders);
  });

  app.post("/api/fiverr-orders", async (req, res) => {
    const userId = req.user?.id || 1;
    const order = await storage.createFiverrOrder({ ...req.body, userId });
    res.status(201).json(order);
  });

  app.put("/api/fiverr-orders/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const order = await storage.getFiverrOrder(req.params.id);
    if (!order || order.userId !== userId) return res.status(404).json({ error: "Not found" });
    const updated = await storage.updateFiverrOrder(req.params.id, req.body);
    res.json(updated);
  });

  app.post("/api/fiverr-orders/:id/generate", async (req, res) => {
    const userId = req.user?.id || 1;
    const order = await storage.getFiverrOrder(req.params.id);
    if (!order || order.userId !== userId) return res.status(404).json({ error: "Not found" });
    const gig = await storage.getFiverrGig(order.gigId);
    try {
      const { runAgentChatWithUserKey } = await import("./ai");
      const { provider, model } = req.body || {};
      let aiModel = gig?.aiModel || "claude-sonnet";
      let userKeyId: string | undefined;
      if (provider && model) {
        const keys = await storage.getUserApiKeys(userId);
        const key = keys.find(k => k.provider === provider && k.isActive);
        if (key) { userKeyId = key.id; aiModel = model; }
      }
      const systemPrompt = `You are a professional freelancer completing a Fiverr order. Generate a high-quality deliverable draft based on the gig description and buyer requirements. Be thorough and professional.`;
      const prompt = `Gig: ${gig?.title || 'Freelance work'}\nGig Description: ${gig?.description || 'N/A'}\nBuyer Requirements: ${order.requirements || 'No specific requirements'}\n\nGenerate the deliverable.`;
      const { reply } = await runAgentChatWithUserKey(aiModel, systemPrompt, [], prompt, userKeyId);
      const updated = await storage.updateFiverrOrder(req.params.id, { aiDraft: reply, status: 'draft_ready' } as any);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Generated Apps ────────────────────────────────────────────────────────
  app.get("/api/generated-apps", async (req, res) => {
    const userId = req.user?.id || 1;
    const apps = await storage.getGeneratedApps(userId);
    res.json(apps);
  });

  app.post("/api/generated-apps", async (req, res) => {
    const userId = req.user?.id || 1;
    const app_ = await storage.createGeneratedApp({ ...req.body, userId });
    res.status(201).json(app_);
  });

  app.get("/api/generated-apps/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const app_ = await storage.getGeneratedApp(req.params.id);
    if (!app_ || app_.userId !== userId) return res.status(404).json({ error: "Not found" });
    res.json(app_);
  });

  app.put("/api/generated-apps/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const app_ = await storage.getGeneratedApp(req.params.id);
    if (!app_ || app_.userId !== userId) return res.status(404).json({ error: "Not found" });
    const updated = await storage.updateGeneratedApp(req.params.id, req.body);
    res.json(updated);
  });

  app.delete("/api/generated-apps/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const app_ = await storage.getGeneratedApp(req.params.id);
    if (!app_ || app_.userId !== userId) return res.status(404).json({ error: "Not found" });
    await storage.deleteGeneratedApp(req.params.id);
    res.json({ ok: true });
  });

  app.post("/api/generated-apps/:id/generate", async (req, res) => {
    const userId = req.user?.id || 1;
    const app_ = await storage.getGeneratedApp(req.params.id);
    if (!app_ || app_.userId !== userId) return res.status(404).json({ error: "Not found" });
    try {
      const { runAgentChatWithUserKey } = await import("./ai");
      const { provider, model } = req.body || {};
      let aiModel = "claude-sonnet";
      let userKeyId: string | undefined;
      if (provider && model) {
        const keys = await storage.getUserApiKeys(userId);
        const key = keys.find(k => k.provider === provider && k.isActive);
        if (key) { userKeyId = key.id; aiModel = model; }
      }
      const systemPrompt = `You are an expert app developer. Generate complete, working code for the described application. Return clean, well-structured code with comments. Use the specified framework. Use file markers like "// === filename.ext ===" to separate files.`;
      const prompt = `App: ${app_.name}\nDescription: ${app_.description || 'No description'}\nFramework: ${app_.framework}\nApp Type: ${app_.appType}\n\nGenerate the complete app code.`;
      const { reply } = await runAgentChatWithUserKey(aiModel, systemPrompt, [], prompt, userKeyId);

      // Save version snapshot
      let versions: any[] = [];
      try { if (app_.versions) versions = JSON.parse(app_.versions); } catch {}
      versions.push({ code: reply, timestamp: new Date().toISOString(), version: versions.length + 1 });
      const updated = await storage.updateGeneratedApp(req.params.id, { generatedCode: reply, status: 'generated', versions: JSON.stringify(versions) } as any);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── White Label Configs ───────────────────────────────────────────────────
  app.get("/api/white-label-configs", async (req, res) => {
    const userId = req.user?.id || 1;
    const configs = await storage.getWhiteLabelConfigs(userId);
    res.json(configs);
  });

  app.post("/api/white-label-configs", async (req, res) => {
    const userId = req.user?.id || 1;
    const config = await storage.createWhiteLabelConfig({ ...req.body, userId });
    res.status(201).json(config);
  });

  app.get("/api/white-label-configs/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const config = await storage.getWhiteLabelConfig(req.params.id);
    if (!config || config.userId !== userId) return res.status(404).json({ error: "Not found" });
    res.json(config);
  });

  app.put("/api/white-label-configs/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const config = await storage.getWhiteLabelConfig(req.params.id);
    if (!config || config.userId !== userId) return res.status(404).json({ error: "Not found" });
    const updated = await storage.updateWhiteLabelConfig(req.params.id, req.body);
    res.json(updated);
  });

  app.delete("/api/white-label-configs/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const config = await storage.getWhiteLabelConfig(req.params.id);
    if (!config || config.userId !== userId) return res.status(404).json({ error: "Not found" });
    await storage.deleteWhiteLabelConfig(req.params.id);
    res.json({ ok: true });
  });

  // ── Prop Accounts ─────────────────────────────────────────────────────────
  app.get("/api/prop-accounts", async (req, res) => {
    const userId = req.user?.id || 1;
    const accounts = await storage.getPropAccounts(userId);
    res.json(accounts);
  });

  app.post("/api/prop-accounts", async (req, res) => {
    const userId = req.user?.id || 1;
    const account = await storage.createPropAccount({ ...req.body, userId });
    res.status(201).json(account);
  });

  app.get("/api/prop-accounts/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const account = await storage.getPropAccount(req.params.id);
    if (!account || account.userId !== userId) return res.status(404).json({ error: "Not found" });
    res.json(account);
  });

  app.put("/api/prop-accounts/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const account = await storage.getPropAccount(req.params.id);
    if (!account || account.userId !== userId) return res.status(404).json({ error: "Not found" });
    const updated = await storage.updatePropAccount(req.params.id, req.body);
    res.json(updated);
  });

  app.delete("/api/prop-accounts/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const account = await storage.getPropAccount(req.params.id);
    if (!account || account.userId !== userId) return res.status(404).json({ error: "Not found" });
    await storage.deletePropAccount(req.params.id);
    res.json({ ok: true });
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

  // ── Account Stack Execution ──────────────────────────────────────────────
  app.post("/api/account-stacks/:id/execute", async (req, res) => {
    const userId = req.user?.id || 1;
    const stack = await storage.getAccountStack(req.params.id);
    if (!stack) return res.status(404).json({ error: "Stack not found" });

    const { symbol, side, quantity, price } = req.body;
    const results: any[] = [];
    const followers = await storage.getStackFollowers(stack.id);

    for (const follower of followers) {
      const adjQty = quantity * (follower.sizeMultiplier || 1);
      const logEntry = {
        id: require("uuid").v4(),
        stackId: stack.id,
        connectionId: follower.connectionId,
        symbol: symbol || "N/A",
        side: side || "buy",
        quantity: adjQty,
        price: price || 0,
        status: follower.isActive ? "filled" : "skipped",
        executedAt: new Date().toISOString(),
      };
      try {
        storage.addStackExecutionLog(logEntry);
      } catch {}
      results.push(logEntry);
    }

    res.json({ executions: results });
  });

  app.get("/api/account-stacks/:id/executions", async (req, res) => {
    try {
      const logs = storage.getStackExecutionLogs(req.params.id);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Products + Purchase ──────────────────────────────────────────────────
  app.get("/api/products", async (req, res) => {
    const products = await storage.getProducts();
    res.json(products);
  });

  app.get("/api/products/:id", async (req, res) => {
    const product = await storage.getProduct(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  });

  app.post("/api/products/:id/purchase", async (req, res) => {
    const userId = req.user?.id || 1;
    const user = await storage.getUser(userId);
    const product = await storage.getProduct(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });

    // Owner gets everything free
    if (user?.role === "owner") {
      const existing = await storage.getUserProduct(userId, product.id);
      if (existing) return res.json({ already_owned: true, product: existing });
      const up = await storage.createUserProduct({ userId, productId: product.id, priceCents: 0 });
      return res.json({ purchased: true, product: up });
    }

    const existing = await storage.getUserProduct(userId, product.id);
    if (existing) return res.json({ already_owned: true, product: existing });

    try {
      const { stripe } = await import("./stripe");
      const origin = req.headers.origin || `https://${req.headers.host}`;
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: product.name, description: product.description || "" },
            unit_amount: product.priceCents,
          },
          quantity: 1,
        }],
        success_url: `${origin}/#/workflows?purchased=${product.id}`,
        cancel_url: `${origin}/#/marketplace`,
        metadata: { userId: String(userId), productId: product.id, type: "product_purchase" },
      });
      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/user-products", async (req, res) => {
    const userId = req.user?.id || 1;
    const products = await storage.getUserProducts(userId);
    res.json(products);
  });

  // ── Workflow Presets ────────────────────────────────────────────────────────
  app.get("/api/workflow-presets", async (req, res) => {
    const presets = await storage.getWorkflowPresets(req.query.productId as string | undefined);
    res.json(presets);
  });

  app.get("/api/workflow-presets/:id", async (req, res) => {
    const preset = await storage.getWorkflowPreset(req.params.id);
    if (!preset) return res.status(404).json({ error: "Preset not found" });
    res.json(preset);
  });

  app.post("/api/workflow-presets/:id/apply", async (req, res) => {
    const userId = req.user?.id || 1;
    const preset = await storage.getWorkflowPreset(req.params.id);
    if (!preset) return res.status(404).json({ error: "Preset not found" });

    // Check if user owns the required product (if preset requires one)
    if (preset.productId) {
      const user = await storage.getUser(userId);
      if (user?.role !== "owner") {
        const owned = await storage.getUserProduct(userId, preset.productId);
        if (!owned) return res.status(403).json({ error: "Product required", productId: preset.productId });
      }
    }

    // Create a workflow from the preset template
    const workflow = await storage.createWorkflow({
      name: preset.name,
      description: preset.description,
      status: "draft",
      priority: "medium",
    });

    // Save the canvas state from template
    if (preset.templateData) {
      await storage.updateWorkflow(workflow.id, { canvasState: preset.templateData } as any);
    }

    res.json(workflow);
  });

  // ── Marketplace Sell Items ──────────────────────────────────────────────────
  app.post("/api/marketplace/sell-item", async (req, res) => {
    const userId = req.user?.id || 1;
    const { title, description, price, priceType, category, listingType, attachedItemId, attachedItemData } = req.body;
    if (!title) return res.status(400).json({ error: "Title required" });

    try {
      const listing = await storage.createMarketplaceListing({
        sellerId: userId,
        title,
        shortDescription: description || title,
        fullDescription: description || "",
        category: category || "tool",
        price: price || 0,
        priceType: priceType || "one_time",
        tags: [],
        previewImages: [],
      });

      // Update with extra columns via raw SQL
      if (listingType || attachedItemId || attachedItemData) {
        const updates: string[] = [];
        const vals: any[] = [];
        if (listingType) { updates.push("listing_type = ?"); vals.push(listingType); }
        if (attachedItemId) { updates.push("attached_item_id = ?"); vals.push(attachedItemId); }
        if (attachedItemData) { updates.push("attached_item_data = ?"); vals.push(typeof attachedItemData === "string" ? attachedItemData : JSON.stringify(attachedItemData)); }
        if (updates.length) {
          vals.push(listing.id);
          const db = (await import("./storage")).default || (await import("./storage"));
          // Direct SQL update for new columns
          const Database = (await import("better-sqlite3")).default;
          const DB_PATH = process.env.NODE_ENV === "production" ? "/data/data.db" : "data.db";
          const sqliteDb = new Database(DB_PATH);
          sqliteDb.prepare(`UPDATE marketplace_listings SET ${updates.join(", ")} WHERE id = ?`).run(...vals);
          sqliteDb.close();
        }
      }

      res.status(201).json(listing);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Marketplace Purchase with Item Copy ─────────────────────────────────────
  app.post("/api/marketplace/listings/:id/buy-item", async (req, res) => {
    const userId = req.user?.id || 1;
    const listing = await storage.getMarketplaceListing(Number(req.params.id));
    if (!listing) return res.status(404).json({ error: "Listing not found" });

    // Check for attached item data
    const Database = (await import("better-sqlite3")).default;
    const DB_PATH = process.env.NODE_ENV === "production" ? "/data/data.db" : "data.db";
    const sqliteDb = new Database(DB_PATH);
    const row = sqliteDb.prepare("SELECT listing_type, attached_item_data FROM marketplace_listings WHERE id = ?").get(Number(req.params.id)) as any;
    sqliteDb.close();

    const itemData = row?.attached_item_data ? JSON.parse(row.attached_item_data) : null;
    const listingType = row?.listing_type || "service";

    // Copy item to buyer's account
    let copiedItem = null;
    if (itemData) {
      if (listingType === "workflow" || listingType === "automation") {
        copiedItem = await storage.createWorkflow({
          name: itemData.name || listing.title,
          description: itemData.description || listing.shortDescription,
          status: "draft",
          priority: "medium",
        });
        if (itemData.canvasState) {
          await storage.updateWorkflow(copiedItem.id, { canvasState: itemData.canvasState } as any);
        }
      }
      // For bot or code types, just provide the data
    }

    res.json({ purchased: true, copiedItem, listingType, listing });
  });

  // ── Fiverr Webhook for External Orders ──────────────────────────────────────
  app.post("/api/fiverr/webhook/order", async (req, res) => {
    const { clientName, clientEmail, gigType, requirements, deadline } = req.body;
    try {
      const order = await storage.createFiverrOrder({
        gigId: "webhook",
        userId: 1,
        buyerName: clientName || "External Client",
        requirements: requirements || "",
        amount: 0,
      });
      // Update extra columns
      const Database = (await import("better-sqlite3")).default;
      const DB_PATH = process.env.NODE_ENV === "production" ? "/data/data.db" : "data.db";
      const sqliteDb = new Database(DB_PATH);
      sqliteDb.prepare("UPDATE fiverr_orders SET client_name = ?, client_email = ?, gig_type = ?, deadline = ?, status = ? WHERE id = ?").run(
        clientName || null, clientEmail || null, gigType || null, deadline || null, "intake", order.id
      );
      sqliteDb.close();
      res.json({ orderId: order.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Fiverr Pipeline Stage Update ────────────────────────────────────────────
  app.post("/api/fiverr-orders/:id/advance", async (req, res) => {
    const { stage, revisionNotes } = req.body;
    const order = await storage.getFiverrOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const update: any = { status: stage };
    const updated = await storage.updateFiverrOrder(req.params.id, update);

    // If moving to generation stage, trigger AI generation
    if (stage === "generation") {
      try {
        const { runAgentChat } = await import("./ai");
        const systemPrompt = "You are an expert content creator. Generate the deliverable based on the client requirements. Be professional and thorough.";
        const userMessage = `Client requirements: ${order.requirements || "Not specified"}. ${revisionNotes ? `Revision notes: ${revisionNotes}` : ""}`;
        const reply = await runAgentChat("claude-sonnet", systemPrompt, [], userMessage);

        // Save AI output
        const Database = (await import("better-sqlite3")).default;
        const DB_PATH = process.env.NODE_ENV === "production" ? "/data/data.db" : "data.db";
        const sqliteDb = new Database(DB_PATH);
        sqliteDb.prepare("UPDATE fiverr_orders SET ai_output = ?, status = ? WHERE id = ?").run(reply, "quality_check", req.params.id);
        sqliteDb.close();

        return res.json({ ...updated, aiOutput: reply, status: "quality_check" });
      } catch (err: any) {
        return res.json({ ...updated, error: "AI generation failed: " + err.message });
      }
    }

    res.json(updated);
  });

  // ── Fiverr Revenue Stats (legacy) ─────────────────────────────────────────
  app.get("/api/fiverr/stats", async (req, res) => {
    const userId = req.user?.id || 1;
    const orders = await storage.getFiverrOrdersV2(userId);
    const completed = orders.filter((o: any) => o.status === "delivered");
    const totalRevenue = completed.reduce((sum: number, o: any) => sum + ((o.revenue ?? o.amount ?? 0)), 0);
    const avgOrderValue = completed.length ? totalRevenue / completed.length : 0;
    const byStatus: Record<string, number> = {};
    orders.forEach((o: any) => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });
    res.json({ totalRevenue, avgOrderValue, totalOrders: orders.length, completedOrders: completed.length, byStatus });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3: FIVERR AUTOMATION — Full CRUD + Templates + Webhooks + Revenue + Income
  // ══════════════════════════════════════════════════════════════════════════

  // ── Fiverr Orders V2 CRUD ──────────────────────────────────────────────────
  app.get("/api/fiverr/orders", async (req, res) => {
    const userId = req.user?.id || 1;
    const status = req.query.status as string | undefined;
    const orders = await storage.getFiverrOrdersV2(userId, status);
    res.json(orders);
  });

  app.post("/api/fiverr/orders", async (req, res) => {
    const userId = req.user?.id || 1;
    const order = await storage.createFiverrOrderV2({ ...req.body, userId });
    res.status(201).json(order);
  });

  app.patch("/api/fiverr/orders/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const order = await storage.getFiverrOrderV2(req.params.id);
    if (!order || order.userId !== userId) return res.status(404).json({ error: "Not found" });
    const updated = await storage.updateFiverrOrderV2(req.params.id, req.body);
    res.json(updated);
  });

  app.patch("/api/fiverr/orders/:id/status", async (req, res) => {
    const userId = req.user?.id || 1;
    const { status } = req.body;
    const order = await storage.getFiverrOrderV2(req.params.id);
    if (!order || order.userId !== userId) return res.status(404).json({ error: "Not found" });
    const validStatuses = ["intake", "generation", "quality_check", "delivered"];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });
    // NEVER auto-advance to delivered — require explicit approve
    if (status === "delivered") return res.status(400).json({ error: "Use /approve endpoint to deliver" });
    const updated = await storage.updateFiverrOrderV2(req.params.id, { status });
    res.json(updated);
  });

  app.delete("/api/fiverr/orders/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const order = await storage.getFiverrOrderV2(req.params.id);
    if (!order || order.userId !== userId) return res.status(404).json({ error: "Not found" });
    await storage.deleteFiverrOrderV2(req.params.id);
    res.json({ ok: true });
  });

  // ── Fiverr Order: Generate Deliverable (BullMQ) ──────────────────────────
  app.post("/api/fiverr/orders/:id/generate", async (req, res) => {
    const userId = req.user?.id || 1;
    const order = await storage.getFiverrOrderV2(req.params.id);
    if (!order || order.userId !== userId) return res.status(404).json({ error: "Not found" });
    try {
      const { fiverrGenerationQueue } = await import("./workers/fiverrGeneration.worker");
      const job = await fiverrGenerationQueue.add("generate", {
        orderId: order.id,
        templateId: req.body.templateId || order.templateId,
        userId,
        feedback: req.body.feedback,
      });
      await storage.updateFiverrOrderV2(order.id, { status: "generation", generationJobId: job.id });
      res.json({ jobId: job.id, status: "generation" });
    } catch (err: any) {
      // Fallback to direct generation if BullMQ/Redis unavailable
      try {
        const { modelRouter } = await import("./lib/modelRouter");
        let template: any = null;
        if (order.templateId) template = await storage.getGigTemplate(order.templateId);
        const systemPrompt = template?.systemPrompt || "You are a professional freelancer. Generate a high-quality deliverable based on the order specifications.";
        const userMsg = `Order: ${order.gigTitle || "Freelance order"}\nSpecs: ${order.specs || "No specific requirements"}\nBuyer: ${order.buyerName || "Anonymous"}${req.body.feedback ? `\n\nRevision feedback: ${req.body.feedback}` : ""}`;
        const result = await modelRouter.chat({ model: template?.defaultModel || "claude-sonnet", messages: [{ role: "user", content: userMsg }], systemPrompt });
        const updated = await storage.updateFiverrOrderV2(order.id, { generatedOutput: result.content, status: "quality_check" });
        res.json(updated);
      } catch (fallbackErr: any) {
        res.status(500).json({ error: fallbackErr.message });
      }
    }
  });

  // ── HITL: Approve & Deliver ──────────────────────────────────────────────
  app.post("/api/fiverr/orders/:id/approve", async (req, res) => {
    const userId = req.user?.id || 1;
    const order = await storage.getFiverrOrderV2(req.params.id);
    if (!order || order.userId !== userId) return res.status(404).json({ error: "Not found" });
    const revenue = req.body.revenue ?? order.revenue ?? order.amount ?? 0;
    const updated = await storage.updateFiverrOrderV2(req.params.id, {
      status: "delivered",
      revenue: typeof revenue === 'number' ? revenue : parseInt(revenue) || 0,
      deliveredAt: Date.now(),
      reviewedAt: Date.now(),
      reviewNote: req.body.reviewNote || null,
    });
    res.json(updated);
  });

  // ── HITL: Reject & Regenerate ────────────────────────────────────────────
  app.post("/api/fiverr/orders/:id/reject", async (req, res) => {
    const userId = req.user?.id || 1;
    const order = await storage.getFiverrOrderV2(req.params.id);
    if (!order || order.userId !== userId) return res.status(404).json({ error: "Not found" });
    const feedback = req.body.feedback || "Please improve the output.";
    await storage.updateFiverrOrderV2(req.params.id, { reviewNote: feedback, status: "generation" });
    try {
      const { fiverrGenerationQueue } = await import("./workers/fiverrGeneration.worker");
      const job = await fiverrGenerationQueue.add("regenerate", {
        orderId: order.id,
        templateId: order.templateId,
        userId,
        feedback,
      });
      await storage.updateFiverrOrderV2(req.params.id, { generationJobId: job.id });
      res.json({ jobId: job.id, status: "generation" });
    } catch {
      // Fallback to direct regeneration
      try {
        const { modelRouter } = await import("./lib/modelRouter");
        let template: any = null;
        if (order.templateId) template = await storage.getGigTemplate(order.templateId);
        const systemPrompt = template?.systemPrompt || "You are a professional freelancer. Regenerate the deliverable incorporating the feedback.";
        const userMsg = `Order: ${order.gigTitle}\nSpecs: ${order.specs}\nFeedback: ${feedback}\n\nPrevious output:\n${order.generatedOutput}`;
        const result = await modelRouter.chat({ model: template?.defaultModel || "claude-sonnet", messages: [{ role: "user", content: userMsg }], systemPrompt });
        const updated = await storage.updateFiverrOrderV2(req.params.id, { generatedOutput: result.content, status: "quality_check" });
        res.json(updated);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  // ── Gig Templates CRUD ──────────────────────────────────────────────────
  app.get("/api/fiverr/templates", async (req, res) => {
    const userId = req.user?.id || 1;
    const templates = await storage.getGigTemplates(userId);
    res.json(templates);
  });

  app.post("/api/fiverr/templates", async (req, res) => {
    const userId = req.user?.id || 1;
    const { v4: uuidv4 } = await import("uuid");
    const now = Date.now();
    const template = await storage.createGigTemplate({
      id: uuidv4(),
      userId,
      name: req.body.name,
      description: req.body.description || null,
      systemPrompt: req.body.systemPrompt,
      outputFormat: req.body.outputFormat || "markdown",
      defaultModel: req.body.defaultModel || null,
      estimatedTokens: req.body.estimatedTokens || null,
      turnaroundHours: req.body.turnaroundHours || null,
      autoGenerate: req.body.autoGenerate ? 1 : 0,
      workflowId: req.body.workflowId || null,
      createdAt: now,
      updatedAt: now,
    });
    res.status(201).json(template);
  });

  app.patch("/api/fiverr/templates/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const tmpl = await storage.getGigTemplate(req.params.id);
    if (!tmpl || tmpl.userId !== userId) return res.status(404).json({ error: "Not found" });
    const updated = await storage.updateGigTemplate(req.params.id, req.body);
    res.json(updated);
  });

  app.delete("/api/fiverr/templates/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const tmpl = await storage.getGigTemplate(req.params.id);
    if (!tmpl || tmpl.userId !== userId) return res.status(404).json({ error: "Not found" });
    await storage.deleteGigTemplate(req.params.id);
    res.json({ ok: true });
  });

  // ── Fiverr AI Chat ──────────────────────────────────────────────────────
  app.post("/api/fiverr/chat", requireCredits(), async (req, res) => {
    const userId = req.user?.id || 1;
    const { message, history } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    try {
      const { modelRouter } = await import("./lib/modelRouter");

      // Gather context about user's Fiverr state
      const orders = await storage.getFiverrOrdersV2(userId);
      const templates = await storage.getGigTemplates(userId);
      const deliveredOrders = orders.filter((o: any) => o.status === "delivered");
      const totalRevenue = deliveredOrders.reduce((s: number, o: any) => s + (o.revenue ?? o.amount ?? 0), 0);

      const orderSummary = orders.slice(0, 20).map((o: any) => `#${o.orderId || o.id.slice(0, 8)}: "${o.gigTitle || 'Untitled'}" [${o.status}] ${o.buyerName || ''} $${((o.revenue ?? o.amount ?? 0) / 100).toFixed(2)}`).join("\n");
      const templateSummary = templates.map((t: any) => `- ${t.name} (${t.outputFormat}, model: ${t.defaultModel || 'default'})`).join("\n");

      const messages: Array<{ role: string; content: string }> = [];
      if (Array.isArray(history)) {
        for (const h of history) {
          if (h.role && h.content) messages.push({ role: h.role, content: h.content });
        }
      }
      messages.push({ role: "user", content: message });

      const result = await modelRouter.chat({
        model: "claude-sonnet-4-6",
        messages,
        systemPrompt: `You are a Fiverr AI Assistant helping the user manage their freelance automation platform. You have context about their orders, templates, and revenue.

Current stats:
- Total orders: ${orders.length}
- Active (in pipeline): ${orders.filter((o: any) => o.status !== "delivered").length}
- Delivered: ${deliveredOrders.length}
- Total revenue: $${(totalRevenue / 100).toFixed(2)}

Recent orders:
${orderSummary || "No orders yet"}

Templates:
${templateSummary || "No templates yet"}

You can help with:
- Creating gig templates (suggest system prompts, output formats)
- Understanding order status and pipeline
- Revenue insights and analysis
- Workflow optimization tips
- Generating deliverables advice
- Template recommendations based on order patterns

Be concise, helpful, and actionable. Use plain text, not markdown.`,
      });

      res.json({ reply: result.content });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Chat failed" });
    }
  });

  // ── Webhook Endpoint (PUBLIC — no auth, HMAC verified) ──────────────────
  app.post("/api/webhooks/fiverr-order", async (req, res) => {
    const signature = req.headers["x-webhook-signature"] as string;
    if (!signature) return res.status(401).json({ error: "Missing X-Webhook-Signature header" });
    const { createHmac } = await import("crypto");
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    // Check against all webhook secrets
    const allSecrets = await storage.getAllWebhookSecrets();
    let matchedSecret: any = null;
    for (const ws of allSecrets) {
      const expected = createHmac("sha256", ws.secret).update(rawBody).digest("hex");
      if (expected === signature) { matchedSecret = ws; break; }
    }
    if (!matchedSecret) return res.status(403).json({ error: "Invalid signature" });
    const { orderId, gigTitle, buyerName, buyerEmail, specs, dueAt, revenue } = req.body;
    const order = await storage.createFiverrOrderV2({
      userId: matchedSecret.userId,
      orderId: orderId || undefined,
      gigTitle: gigTitle || "Webhook Order",
      buyerName: buyerName || "External Client",
      buyerEmail: buyerEmail || undefined,
      specs: specs || "",
      revenue: revenue ? Math.round(revenue * 100) : undefined,
      dueAt: dueAt ? new Date(dueAt).getTime() : undefined,
    });
    // Auto-generate if default template has autoGenerate
    const autoTemplate = await storage.getAutoGenerateTemplate(matchedSecret.userId);
    if (autoTemplate) {
      try {
        await storage.updateFiverrOrderV2(order.id, { templateId: autoTemplate.id });
        const { fiverrGenerationQueue } = await import("./workers/fiverrGeneration.worker");
        await fiverrGenerationQueue.add("auto-generate", {
          orderId: order.id,
          templateId: autoTemplate.id,
          userId: matchedSecret.userId,
        });
      } catch { /* Redis unavailable — order still created */ }
    }
    res.json({ orderId: order.id, status: "received" });
  });

  // ── Webhook Secret Management ─────────────────────────────────────────────
  app.get("/api/fiverr/webhook-secrets", async (req, res) => {
    const userId = req.user?.id || 1;
    const secrets = await storage.getWebhookSecrets(userId);
    // Mask secrets — only show last 8 chars
    res.json(secrets.map(s => ({ ...s, secret: "••••••••" + s.secret.slice(-8) })));
  });

  app.post("/api/fiverr/webhook-secrets", async (req, res) => {
    const userId = req.user?.id || 1;
    const { v4: uuidv4 } = await import("uuid");
    const { randomBytes } = await import("crypto");
    const secret = randomBytes(32).toString("hex");
    const ws = await storage.createWebhookSecret({
      id: uuidv4(),
      userId,
      secret,
      source: req.body.source || "fiverr",
    });
    // Return full secret ONCE on creation
    res.status(201).json({ ...ws, secret });
  });

  app.delete("/api/fiverr/webhook-secrets/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    const ws = await storage.getWebhookSecret(req.params.id);
    if (!ws || ws.userId !== userId) return res.status(404).json({ error: "Not found" });
    await storage.deleteWebhookSecret(req.params.id);
    res.json({ ok: true });
  });

  app.post("/api/fiverr/webhook-secrets/:id/test", async (req, res) => {
    const userId = req.user?.id || 1;
    const ws = await storage.getWebhookSecret(req.params.id);
    if (!ws || ws.userId !== userId) return res.status(404).json({ error: "Not found" });
    const { createHmac } = await import("crypto");
    const testPayload = {
      orderId: "test-" + Date.now(),
      gigTitle: "Test Order",
      buyerName: "Test Buyer",
      specs: "This is a test webhook payload.",
      revenue: 50,
    };
    const body = JSON.stringify(testPayload);
    const signature = createHmac("sha256", ws.secret).update(body).digest("hex");
    res.json({ testPayload, signature, webhookUrl: "/api/webhooks/fiverr-order" });
  });

  // ── Revenue Dashboard ──────────────────────────────────────────────────────
  app.get("/api/fiverr/revenue", async (req, res) => {
    const userId = req.user?.id || 1;
    const period = (req.query.period as string) || "30d";
    const now = Date.now();
    const periodMs: Record<string, number> = {
      "7d": 7 * 86400000,
      "30d": 30 * 86400000,
      "90d": 90 * 86400000,
      "all": 0,
    };
    const sinceTs = periodMs[period] ? now - periodMs[period] : undefined;
    const delivered = await storage.getDeliveredOrdersForRevenue(userId, sinceTs);
    const totalRevenue = delivered.reduce((sum: number, o: any) => sum + (o.revenue ?? o.amount ?? 0), 0);
    const orderCount = delivered.length;
    const avgOrderValue = orderCount ? Math.round(totalRevenue / orderCount) : 0;
    const allOrders = await storage.getFiverrOrdersV2(userId);
    const completionRate = allOrders.length ? Math.round((delivered.length / allOrders.length) * 100) : 0;

    // Daily aggregation for chart
    const daily: { date: string; revenue: number; orders: number }[] = [];
    const dayMap = new Map<string, { revenue: number; orders: number }>();
    for (const o of delivered) {
      const d = new Date(o.deliveredAt || o.createdAt).toISOString().slice(0, 10);
      const existing = dayMap.get(d) || { revenue: 0, orders: 0 };
      existing.revenue += o.revenue ?? o.amount ?? 0;
      existing.orders += 1;
      dayMap.set(d, existing);
    }
    // Fill gaps for last 30 days
    const daysToShow = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
      const existing = dayMap.get(d) || { revenue: 0, orders: 0 };
      daily.push({ date: d, ...existing });
    }

    res.json({ totalRevenue, orderCount, avgOrderValue, completionRate, daily, recentOrders: delivered.slice(0, 10) });
  });

  // ── Income Tracking (unified: fiverr orders + manual entries) ─────────────
  app.get("/api/fiverr/income", async (req, res) => {
    const userId = req.user?.id || 1;
    const period = (req.query.period as string) || "30d";
    const now = Date.now();
    const periodMs: Record<string, number> = { "7d": 7 * 86400000, "30d": 30 * 86400000, "90d": 90 * 86400000, "all": 0 };
    const sinceTs = periodMs[period] ? now - periodMs[period] : undefined;

    const delivered = await storage.getDeliveredOrdersForRevenue(userId, sinceTs);
    const manualEntries = await storage.getManualIncomeEntries(userId, sinceTs);

    // Unify into income items
    const items: any[] = [];
    for (const o of delivered) {
      items.push({
        id: o.id, type: "fiverr_order", amount: o.revenue ?? o.amount ?? 0,
        description: o.gigTitle || "Fiverr Order", platform: "fiverr",
        date: o.deliveredAt || o.createdAt,
      });
    }
    for (const m of manualEntries) {
      items.push({
        id: m.id, type: "manual", amount: m.amount,
        description: m.description, platform: m.platform || "manual",
        date: m.date,
      });
    }
    items.sort((a, b) => (b.date || 0) - (a.date || 0));

    // Platform breakdown
    const platforms: Record<string, number> = {};
    for (const item of items) {
      const p = item.platform || "other";
      platforms[p] = (platforms[p] || 0) + item.amount;
    }

    // Monthly trend
    const monthMap = new Map<string, number>();
    for (const item of items) {
      const d = new Date(typeof item.date === "number" ? item.date : Date.parse(item.date));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, (monthMap.get(key) || 0) + item.amount);
    }
    const monthlyTrend = Array.from(monthMap.entries()).map(([month, amount]) => ({ month, amount })).sort((a, b) => a.month.localeCompare(b.month));

    const totalIncome = items.reduce((s, i) => s + i.amount, 0);
    const taxRate = parseFloat((req.query.taxRate as string) || "0.25");
    const estimatedTax = Math.round(totalIncome * taxRate);

    res.json({ totalIncome, estimatedTax, taxRate, items, platforms, monthlyTrend });
  });

  app.post("/api/fiverr/income", async (req, res) => {
    const userId = req.user?.id || 1;
    const { v4: uuidv4 } = await import("uuid");
    const entry = await storage.createManualIncomeEntry({
      id: uuidv4(),
      userId,
      amount: Math.round((req.body.amount || 0) * 100), // dollars to cents
      description: req.body.description || "Manual income",
      platform: req.body.platform || "manual",
      date: req.body.date ? new Date(req.body.date).getTime() : Date.now(),
    });
    res.status(201).json(entry);
  });

  app.delete("/api/fiverr/income/:id", async (req, res) => {
    const userId = req.user?.id || 1;
    await storage.deleteManualIncomeEntry(req.params.id);
    res.json({ ok: true });
  });

  // ── Income CSV Export ──────────────────────────────────────────────────────
  app.get("/api/fiverr/income/export", async (req, res) => {
    const userId = req.user?.id || 1;
    const delivered = await storage.getDeliveredOrdersForRevenue(userId);
    const manualEntries = await storage.getManualIncomeEntries(userId);

    let csv = "Date,Description,Platform,Amount\n";
    for (const o of delivered) {
      const date = new Date(o.deliveredAt || o.createdAt).toISOString().slice(0, 10);
      const amount = ((o.revenue ?? o.amount ?? 0) / 100).toFixed(2);
      csv += `${date},"${(o.gigTitle || "Fiverr Order").replace(/"/g, '""')}",fiverr,${amount}\n`;
    }
    for (const m of manualEntries) {
      const date = new Date(m.date).toISOString().slice(0, 10);
      const amount = (m.amount / 100).toFixed(2);
      csv += `${date},"${m.description.replace(/"/g, '""')}",${m.platform || "manual"},${amount}\n`;
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=income-export-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
  });

  // ── Fiverr SSE Stream for Generation Progress ────────────────────────────
  app.get("/api/fiverr/stream/:orderId", async (req, res) => {
    const orderId = req.params.orderId;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ event: "connected", orderId })}\n\n`);

    let closed = false;
    try {
      const { createSubscriber } = await import("./lib/redis");
      const sub = createSubscriber();
      const channel = `fiverr:${orderId}:progress`;
      await sub.subscribe(channel);
      sub.on("message", (_ch: string, message: string) => {
        if (closed) return;
        try {
          const parsed = JSON.parse(message);
          res.write(`data: ${JSON.stringify(parsed)}\n\n`);
          if (parsed.event === "complete" || parsed.event === "error") {
            sub.unsubscribe(channel);
            sub.quit();
            res.end();
            closed = true;
          }
        } catch { /* ignore parse errors */ }
      });
      // Heartbeat
      const hb = setInterval(() => {
        if (closed) { clearInterval(hb); return; }
        res.write(`: heartbeat\n\n`);
      }, 15000);
      req.on("close", () => {
        closed = true;
        clearInterval(hb);
        sub.unsubscribe(channel).catch(() => {});
        sub.quit().catch(() => {});
      });
    } catch {
      // Redis unavailable — just end stream
      res.write(`data: ${JSON.stringify({ event: "error", data: { message: "Streaming unavailable" } })}\n\n`);
      res.end();
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

  // === AGENT JOBS SUMMARY ===
  app.get("/api/agent-jobs/summary", async (req, res) => {
    const userId = req.user?.id || 1;
    try {
      const allJobs = await storage.getRunningJobsByUser(userId);
      const types = ["researcher", "coder", "writer", "analyst", "reviewer", "artgen", "browser", "art", "reasoning", "boss"];
      const summaries = types.map(type => {
        const jobsOfType = allJobs.filter((j: any) => j.type === type);
        const completed = jobsOfType.filter((j: any) => j.status === "complete");
        const totalTokens = jobsOfType.reduce((sum: number, j: any) => sum + (j.tokenCount || 0), 0);
        const totalDuration = completed.reduce((sum: number, j: any) => sum + (j.durationMs || 0), 0);
        return {
          type,
          totalJobs: jobsOfType.length,
          completedJobs: completed.length,
          totalTokens,
          avgDurationMs: completed.length ? Math.round(totalDuration / completed.length) : 0,
        };
      });
      res.json(summaries);
    } catch {
      res.json([]);
    }
  });

  // === WORKFLOW EXECUTION (Visual Workflow Engine) ===
  app.post("/api/workflows/:id/execute", async (req, res) => {
    const workflowId = Number(req.params.id);
    const userId = req.user?.id || 1;
    const { prompt } = req.body;

    const workflow = await storage.getWorkflow(workflowId);
    if (!workflow) return res.status(404).json({ error: "Workflow not found" });
    if (!workflow.canvasState) return res.status(400).json({ error: "Workflow has no canvas state" });

    const { v4: uuidv4 } = await import("uuid");
    const executionId = uuidv4();

    await storage.createWorkflowExecution({
      id: executionId,
      workflowId,
      userId,
      status: "pending",
      createdAt: Date.now(),
    });

    // Run workflow in background
    (async () => {
      try {
        await storage.updateWorkflowExecution(executionId, {
          status: "running",
          startedAt: Date.now(),
        });

        const { executeWorkflow } = await import("./workflowEngine");
        const canvasState = JSON.parse(workflow.canvasState!);
        const nodes = canvasState.nodes || [];
        const edges = canvasState.edges || [];

        const result = await executeWorkflow(executionId, nodes, edges, userId, prompt);

        await storage.updateWorkflowExecution(executionId, {
          status: "completed",
          completedAt: Date.now(),
        });

        // Publish completion event
        const { redis } = await import("./lib/redis");
        await redis.publish(
          `workflow:${executionId}:events`,
          JSON.stringify({ event: "execution_complete", data: { totalTokens: result.totalTokens } })
        );
      } catch (err: any) {
        await storage.updateWorkflowExecution(executionId, {
          status: "failed",
          errorMessage: err.message,
          completedAt: Date.now(),
        });

        try {
          const { redis } = await import("./lib/redis");
          await redis.publish(
            `workflow:${executionId}:events`,
            JSON.stringify({ event: "execution_error", data: { error: err.message } })
          );
        } catch {}
      }
    })();

    res.status(201).json({ executionId, status: "pending" });
  });

  // === WORKFLOW EXECUTION SSE ===
  app.get("/api/workflows/executions/:executionId/stream", (req, res) => {
    const { executionId } = req.params;
    if (!executionId) return res.status(400).json({ error: "executionId required" });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    res.write(`event: connected\ndata: ${JSON.stringify({ executionId })}\n\n`);

    const { createSubscriber } = require("./lib/redis");
    const subscriber = createSubscriber();
    const channel = `workflow:${executionId}:events`;

    subscriber.subscribe(channel, (err: any) => {
      if (err) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: "Subscribe failed" })}\n\n`);
        res.end();
        return;
      }
    });

    subscriber.on("message", (_ch: string, message: string) => {
      try {
        const parsed = JSON.parse(message);
        const eventType = parsed.event || "node_update";
        const data = parsed.data || parsed;
        res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);

        if (eventType === "execution_complete" || eventType === "execution_error") {
          setTimeout(() => {
            subscriber.unsubscribe(channel);
            subscriber.quit();
            res.end();
          }, 100);
        }
      } catch {}
    });

    const heartbeat = setInterval(() => {
      res.write(`:heartbeat\n\n`);
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeat);
      subscriber.unsubscribe(channel).catch(() => {});
      subscriber.quit().catch(() => {});
    });
  });

  // === WORKFLOW EXECUTION STATUS ===
  app.get("/api/workflows/executions/:executionId", async (req, res) => {
    const exec = await storage.getWorkflowExecution(req.params.executionId);
    if (!exec) return res.status(404).json({ error: "Execution not found" });
    const nodeResults = await storage.getWorkflowNodeResults(exec.id);
    res.json({ execution: exec, nodeResults });
  });

  // === KILL WORKFLOW EXECUTION ===
  app.post("/api/workflows/executions/:executionId/kill", async (req, res) => {
    const exec = await storage.getWorkflowExecution(req.params.executionId);
    if (!exec) return res.status(404).json({ error: "Execution not found" });
    await storage.updateWorkflowExecution(exec.id, {
      status: "killed",
      completedAt: Date.now(),
    });
    res.json({ status: "killed" });
  });

  // === WORKFLOW EXECUTIONS LIST ===
  app.get("/api/workflows/:id/executions", async (req, res) => {
    const executions = await storage.getWorkflowExecutions(Number(req.params.id));
    res.json(executions);
  });

  // === BUILT-IN WORKFLOW TEMPLATES ===
  app.get("/api/workflow-templates", (_req, res) => {
    const templates = [
      {
        id: "blog-post-pipeline",
        name: "Blog Post Pipeline",
        description: "Research a topic, write a blog post, then review it for quality",
        category: "content",
        nodes: [
          { id: "trigger-1", type: "trigger", data: { subtype: "manual", label: "Start" }, position: { x: 50, y: 150 } },
          { id: "agent-researcher", type: "agent", data: { subtype: "researcher", label: "Research Topic" }, position: { x: 300, y: 150 } },
          { id: "agent-writer", type: "agent", data: { subtype: "writer", label: "Write Blog Post" }, position: { x: 550, y: 150 } },
          { id: "agent-reviewer", type: "agent", data: { subtype: "reviewer", label: "Review & Edit" }, position: { x: 800, y: 150 } },
          { id: "output-1", type: "output", data: { subtype: "return", label: "Final Post" }, position: { x: 1050, y: 150 } },
        ],
        edges: [
          { id: "e1", source: "trigger-1", target: "agent-researcher", type: "animated", data: { dataType: "execution" } },
          { id: "e2", source: "agent-researcher", target: "agent-writer", type: "animated", data: { dataType: "execution" } },
          { id: "e3", source: "agent-writer", target: "agent-reviewer", type: "animated", data: { dataType: "execution" } },
          { id: "e4", source: "agent-reviewer", target: "output-1", type: "animated", data: { dataType: "execution" } },
        ],
      },
      {
        id: "code-review",
        name: "Code Review",
        description: "Generate code then review it for bugs and best practices",
        category: "development",
        nodes: [
          { id: "trigger-1", type: "trigger", data: { subtype: "manual", label: "Start" }, position: { x: 50, y: 150 } },
          { id: "agent-coder", type: "agent", data: { subtype: "coder", label: "Write Code" }, position: { x: 300, y: 150 } },
          { id: "agent-reviewer", type: "agent", data: { subtype: "reviewer", label: "Code Review" }, position: { x: 550, y: 150 } },
          { id: "output-1", type: "output", data: { subtype: "return", label: "Reviewed Code" }, position: { x: 800, y: 150 } },
        ],
        edges: [
          { id: "e1", source: "trigger-1", target: "agent-coder", type: "animated", data: { dataType: "execution" } },
          { id: "e2", source: "agent-coder", target: "agent-reviewer", type: "animated", data: { dataType: "execution" } },
          { id: "e3", source: "agent-reviewer", target: "output-1", type: "animated", data: { dataType: "execution" } },
        ],
      },
      {
        id: "content-creation",
        name: "Content Creation",
        description: "Research, write content, and generate art direction",
        category: "content",
        nodes: [
          { id: "trigger-1", type: "trigger", data: { subtype: "manual", label: "Start" }, position: { x: 50, y: 200 } },
          { id: "agent-researcher", type: "agent", data: { subtype: "researcher", label: "Research" }, position: { x: 300, y: 100 } },
          { id: "agent-writer", type: "agent", data: { subtype: "writer", label: "Write Content" }, position: { x: 550, y: 100 } },
          { id: "agent-artgen", type: "agent", data: { subtype: "boss", label: "Art Direction" }, position: { x: 550, y: 300 } },
          { id: "output-1", type: "output", data: { subtype: "return", label: "Final Content" }, position: { x: 800, y: 200 } },
        ],
        edges: [
          { id: "e1", source: "trigger-1", target: "agent-researcher", type: "animated", data: { dataType: "execution" } },
          { id: "e2", source: "agent-researcher", target: "agent-writer", type: "animated", data: { dataType: "execution" } },
          { id: "e3", source: "trigger-1", target: "agent-artgen", type: "animated", data: { dataType: "execution" } },
          { id: "e4", source: "agent-writer", target: "output-1", type: "animated", data: { dataType: "execution" } },
          { id: "e5", source: "agent-artgen", target: "output-1", type: "animated", data: { dataType: "execution" } },
        ],
      },
      {
        id: "data-report",
        name: "Data Report",
        description: "Analyze data and write a professional report",
        category: "analysis",
        nodes: [
          { id: "trigger-1", type: "trigger", data: { subtype: "manual", label: "Start" }, position: { x: 50, y: 150 } },
          { id: "agent-analyst", type: "agent", data: { subtype: "analyst", label: "Analyze Data" }, position: { x: 300, y: 150 } },
          { id: "agent-writer", type: "agent", data: { subtype: "writer", label: "Write Report" }, position: { x: 550, y: 150 } },
          { id: "output-1", type: "output", data: { subtype: "return", label: "Final Report" }, position: { x: 800, y: 150 } },
        ],
        edges: [
          { id: "e1", source: "trigger-1", target: "agent-analyst", type: "animated", data: { dataType: "execution" } },
          { id: "e2", source: "agent-analyst", target: "agent-writer", type: "animated", data: { dataType: "execution" } },
          { id: "e3", source: "agent-writer", target: "output-1", type: "animated", data: { dataType: "execution" } },
        ],
      },
      {
        id: "bunz-ai-architecture",
        name: "Bunz AI Architecture Blueprint",
        description: "Interactive blueprint of the Bunz AI system — drag nodes to reroute paths between Boss, workers, and integrations.",
        category: "architecture",
        nodes: [
          // Top Level — Orchestration
          { id: "trigger-input", type: "trigger", data: { subtype: "manual", label: "User Input" }, position: { x: 600, y: 0 } },
          { id: "agent-boss", type: "agent", data: { subtype: "boss", label: "Boss (Orchestrator)" }, position: { x: 550, y: 120 } },
          { id: "logic-router", type: "logic", data: { subtype: "switch", label: "Task Router" }, position: { x: 550, y: 260 } },
          // Left Branch — Research & Analysis
          { id: "agent-researcher", type: "agent", data: { subtype: "researcher", label: "Researcher" }, position: { x: 100, y: 400 } },
          { id: "agent-analyst", type: "agent", data: { subtype: "analyst", label: "Analyst" }, position: { x: 100, y: 540 } },
          // Center-Left — Content Creation
          { id: "agent-writer", type: "agent", data: { subtype: "writer", label: "Writer" }, position: { x: 350, y: 400 } },
          { id: "agent-reviewer", type: "agent", data: { subtype: "reviewer", label: "Reviewer" }, position: { x: 350, y: 540 } },
          // Center — Code & Development
          { id: "agent-coder", type: "agent", data: { subtype: "coder", label: "Coder" }, position: { x: 600, y: 400 } },
          // Center-Right — Visual & Media
          { id: "agent-artgen", type: "agent", data: { subtype: "artgen", label: "Art Gen" }, position: { x: 850, y: 400 } },
          // Right — Web & Automation
          { id: "agent-browser", type: "agent", data: { subtype: "browser", label: "Browser" }, position: { x: 1100, y: 400 } },
          // Bottom — Output & Integration
          { id: "logic-merge", type: "logic", data: { subtype: "merge", label: "Merge" }, position: { x: 550, y: 680 } },
          { id: "output-final", type: "output", data: { subtype: "return", label: "Final Output" }, position: { x: 350, y: 820 } },
          { id: "trigger-fiverr", type: "trigger", data: { subtype: "webhook", label: "Fiverr Webhook" }, position: { x: 800, y: 820 } },
          { id: "output-fiverr", type: "output", data: { subtype: "return", label: "Fiverr Delivery" }, position: { x: 800, y: 960 } },
        ],
        edges: [
          // Orchestration flow
          { id: "e-input-boss", source: "trigger-input", target: "agent-boss", type: "animated", data: { dataType: "execution" } },
          { id: "e-boss-router", source: "agent-boss", target: "logic-router", type: "animated", data: { dataType: "execution" } },
          // Task Router → Workers
          { id: "e-router-researcher", source: "logic-router", target: "agent-researcher", type: "animated", data: { dataType: "execution" } },
          { id: "e-router-writer", source: "logic-router", target: "agent-writer", type: "animated", data: { dataType: "execution" } },
          { id: "e-router-coder", source: "logic-router", target: "agent-coder", type: "animated", data: { dataType: "execution" } },
          { id: "e-router-artgen", source: "logic-router", target: "agent-artgen", type: "animated", data: { dataType: "execution" } },
          { id: "e-router-browser", source: "logic-router", target: "agent-browser", type: "animated", data: { dataType: "execution" } },
          // Research chain
          { id: "e-researcher-analyst", source: "agent-researcher", target: "agent-analyst", type: "animated", data: { dataType: "execution" } },
          // Content chain — Writer & Coder both go to shared Reviewer
          { id: "e-writer-reviewer", source: "agent-writer", target: "agent-reviewer", type: "animated", data: { dataType: "execution" } },
          { id: "e-coder-reviewer", source: "agent-coder", target: "agent-reviewer", type: "animated", data: { dataType: "execution" } },
          // All agent outputs → Merge
          { id: "e-analyst-merge", source: "agent-analyst", target: "logic-merge", type: "animated", data: { dataType: "execution" } },
          { id: "e-reviewer-merge", source: "agent-reviewer", target: "logic-merge", type: "animated", data: { dataType: "execution" } },
          { id: "e-artgen-merge", source: "agent-artgen", target: "logic-merge", type: "animated", data: { dataType: "execution" } },
          { id: "e-browser-merge", source: "agent-browser", target: "logic-merge", type: "animated", data: { dataType: "execution" } },
          // Merge → Outputs
          { id: "e-merge-final", source: "logic-merge", target: "output-final", type: "animated", data: { dataType: "execution" } },
          { id: "e-merge-fiverr-delivery", source: "logic-merge", target: "output-fiverr", type: "animated", data: { dataType: "execution" } },
          // Fiverr integration path
          { id: "e-fiverr-boss", source: "trigger-fiverr", target: "agent-boss", type: "animated", data: { dataType: "execution" } },
        ],
      },
    ];
    res.json(templates);
  });

  // === INSTALL WORKFLOW TEMPLATE ===
  app.post("/api/workflow-templates/:templateId/install", async (_req, res) => {
    const { templateId } = _req.params;
    // Use the same full template definitions as the GET endpoint
    const templates = [
      {
        id: "blog-post-pipeline",
        name: "Blog Post Pipeline",
        description: "Research a topic, write a blog post, then review it for quality",
        nodes: [
          { id: "trigger-1", type: "trigger", data: { subtype: "manual", label: "Start" }, position: { x: 50, y: 150 } },
          { id: "agent-researcher", type: "agent", data: { subtype: "researcher", label: "Research Topic" }, position: { x: 300, y: 150 } },
          { id: "agent-writer", type: "agent", data: { subtype: "writer", label: "Write Blog Post" }, position: { x: 550, y: 150 } },
          { id: "agent-reviewer", type: "agent", data: { subtype: "reviewer", label: "Review & Edit" }, position: { x: 800, y: 150 } },
          { id: "output-1", type: "output", data: { subtype: "return", label: "Final Post" }, position: { x: 1050, y: 150 } },
        ],
        edges: [
          { id: "e1", source: "trigger-1", target: "agent-researcher", type: "animated", data: { dataType: "execution" } },
          { id: "e2", source: "agent-researcher", target: "agent-writer", type: "animated", data: { dataType: "execution" } },
          { id: "e3", source: "agent-writer", target: "agent-reviewer", type: "animated", data: { dataType: "execution" } },
          { id: "e4", source: "agent-reviewer", target: "output-1", type: "animated", data: { dataType: "execution" } },
        ],
      },
      {
        id: "code-review",
        name: "Code Review",
        description: "Generate code then review it for bugs and best practices",
        nodes: [
          { id: "trigger-1", type: "trigger", data: { subtype: "manual", label: "Start" }, position: { x: 50, y: 150 } },
          { id: "agent-coder", type: "agent", data: { subtype: "coder", label: "Write Code" }, position: { x: 300, y: 150 } },
          { id: "agent-reviewer", type: "agent", data: { subtype: "reviewer", label: "Code Review" }, position: { x: 550, y: 150 } },
          { id: "output-1", type: "output", data: { subtype: "return", label: "Reviewed Code" }, position: { x: 800, y: 150 } },
        ],
        edges: [
          { id: "e1", source: "trigger-1", target: "agent-coder", type: "animated", data: { dataType: "execution" } },
          { id: "e2", source: "agent-coder", target: "agent-reviewer", type: "animated", data: { dataType: "execution" } },
          { id: "e3", source: "agent-reviewer", target: "output-1", type: "animated", data: { dataType: "execution" } },
        ],
      },
      {
        id: "content-creation",
        name: "Content Creation",
        description: "Research, write content, and generate art direction",
        nodes: [
          { id: "trigger-1", type: "trigger", data: { subtype: "manual", label: "Start" }, position: { x: 50, y: 200 } },
          { id: "agent-researcher", type: "agent", data: { subtype: "researcher", label: "Research" }, position: { x: 300, y: 100 } },
          { id: "agent-writer", type: "agent", data: { subtype: "writer", label: "Write Content" }, position: { x: 550, y: 100 } },
          { id: "agent-artgen", type: "agent", data: { subtype: "boss", label: "Art Direction" }, position: { x: 550, y: 300 } },
          { id: "output-1", type: "output", data: { subtype: "return", label: "Final Content" }, position: { x: 800, y: 200 } },
        ],
        edges: [
          { id: "e1", source: "trigger-1", target: "agent-researcher", type: "animated", data: { dataType: "execution" } },
          { id: "e2", source: "agent-researcher", target: "agent-writer", type: "animated", data: { dataType: "execution" } },
          { id: "e3", source: "trigger-1", target: "agent-artgen", type: "animated", data: { dataType: "execution" } },
          { id: "e4", source: "agent-writer", target: "output-1", type: "animated", data: { dataType: "execution" } },
          { id: "e5", source: "agent-artgen", target: "output-1", type: "animated", data: { dataType: "execution" } },
        ],
      },
      {
        id: "data-report",
        name: "Data Report",
        description: "Analyze data and write a professional report",
        nodes: [
          { id: "trigger-1", type: "trigger", data: { subtype: "manual", label: "Start" }, position: { x: 50, y: 150 } },
          { id: "agent-analyst", type: "agent", data: { subtype: "analyst", label: "Analyze Data" }, position: { x: 300, y: 150 } },
          { id: "agent-writer", type: "agent", data: { subtype: "writer", label: "Write Report" }, position: { x: 550, y: 150 } },
          { id: "output-1", type: "output", data: { subtype: "return", label: "Final Report" }, position: { x: 800, y: 150 } },
        ],
        edges: [
          { id: "e1", source: "trigger-1", target: "agent-analyst", type: "animated", data: { dataType: "execution" } },
          { id: "e2", source: "agent-analyst", target: "agent-writer", type: "animated", data: { dataType: "execution" } },
          { id: "e3", source: "agent-writer", target: "output-1", type: "animated", data: { dataType: "execution" } },
        ],
      },
      {
        id: "bunz-ai-architecture",
        name: "Bunz AI Architecture Blueprint",
        description: "Interactive blueprint of the Bunz AI system — drag nodes to reroute paths between Boss, workers, and integrations.",
        nodes: [
          { id: "trigger-input", type: "trigger", data: { subtype: "manual", label: "User Input" }, position: { x: 600, y: 0 } },
          { id: "agent-boss", type: "agent", data: { subtype: "boss", label: "Boss (Orchestrator)" }, position: { x: 550, y: 120 } },
          { id: "logic-router", type: "logic", data: { subtype: "switch", label: "Task Router" }, position: { x: 550, y: 260 } },
          { id: "agent-researcher", type: "agent", data: { subtype: "researcher", label: "Researcher" }, position: { x: 100, y: 400 } },
          { id: "agent-analyst", type: "agent", data: { subtype: "analyst", label: "Analyst" }, position: { x: 100, y: 540 } },
          { id: "agent-writer", type: "agent", data: { subtype: "writer", label: "Writer" }, position: { x: 350, y: 400 } },
          { id: "agent-reviewer", type: "agent", data: { subtype: "reviewer", label: "Reviewer" }, position: { x: 350, y: 540 } },
          { id: "agent-coder", type: "agent", data: { subtype: "coder", label: "Coder" }, position: { x: 600, y: 400 } },
          { id: "agent-artgen", type: "agent", data: { subtype: "artgen", label: "Art Gen" }, position: { x: 850, y: 400 } },
          { id: "agent-browser", type: "agent", data: { subtype: "browser", label: "Browser" }, position: { x: 1100, y: 400 } },
          { id: "logic-merge", type: "logic", data: { subtype: "merge", label: "Merge" }, position: { x: 550, y: 680 } },
          { id: "output-final", type: "output", data: { subtype: "return", label: "Final Output" }, position: { x: 350, y: 820 } },
          { id: "trigger-fiverr", type: "trigger", data: { subtype: "webhook", label: "Fiverr Webhook" }, position: { x: 800, y: 820 } },
          { id: "output-fiverr", type: "output", data: { subtype: "return", label: "Fiverr Delivery" }, position: { x: 800, y: 960 } },
        ],
        edges: [
          { id: "e-input-boss", source: "trigger-input", target: "agent-boss", type: "animated", data: { dataType: "execution" } },
          { id: "e-boss-router", source: "agent-boss", target: "logic-router", type: "animated", data: { dataType: "execution" } },
          { id: "e-router-researcher", source: "logic-router", target: "agent-researcher", type: "animated", data: { dataType: "execution" } },
          { id: "e-router-writer", source: "logic-router", target: "agent-writer", type: "animated", data: { dataType: "execution" } },
          { id: "e-router-coder", source: "logic-router", target: "agent-coder", type: "animated", data: { dataType: "execution" } },
          { id: "e-router-artgen", source: "logic-router", target: "agent-artgen", type: "animated", data: { dataType: "execution" } },
          { id: "e-router-browser", source: "logic-router", target: "agent-browser", type: "animated", data: { dataType: "execution" } },
          { id: "e-researcher-analyst", source: "agent-researcher", target: "agent-analyst", type: "animated", data: { dataType: "execution" } },
          { id: "e-writer-reviewer", source: "agent-writer", target: "agent-reviewer", type: "animated", data: { dataType: "execution" } },
          { id: "e-coder-reviewer", source: "agent-coder", target: "agent-reviewer", type: "animated", data: { dataType: "execution" } },
          { id: "e-analyst-merge", source: "agent-analyst", target: "logic-merge", type: "animated", data: { dataType: "execution" } },
          { id: "e-reviewer-merge", source: "agent-reviewer", target: "logic-merge", type: "animated", data: { dataType: "execution" } },
          { id: "e-artgen-merge", source: "agent-artgen", target: "logic-merge", type: "animated", data: { dataType: "execution" } },
          { id: "e-browser-merge", source: "agent-browser", target: "logic-merge", type: "animated", data: { dataType: "execution" } },
          { id: "e-merge-final", source: "logic-merge", target: "output-final", type: "animated", data: { dataType: "execution" } },
          { id: "e-merge-fiverr-delivery", source: "logic-merge", target: "output-fiverr", type: "animated", data: { dataType: "execution" } },
          { id: "e-fiverr-boss", source: "trigger-fiverr", target: "agent-boss", type: "animated", data: { dataType: "execution" } },
        ],
      },
    ];
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) return res.status(404).json({ error: "Template not found" });

    const workflow = await storage.createWorkflow({
      name: tpl.name,
      description: tpl.description,
      status: "draft",
      priority: "medium",
      canvasState: JSON.stringify({ nodes: tpl.nodes, edges: tpl.edges }),
    } as any);
    res.status(201).json(workflow);
  });

  // === AI WORKFLOW CREATOR ===
  app.post("/api/workflows/ai-create", async (req, res) => {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Prompt is required" });
    }

    try {
      const { modelRouter } = await import("./lib/modelRouter");
      const result = await modelRouter.chat({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: prompt }],
        systemPrompt: `You are a workflow architect. Given a user's description, generate a workflow as JSON.
Output ONLY valid JSON with this structure:
{
  "name": "Workflow Name",
  "description": "Brief description",
  "nodes": [
    { "agentType": "researcher|coder|writer|analyst|reviewer|artgen|browser", "label": "Human-readable name" }
  ]
}

Rules:
- Each node must use one of these agent types: researcher, coder, writer, analyst, reviewer, artgen, browser
- Choose agent types that match the task description
- If the user says "3 AI" or "3 agents", create 3 nodes with sensible defaults
- For "blog post pipeline": researcher → writer → reviewer
- For "code review": coder → reviewer
- Do NOT add system prompts or models unless the user explicitly asks
- Keep it simple and match the user's intent
- Output ONLY the JSON, no markdown, no explanation`,
        maxTokens: 500,
      });

      let parsed: any;
      try {
        // Extract JSON from response (handle potential markdown wrapping)
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : result.content);
      } catch {
        return res.status(500).json({ error: "AI returned invalid JSON" });
      }

      // Build canvas state from AI output
      const nodes: any[] = [];
      const edges: any[] = [];
      const agentNodes = parsed.nodes || [];

      // Add trigger node
      nodes.push({
        id: "trigger-1",
        type: "trigger",
        position: { x: 250, y: 0 },
        data: { label: "Start", subtype: "manual" },
      });

      // Add agent nodes
      agentNodes.forEach((n: any, i: number) => {
        const nodeId = `agent-${n.agentType}-${i}`;
        nodes.push({
          id: nodeId,
          type: "agent",
          position: { x: 250, y: 120 + i * 120 },
          data: { label: n.label || n.agentType, subtype: n.agentType, model: "", systemPrompt: "" },
        });
      });

      // Add output node
      nodes.push({
        id: "output-1",
        type: "output",
        position: { x: 250, y: 120 + agentNodes.length * 120 },
        data: { label: "Output" },
      });

      // Connect nodes in sequence
      edges.push({
        id: "e-trigger",
        source: "trigger-1",
        target: nodes[1]?.id || "output-1",
        type: "animated",
        data: { dataType: "execution" },
      });
      for (let i = 1; i < nodes.length - 1; i++) {
        edges.push({
          id: `e-${i}`,
          source: nodes[i].id,
          target: nodes[i + 1].id,
          type: "animated",
          data: { dataType: "execution" },
        });
      }

      const workflow = await storage.createWorkflow({
        name: parsed.name || "AI-Generated Workflow",
        description: parsed.description || prompt,
        status: "draft",
        priority: "medium",
        canvasState: JSON.stringify({ nodes, edges }),
      } as any);

      res.status(201).json(workflow);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to create workflow" });
    }
  });

  // === AI WORKFLOW CHAT (modify existing workflow) ===
  app.post("/api/workflows/:id/chat", async (req, res) => {
    const workflowId = Number(req.params.id);
    const { message, history } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    try {
      const workflow = await storage.getWorkflow(workflowId);
      if (!workflow) return res.status(404).json({ error: "Workflow not found" });

      const currentCanvas = workflow.canvasState ? JSON.parse(workflow.canvasState) : { nodes: [], edges: [] };
      const currentNodes = currentCanvas.nodes || [];
      const currentEdges = currentCanvas.edges || [];

      const { modelRouter } = await import("./lib/modelRouter");

      const messages: Array<{ role: string; content: string }> = [];
      if (Array.isArray(history)) {
        for (const h of history) {
          if (h.role && h.content) messages.push({ role: h.role, content: h.content });
        }
      }
      messages.push({ role: "user", content: message });

      const result = await modelRouter.chat({
        model: "claude-sonnet-4-6",
        messages,
        systemPrompt: `You are a workflow editor AI. The user wants to modify an existing workflow.

Current workflow: "${workflow.name}"
Current nodes: ${JSON.stringify(currentNodes.map((n: any) => ({ id: n.id, type: n.type, subtype: n.data?.subtype, label: n.data?.label, model: n.data?.model })))}
Current edges: ${JSON.stringify(currentEdges.map((e: any) => ({ source: e.source, target: e.target })))}

Output ONLY valid JSON with this structure:
{
  "reply": "Short confirmation of what you changed",
  "nodes": [ full array of ALL nodes after modification ],
  "edges": [ full array of ALL edges after modification ]
}

Node format: { "id": "agent-TYPE-N", "type": "agent"|"trigger"|"output"|"logic", "position": { "x": N, "y": N }, "data": { "label": "Name", "subtype": "researcher|coder|writer|analyst|reviewer|artgen|browser|manual|webhook|return|switch|merge", "model": "", "systemPrompt": "" } }
Edge format: { "id": "e-N", "source": "node-id", "target": "node-id", "type": "animated", "data": { "dataType": "execution" } }

Rules:
- Valid agent subtypes: researcher, coder, writer, analyst, reviewer, artgen, browser
- Always keep trigger and output nodes
- When adding nodes, place them logically (increment y by 120 for vertical, x by 250 for horizontal)
- When changing a model, use the model ID string (e.g. "claude-sonnet-4-6", "gpt-4o", "gpt-5.4")
- Return ALL nodes and edges, not just changes
- Output ONLY the JSON, no markdown, no explanation`,
        maxTokens: 2000,
      });

      let parsed: any;
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : result.content);
      } catch {
        return res.status(500).json({ error: "AI returned invalid JSON", raw: result.content });
      }

      const newNodes = parsed.nodes || currentNodes;
      const newEdges = parsed.edges || currentEdges;

      await storage.updateWorkflow(workflowId, {
        canvasState: JSON.stringify({ nodes: newNodes, edges: newEdges }),
      } as any);

      res.json({
        reply: parsed.reply || "Workflow updated",
        nodes: newNodes,
        edges: newEdges,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to process chat" });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3: DASHBOARD & KPIs — Live stats, layout persistence, activity feed
  // ══════════════════════════════════════════════════════════════════════════

  // ── Dashboard Stats (real DB queries with period-over-period deltas) ────
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const userId = req.user?.id || 1;

      // Try Redis cache first (60s TTL)
      let cached: string | null = null;
      try {
        const { redis } = await import("./lib/redis");
        cached = await redis.get(`dashboard:stats:${userId}`);
        if (cached) return res.json(JSON.parse(cached));
      } catch (_) { /* Redis unavailable, skip cache */ }

      const stats = storage.getDashboardStats(userId);

      // Cache in Redis for 60s
      try {
        const { redis } = await import("./lib/redis");
        await redis.setex(`dashboard:stats:${userId}`, 60, JSON.stringify(stats));
      } catch (_) {}

      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Token Usage Chart Data (7d daily) ───────────────────────────────────
  app.get("/api/dashboard/token-usage", async (req, res) => {
    const userId = req.user?.id || 1;
    const days = parseInt(req.query.days as string) || 7;
    const data = storage.getTokenUsageByDay(userId, days);
    res.json(data);
  });

  // ── Workflow Run Chart Data (30d daily) ─────────────────────────────────
  app.get("/api/dashboard/workflow-runs", async (req, res) => {
    const userId = req.user?.id || 1;
    const days = parseInt(req.query.days as string) || 30;
    const data = storage.getWorkflowRunsByDay(userId, days);
    res.json(data);
  });

  // ── Model Usage Breakdown ───────────────────────────────────────────────
  app.get("/api/dashboard/model-usage", async (req, res) => {
    const userId = req.user?.id || 1;
    const data = storage.getModelUsageBreakdown(userId);
    res.json(data);
  });

  // ── Dashboard Layout Persistence ────────────────────────────────────────
  app.get("/api/dashboard/layout", async (req, res) => {
    const userId = req.user?.id || 1;
    const layout = storage.getDashboardLayout(userId);
    res.json(layout || { layout: null });
  });

  app.put("/api/dashboard/layout", async (req, res) => {
    const userId = req.user?.id || 1;
    const { layout } = req.body;
    if (!Array.isArray(layout)) return res.status(400).json({ error: "layout must be an array" });
    const saved = storage.upsertDashboardLayout(userId, layout);
    res.json(saved);
  });

  // ── Activity Events Feed ────────────────────────────────────────────────
  app.get("/api/activity", async (req, res) => {
    const userId = req.user?.id || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const events = storage.getActivityEvents(userId, limit);
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

      const dbSizeRow = sqlite.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get() as any;
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

  // === WORKSHOP MODS ===
  app.get("/api/workshop/mods", async (req, res) => {
    const userId = req.user?.id || 0;
    try {
      const mods = sqlite.prepare("SELECT * FROM workshop_mods WHERE is_published = 1 ORDER BY install_count DESC").all() as any[];
      const installed = userId ? sqlite.prepare("SELECT mod_id FROM user_installed_mods WHERE user_id = ?").all(userId) as any[] : [];
      const installedSet = new Set(installed.map((i: any) => i.mod_id));

      // Owner/admin gets all mods auto-installed
      const isOwnerOrAdmin = req.user?.role === "owner" || req.user?.role === "admin";

      res.json(mods.map((m: any) => ({
        id: m.id,
        slug: m.slug,
        name: m.name,
        description: m.description,
        longDescription: m.long_description,
        category: m.category,
        icon: m.icon,
        price: m.price,
        version: m.version,
        installCount: m.install_count,
        rating: m.rating,
        isOfficial: m.is_official,
        isPublished: m.is_published,
        route: m.route,
        isInstalled: isOwnerOrAdmin || installedSet.has(m.id),
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/workshop/installed", async (req, res) => {
    const userId = req.user?.id || 0;
    try {
      const isOwnerOrAdmin = req.user?.role === "owner" || req.user?.role === "admin";
      let mods: any[];
      if (isOwnerOrAdmin) {
        mods = sqlite.prepare("SELECT * FROM workshop_mods WHERE is_published = 1").all() as any[];
      } else {
        mods = sqlite.prepare(`
          SELECT wm.* FROM workshop_mods wm
          INNER JOIN user_installed_mods uim ON wm.id = uim.mod_id
          WHERE uim.user_id = ? AND wm.is_published = 1
        `).all(userId) as any[];
      }
      res.json(mods.map((m: any) => ({
        id: m.id, slug: m.slug, name: m.name, description: m.description,
        icon: m.icon, category: m.category, route: m.route,
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/workshop/mods/:slug/install", async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    try {
      const mod = sqlite.prepare("SELECT id FROM workshop_mods WHERE slug = ?").get(req.params.slug) as any;
      if (!mod) return res.status(404).json({ error: "Mod not found" });
      sqlite.prepare("INSERT OR IGNORE INTO user_installed_mods (user_id, mod_id) VALUES (?, ?)").run(userId, mod.id);
      sqlite.prepare("UPDATE workshop_mods SET install_count = install_count + 1 WHERE id = ?").run(mod.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/workshop/mods/:slug/uninstall", async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    try {
      const mod = sqlite.prepare("SELECT id FROM workshop_mods WHERE slug = ?").get(req.params.slug) as any;
      if (!mod) return res.status(404).json({ error: "Mod not found" });
      sqlite.prepare("DELETE FROM user_installed_mods WHERE user_id = ? AND mod_id = ?").run(userId, mod.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // === FILE UPLOAD/DOWNLOAD ===
  const multer = await import("multer");
  const path = await import("path");
  const fs = await import("fs");
  const { v4: uuidv4File } = await import("uuid");

  // Ensure uploads directory exists
  const uploadsDir = path.default.resolve(process.cwd(), "uploads");
  if (!fs.default.existsSync(uploadsDir)) {
    fs.default.mkdirSync(uploadsDir, { recursive: true });
  }

  const uploadStorage = multer.default.diskStorage({
    destination: (_req: any, _file: any, cb: any) => cb(null, uploadsDir),
    filename: (_req: any, file: any, cb: any) => {
      const ext = path.default.extname(file.originalname);
      cb(null, `${uuidv4File()}${ext}`);
    },
  });

  const upload = multer.default({
    storage: uploadStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  });

  app.post("/api/chat/upload", upload.single("file"), async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const fileId = uuidv4File();
    const storagePath = req.file.filename;
    const conversationId = req.body?.conversationId || null;

    try {
      sqlite.prepare(
        "INSERT INTO uploaded_files (id, user_id, original_name, mime_type, size, storage_path, conversation_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(fileId, userId, req.file.originalname, req.file.mimetype, req.file.size, storagePath, conversationId);

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
      const file = sqlite.prepare("SELECT * FROM uploaded_files WHERE id = ?").get(req.params.id) as any;
      if (!file) return res.status(404).json({ error: "File not found" });
      const filePath = path.default.join(uploadsDir, file.storage_path);
      if (!fs.default.existsSync(filePath)) return res.status(404).json({ error: "File not found on disk" });
      res.setHeader("Content-Type", file.mime_type);
      res.setHeader("Content-Disposition", `inline; filename="${file.original_name}"`);
      fs.default.createReadStream(filePath).pipe(res);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/files/:id/thumbnail", async (req, res) => {
    try {
      const file = sqlite.prepare("SELECT * FROM uploaded_files WHERE id = ?").get(req.params.id) as any;
      if (!file) return res.status(404).json({ error: "File not found" });
      const filePath = path.default.join(uploadsDir, file.storage_path);
      if (!fs.default.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
      // For now, serve the original image as thumbnail (could add sharp/resize later)
      res.setHeader("Content-Type", file.mime_type);
      fs.default.createReadStream(filePath).pipe(res);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // === ACTIVE AGENTS — removed (was using deleted BullMQ queues) ===
  // TODO: rebuild active agents dashboard using department system

  return httpServer;
}

