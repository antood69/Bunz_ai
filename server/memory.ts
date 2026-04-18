/**
 * Agent Memory System — 3-tier persistent memory for AI agents.
 *
 * Tier 1: Conversation Memory (already in boss_messages / conversations)
 * Tier 2: Episodic Memory — agents remember outcomes of past similar tasks
 * Tier 3: Shared Knowledge — agents contribute learnings to a knowledge base
 *
 * The memory system is used by the Boss AI and departments to:
 * - Recall how similar tasks were handled before
 * - Avoid repeating mistakes
 * - Build up domain expertise over time
 */

import { v4 as uuidv4 } from "uuid";
import { Router, type Request, type Response } from "express";
import { dbRun, dbAll, dbGet } from "./lib/db";
import { modelRouter } from "./ai";

// ── Memory Recording ─────────────────────────────────────────────────────

export interface MemoryInput {
  userId: number;
  tier: "episodic" | "knowledge" | "preference";
  department?: string;
  category?: string;
  content: string;
  source?: string;
  sourceId?: string;
  metadata?: Record<string, any>;
}

/** Store a new memory entry */
export async function recordMemory(input: MemoryInput): Promise<string> {
  const id = uuidv4();
  const now = Date.now();

  await dbRun(`
    INSERT INTO agent_memory
      (id, user_id, tier, department, category, content, source, source_id, relevance, access_count, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `,
    id,
    input.userId,
    input.tier,
    input.department || null,
    input.category || null,
    input.content,
    input.source || null,
    input.sourceId || null,
    input.tier === "knowledge" ? 70 : 50,
    input.metadata ? JSON.stringify(input.metadata) : null,
    now,
    now,
  );

  return id;
}

/** Auto-extract memories from a completed task */
export async function extractMemories(
  userId: number,
  department: string,
  task: string,
  output: string,
  source: string,
  sourceId?: string,
): Promise<void> {
  try {
    const result = await modelRouter.chat({
      model: "gpt-5.4-mini",
      messages: [{
        role: "user",
        content: `Analyze this completed AI task and extract useful memories. Return a JSON array of memories to store.

TASK: ${task.slice(0, 500)}
DEPARTMENT: ${department}
OUTPUT (truncated): ${output.slice(0, 800)}

Extract 0-3 memories. Each should be something useful for handling similar tasks in the future.
Return ONLY a JSON array:
[
  {
    "tier": "episodic" or "knowledge",
    "category": "category name",
    "content": "the memory to store (1-2 sentences)",
    "relevance": 50-90
  }
]

If nothing worth remembering, return an empty array [].`,
      }],
      systemPrompt: "Extract useful memories from completed tasks. Be concise and practical. Only extract genuinely useful patterns or knowledge.",
    });

    const jsonMatch = result.content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const memories = JSON.parse(jsonMatch[0]);
    for (const mem of memories) {
      if (!mem.content || mem.content.length < 10) continue;
      await recordMemory({
        userId,
        tier: mem.tier || "episodic",
        department,
        category: mem.category,
        content: mem.content,
        source,
        sourceId,
        metadata: { autoExtracted: true, relevance: mem.relevance },
      });
    }
  } catch (err) {
    console.error("[Memory] Failed to extract memories:", err);
  }
}

/** Recall relevant memories for a task */
export async function recallMemories(
  userId: number,
  task: string,
  department?: string,
  limit = 5,
): Promise<Array<{ id: string; content: string; tier: string; category: string; relevance: number }>> {
  // Simple keyword-based recall (future: vector similarity search)
  const keywords = task
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 10);

  if (keywords.length === 0) return [];

  // Build a query that scores by keyword matches
  const conditions = keywords.map(() => "content LIKE ?").join(" OR ");
  const params = keywords.map(k => `%${k}%`);

  let sql = `
    SELECT id, content, tier, category, relevance, access_count
    FROM agent_memory
    WHERE user_id = ? AND (${conditions})
  `;
  const allParams: any[] = [userId, ...params];

  if (department) {
    sql += " AND (department = ? OR department IS NULL)";
    allParams.push(department);
  }

  sql += " ORDER BY relevance DESC, access_count DESC LIMIT ?";
  allParams.push(limit);

  const memories = await dbAll(sql, ...allParams) as any[];

  // Batch update access counts in a single query
  if (memories.length > 0) {
    const ids = memories.map((m: any) => m.id);
    const placeholders = ids.map(() => "?").join(",");
    await dbRun(
      `UPDATE agent_memory SET access_count = access_count + 1, last_accessed_at = ? WHERE id IN (${placeholders})`,
      Date.now(), ...ids,
    );
  }

  return memories.map(m => ({
    id: m.id,
    content: m.content,
    tier: m.tier,
    category: m.category || "general",
    relevance: m.relevance,
  }));
}

/** Format recalled memories for injection into AI prompts */
export async function getMemoryContext(
  userId: number,
  task: string,
  department?: string,
): Promise<string> {
  const memories = await recallMemories(userId, task, department);
  if (memories.length === 0) return "";

  return `\n\n--- AGENT MEMORY (relevant past experiences) ---\n${
    memories.map((m, i) => `${i + 1}. [${m.tier}/${m.category}] ${m.content}`).join("\n")
  }\n--- END MEMORY ---\n`;
}

// ── Memory Palace: Proactive Connection Finder ───────────────────────────

