/**
 * Pipeline Engine — executes multi-step workflows with live SSE progress.
 */
import { v4 as uuidv4 } from "uuid";
import { Router, type Request, type Response } from "express";
import { storage } from "./storage";
import { modelRouter } from "./ai";
import { eventBus } from "./lib/eventBus";
import { executeDepartment, type DepartmentResult } from "./departments/executor";
import { estimateComplexity, type IntelligenceLevel } from "./departments/types";
import { connectorRegistry } from "./lib/connectorRegistry";

interface PipelineStep {
  id: string;
  type: "department" | "connector" | "transform";
  department?: string;
  connectorId?: number;
  connectorAction?: string;
  prompt: string;
  params?: Record<string, any>;
}

/**
 * Execute a pipeline asynchronously with live progress via eventBus.
 */
async function executePipeline(
  pipelineId: string,
  userId: number,
  level: IntelligenceLevel = "medium",
  runId: string,
): Promise<void> {
  const pipeline = await storage.getPipeline(pipelineId);
  if (!pipeline) { eventBus.emit(runId, "error", { error: "Pipeline not found" }); return; }

  const steps: PipelineStep[] = pipeline.steps;
  if (!steps.length) { eventBus.emit(runId, "error", { error: "No steps" }); return; }

  let previousOutput = "";
  let totalTokens = 0;
  const outputs: string[] = [];

  try {
    eventBus.emit(runId, "pipeline_start", {
      pipelineId, name: pipeline.name, totalSteps: steps.length,
    });

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      let prompt = step.prompt.replace(/\{\{prev\}\}/g, previousOutput);
      prompt = prompt.replace(/\{\{step\.(\d+)\}\}/g, (_, n) => outputs[parseInt(n) - 1] || "");

      const stepLabel = step.type === "department" ? step.department : step.type;

      eventBus.emit(runId, "step_start", {
        stepIndex: i, stepTotal: steps.length, type: step.type,
        department: step.department, label: stepLabel,
        prompt: prompt.slice(0, 200),
      });

      console.log(`[Pipeline] Step ${i + 1}/${steps.length}: ${stepLabel} — ${prompt.slice(0, 80)}`);

      let stepOutput = "";
      let stepTokens = 0;
      const stepStart = Date.now();

      if (step.type === "department" && step.department) {
        let github: { token: string; repo: string } | undefined;
        if (step.department === "coder") {
          try {
            const ghToken = await storage.getGitHubToken(userId);
            if (ghToken) {
              const prefs = await storage.getUserPreferences(userId);
              if (prefs.defaultRepo) github = { token: ghToken, repo: prefs.defaultRepo };
            }
          } catch {}
        }

        const result: DepartmentResult = await executeDepartment(
          runId, { department: step.department as any, task: prompt },
          level, estimateComplexity(prompt), undefined,
          step.department === "coder" ? github : undefined,
        );
        stepOutput = result.finalOutput;
        stepTokens = result.totalTokens;
      } else if (step.type === "connector" && step.connectorId && step.connectorAction) {
        const result = await connectorRegistry.execute(step.connectorId, step.connectorAction, {
          ...step.params, content: previousOutput, query: prompt,
        });
        stepOutput = result.ok ? (typeof result.data === "string" ? result.data : JSON.stringify(result.data)) : `Error: ${result.error}`;
      } else if (step.type === "transform") {
        const transformResult = await modelRouter.chat({
          model: "gpt-5.4-mini",
          messages: [{ role: "user", content: prompt + "\n\nInput:\n" + previousOutput }],
          systemPrompt: "You are a data transformation assistant. Process the input according to the instructions.",
        });
        stepOutput = transformResult.content;
        stepTokens = transformResult.usage.totalTokens;
      }

      totalTokens += stepTokens;
      outputs.push(stepOutput);
      previousOutput = stepOutput;

      await storage.updatePipelineRun(runId, { stepsCompleted: i + 1, totalTokens });

      eventBus.emit(runId, "step_complete", {
        stepIndex: i, stepTotal: steps.length, label: stepLabel,
        output: stepOutput.slice(0, 500),
        tokens: stepTokens,
        durationMs: Date.now() - stepStart,
      });
    }

    // Auto-save to Obsidian
    try {
      const connectors = await storage.getConnectorsByUser(userId);
      const obsConnector = connectors.find((c: any) => c.provider === "obsidian" && c.status === "connected");
      if (obsConnector) {
        const timestamp = new Date().toISOString().slice(0, 10);
        const slug = pipeline.name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
        const header = `# ${pipeline.name}\n*Pipeline run: ${new Date().toLocaleString()} | ${steps.length} steps*\n\n---\n\n`;
        await connectorRegistry.execute(obsConnector.id, "write_note", {
          path: `Workflows/${timestamp}-${slug}.md`, content: header + previousOutput,
        });
      }
    } catch {}

    await storage.updatePipelineRun(runId, { status: "complete", output: previousOutput, totalTokens, completedAt: Date.now() });
    await storage.updatePipeline(pipelineId, { lastRunAt: Date.now(), runCount: (pipeline.run_count || 0) + 1 });

    try {
      await storage.createNotification({
        userId, type: "pipeline_complete",
        title: `Pipeline "${pipeline.name}" completed`,
        message: `${steps.length} steps, ${totalTokens >= 1000 ? (totalTokens / 1000).toFixed(1) + "K" : totalTokens} tokens`,
        link: "/workflows",
      });
    } catch {}

    eventBus.emit(runId, "pipeline_complete", {
      status: "complete", totalTokens, output: previousOutput.slice(0, 1000),
    });

  } catch (err: any) {
    await storage.updatePipelineRun(runId, { status: "failed", error: err.message, completedAt: Date.now() });
    console.error(`[Pipeline] Failed:`, err.message);
    eventBus.emit(runId, "pipeline_complete", { status: "failed", error: err.message });
  }
}

