import { storage } from "./storage";
import { runAgentChat, type AiResponse } from "./ai";

// ── Worker Types ─────────────────────────────────────────────────────────────
export const WORKER_TYPES = ["researcher", "coder", "writer", "reviewer", "analyst"] as const;
export type WorkerType = typeof WORKER_TYPES[number];

// ── Worker System Prompts ────────────────────────────────────────────────────
const WORKER_PROMPTS: Record<WorkerType, string> = {
  researcher: `You are a Research Worker in Bunz. Your job is to:
- Gather information and synthesize findings
- Analyze data and identify patterns
- Provide well-structured research summaries with key takeaways
Always cite your reasoning. Structure output with clear headers and bullet points.`,

  coder: `You are a Code Worker in Bunz. Your job is to:
- Write clean, well-documented code
- Debug and fix issues
- Refactor and improve existing code
- Provide code with explanations
Always wrap code in appropriate markdown code blocks. Be precise and production-ready.`,

  writer: `You are a Writer Worker in Bunz. Your job is to:
- Create compelling, well-structured content
- Write copy, documentation, emails, or articles
- Adapt tone and style to the requested format
- Proofread and improve text quality
Focus on clarity, engagement, and proper formatting.`,

  reviewer: `You are a Reviewer Worker in Bunz. Your job is to:
- Review outputs from other workers for quality and accuracy
- Check code for bugs, security issues, and best practices
- Fact-check research findings
- Provide structured feedback with specific improvement suggestions
Be thorough but constructive. Use a pass/fail/needs-improvement verdict.`,

  analyst: `You are a Data Analyst Worker in Bunz. Your job is to:
- Analyze data and extract insights
- Perform calculations and statistical reasoning
- Create structured analysis with clear conclusions
- Present findings in a clear, actionable format
Always show your work and reasoning.`,
};

// ── Boss Agent Routing ───────────────────────────────────────────────────────
interface RoutingDecision {
  steps: Array<{
    worker: WorkerType;
    task: string;
    depends_on?: number; // index of step this depends on (for sequential)
  }>;
  reasoning: string;
}

const BOSS_SYSTEM_PROMPT = `You are the Bunz Boss Agent — the coordinator responsible for orchestrating worker agents to complete user tasks.

AVAILABLE WORKERS:
- researcher: Web research, data gathering, competitive analysis, fact-finding
- coder: Code generation, debugging, refactoring, code review
- writer: Content creation, copywriting, documentation, email drafts
- reviewer: Quality checks, validation, fact-checking, code review
- analyst: Data analysis, number crunching, statistical insights

YOUR JOB:
1. Analyze the user's request
2. Break it into subtasks for appropriate workers
3. Return a JSON routing plan

RESPOND WITH ONLY VALID JSON in this exact format:
{
  "steps": [
    { "worker": "researcher", "task": "Research the top 5 competitors in the AI agent space" },
    { "worker": "writer", "task": "Write a summary report based on the research findings", "depends_on": 0 }
  ],
  "reasoning": "This task requires research first, then synthesis into a written report"
}

RULES:
- Use 1-3 workers for simple tasks, up to 5 for complex ones
- If steps are independent, omit depends_on (they can run in parallel)
- If a step needs output from a previous step, set depends_on to that step's index (0-based)
- For simple questions that don't need decomposition, use a single worker
- Choose the most appropriate worker type for each subtask
- ONLY output the JSON object, nothing else`;

// ── Parse Boss Decision ──────────────────────────────────────────────────────
function parseBossDecision(text: string): RoutingDecision | null {
  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.steps || !Array.isArray(parsed.steps)) return null;
    // Validate worker types
    for (const step of parsed.steps) {
      if (!WORKER_TYPES.includes(step.worker)) return null;
      if (!step.task || typeof step.task !== "string") return null;
    }
    return parsed as RoutingDecision;
  } catch {
    return null;
  }
}

