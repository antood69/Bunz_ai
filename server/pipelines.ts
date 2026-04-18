/**
 * Pipeline Engine — executes multi-step workflows with live SSE progress.
 * Supports pause, cancel, per-step output storage, and token tracking.
 */
import { v4 as uuidv4 } from "uuid";
import { Router, type Request, type Response } from "express";
import { storage } from "./storage";
import { modelRouter } from "./ai";
import { eventBus } from "./lib/eventBus";
import { executeDepartment, type DepartmentResult } from "./departments/executor";
import { estimateComplexity, type IntelligenceLevel } from "./departments/types";
import { connectorRegistry } from "./lib/connectorRegistry";
import { broadcastToUser } from "./ws";

interface PipelineStep {
  id: string;
  type: "department" | "connector" | "transform" | "ai_decision" | "approval_gate" | "output";
  department?: string;
  connectorId?: number;
  connectorAction?: string;
  prompt: string;
  params?: Record<string, any>;
  retryCount?: number;
  skipOnFail?: boolean;
  branches?: { yes?: string; no?: string; approved?: string; rejected?: string };
}

// Track active pipeline runs for pause/cancel
const activeRuns = new Map<string, { status: "running" | "paused" | "cancelled"; resolve?: () => void }>();

function waitForResume(runId: string): Promise<void> {
  return new Promise((resolve) => {
    const run = activeRuns.get(runId);
    if (run) run.resolve = resolve;
  });
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

  activeRuns.set(runId, { status: "running" });

  let previousOutput = "";
  let totalTokens = 0;
  const outputs: string[] = [];
  const stepResults: Array<{ label: string; status: string; output: string; tokens: number; durationMs: number; error?: string }> = [];

  try {
    eventBus.emit(runId, "pipeline_start", {
      pipelineId, name: pipeline.name, totalSteps: steps.length,
    });
    broadcastToUser(userId, "pipelines", "run_started", {
      pipelineId, runId, name: pipeline.name, totalSteps: steps.length,
    });

    for (let i = 0; i < steps.length; i++) {
      const runState = activeRuns.get(runId);

      // Check for cancel
      if (!runState || runState.status === "cancelled") {
        await storage.updatePipelineRun(runId, { status: "cancelled", completedAt: Date.now() });
        eventBus.emit(runId, "pipeline_complete", { status: "cancelled", totalTokens, stepsCompleted: i });
        activeRuns.delete(runId);
        return;
      }

      // Check for pause — wait until resumed or cancelled
      if (runState.status === "paused") {
        eventBus.emit(runId, "pipeline_paused", { stepsCompleted: i, totalSteps: steps.length });
        await waitForResume(runId);
        const afterPause = activeRuns.get(runId);
        if (!afterPause || afterPause.status === "cancelled") {
          await storage.updatePipelineRun(runId, { status: "cancelled", completedAt: Date.now() });
          eventBus.emit(runId, "pipeline_complete", { status: "cancelled", totalTokens, stepsCompleted: i });
          activeRuns.delete(runId);
          return;
        }
        eventBus.emit(runId, "pipeline_resumed", { stepIndex: i });
      }

      const step = steps[i];
      let prompt = step.prompt.replace(/\{\{prev\}\}/g, previousOutput);
      prompt = prompt.replace(/\{\{step\.(\d+)\}\}/g, (_, n) => outputs[parseInt(n) - 1] || "");

      const stepLabel = step.type === "department" ? (step.department || step.type) : step.type;
      const retryCount = step.retryCount || 0;
      const skipOnFail = step.skipOnFail || false;

      eventBus.emit(runId, "step_start", {
        stepIndex: i, stepTotal: steps.length, type: step.type,
        department: step.department, label: stepLabel,
        prompt: prompt.slice(0, 200),
      });

      let stepOutput = "";
      let stepTokens = 0;
      let stepError: string | undefined;
      const stepStart = Date.now();
      let attempts = 0;
      let success = false;

      while (attempts <= retryCount && !success) {
        attempts++;
        try {
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
            if (!result.ok) throw new Error(result.error || "Connector failed");
          } else if (step.type === "ai_decision") {
            // AI evaluates condition and returns yes/no decision
            const decisionResult = await modelRouter.chat({
              model: "gpt-5.4-mini",
              messages: [{ role: "user", content: `Evaluate this condition based on the input below. Respond with ONLY a JSON object: {"decision": true or false, "reasoning": "brief explanation"}\n\nCondition: ${prompt}\n\nInput:\n${previousOutput}` }],
              systemPrompt: "You are a decision evaluator. Analyze the condition and input, then decide true or false. Respond with ONLY valid JSON.",
            });
            stepTokens = decisionResult.usage.totalTokens;
            try {
              const jsonMatch = decisionResult.content.match(/\{[\s\S]*\}/);
              const decision = jsonMatch ? JSON.parse(jsonMatch[0]) : { decision: true, reasoning: "Parse failed, defaulting to true" };
              stepOutput = JSON.stringify(decision);
              // Log the decision for the UI
              eventBus.emit(runId, "ai_decision", {
                stepIndex: i, decision: decision.decision, reasoning: decision.reasoning,
              });
            } catch {
              stepOutput = JSON.stringify({ decision: true, reasoning: "Parse error" });
            }
          } else if (step.type === "approval_gate") {
            // Pause execution until human approves
            eventBus.emit(runId, "approval_required", {
              stepIndex: i, prompt, context: previousOutput.slice(0, 500),
            });
            activeRuns.set(runId, { status: "paused" });
            await waitForResume(runId);
            const afterApproval = activeRuns.get(runId);
            if (!afterApproval || afterApproval.status === "cancelled") {
              stepOutput = JSON.stringify({ approved: false, reason: "Rejected by user" });
            } else {
              stepOutput = JSON.stringify({ approved: true });
            }
          } else if (step.type === "output") {
            // Output node just passes through
            stepOutput = previousOutput;
          } else if (step.type === "transform") {
            const transformResult = await modelRouter.chat({
              model: "gpt-5.4-mini",
              messages: [{ role: "user", content: prompt + "\n\nInput:\n" + previousOutput }],
              systemPrompt: "You are a data transformation assistant. Process the input according to the instructions.",
            });
            stepOutput = transformResult.content;
            stepTokens = transformResult.usage.totalTokens;
          }
          success = true;
        } catch (err: any) {
          stepError = err.message;
          if (attempts <= retryCount) {
            eventBus.emit(runId, "step_retry", { stepIndex: i, attempt: attempts, maxRetries: retryCount, error: stepError });
          }
        }
      }

      const stepDuration = Date.now() - stepStart;

      if (!success) {
        stepResults.push({ label: stepLabel, status: "failed", output: "", tokens: 0, durationMs: stepDuration, error: stepError });

        eventBus.emit(runId, "step_complete", {
          stepIndex: i, stepTotal: steps.length, label: stepLabel,
          status: "failed", error: stepError, tokens: 0, durationMs: stepDuration,
        });

        if (skipOnFail) {
          outputs.push("");
          await storage.updatePipelineRun(runId, { stepsCompleted: i + 1, totalTokens });
          continue;
        }

        // Step failed and not skippable — abort pipeline
        await storage.updatePipelineRun(runId, { status: "failed", error: `Step ${i + 1} (${stepLabel}) failed: ${stepError}`, completedAt: Date.now() });
        try { await storage.createNotification({ userId, type: "pipeline_failed", title: `Workflow "${pipeline.name}" failed`, message: `Step ${i + 1} (${stepLabel}): ${stepError?.slice(0, 100)}`, link: "/workflows" }); } catch {}
        eventBus.emit(runId, "pipeline_complete", { status: "failed", error: stepError, stepsCompleted: i });
        activeRuns.delete(runId);
        return;
      }

      totalTokens += stepTokens;
      outputs.push(stepOutput);
      previousOutput = stepOutput;

      stepResults.push({ label: stepLabel, status: "complete", output: stepOutput.slice(0, 2000), tokens: stepTokens, durationMs: stepDuration });

      await storage.updatePipelineRun(runId, { stepsCompleted: i + 1, totalTokens });

      eventBus.emit(runId, "step_complete", {
        stepIndex: i, stepTotal: steps.length, label: stepLabel,
        status: "complete",
        output: stepOutput.slice(0, 500),
        tokens: stepTokens,
        durationMs: stepDuration,
      });
    }

    // Auto-save to Obsidian (env var fallback)
    try {
      let obsId: any = null;
      const connectors = await storage.getConnectorsByUser(userId);
      const obsConnector = connectors.find((c: any) => c.provider === "obsidian" && c.status === "connected");
      if (obsConnector) {
        obsId = obsConnector.id;
      } else if (process.env.OBSIDIAN_API_URL && process.env.OBSIDIAN_API_KEY) {
        obsId = "env";
      }
      if (obsId) {
        const timestamp = new Date().toISOString().slice(0, 10);
        const slug = pipeline.name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
        const header = `# ${pipeline.name}\n*Pipeline run: ${new Date().toLocaleString()} | ${steps.length} steps | ${totalTokens} tokens*\n\n---\n\n`;
        const exec = obsId === "env" ? connectorRegistry.executeObsidianDirect.bind(connectorRegistry) : (a: string, p: any) => connectorRegistry.execute(obsId, a, p);
        await exec("write_note", { path: `Workflows/${timestamp}-${slug}.md`, content: header + previousOutput });
      }
    } catch {}

    // Store step results in the run output for history
    await storage.updatePipelineRun(runId, {
      status: "complete",
      output: JSON.stringify({ finalOutput: previousOutput, stepResults }),
      totalTokens,
      completedAt: Date.now(),
    });
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
      status: "complete", totalTokens,
      output: previousOutput.slice(0, 1000),
      stepResults: stepResults.map(s => ({ label: s.label, status: s.status, tokens: s.tokens, durationMs: s.durationMs })),
    });
    broadcastToUser(userId, "pipelines", "run_completed", {
      pipelineId, runId, name: pipeline.name, status: "complete", totalTokens,
      stepResults: stepResults.map(s => ({ label: s.label, status: s.status })),
    });
    broadcastToUser(userId, "workflows", "updated", { pipelineId });
    broadcastToUser(userId, "notifications", "new", {});

  } catch (err: any) {
    await storage.updatePipelineRun(runId, { status: "failed", error: err.message, completedAt: Date.now() });
    try { await storage.createNotification({ userId, type: "pipeline_failed", title: `Workflow "${pipeline.name}" failed`, message: err.message.slice(0, 100), link: "/workflows" }); } catch {}
    console.error(`[Pipeline] Failed:`, err.message);
    eventBus.emit(runId, "pipeline_complete", { status: "failed", error: err.message });
  } finally {
    activeRuns.delete(runId);
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

  // Run pipeline
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

  // Webhook trigger — external API access (no auth required, uses pipeline's owner)
  router.post("/:id/webhook", async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const pipeline = await storage.getPipeline(id);
    if (!pipeline) return res.status(404).json({ error: "Not found" });
    if (pipeline.trigger_type !== "webhook") return res.status(400).json({ error: "This workflow is not configured for webhook triggers" });

    const runId = uuidv4();
    const userId = pipeline.user_id;

    await storage.createPipelineRun({ id: runId, pipelineId: id, userId, totalSteps: pipeline.steps.length });

    // Pass webhook body as input to first step via environment
    executePipeline(id, userId, "medium" as IntelligenceLevel, runId).catch(() => {});

    res.json({ ok: true, runId, status: "running" });
  });

  // Pause a running pipeline
  router.post("/runs/:runId/pause", (_req: Request, res: Response) => {
    const runId = _req.params.runId as string;
    const run = activeRuns.get(runId);
    if (!run) return res.status(404).json({ error: "Run not found or already finished" });
    run.status = "paused";
    res.json({ ok: true, status: "paused" });
  });

  // Resume a paused pipeline
  router.post("/runs/:runId/resume", (_req: Request, res: Response) => {
    const runId = _req.params.runId as string;
    const run = activeRuns.get(runId);
    if (!run) return res.status(404).json({ error: "Run not found or already finished" });
    run.status = "running";
    if (run.resolve) { run.resolve(); run.resolve = undefined; }
    res.json({ ok: true, status: "running" });
  });

  // Cancel a running/paused pipeline
  router.post("/runs/:runId/cancel", async (_req: Request, res: Response) => {
    const runId = _req.params.runId as string;
    const run = activeRuns.get(runId);
    if (!run) return res.status(404).json({ error: "Run not found or already finished" });
    run.status = "cancelled";
    if (run.resolve) { run.resolve(); run.resolve = undefined; }
    res.json({ ok: true, status: "cancelled" });
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

  // Run history for a pipeline
  router.get("/:id/runs", async (req: Request, res: Response) => {
    const id = req.params.id as string;
    res.json(await storage.getPipelineRuns(id));
  });

  // Get a single run (for viewing past run details)
  router.get("/runs/:runId", async (req: Request, res: Response) => {
    const runId = req.params.runId as string;
    const run = await storage.getPipelineRunById(runId);
    if (!run) return res.status(404).json({ error: "Run not found" });
    res.json(run);
  });

  // Workflow AI Assistant (conversational design)
  router.post("/assist", async (req: Request, res: Response) => {
    const { description, messages } = req.body;
    const userId = req.user?.id || 1;

    const connectors = await storage.getConnectorsByUser(userId);
    const connectedList = connectors
      .filter((c: any) => c.status === "connected")
      .map((c: any) => `${c.provider} (${c.name})`)
      .join(", ");

    const systemPrompt = `You are a workflow architect for Cortal — an AI orchestration platform.

Available departments (AI workers): research, coder, writer, artist
Available connectors: ${connectedList || "none connected"}
Step types: department (AI work), connector (external service), transform (data processing), ai_decision (AI evaluates condition, branches yes/no), approval_gate (pauses for human approval), output (final output)

When the user describes what they want, design a multi-step workflow.
If you have enough info, return the workflow as JSON inside <workflow>...</workflow> tags:
{
  "name": "...",
  "description": "...",
  "steps": [
    { "id": "step-1", "type": "department", "department": "research", "prompt": "..." },
    { "id": "step-2", "type": "ai_decision", "prompt": "Is the research comprehensive enough?" },
    { "id": "step-3", "type": "transform", "prompt": "Summarize: {{prev}}" }
  ]
}

Ask clarifying questions if the request is ambiguous. Be concise.`;

    const chatMessages = messages?.length
      ? messages.map((m: any) => ({ role: m.role, content: m.content }))
      : [{ role: "user" as const, content: description || "Help me create a workflow" }];

    try {
      const result = await modelRouter.chat({
        model: "gpt-5.4",
        systemPrompt,
        messages: chatMessages,
      });

      let workflow = null;
      const wfMatch = result.content.match(/<workflow>([\s\S]*?)<\/workflow>/);
      if (wfMatch) {
        try { workflow = JSON.parse(wfMatch[1]); } catch {}
      }

      res.json({ reply: result.content, workflow, tokens: result.usage.totalTokens });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Natural Language → Auto-Create Pipeline (one-shot)
  router.post("/generate", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const { description } = req.body;
    if (!description) return res.status(400).json({ error: "description required" });

    const connectors = await storage.getConnectorsByUser(userId);
    const connectedList = connectors
      .filter((c: any) => c.status === "connected")
      .map((c: any) => `${c.provider} (id:${c.id}, actions: ${c.name})`)
      .join("\n");

    try {
      const result = await modelRouter.chat({
        model: "gpt-5.4",
        systemPrompt: "You create workflow pipelines from natural language descriptions. Return ONLY valid JSON.",
        messages: [{
          role: "user",
          content: `Create a workflow pipeline from this description:

"${description}"

Available department types: research, coder, writer, artist
Available step types: department, connector, transform, ai_decision, approval_gate, output
Connected services:
${connectedList || "none"}

Return ONLY a JSON object (no markdown, no explanation):
{
  "name": "Short name",
  "description": "One sentence",
  "steps": [
    {
      "id": "step-1",
      "type": "department",
      "department": "research",
      "prompt": "Detailed instruction for this step. Use {{prev}} to reference previous step output."
    }
  ]
}`,
        }],
      });

      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return res.status(400).json({ error: "Failed to generate workflow" });

      const generated = JSON.parse(jsonMatch[0]);
      if (!generated.steps?.length) return res.status(400).json({ error: "No steps generated" });

      // Auto-create the pipeline
      const pipeline = await storage.createPipeline({
        id: uuidv4(),
        userId,
        name: generated.name || "Generated Workflow",
        description: generated.description || description,
        triggerType: "manual",
        steps: generated.steps,
      });

      broadcastToUser(userId, "workflows", "created", { id: pipeline.id, name: pipeline.name });

      res.json({ pipeline, steps: generated.steps, tokens: result.usage.totalTokens });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
