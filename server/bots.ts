/**
 * Bot Engine — persistent, stateful, autonomous agents.
 */
import { v4 as uuidv4 } from "uuid";
import { Router, type Request, type Response } from "express";
import { storage } from "./storage";
import { modelRouter } from "./ai";
import { executeDepartment } from "./departments/executor";
import { estimateComplexity, type IntelligenceLevel } from "./departments/types";
import { connectorRegistry } from "./lib/connectorRegistry";

// Active bot intervals (in-memory)
const activeBots = new Map<string, NodeJS.Timeout>();

/**
 * Execute one bot cycle: load state, make a decision, act on it.
 */
async function runBotCycle(botId: string): Promise<void> {
  const bot = storage.getBot(botId);
  if (!bot || bot.status !== "running") {
    stopBot(botId);
    return;
  }

  try {
    storage.addBotLog(botId, "cycle", "Bot cycle started");

    // Build context from memory + recent logs
    const recentLogs = storage.getBotLogs(botId, 10);
    const logContext = recentLogs.reverse().map((l: any) =>
      `[${new Date(l.created_at).toLocaleTimeString()}] ${l.type}: ${l.message}`
    ).join("\n");

    const decisionPrompt = `You are an autonomous bot. Based on your current state and recent activity, decide what to do next.

CURRENT STATE (memory):
${JSON.stringify(bot.memory, null, 2)}

RECENT ACTIVITY:
${logContext || "No recent activity"}

AVAILABLE TOOLS:
${bot.tools.map((t: any) => `- ${t.type}: ${t.name} — ${t.description || ""}`).join("\n") || "No tools configured"}

RULES/CONSTRAINTS:
${bot.rules.map((r: any) => `- ${r}`).join("\n") || "No rules set"}

Respond with a JSON object (no markdown):
{
  "action": "none" | "department" | "connector" | "notify" | "update_memory",
  "department": "research|coder|writer|artist" (if action=department),
  "task": "task description" (if action=department),
  "connectorId": number (if action=connector),
  "connectorAction": "action name" (if action=connector),
  "params": {} (if action=connector),
  "message": "notification text" (if action=notify),
  "memoryUpdate": {} (if action=update_memory, will be merged with current memory),
  "reasoning": "brief explanation of why this action"
}

If nothing needs to be done right now, use action "none".`;

    const result = await modelRouter.chat({
      model: bot.brain_model || "gpt-5.4-mini",
      messages: [{ role: "user", content: decisionPrompt }],
      systemPrompt: bot.brain_prompt,
    });

    const tokens = result.usage.totalTokens;
    storage.updateBot(botId, {
      totalTokens: (bot.total_tokens || 0) + tokens,
      totalRuns: (bot.total_runs || 0) + 1,
      lastActiveAt: Date.now(),
    });

    // Parse decision
    let decision: any;
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      decision = jsonMatch ? JSON.parse(jsonMatch[0]) : { action: "none" };
    } catch {
      decision = { action: "none", reasoning: "Failed to parse decision" };
    }

    storage.addBotLog(botId, "decision", decision.reasoning || decision.action, { action: decision.action });

    // Execute decision
    if (decision.action === "department" && decision.department && decision.task) {
      storage.addBotLog(botId, "action", `Dispatching to ${decision.department}: ${decision.task.slice(0, 100)}`);
      try {
        const deptResult = await executeDepartment(
          botId, { department: decision.department, task: decision.task },
          "medium" as IntelligenceLevel, estimateComplexity(decision.task),
        );
        storage.addBotLog(botId, "result", `${decision.department} completed (${deptResult.totalTokens} tokens)`, {
          output: deptResult.finalOutput.slice(0, 500),
        });
        storage.updateBot(botId, { totalTokens: (bot.total_tokens || 0) + tokens + deptResult.totalTokens });
      } catch (e: any) {
        storage.addBotLog(botId, "error", `Department failed: ${e.message}`);
      }
    } else if (decision.action === "connector" && decision.connectorId) {
      storage.addBotLog(botId, "action", `Calling connector: ${decision.connectorAction}`);
      try {
        const connResult = await connectorRegistry.execute(decision.connectorId, decision.connectorAction, decision.params || {});
        storage.addBotLog(botId, "result", connResult.ok ? "Connector action succeeded" : `Connector failed: ${connResult.error}`);
      } catch (e: any) {
        storage.addBotLog(botId, "error", `Connector failed: ${e.message}`);
      }
    } else if (decision.action === "notify" && decision.message) {
      storage.addBotLog(botId, "notify", decision.message);
      try {
        await storage.createNotification({
          userId: bot.user_id, type: "bot_alert",
          title: `Bot "${bot.name}"`, message: decision.message, link: "/bots",
        });
      } catch {}
    } else if (decision.action === "update_memory" && decision.memoryUpdate) {
      const newMemory = { ...bot.memory, ...decision.memoryUpdate };
      storage.updateBot(botId, { memory: newMemory });
      storage.addBotLog(botId, "memory", "Memory updated", { update: decision.memoryUpdate });
    }

    // Auto-save to Obsidian
    try {
      const connectors = await storage.getConnectorsByUser(bot.user_id);
      const obs = connectors.find((c: any) => c.provider === "obsidian" && c.status === "connected");
      if (obs && decision.action !== "none") {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        await connectorRegistry.execute(obs.id, "write_note", {
          path: `Bots/${bot.name}/${timestamp}.md`,
          content: `# Bot: ${bot.name}\n*${new Date().toLocaleString()} | Action: ${decision.action}*\n\n${decision.reasoning || ""}\n\n${result.content}`,
        });
      }
    } catch {}

  } catch (e: any) {
    storage.addBotLog(botId, "error", `Cycle failed: ${e.message}`);
    console.error(`[Bot ${botId}] Cycle error:`, e.message);
  }
}