// ── Run a Single Worker ──────────────────────────────────────────────────────
async function runWorker(
  runId: number,
  workerType: WorkerType,
  task: string,
  context: string,
  model: string
): Promise<{ execId: number; output: string; tokens: { input: number; output: number; total: number } }> {
  // Create execution record
  const exec = await storage.createAgentExecution({
    runId,
    workerType,
    status: "running",
    inputPayload: JSON.stringify({ task, context }),
    modelUsed: model,
    startedAt: new Date().toISOString(),
  });

  try {
    const systemPrompt = WORKER_PROMPTS[workerType];
    const fullPrompt = context
      ? `${task}\n\nContext from previous steps:\n${context}`
      : task;

    const result = await runAgentChat(model, systemPrompt, [], fullPrompt);

    await storage.updateAgentExecution(exec.id, {
      status: "completed",
      output: result.reply,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.totalTokens,
      completedAt: new Date().toISOString(),
    });

    return {
      execId: exec.id,
      output: result.reply,
      tokens: { input: result.inputTokens, output: result.outputTokens, total: result.totalTokens },
    };
  } catch (err: any) {
    await storage.updateAgentExecution(exec.id, {
      status: "failed",
      error: err.message || "Worker execution failed",
      completedAt: new Date().toISOString(),
    });
    throw err;
  }
}

