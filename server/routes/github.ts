/**
 * GitHub API Routes
 * Exposes repo operations to the frontend for the Coder agent
 * and for users to browse/select repos.
 */

import { Router, Request, Response } from "express";
import { storage } from "../storage";
import * as gh from "../lib/github";

const router = Router();

// Middleware: require authenticated user with GitHub token
async function requireGitHub(req: Request, res: Response, next: Function) {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  // Check users.github_token first (set via OAuth login)
  let token = await storage.getGitHubToken(userId);

  // Fallback: check connectors table for GitHub API key connector
  if (!token) {
    try {
      const connectors = await storage.getConnectorsByUser(userId);
      const ghConnector = connectors.find((c: any) => c.provider === "github" && c.status === "connected");
      if (ghConnector) {
        const { decryptCredentials } = await import("../lib/connectorCrypto.js");
        const config = decryptCredentials(ghConnector.config);
        token = config.apiKey || null;
      }
    } catch {}
  }

  if (!token) {
    return res.status(403).json({
      error: "GitHub not connected",
      action: "connect_github",
      message: "Connect your GitHub account via Settings → Connectors → GitHub.",
    });
  }

  (req as any).githubToken = token;
  next();
}

// ── List user's repos ───────────────────────────────────────────────────────
router.get("/repos", requireGitHub, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const repos = await gh.listRepos((req as any).githubToken, page);
    res.json(repos);
  } catch (err: any) {
    console.error("[GitHub] listRepos error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Get repo file tree ──────────────────────────────────────────────────────
router.get("/repos/:owner/:repo/tree", requireGitHub, async (req: Request, res: Response) => {
  try {
    const fullName = `${req.params.owner}/${req.params.repo}`;
    const branch = req.query.branch as string | undefined;
    const tree = await gh.getRepoTree((req as any).githubToken, fullName, branch);
    res.json(tree);
  } catch (err: any) {
    console.error("[GitHub] getRepoTree error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── List files at a path ────────────────────────────────────────────────────
router.get("/repos/:owner/:repo/contents/*path", requireGitHub, async (req: Request, res: Response) => {
  try {
    const fullName = `${req.params.owner}/${req.params.repo}`;
    const path = req.params.path || "";
    const ref = req.query.ref as string | undefined;
    const files = await gh.listFiles((req as any).githubToken, fullName, path, ref);
    res.json(files);
  } catch (err: any) {
    console.error("[GitHub] listFiles error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Read a single file ──────────────────────────────────────────────────────
router.get("/repos/:owner/:repo/file/*path", requireGitHub, async (req: Request, res: Response) => {
  try {
    const fullName = `${req.params.owner}/${req.params.repo}`;
    const path = req.params.path || "";
    const ref = req.query.ref as string | undefined;
    const file = await gh.readFile((req as any).githubToken, fullName, path, ref);
    res.json(file);
  } catch (err: any) {
    console.error("[GitHub] readFile error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Write / create a file ───────────────────────────────────────────────────
router.put("/repos/:owner/:repo/file/*path", requireGitHub, async (req: Request, res: Response) => {
  try {
    const fullName = `${req.params.owner}/${req.params.repo}`;
    const path = req.params.path || "";
    const { content, message, branch, sha } = req.body;
    if (!content || !message) {
      return res.status(400).json({ error: "content and message are required" });
    }
    const result = await gh.writeFile((req as any).githubToken, fullName, path, content, message, branch, sha);
    res.json(result);
  } catch (err: any) {
    console.error("[GitHub] writeFile error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Multi-file commit ───────────────────────────────────────────────────────
router.post("/repos/:owner/:repo/commit", requireGitHub, async (req: Request, res: Response) => {
  try {
    const fullName = `${req.params.owner}/${req.params.repo}`;
    const { branch, message, files } = req.body;
    if (!branch || !message || !files?.length) {
      return res.status(400).json({ error: "branch, message, and files[] are required" });
    }
    const result = await gh.commitMultipleFiles((req as any).githubToken, fullName, branch, message, files);
    res.json(result);
  } catch (err: any) {
    console.error("[GitHub] commitMultipleFiles error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── List branches ───────────────────────────────────────────────────────────
router.get("/repos/:owner/:repo/branches", requireGitHub, async (req: Request, res: Response) => {
  try {
    const fullName = `${req.params.owner}/${req.params.repo}`;
    const branches = await gh.listBranches((req as any).githubToken, fullName);
    res.json(branches);
  } catch (err: any) {
    console.error("[GitHub] listBranches error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Create branch ───────────────────────────────────────────────────────────
router.post("/repos/:owner/:repo/branches", requireGitHub, async (req: Request, res: Response) => {
  try {
    const fullName = `${req.params.owner}/${req.params.repo}`;
    const { name, fromSha } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const branch = await gh.createBranch((req as any).githubToken, fullName, name, fromSha);
    res.json(branch);
  } catch (err: any) {
    console.error("[GitHub] createBranch error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Create PR ───────────────────────────────────────────────────────────────
router.post("/repos/:owner/:repo/pulls", requireGitHub, async (req: Request, res: Response) => {
  try {
    const fullName = `${req.params.owner}/${req.params.repo}`;
    const { title, head, base, body } = req.body;
    if (!title || !head || !base) {
      return res.status(400).json({ error: "title, head, and base are required" });
    }
    const pr = await gh.createPullRequest((req as any).githubToken, fullName, title, head, base, body);
    res.json(pr);
  } catch (err: any) {
    console.error("[GitHub] createPR error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── List PRs ────────────────────────────────────────────────────────────────
router.get("/repos/:owner/:repo/pulls", requireGitHub, async (req: Request, res: Response) => {
  try {
    const fullName = `${req.params.owner}/${req.params.repo}`;
    const state = (req.query.state as any) || "open";
    const prs = await gh.listPullRequests((req as any).githubToken, fullName, state);
    res.json(prs);
  } catch (err: any) {
    console.error("[GitHub] listPRs error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Search code ─────────────────────────────────────────────────────────────
router.get("/repos/:owner/:repo/search", requireGitHub, async (req: Request, res: Response) => {
  try {
    const fullName = `${req.params.owner}/${req.params.repo}`;
    const q = req.query.q as string;
    if (!q) return res.status(400).json({ error: "q parameter is required" });
    const results = await gh.searchCode((req as any).githubToken, fullName, q);
    res.json(results);
  } catch (err: any) {
    console.error("[GitHub] searchCode error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Check GitHub connection status ──────────────────────────────────────────
router.get("/status", async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const token = await storage.getGitHubToken(userId);
  const username = await storage.getGitHubUsername(userId);

  if (!token) {
    return res.json({ connected: false });
  }

  // Verify token is still valid
  try {
    const ghUser = await gh.getGitHubUser(token);
    res.json({ connected: true, username: ghUser.login, avatarUrl: ghUser.avatar_url });
  } catch {
    res.json({ connected: false, expired: true, username });
  }
});

export default router;
