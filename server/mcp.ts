/**
 * MCP (Model Context Protocol) Integration.
 *
 * Cortal acts as BOTH:
 * 1. MCP Server — exposes Cortal departments/tools so external AI clients
 *    (Claude, GPT, etc.) can call them
 * 2. MCP Client — connects to external MCP servers so Cortal agents can
 *    use any MCP-compatible tool
 *
 * Server endpoints follow the MCP spec: tool discovery + tool execution.
 * Client config stored per-user (URL + auth for remote MCP servers).
 */

import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { dbRun, dbAll, dbGet } from "./lib/db";
import { executeDepartment } from "./departments/executor";
import { estimateComplexity } from "./departments/types";
import { recallMemories } from "./memory";

// ── MCP Server: Expose Cortal tools ───────────────────────────────────────

const CORTAL_TOOLS = [
  {
    name: "cortal_research",
    description: "Deep research and analysis on any topic. Returns comprehensive findings with sources.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "The research question or topic to investigate" },
        depth: { type: "string", enum: ["quick", "medium", "deep"], description: "How thorough the research should be" },
      },
      required: ["task"],
    },
  },
  {
    name: "cortal_write",
    description: "Professional content writing — articles, emails, copy, documentation, scripts.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "What to write (include style, tone, length requirements)" },
        format: { type: "string", description: "Output format: article, email, copy, doc, script" },
      },
      required: ["task"],
    },
  },
  {
    name: "cortal_code",
    description: "Code generation, review, debugging, and refactoring across all languages.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "Code task description" },
        language: { type: "string", description: "Programming language" },
      },
      required: ["task"],
    },
  },
  {
    name: "cortal_art",
    description: "AI image generation — create illustrations, logos, photos, designs.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Description of the image to generate" },
        style: { type: "string", description: "Art style: realistic, cartoon, abstract, etc." },
      },
      required: ["prompt"],
    },
  },
  {
    name: "cortal_memory_recall",
    description: "Search the agent's memory for relevant past experiences and knowledge.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for in memory" },
      },
      required: ["query"],
    },
  },
];

// ── MCP Client: Connect to external MCP servers ─────────────────────────

interface McpServerConfig {
  id: string;
  userId: number;
  name: string;
  url: string;
  authType: string; // "none" | "bearer" | "api_key"
  authToken?: string;
  isActive: boolean;
  tools?: any[]; // Cached tool list
  lastSyncAt?: number;
}

/** Fetch tool list from a remote MCP server */
async function fetchMcpTools(config: McpServerConfig): Promise<any[]> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.authType === "bearer" && config.authToken) {
      headers["Authorization"] = `Bearer ${config.authToken}`;
    } else if (config.authType === "api_key" && config.authToken) {
      headers["X-API-Key"] = config.authToken;
    }

    const res = await fetch(`${config.url}/tools/list`, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
    });

    if (!res.ok) throw new Error(`MCP server returned ${res.status}`);
    const data = await res.json();
    return data.result?.tools || data.tools || [];
  } catch (err: any) {
    console.error(`[MCP Client] Failed to fetch tools from ${config.name}:`, err.message);
    return [];
  }
}