// ── Main Orchestration Function ──────────────────────────────────────────────
export async function executeWorkflowRun(
  runId: number,
  userPrompt: string,
  model: string = "claude-sonnet"
): Promise<void> {
  // ── Pre-flight: check token budget ─────────────────────────────────────
  const plan = await storage.getUserPlan(1);
  if (plan) {
    const remaining = plan.monthlyTokens - plan.tokensUsed;
    if (remaining <= 0) {
      await storage.updateWorkflowRun(runId, {
        status: "failed",
        error: "Token budget exhausted — upgrade your plan or purchase a token pack.",
        completedAt: new Date().toISOString(),
      });
      return;
    }
  }

  // Mark run as running
  await storage.updateWorkflowRun(runId, {
    status: "running",
    startedAt: new Date().toISOString(),
  });

  let totalTokensUsed = 0;

  try {
    // ── Step 1: Boss Agent decomposes the task ─────────────────────────────
    const bossExec = await storage.createAgentExecution({
      runId,
      workerType: "boss",
      status: "running",
      inputPayload: JSON.stringify({ task: "Route and decompose user request", userPrompt }),
      modelUsed: model,
      startedAt: new Date().toISOString(),
    });

    const bossResult = await runAgentChat(model, BOSS_SYSTEM_PROMPT, [], userPrompt);
    totalTokensUsed += bossResult.totalTokens;

    // Record boss token usage
    await storage.recordTokenUsage({
      userId: 1,
      model,
      inputTokens: bossResult.inputTokens,
      outputTokens: bossResult.outputTokens,
      totalTokens: bossResult.totalTokens,
      endpoint: "orchestrator_boss",
    });

    const decision = parseBossDecision(bossResult.reply);

    await storage.updateAgentExecution(bossExec.id, {
      status: "completed",
      output: bossResult.reply,
      inputTokens: bossResult.inputTokens,
      outputTokens: bossResult.outputTokens,
      totalTokens: bossResult.totalTokens,
      completedAt: new Date().toISOString(),
    });

    if (!decision || decision.steps.length === 0) {
      // If boss can't decompose, treat entire response as the output
      await storage.updateWorkflowRun(runId, {
        status: "completed",
        finalOutput: JSON.stringify({ result: bossResult.reply, steps: 0 }),
        totalTokensUsed,
        completedAt: new Date().toISOString(),
      });
      return;
    }

    // ── Step 2: Execute workers (respecting dependencies) ──────────────────
    const stepOutputs: string[] = new Array(decision.steps.length).fill("");
    const completed: boolean[] = new Array(decision.steps.length).fill(false);

    // Process steps, handling dependencies
    // Group steps by dependency level
    let maxIterations = decision.steps.length * 2; // safety guard
    while (completed.some(c => !c) && maxIterations > 0) {
      maxIterations--;

      // Find steps that can run now (all dependencies met)
      const ready: number[] = [];
      for (let i = 0; i < decision.steps.length; i++) {
        if (completed[i]) continue;
        const step = decision.steps[i];
        if (step.depends_on !== undefined && step.depends_on !== null) {
          if (!completed[step.depends_on]) continue; // dependency not done yet
        }
        ready.push(i);
      }

      if (ready.length === 0) break; // deadlock protection

      // Run all ready steps in parallel
      const results = await Promise.all(
        ready.map(async (idx) => {
          const step = decision.steps[idx];
          const context = step.depends_on !== undefined && step.depends_on !== null
            ? stepOutputs[step.depends_on]
            : "";

          try {
            const result = await runWorker(runId, step.worker, step.task, context, model);

            // Record worker token usage
            await storage.recordTokenUsage({
              userId: 1,
              model,
              inputTokens: result.tokens.input,
              outputTokens: result.tokens.output,
              totalTokens: result.tokens.total,
              endpoint: `orchestrator_${step.worker}`,
            });

            return { idx, output: result.output, tokens: result.tokens.total };
          } catch (err: any) {
            return { idx, output: `[Error: ${err.message}]`, tokens: 0 };
          }
        })
      );

      for (const r of results) {
        stepOutputs[r.idx] = r.output;
        completed[r.idx] = true;
        totalTokensUsed += r.tokens;
      }
    }

    // ── Step 3: Boss Agent synthesizes final output ────────────────────────
    const synthesisPrompt = `You are the Bunz Boss Agent. Workers have completed their tasks. Synthesize the results into a cohesive final output for the user.

USER'S ORIGINAL REQUEST:
${userPrompt}

WORKER RESULTS:
${decision.steps.map((step, i) => `--- ${step.worker.toUpperCase()} (Task: ${step.task}) ---\n${stepOutputs[i]}`).join("\n\n")}

Provide a well-structured final response that combines all worker outputs into a single, coherent answer. Use markdown formatting.`;

    const synthesisExec = await storage.createAgentExecution({
      runId,
      workerType: "boss",
      status: "running",
      inputPayload: JSON.stringify({ task: "Synthesize final output" }),
      modelUsed: model,
      startedAt: new Date().toISOString(),
    });

    const synthesisResult = await runAgentChat(model, "You are the Bunz Boss Agent synthesizer. Combine worker outputs into a polished final response.", [], synthesisPrompt);
    totalTokensUsed += synthesisResult.totalTokens;

    await storage.recordTokenUsage({
      userId: 1,
      model,
      inputTokens: synthesisResult.inputTokens,
      outputTokens: synthesisResult.outputTokens,
      totalTokens: synthesisResult.totalTokens,
      endpoint: "orchestrator_synthesis",
    });

    await storage.updateAgentExecution(synthesisExec.id, {
      status: "completed",
      output: synthesisResult.reply,
      inputTokens: synthesisResult.inputTokens,
      outputTokens: synthesisResult.outputTokens,
      totalTokens: synthesisResult.totalTokens,
      completedAt: new Date().toISOString(),
    });

    // ── Step 4: Update plan usage ──────────────────────────────────────────
    const plan = await storage.getUserPlan(1);
    if (plan) {
      await storage.updateUserPlan(plan.id, { tokensUsed: plan.tokensUsed + totalTokensUsed });
    }

    // ── Step 5: Mark run complete ──────────────────────────────────────────
    await storage.updateWorkflowRun(runId, {
      status: "completed",
      finalOutput: synthesisResult.reply,
      totalTokensUsed,
      completedAt: new Date().toISOString(),
    });

  } catch (err: any) {
    // Update plan usage even on failure
    if (totalTokensUsed > 0) {
      const plan = await storage.getUserPlan(1);
      if (plan) {
        await storage.updateUserPlan(plan.id, { tokensUsed: plan.tokensUsed + totalTokensUsed });
      }
    }

    await storage.updateWorkflowRun(runId, {
      status: "failed",
      error: err.message || "Orchestration failed",
      totalTokensUsed,
      completedAt: new Date().toISOString(),
    });
  }
}