/** Scan recent memories and find non-obvious connections to older ones */
export async function findMemoryConnections(userId: number): Promise<Array<{ insight: string; memories: string[] }>> {
  // Get recent memories (last 7 days)
  const recent = await dbAll(
    "SELECT id, content, category, created_at FROM agent_memory WHERE user_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 10",
    userId, Date.now() - 7 * 24 * 60 * 60 * 1000,
  ) as any[];

  if (recent.length < 2) return [];

  // Get older memories (7-90 days ago)
  const older = await dbAll(
    "SELECT id, content, category, created_at FROM agent_memory WHERE user_id = ? AND created_at < ? AND created_at > ? ORDER BY relevance DESC LIMIT 20",
    userId, Date.now() - 7 * 24 * 60 * 60 * 1000, Date.now() - 90 * 24 * 60 * 60 * 1000,
  ) as any[];

  if (older.length === 0) return [];

  try {
    const result = await modelRouter.chat({
      model: "gpt-5.4-mini",
      messages: [{
        role: "user",
        content: `Find non-obvious connections between these recent and older memories.

RECENT (last 7 days):
${recent.map((m: any) => `- [${m.category || "general"}] ${m.content}`).join("\n")}

OLDER (7-90 days ago):
${older.map((m: any) => `- [${m.category || "general"}] ${m.content}`).join("\n")}

Find 1-3 surprising connections, patterns, or insights. Return as JSON:
[{"insight": "This recent work on X connects to the earlier idea about Y because...", "recentId": "...", "olderId": "..."}]
Only include genuinely useful connections. Return [] if nothing interesting.`,
      }],
      systemPrompt: "You find non-obvious connections between ideas across time. Be specific and actionable.",
    });

    const match = result.content.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch {
    return [];
  }
}

// ── Memory Decay (reduce relevance of old unused memories) ───────────────

export async function decayMemories(): Promise<void> {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  // Reduce relevance by 5 for memories not accessed in 30 days
  await dbRun(
    "UPDATE agent_memory SET relevance = MAX(relevance - 5, 0), updated_at = ? WHERE last_accessed_at < ? OR (last_accessed_at IS NULL AND created_at < ?)",
    Date.now(), thirtyDaysAgo, thirtyDaysAgo,
  );

  // Delete memories with 0 relevance
  await dbRun("DELETE FROM agent_memory WHERE relevance <= 0");
}

// ── API Routes ───────────────────────────────────────────────────────────

export function createMemoryRouter() {
  const router = Router();

  // List memories
  router.get("/", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const { tier, department, category, limit = "50" } = req.query;

    let sql = "SELECT * FROM agent_memory WHERE user_id = ?";
    const params: any[] = [userId];

    if (tier) { sql += " AND tier = ?"; params.push(tier); }
    if (department) { sql += " AND department = ?"; params.push(department); }
    if (category) { sql += " AND category = ?"; params.push(category); }

    sql += " ORDER BY updated_at DESC LIMIT ?";
    params.push(Number(limit));

    res.json(await dbAll(sql, ...params));
  });

  // Recall memories for a task
  router.post("/recall", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const { task, department, limit } = req.body;
    if (!task) return res.status(400).json({ error: "task required" });

    const memories = await recallMemories(userId, task, department, limit);
    res.json(memories);
  });

  // Manually add a memory
  router.post("/", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const { tier, department, category, content, metadata } = req.body;
    if (!content) return res.status(400).json({ error: "content required" });

    const id = await recordMemory({
      userId,
      tier: tier || "knowledge",
      department,
      category,
      content,
      source: "manual",
      metadata,
    });

    res.json({ id });
  });

  // Delete a memory
  router.delete("/:id", async (req: Request, res: Response) => {
    await dbRun("DELETE FROM agent_memory WHERE id = ?", req.params.id);
    res.json({ ok: true });
  });

  // Memory stats
  router.get("/stats", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;

    const stats = await dbAll(`
      SELECT tier, department, COUNT(*) as count, AVG(relevance) as avgRelevance, SUM(access_count) as totalAccesses
      FROM agent_memory WHERE user_id = ?
      GROUP BY tier, department
    `, userId);

    const total = await dbGet("SELECT COUNT(*) as count FROM agent_memory WHERE user_id = ?", userId) as any;

    res.json({ total: total?.count || 0, breakdown: stats });
  });

  // ── Project Context — pinned context per conversation ──────────────────
  // Stored as conversation-scoped memories that auto-inject into every message

  router.post("/project-context", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const { conversationId, content, label } = req.body;
    if (!conversationId || !content) return res.status(400).json({ error: "conversationId and content required" });

    const id = uuidv4();
    await dbRun(
      `INSERT INTO agent_memory (id, user_id, tier, category, department, content, source, source_id, relevance, access_count, created_at, updated_at)
       VALUES (?, ?, 'knowledge', 'project_context', NULL, ?, 'project', ?, 10, 0, ?, ?)`,
      id, userId, `[PROJECT:${label || "context"}] ${content}`, conversationId, Date.now(), Date.now()
    );
    res.json({ id });
  });

  router.get("/project-context/:conversationId", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const rows = await dbAll(
      "SELECT id, content, created_at FROM agent_memory WHERE user_id = ? AND category = 'project_context' AND source_id = ? ORDER BY created_at DESC",
      userId, req.params.conversationId
    );
    res.json(rows);
  });

  router.delete("/project-context/:id", async (req: Request, res: Response) => {
    await dbRun("DELETE FROM agent_memory WHERE id = ? AND category = 'project_context'", req.params.id);
    res.json({ ok: true });
  });

  return router;
}
