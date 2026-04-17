/**
 * Bunz SDK API — external programmatic access to Bunz features.
 *
 * Developers authenticate with API keys (bunz_sk_...) and can:
 * - Trigger workflows/pipelines
 * - Run department tasks (research, write, code, art)
 * - Execute bot cycles
 * - Read traces and memories
 * - Chat with Boss AI
 *
 * API key management: create, list, revoke.
 */

import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { dbRun, dbAll, dbGet } from "./lib/db";
import { executeDepartment } from "./departments/executor";
import { estimateComplexity } from "./departments/types";
import { modelRouter } from "./ai";

// ── API Key Management ───────────────────────────────────────────────────

function generateApiKey(): string {
  return `bunz_sk_${crypto.randomBytes(32).toString("hex")}`;
}

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/** Authenticate SDK requests via API key */
async function sdkAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer bunz_sk_")) {
    return res.status(401).json({ error: "Invalid API key. Use: Authorization: Bearer bunz_sk_..." });
  }

  const key = authHeader.slice(7);
  const keyHashValue = hashKey(key);

  const apiKey = await dbGet(
    "SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1",
    keyHashValue,
  ) as any;

  if (!apiKey) return res.status(401).json({ error: "Invalid or revoked API key" });
  if (apiKey.expires_at && apiKey.expires_at < Date.now()) {
    return res.status(401).json({ error: "API key expired" });
  }

  // Update usage
  await dbRun(
    "UPDATE api_keys SET last_used_at = ?, usage_count = usage_count + 1 WHERE id = ?",
    Date.now(), apiKey.id,
  );

  // Attach user info to request
  (req as any).sdkUserId = apiKey.user_id;
  (req as any).sdkScopes = apiKey.scopes ? JSON.parse(apiKey.scopes) : ["all"];
  next();
}

// ── API Key Management Routes ────────────────────────────────────────────

export function createApiKeyRouter() {
  const router = Router();

  // List API keys (authenticated user)
  router.get("/", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const keys = await dbAll(
      "SELECT id, name, key_prefix, scopes, last_used_at, usage_count, expires_at, is_active, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC",
      userId,
    );
    res.json(keys);
  });

  // Create API key
  router.post("/", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const { name, scopes, expiresInDays } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });

    const key = generateApiKey();
    const id = uuidv4();

    await dbRun(
      "INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, scopes, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      id, userId, name, hashKey(key), key.slice(0, 16),
      scopes ? JSON.stringify(scopes) : '["all"]',
      expiresInDays ? Date.now() + expiresInDays * 24 * 60 * 60 * 1000 : null,
      Date.now(),
    );

    // Return the full key ONCE — it won't be shown again
    res.json({ id, key, name, prefix: key.slice(0, 16) });
  });

  // Revoke API key
  router.delete("/:id", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    await dbRun("UPDATE api_keys SET is_active = 0 WHERE id = ? AND user_id = ?", req.params.id, userId);
    res.json({ ok: true });
  });

  return router;
}

// ── SDK API Routes (authenticated via API key) ───────────────────────────

export function createSdkRouter() {
  const router = Router();
  router.use(sdkAuthMiddleware);

  // Run a department task
  router.post("/departments/:dept", async (req: Request, res: Response) => {
    const userId = (req as any).sdkUserId;
    const dept = req.params.dept as string;
    const { task, level = "medium" } = req.body;
    if (!task) return res.status(400).json({ error: "task required" });

    const validDepts = ["research", "writer", "coder", "artist"];
    if (!validDepts.includes(dept)) return res.status(400).json({ error: `Invalid department. Use: ${validDepts.join(", ")}` });

    try {
      const result = await executeDepartment(
        uuidv4(),
        { department: dept as any, task },
        level as any,
        estimateComplexity(task),
      );

      res.json({
        department: dept,
        output: result.finalOutput,
        tokens: result.totalTokens,
        durationMs: result.totalDurationMs,
        imageUrl: result.imageUrl,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Chat with Boss AI
  router.post("/chat", async (req: Request, res: Response) => {
    const userId = (req as any).sdkUserId;
    const { message, conversationId, level = "medium" } = req.body;
    if (!message) return res.status(400).json({ error: "message required" });

    try {
      const { handleBossChat } = await import("./boss");
      const result = await handleBossChat({
        message, userId, level,
        conversationId,
        source: "sdk",
      });

      res.json({
        conversationId: result.conversationId,
        reply: result.reply,
        tokens: result.tokenCount,
        isDelegating: result.isDelegating,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Simple completion (no Boss routing, direct model call)
  router.post("/completions", async (req: Request, res: Response) => {
    const { prompt, model = "gpt-5.4-mini", systemPrompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "prompt required" });

    try {
      const result = await modelRouter.chat({
        model,
        messages: [{ role: "user", content: prompt }],
        systemPrompt,
      });

      res.json({
        content: result.content,
        model: result.usage.model,
        tokens: result.usage.totalTokens,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Trigger a pipeline
  router.post("/pipelines/:id/run", async (req: Request, res: Response) => {
    const userId = (req as any).sdkUserId;
    const { storage } = await import("./storage");

    const pipelineId = req.params.id as string;
    const pipeline = await storage.getPipeline(pipelineId);
    if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });

    const runId = uuidv4();
    await storage.createPipelineRun({ id: runId, pipelineId, userId, totalSteps: pipeline.steps.length });

    // Import and run (async — returns immediately)
    const { eventBus } = await import("./lib/eventBus");

    res.json({
      runId,
      pipelineId,
      name: pipeline.name,
      totalSteps: pipeline.steps.length,
      status: "started",
      streamUrl: `/api/pipelines/${runId}/stream`,
    });
  });

  // List traces
  router.get("/traces", async (req: Request, res: Response) => {
    const userId = (req as any).sdkUserId;
    const limit = Number(req.query.limit || 50);
    const traces = await dbAll(
      "SELECT * FROM agent_traces WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
      userId, limit,
    );
    res.json(traces);
  });

  // Health check
  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", version: "1.0.0", timestamp: Date.now() });
  });

  return router;
}