function startBot(botId: string, intervalMs = 60000): void {
  if (activeBots.has(botId)) return;
  storage.updateBot(botId, { status: "running" });
  storage.addBotLog(botId, "lifecycle", "Bot started");

  // Run first cycle immediately
  runBotCycle(botId);

  // Then run on interval
  const timer = setInterval(() => runBotCycle(botId), intervalMs);
  activeBots.set(botId, timer);
}

function stopBot(botId: string): void {
  const timer = activeBots.get(botId);
  if (timer) { clearInterval(timer); activeBots.delete(botId); }
  storage.updateBot(botId, { status: "stopped" });
  storage.addBotLog(botId, "lifecycle", "Bot stopped");
}

/**
 * Bot API routes
 */
export function createBotRouter() {
  const router = Router();

  router.get("/", (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    res.json(storage.getBotsByUser(userId));
  });

  router.get("/:id", (req: Request, res: Response) => {
    const bot = storage.getBot(req.params.id as string);
    if (!bot) return res.status(404).json({ error: "Not found" });
    res.json(bot);
  });

  router.post("/", (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const { name, description, brainPrompt, brainModel, category, triggers, tools, rules } = req.body;
    if (!name || !brainPrompt) return res.status(400).json({ error: "Name and brainPrompt required" });
    const bot = storage.createBot({
      id: uuidv4(), userId, name, description, brainPrompt,
      brainModel, category, triggers, tools, rules,
    });
    res.json(bot);
  });

  router.put("/:id", (req: Request, res: Response) => {
    const id = req.params.id as string;
    const bot = storage.getBot(id);
    if (!bot) return res.status(404).json({ error: "Not found" });
    res.json(storage.updateBot(id, req.body));
  });

  router.delete("/:id", (req: Request, res: Response) => {
    const id = req.params.id as string;
    stopBot(id);
    storage.deleteBot(id);
    res.json({ ok: true });
  });

  router.post("/:id/start", (req: Request, res: Response) => {
    const id = req.params.id as string;
    const intervalMs = parseInt(req.body.intervalMs) || 60000;
    startBot(id, intervalMs);
    res.json({ ok: true, status: "running" });
  });

  router.post("/:id/stop", (req: Request, res: Response) => {
    const id = req.params.id as string;
    stopBot(id);
    res.json({ ok: true, status: "stopped" });
  });

  router.post("/:id/run-once", async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const bot = storage.getBot(id);
    if (!bot) return res.status(404).json({ error: "Not found" });
    await runBotCycle(id);
    res.json({ ok: true });
  });

  router.get("/:id/logs", (req: Request, res: Response) => {
    const id = req.params.id as string;
    const limit = parseInt(req.query.limit as string) || 50;
    res.json(storage.getBotLogs(id, limit));
  });

  // Bot AI Assistant — helps design bots by asking clarifying questions
  router.post("/assist", async (req: Request, res: Response) => {
    const { messages = [] } = req.body;
    if (messages.length === 0) return res.status(400).json({ error: "Messages required" });

    try {
      const userId = req.user?.id || 1;
      const connectors = await storage.getConnectorsByUser(userId);
      const connected = connectors.filter((c: any) => c.status === "connected").map((c: any) => c.provider);

      const systemPrompt = `You are the Bot Architect for Bunz. You help users design autonomous bots — persistent agents that run continuously, make decisions, and take actions.

CONNECTED SERVICES: ${connected.length > 0 ? connected.join(", ") : "none"}
AVAILABLE DEPARTMENTS: research, coder, writer, artist
AVAILABLE TOOLS: Any connected service above, plus departments for AI tasks.

YOUR JOB:
1. Understand what the user wants to automate with a persistent bot
2. Ask clarifying questions about:
   - What data/APIs does the bot need access to?
   - Does it need login credentials for any service?
   - What triggers should wake the bot? (timer, webhook, data change)
   - What decisions should the bot make?
   - What actions should it take?
   - What constraints/rules should limit it? (max spend, confirmation needed, hours of operation)
   - How often should it run? (every 30s, every 5min, every hour)
   - What should it remember between cycles?
3. When you have enough info, generate the bot config as JSON wrapped in <bot> tags:

<bot>
{
  "name": "Bot Name",
  "description": "What it does",
  "category": "trading|content|monitor|automation|general",
  "brainPrompt": "You are a [detailed description of the bot's expertise, personality, and decision-making framework]...",
  "brainModel": "gpt-5.4",
  "rules": ["Rule 1", "Rule 2"],
  "tools": [
    {"type": "department", "name": "research", "description": "For gathering data"},
    {"type": "connector", "name": "obsidian", "description": "For saving notes"}
  ],
  "triggers": [
    {"type": "timer", "intervalMs": 60000, "description": "Every 60 seconds"}
  ]
}
</bot>

IMPORTANT:
- Make the brainPrompt DETAILED — it defines the bot's entire personality and decision-making
- Ask about edge cases: what if the bot encounters an error? what if data is missing?
- For trading bots: ask about risk management, position sizing, max drawdown, market hours
- For content bots: ask about tone, audience, frequency, platforms
- Always confirm the plan before generating the final JSON
- If the user wants something that needs external API access they don't have connected, tell them what they need to set up first`;

      const result = await modelRouter.chat({
        model: "gpt-5.4",
        messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
        systemPrompt,
      });

      let botConfig = null;
      const botMatch = result.content.match(/<bot>([\s\S]*?)<\/bot>/);
      if (botMatch) {
        try { botConfig = JSON.parse(botMatch[1]); } catch {}
      }

      res.json({
        reply: result.content.replace(/<bot>[\s\S]*?<\/bot>/, "").trim(),
        botConfig,
        tokens: result.usage.totalTokens,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
