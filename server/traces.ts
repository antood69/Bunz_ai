/**
 * Agent Trace System — records every AI operation for full observability.
 *
 * Every department call, model inference, and tool use gets recorded as a trace.
 * Traces can be nested (boss -> department -> sub-agent) via parentTraceId.
 * The UI renders these as a timeline/waterfall view.
 */

import { v4 as uuidv4 } from "uuid";
import { Router, type Request, type Response } from "express";
import { dbRun, dbAll, dbGet } from "./lib/db";
import { broadcastToUser } from "./ws";

// ── Model pricing (per 1M tokens, USD) ───────────────────────────────────
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6":     { input: 15.0, output: 75.0 },
  "claude-sonnet-4-6":   { input: 3.0, output: 15.0 },
  "claude-haiku-4-5":    { input: 0.80, output: 4.0 },
  "gpt-5.4":             { input: 2.5, output: 10.0 },
  "gpt-5.4-mini":        { input: 0.30, output: 1.20 },
  "gpt-image-1":         { input: 5.0, output: 20.0 },
  "gemini-2.5-pro":      { input: 1.25, output: 5.0 },
  "gemini-2.5-flash":    { input: 0.15, output: 0.60 },
  "gemma-4":             { input: 0.10, output: 0.40 },
  "sonar-pro":           { input: 3.0, output: 15.0 },
  "sonar":               { input: 1.0, output: 1.0 },
  "mistral-large":       { input: 2.0, output: 6.0 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || { input: 1.0, output: 3.0 };
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

// ── Trace Recording API ──────────────────────────────────────────────────

export interface TraceInput {
  userId: number;
  source: "boss" | "editor" | "pipeline" | "bot" | "agent";
  sourceId?: string;
  sourceName?: string;
  department?: string;
  model?: string;
  provider?: string;
  inputPrompt?: string;
  parentTraceId?: string;
}

export interface TraceResult {
  outputPreview?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  status?: "success" | "error" | "timeout";
  error?: string;
  metadata?: Record<string, any>;
}

/** Start a trace — returns traceId and a finish() function */
export function startTrace(input: TraceInput): { traceId: string; finish: (result: TraceResult) => Promise<void> } {
  const traceId = uuidv4();
  const startTime = Date.now();

  const finish = async (result: TraceResult) => {
    const durationMs = Date.now() - startTime;
    const cost = estimateCost(
      input.model || "unknown",
      result.inputTokens || 0,
      result.outputTokens || 0,
    );

    try {
      await dbRun(`
        INSERT INTO agent_traces
          (id, user_id, source, source_id, source_name, department, model, provider,
           input_prompt, output_preview, input_tokens, output_tokens, total_tokens,
           cost_usd, duration_ms, status, error, metadata, parent_trace_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        traceId,
        input.userId,
        input.source,
        input.sourceId || null,
        input.sourceName || null,
        input.department || null,
        input.model || null,
        input.provider || null,
        (input.inputPrompt || "").slice(0, 1000),
        (result.outputPreview || "").slice(0, 500),
        result.inputTokens || 0,
        result.outputTokens || 0,
        result.totalTokens || 0,
        cost.toFixed(6),
        durationMs,
        result.status || "success",
        result.error || null,
        result.metadata ? JSON.stringify(result.metadata) : null,
        input.parentTraceId || null,
        startTime,
      );

      // Broadcast to user's devices
      broadcastToUser(input.userId, "traces", "new_trace", {
        traceId, source: input.source, department: input.department,
        model: input.model, totalTokens: result.totalTokens,
        costUsd: cost.toFixed(6), durationMs, status: result.status || "success",
      });
    } catch (err) {
      console.error("[Traces] Failed to save trace:", err);
    }
  };

  return { traceId, finish };
}

// ── API Routes ───────────────────────────────────────────────────────────

export function createTracesRouter() {
  const router = Router();

  // List traces with filters
  router.get("/", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const { source, department, status, limit = "100", offset = "0", from, to } = req.query;

    let sql = "SELECT * FROM agent_traces WHERE user_id = ?";
    const params: any[] = [userId];

    if (source) { sql += " AND source = ?"; params.push(source); }
    if (department) { sql += " AND department = ?"; params.push(department); }
    if (status) { sql += " AND status = ?"; params.push(status); }
    if (from) { sql += " AND created_at >= ?"; params.push(Number(from)); }
    if (to) { sql += " AND created_at <= ?"; params.push(Number(to)); }

    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), Number(offset));

    const traces = await dbAll(sql, ...params);
    res.json(traces);
  });

  // Get single trace with children
  router.get("/:id", async (req: Request, res: Response) => {
    const trace = await dbGet("SELECT * FROM agent_traces WHERE id = ?", req.params.id);
    if (!trace) return res.status(404).json({ error: "Trace not found" });

    // Get child traces (nested calls)
    const children = await dbAll(
      "SELECT * FROM agent_traces WHERE parent_trace_id = ? ORDER BY created_at ASC",
      req.params.id
    );

    res.json({ ...trace, children });
  });

  // Trace summary stats
  router.get("/stats/summary", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const since = Number(req.query.since || Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [totals, byDepartment, byModel, bySource, timeline] = await Promise.all([
      dbGet(`
        SELECT
          COUNT(*) as totalTraces,
          SUM(total_tokens) as totalTokens,
          CAST(SUM(CAST(cost_usd AS REAL)) AS TEXT) as totalCost,
          AVG(duration_ms) as avgDuration,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errorCount
        FROM agent_traces WHERE user_id = ? AND created_at >= ?
      `, userId, since),

      dbAll(`
        SELECT department, COUNT(*) as count, SUM(total_tokens) as tokens,
               CAST(SUM(CAST(cost_usd AS REAL)) AS TEXT) as cost,
               AVG(duration_ms) as avgDuration,
               SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
               ROUND(100.0 * SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) / COUNT(*), 1) as successRate
        FROM agent_traces WHERE user_id = ? AND created_at >= ? AND department IS NOT NULL
        GROUP BY department ORDER BY count DESC
      `, userId, since),

      dbAll(`
        SELECT model, COUNT(*) as count, SUM(total_tokens) as tokens,
               CAST(SUM(CAST(cost_usd AS REAL)) AS TEXT) as cost
        FROM agent_traces WHERE user_id = ? AND created_at >= ? AND model IS NOT NULL
        GROUP BY model ORDER BY tokens DESC
      `, userId, since),

      dbAll(`
        SELECT source, COUNT(*) as count, SUM(total_tokens) as tokens
        FROM agent_traces WHERE user_id = ? AND created_at >= ?
        GROUP BY source ORDER BY count DESC
      `, userId, since),

      // Hourly timeline for the last 24h
      dbAll(`
        SELECT
          (created_at / 3600000) * 3600000 as hour,
          COUNT(*) as count,
          SUM(total_tokens) as tokens,
          CAST(SUM(CAST(cost_usd AS REAL)) AS TEXT) as cost
        FROM agent_traces
        WHERE user_id = ? AND created_at >= ?
        GROUP BY hour ORDER BY hour ASC
      `, userId, Date.now() - 24 * 60 * 60 * 1000),
    ]);

    res.json({ totals, byDepartment, byModel, bySource, timeline });
  });

  return router;
}
