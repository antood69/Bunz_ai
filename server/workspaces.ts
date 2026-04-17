/**
 * Workspaces + RBAC — team isolation with role-based access.
 *
 * Roles:
 * - admin: full control (settings, members, billing)
 * - builder: create/edit workflows, bots, pipelines
 * - viewer: read-only access to outputs and traces
 */

import { v4 as uuidv4 } from "uuid";
import { Router, type Request, type Response } from "express";
import { dbRun, dbAll, dbGet } from "./lib/db";

export function createWorkspacesRouter() {
  const router = Router();

  // List user's workspaces
  router.get("/", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const workspaces = await dbAll(`
      SELECT w.*, wm.role as userRole
      FROM workspaces w
      JOIN workspace_members wm ON w.id = wm.workspace_id
      WHERE wm.user_id = ?
      ORDER BY w.name
    `, userId);
    res.json(workspaces);
  });

  // Create workspace
  router.post("/", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });

    const id = uuidv4();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
    const now = Date.now();

    // Check slug uniqueness
    const existing = await dbGet("SELECT id FROM workspaces WHERE slug = ?", slug);
    if (existing) return res.status(409).json({ error: "Workspace name already taken" });

    await dbRun(
      "INSERT INTO workspaces (id, name, slug, description, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      id, name, slug, description || null, userId, now, now,
    );

    // Auto-add creator as admin
    await dbRun(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, 'admin', ?)",
      uuidv4(), id, userId, now,
    );

    res.json({ id, slug });
  });

  // Get workspace details
  router.get("/:id", async (req: Request, res: Response) => {
    const workspace = await dbGet("SELECT * FROM workspaces WHERE id = ?", req.params.id);
    if (!workspace) return res.status(404).json({ error: "Not found" });

    const members = await dbAll(`
      SELECT wm.*, u.email, u.display_name, u.avatar_url
      FROM workspace_members wm
      LEFT JOIN users u ON wm.user_id = u.id
      WHERE wm.workspace_id = ?
    `, req.params.id);

    res.json({ ...(workspace as any), members });
  });

  // Update workspace
  router.put("/:id", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;

    // Check admin role
    const member = await dbGet(
      "SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
      req.params.id, userId,
    ) as any;
    if (!member || member.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const { name, description, settings } = req.body;
    const updates: string[] = [];
    const params: any[] = [];

    if (name) { updates.push("name = ?"); params.push(name); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (settings) { updates.push("settings = ?"); params.push(JSON.stringify(settings)); }

    updates.push("updated_at = ?"); params.push(Date.now());
    params.push(req.params.id);

    await dbRun(`UPDATE workspaces SET ${updates.join(", ")} WHERE id = ?`, ...params);
    res.json({ ok: true });
  });

  // Invite member
  router.post("/:id/members", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const { email, role = "viewer" } = req.body;

    // Check admin role
    const member = await dbGet(
      "SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
      req.params.id, userId,
    ) as any;
    if (!member || member.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    // Find user by email
    const invitee = await dbGet("SELECT id FROM users WHERE email = ?", email) as any;
    if (!invitee) return res.status(404).json({ error: "User not found" });

    // Check if already member
    const existing = await dbGet(
      "SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
      req.params.id, invitee.id,
    );
    if (existing) return res.status(409).json({ error: "Already a member" });

    await dbRun(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)",
      uuidv4(), req.params.id, invitee.id, role, Date.now(),
    );

    res.json({ ok: true });
  });

  // Update member role
  router.put("/:id/members/:memberId", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const { role } = req.body;

    const member = await dbGet(
      "SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
      req.params.id, userId,
    ) as any;
    if (!member || member.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    await dbRun(
      "UPDATE workspace_members SET role = ? WHERE id = ?",
      role, req.params.memberId,
    );

    res.json({ ok: true });
  });

  // Remove member
  router.delete("/:id/members/:memberId", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;

    const member = await dbGet(
      "SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
      req.params.id, userId,
    ) as any;
    if (!member || member.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    await dbRun("DELETE FROM workspace_members WHERE id = ?", req.params.memberId);
    res.json({ ok: true });
  });

  // Delete workspace
  router.delete("/:id", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;

    const workspace = await dbGet("SELECT owner_id FROM workspaces WHERE id = ?", req.params.id) as any;
    if (!workspace || workspace.owner_id !== userId) return res.status(403).json({ error: "Owner only" });

    await dbRun("DELETE FROM workspace_members WHERE workspace_id = ?", req.params.id);
    await dbRun("DELETE FROM workspaces WHERE id = ?", req.params.id);
    res.json({ ok: true });
  });

  return router;
}
