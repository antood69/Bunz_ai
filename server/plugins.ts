/**
 * Plugin System — MCP-inspired skills, connectors, and plugins directory.
 * Each plugin registers tools that the AI (Boss, bots, workflows) can use.
 */
import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { storage } from "./storage";

// ── Built-in Plugin Directory ───────────────────────────────────────
export const BUILTIN_PLUGINS = [
  // Skills
  {
    slug: "web-search", name: "Web Search", category: "skill",
    description: "Search the web and return summarized results for any query",
    author: "Cortal", icon: "Search",
    tools: [{ name: "search_web", description: "Search the web for information", params: { query: "string" } }],
  },
  {
    slug: "doc-writer", name: "Document Writer", category: "skill",
    description: "Generate professional documents — reports, proposals, briefs, and more",
    author: "Cortal", icon: "FileText",
    tools: [{ name: "write_document", description: "Write a structured document", params: { type: "string", topic: "string", length: "string" } }],
  },
  {
    slug: "code-generator", name: "Code Generator", category: "skill",
    description: "Generate code in any language with best practices and documentation",
    author: "Cortal", icon: "Code",
    tools: [{ name: "generate_code", description: "Generate code from description", params: { language: "string", description: "string" } }],
  },
  {
    slug: "data-analyzer", name: "Data Analyzer", category: "skill",
    description: "Analyze data, create summaries, find patterns, and generate insights",
    author: "Cortal", icon: "BarChart3",
    tools: [{ name: "analyze_data", description: "Analyze input data and provide insights", params: { data: "string", question: "string" } }],
  },
  {
    slug: "email-drafter", name: "Email Drafter", category: "skill",
    description: "Draft professional emails with proper tone, structure, and call-to-action",
    author: "Cortal", icon: "Mail",
    tools: [{ name: "draft_email", description: "Draft a professional email", params: { to: "string", subject: "string", context: "string", tone: "string" } }],
  },
  {
    slug: "seo-optimizer", name: "SEO Optimizer", category: "skill",
    description: "Optimize content for search engines — keywords, meta tags, structure",
    author: "Cortal", icon: "TrendingUp",
    tools: [{ name: "optimize_seo", description: "Analyze and optimize content for SEO", params: { content: "string", targetKeyword: "string" } }],
  },
  {
    slug: "social-media", name: "Social Media Creator", category: "skill",
    description: "Create platform-optimized posts for Twitter, LinkedIn, Instagram",
    author: "Cortal", icon: "Share2",
    tools: [{ name: "create_social_post", description: "Create social media post", params: { platform: "string", topic: "string", tone: "string" } }],
  },
  {
    slug: "translator", name: "Translator", category: "skill",
    description: "Translate text between languages while preserving tone and context",
    author: "Cortal", icon: "Globe",
    tools: [{ name: "translate_text", description: "Translate text to target language", params: { text: "string", targetLanguage: "string" } }],
  },
  // Connectors (point to existing connector system)
  {
    slug: "gmail-plugin", name: "Gmail", category: "connector",
    description: "Read, search, and send emails through Gmail",
    author: "Google", icon: "Mail",
    tools: [
      { name: "list_emails", description: "List recent emails", params: { query: "string", maxResults: "number" } },
      { name: "read_email", description: "Read email content", params: { messageId: "string" } },
      { name: "send_email", description: "Send an email", params: { to: "string", subject: "string", body: "string" } },
    ],
  },
  {
    slug: "github-plugin", name: "GitHub", category: "connector",
    description: "Manage repos, issues, and pull requests",
    author: "GitHub", icon: "GitBranch",
    tools: [
      { name: "list_repos", description: "List repositories", params: {} },
      { name: "create_issue", description: "Create an issue", params: { owner: "string", repo: "string", title: "string", body: "string" } },
    ],
  },
  {
    slug: "slack-plugin", name: "Slack", category: "connector",
    description: "Send messages, read channels, and manage Slack workspace",
    author: "Slack", icon: "MessageSquare",
    tools: [
      { name: "send_message", description: "Send a Slack message", params: { channel: "string", text: "string" } },
      { name: "list_channels", description: "List channels", params: {} },
    ],
  },
  {
    slug: "figma-plugin", name: "Figma", category: "connector",
    description: "Access Figma files, components, and design data",
    author: "Figma", icon: "Palette",
    tools: [
      { name: "get_file", description: "Get Figma file data", params: { fileKey: "string" } },
      { name: "get_comments", description: "Get file comments", params: { fileKey: "string" } },
    ],
  },
  {
    slug: "supabase-plugin", name: "Supabase", category: "connector",
    description: "Query databases, insert rows, and manage Supabase projects",
    author: "Supabase", icon: "Database",
    tools: [
      { name: "query", description: "Run a SQL query", params: { sql: "string" } },
      { name: "insert_row", description: "Insert a row", params: { table: "string", data: "object" } },
    ],
  },
  {
    slug: "vercel-plugin", name: "Vercel", category: "connector",
    description: "Manage deployments, projects, and domains on Vercel",
    author: "Vercel", icon: "Cloud",
    tools: [
      { name: "list_projects", description: "List projects", params: {} },
      { name: "list_deployments", description: "List deployments", params: { projectId: "string" } },
    ],
  },
];

