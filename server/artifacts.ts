/**
 * Artifact Gallery API — stores and serves generated artifacts.
 * Auto-captures artifacts from Boss/Editor chat and pipelines.
 */

import { v4 as uuidv4 } from "uuid";
import { Router, type Request, type Response } from "express";
import { dbRun, dbAll, dbGet } from "./lib/db";

/** Save an artifact from chat/pipeline output */
export async function saveArtifact(input: {
  userId: number;
  title: string;
  type: "html" | "svg" | "code" | "image" | "document";
  content: string;
  language?: string;
  sourceType?: string;
  sourceId?: string;
  tags?: string[];
}): Promise<string> {
  const id = uuidv4();
  await dbRun(`
    INSERT INTO artifacts (id, user_id, title, type, content, language, source_type, source_id, tags, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    id, input.userId, input.title, input.type, input.content,
    input.language || null, input.sourceType || null, input.sourceId || null,
    input.tags ? JSON.stringify(input.tags) : null, Date.now(),
  );
  return id;
}

/** Auto-extract artifacts from AI output content */
export async function extractArtifacts(
  userId: number,
  content: string,
  sourceType: string,
  sourceId?: string,
): Promise<string[]> {
  const ids: string[] = [];

  // Extract <artifact> tags
  const artifactRegex = /<artifact\s+(?:type="([^"]*)")?\s*(?:title="([^"]*)")?\s*(?:language="([^"]*)")?\s*>([\s\S]*?)<\/artifact>/g;
  let match;
  while ((match = artifactRegex.exec(content)) !== null) {
    const [, type = "html", title = "Untitled", language, body] = match;
    try {
      const id = await saveArtifact({
        userId,
        title,
        type: type as any,
        content: body.trim(),
        language,
        sourceType,
        sourceId,
      });
      ids.push(id);
    } catch {}
  }

  return ids;
}

export function createArtifactsRouter() {
  const router = Router();

  // List artifacts
  router.get("/", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const { type, favorite, limit = "50" } = req.query;

    let sql = "SELECT * FROM artifacts WHERE user_id = ?";
    const params: any[] = [userId];

    if (type) { sql += " AND type = ?"; params.push(type); }
    if (favorite === "1") { sql += " AND is_favorite = 1"; }

    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(Number(limit));

    res.json(await dbAll(sql, ...params));
  });

  // Get single artifact
  router.get("/:id", async (req: Request, res: Response) => {
    const artifact = await dbGet("SELECT * FROM artifacts WHERE id = ?", req.params.id);
    if (!artifact) return res.status(404).json({ error: "Not found" });
    await dbRun("UPDATE artifacts SET view_count = view_count + 1 WHERE id = ?", req.params.id);
    res.json(artifact);
  });

  // Toggle favorite
  router.post("/:id/favorite", async (req: Request, res: Response) => {
    const artifact = await dbGet("SELECT is_favorite FROM artifacts WHERE id = ?", req.params.id) as any;
    if (!artifact) return res.status(404).json({ error: "Not found" });
    await dbRun("UPDATE artifacts SET is_favorite = ? WHERE id = ?", artifact.is_favorite ? 0 : 1, req.params.id);
    res.json({ ok: true, isFavorite: !artifact.is_favorite });
  });

  // Delete artifact
  router.delete("/:id", async (req: Request, res: Response) => {
    await dbRun("DELETE FROM artifacts WHERE id = ?", req.params.id);
    res.json({ ok: true });
  });

  // Manually save an artifact
  router.post("/", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const { title, type, content, language, tags } = req.body;
    if (!title || !content) return res.status(400).json({ error: "title and content required" });

    const id = await saveArtifact({
      userId, title, type: type || "html", content,
      language, sourceType: "manual", tags,
    });

    res.json({ id });
  });

  return router;
}