/** Call a tool on a remote MCP server */
async function callMcpTool(config: McpServerConfig, toolName: string, args: any): Promise<any> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.authType === "bearer" && config.authToken) {
    headers["Authorization"] = `Bearer ${config.authToken}`;
  } else if (config.authType === "api_key" && config.authToken) {
    headers["X-API-Key"] = config.authToken;
  }

  const res = await fetch(`${config.url}/tools/call`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: toolName, arguments: args },
      id: uuidv4(),
    }),
  });

  if (!res.ok) throw new Error(`MCP tool call failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "MCP tool error");
  return data.result;
}

// ── API Routes ───────────────────────────────────────────────────────────

export function createMcpRouter() {
  const router = Router();

  // ── MCP Server endpoints (for external AI clients) ─────────────────

  // Tool discovery
  router.post("/server/tools/list", (_req: Request, res: Response) => {
    res.json({
      jsonrpc: "2.0",
      result: { tools: CORTAL_TOOLS },
      id: 1,
    });
  });

  // Also support GET for discovery
  router.get("/server/tools", (_req: Request, res: Response) => {
    res.json({ tools: CORTAL_TOOLS });
  });

  // Tool execution
  router.post("/server/tools/call", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const { params } = req.body;
    const toolName = params?.name;
    const args = params?.arguments || {};

    if (!toolName) return res.status(400).json({ error: "Tool name required" });

    try {
      let result: any;

      const deptMap: Record<string, string> = {
        cortal_research: "research",
        cortal_write: "writer",
        cortal_code: "coder",
        cortal_art: "artist",
      };

      if (deptMap[toolName]) {
        const dept = deptMap[toolName];
        const task = args.task || args.prompt || "";
        const deptResult = await executeDepartment(
          uuidv4(),
          { department: dept as any, task },
          "medium",
          estimateComplexity(task),
        );
        result = {
          content: [{ type: "text", text: deptResult.finalOutput }],
          isError: false,
        };
        if (deptResult.imageUrl) {
          result.content.push({ type: "image", data: deptResult.imageUrl, mimeType: "image/png" });
        }
      } else if (toolName === "cortal_memory_recall") {
        const memories = await recallMemories(userId, args.query);
        result = {
          content: [{ type: "text", text: JSON.stringify(memories, null, 2) }],
          isError: false,
        };
      } else {
        return res.status(404).json({ error: `Unknown tool: ${toolName}` });
      }

      res.json({ jsonrpc: "2.0", result, id: req.body.id || 1 });
    } catch (err: any) {
      res.json({
        jsonrpc: "2.0",
        result: { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true },
        id: req.body.id || 1,
      });
    }
  });

  // ── MCP Client endpoints (manage external MCP servers) ─────────────

  // List configured MCP servers
  router.get("/client/servers", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const servers = await dbAll("SELECT * FROM mcp_servers WHERE user_id = ? ORDER BY name", userId);
    // Don't expose auth tokens
    res.json(servers.map((s: any) => ({ ...s, auth_token: s.auth_token ? "***" : null })));
  });

  // Add a new MCP server
  router.post("/client/servers", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const { name, url, authType = "none", authToken } = req.body;
    if (!name || !url) return res.status(400).json({ error: "name and url required" });

    const id = uuidv4();
    await dbRun(
      "INSERT INTO mcp_servers (id, user_id, name, url, auth_type, auth_token, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
      id, userId, name, url, authType, authToken || null, Date.now(),
    );

    // Try to fetch tools immediately
    const tools = await fetchMcpTools({ id, userId, name, url, authType, authToken, isActive: true });
    if (tools.length > 0) {
      await dbRun("UPDATE mcp_servers SET tools = ?, last_sync_at = ? WHERE id = ?",
        JSON.stringify(tools), Date.now(), id);
    }

    res.json({ id, toolCount: tools.length });
  });

  // Sync tools from a server
  router.post("/client/servers/:id/sync", async (req: Request, res: Response) => {
    const server = await dbGet("SELECT * FROM mcp_servers WHERE id = ?", req.params.id) as any;
    if (!server) return res.status(404).json({ error: "Server not found" });

    const tools = await fetchMcpTools({
      id: server.id, userId: server.user_id, name: server.name,
      url: server.url, authType: server.auth_type, authToken: server.auth_token, isActive: true,
    });

    await dbRun("UPDATE mcp_servers SET tools = ?, last_sync_at = ? WHERE id = ?",
      JSON.stringify(tools), Date.now(), server.id);

    res.json({ tools, count: tools.length });
  });

  // Delete a server
  router.delete("/client/servers/:id", async (req: Request, res: Response) => {
    await dbRun("DELETE FROM mcp_servers WHERE id = ?", req.params.id);
    res.json({ ok: true });
  });

  // Call a tool on an external MCP server
  router.post("/client/call", async (req: Request, res: Response) => {
    const { serverId, toolName, arguments: args } = req.body;
    if (!serverId || !toolName) return res.status(400).json({ error: "serverId and toolName required" });

    const server = await dbGet("SELECT * FROM mcp_servers WHERE id = ?", serverId) as any;
    if (!server) return res.status(404).json({ error: "Server not found" });

    try {
      const result = await callMcpTool({
        id: server.id, userId: server.user_id, name: server.name,
        url: server.url, authType: server.auth_type, authToken: server.auth_token, isActive: true,
      }, toolName, args || {});

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get all available tools (Cortal + external MCP servers)
  router.get("/tools", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;

    // Cortal native tools
    const allTools: any[] = CORTAL_TOOLS.map(t => ({
      ...t, source: "cortal", serverId: null,
    }));

    // External MCP server tools
    const servers = await dbAll(
      "SELECT * FROM mcp_servers WHERE user_id = ? AND is_active = 1", userId
    ) as any[];

    for (const server of servers) {
      const tools = server.tools ? JSON.parse(server.tools) : [];
      for (const tool of tools) {
        allTools.push({
          ...tool,
          source: "mcp",
          serverId: server.id,
          serverName: server.name,
        });
      }
    }

    res.json(allTools);
  });

  return router;
}
