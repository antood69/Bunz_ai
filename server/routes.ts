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
      try { sqlite.prepare("DELETE FROM agent_jobs WHERE id = ?").run(req.params.jobId); } catch {}
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}