/**
 * Pipeline API routes
 */
export function createPipelineRouter() {
  const router = Router();

  router.get("/", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    res.json(await storage.getPipelinesByUser(userId));
  });

  router.get("/:id", async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const pipeline = await storage.getPipeline(id);
    if (!pipeline) return res.status(404).json({ error: "Not found" });
    res.json(pipeline);
  });

  router.post("/", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const { name, description, triggerType, triggerConfig, steps } = req.body;
    if (!name || !steps?.length) return res.status(400).json({ error: "Name and steps required" });
    const pipeline = await storage.createPipeline({
      id: uuidv4(), userId, name, description,
      triggerType: triggerType || "manual", triggerConfig, steps,
    });
    res.json(pipeline);
  });

  router.put("/:id", async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const pipeline = await storage.getPipeline(id);
    if (!pipeline) return res.status(404).json({ error: "Not found" });
    res.json(await storage.updatePipeline(id, req.body));
  });

  router.delete("/:id", async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await storage.deletePipeline(id);
    res.json({ ok: true });
  });

  // Run pipeline — async, returns runId immediately
  router.post("/:id/run", async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const userId = req.user?.id || 1;
    const level = (req.body.level || "medium") as IntelligenceLevel;
    const runId = uuidv4();
    const pipeline = await storage.getPipeline(id);
    if (!pipeline) return res.status(404).json({ error: "Not found" });

    await storage.createPipelineRun({ id: runId, pipelineId: id, userId, totalSteps: pipeline.steps.length });

    executePipeline(id, userId, level, runId).catch(err => {
      console.error("[Pipeline] Unhandled error:", err.message);
    });

    res.json({ runId, status: "running" });
  });

  // SSE stream for pipeline progress
  router.get("/:runId/stream", (req: Request, res: Response) => {
    const runId = req.params.runId as string;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`event: connected\ndata: ${JSON.stringify({ runId })}\n\n`);

    const unsub = eventBus.subscribe(runId, (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if (event === "pipeline_complete") {
        setTimeout(() => res.end(), 500);
      }
    });

    req.on("close", unsub);
  });

  router.get("/:id/runs", async (req: Request, res: Response) => {
    const id = req.params.id as string;
    res.json(await storage.getPipelineRuns(id));
  });

  // Workflow AI Assistant — helps build workflows by asking questions
  router.post("/assist", async (req: Request, res: Response) => {
    const { description, messages = [] } = req.body;
    if (!description && messages.length === 0) return res.status(400).json({ error: "Description or messages required" });

    try {
      // Get user's connected services for context
      const userId = req.user?.id || 1;
      const connectors = await storage.getConnectorsByUser(userId);
      const connected = connectors.filter((c: any) => c.status === "connected").map((c: any) => c.provider);

      const systemPrompt = `You are the Workflow Architect for Bunz. You help users design multi-step automation workflows.

AVAILABLE DEPARTMENTS: research, coder, writer, artist
AVAILABLE STEP TYPES: department (uses AI departments), connector (calls external services), transform (AI data processing)
CONNECTED SERVICES: ${connected.length > 0 ? connected.join(", ") : "none"}

YOUR JOB:
1. Understand what the user wants to automate
2. Ask clarifying questions if anything is unclear (e.g., "Does this require logging into a specific site?", "What format should the output be?", "Do you need to purchase anything for this?")
3. When you have enough info, generate the workflow as a JSON object

WHEN READY TO GENERATE, output the workflow JSON wrapped in <workflow> tags:
<workflow>
{
  "name": "Workflow Name",
  "description": "What it does",
  "triggerType": "manual",
  "steps": [
    {"id": "step-1", "type": "department", "department": "research", "prompt": "Detailed task..."},
    {"id": "step-2", "type": "department", "department": "writer", "prompt": "Using {{prev}}, write..."},
    {"id": "step-3", "type": "transform", "prompt": "Format the output as..."}
  ]
}
</workflow>

IMPORTANT:
- Use {{prev}} to reference previous step output
- Use {{step.N}} to reference a specific step (1-indexed)
- Make prompts detailed and specific — not vague
- Ask about requirements, logins, purchases, API keys, file formats, frequency
- If the user wants something you can't automate (like physical purchases), explain what can be automated and what they'd need to do manually
- Always confirm the plan before generating the final JSON`;

      const chatMessages = messages.length > 0
        ? messages.map((m: any) => ({ role: m.role, content: m.content }))
        : [{ role: "user" as const, content: description }];

      const result = await modelRouter.chat({
        model: "gpt-5.4",
        messages: chatMessages,
        systemPrompt,
      });

      // Check if response contains a workflow JSON
      const workflowMatch = result.content.match(/<workflow>([\s\S]*?)<\/workflow>/);
      let workflow = null;
      if (workflowMatch) {
        try { workflow = JSON.parse(workflowMatch[1]); } catch {}
      }

      res.json({
        reply: result.content.replace(/<workflow>[\s\S]*?<\/workflow>/, "").trim(),
        workflow,
        tokens: result.usage.totalTokens,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