export function createPluginsRouter(): Router {
  const router = Router();

  // ── Directory: browse available plugins ────────────────────────────
  router.get("/directory", (_req: Request, res: Response) => {
    res.json(BUILTIN_PLUGINS.map(p => ({
      ...p,
      tools: p.tools,
      toolCount: p.tools.length,
    })));
  });

  // ── My installed plugins ──────────────────────────────────────────
  router.get("/installed", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    res.json(await storage.getPluginsByUser(userId));
  });

  // ── Install a plugin ──────────────────────────────────────────────
  router.post("/install", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { slug } = req.body;

    // Check if already installed
    const existing = await storage.getPluginBySlug(userId, slug);
    if (existing) return res.json({ ok: true, plugin: existing, message: "Already installed" });

    // Find in directory
    const builtin = BUILTIN_PLUGINS.find(p => p.slug === slug);
    if (!builtin) return res.status(404).json({ error: "Plugin not found" });

    const plugin = await storage.createPlugin({
      id: uuidv4(),
      userId,
      name: builtin.name,
      slug: builtin.slug,
      description: builtin.description,
      category: builtin.category,
      author: builtin.author,
      icon: builtin.icon,
      tools: JSON.stringify(builtin.tools),
      source: "builtin",
    });

    res.json({ ok: true, plugin });
  });

  // ── Uninstall a plugin ────────────────────────────────────────────
  router.delete("/:id", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const plugin = await storage.getPlugin(req.params.id as string);
    if (!plugin) return res.status(404).json({ error: "Not found" });
    if (plugin.user_id !== userId) return res.status(403).json({ error: "Not yours" });
    await storage.deletePlugin(req.params.id as string);
    res.json({ ok: true });
  });

  // ── Toggle plugin active/inactive ─────────────────────────────────
  router.post("/:id/toggle", async (req: Request, res: Response) => {
    const plugin = await storage.getPlugin(req.params.id as string);
    if (!plugin) return res.status(404).json({ error: "Not found" });
    await storage.updatePlugin(req.params.id as string, { isActive: plugin.is_active ? 0 : 1 });
    res.json({ ok: true });
  });

  // ── Get tools from all active plugins (for AI system prompt) ──────
  router.get("/tools", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const plugins = await storage.getPluginsByUser(userId);
    const activePlugins = plugins.filter((p: any) => p.is_active);
    const allTools = activePlugins.flatMap((p: any) => {
      const tools = typeof p.tools === "string" ? JSON.parse(p.tools) : (p.tools || []);
      return tools.map((t: any) => ({ ...t, plugin: p.name, pluginSlug: p.slug }));
    });
    res.json(allTools);
  });

  return router;
}
