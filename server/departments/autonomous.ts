/**
 * Autonomous Executor — a persistent planning loop that calls other departments.
 * Flow: Goal → Plan Steps → Execute Each Step (via departments) → Evaluate → Repeat
 */

import { modelRouter } from "../ai";
import { eventBus } from "../lib/eventBus";
import { executeDepartment, type DepartmentResult } from "./executor";
import {
  type DepartmentId, type IntelligenceLevel,
  INTELLIGENCE_TIERS, estimateComplexity,
} from "./types";

export interface AutonomousStep {
  stepNumber: number;
  department: DepartmentId;
  task: string;
  status: "pending" | "running" | "complete" | "failed" | "skipped";
  result?: string;
  tokens?: number;
  durationMs?: number;
  imageUrl?: string;
}

export interface AutonomousPlan {
  goal: string;
  steps: AutonomousStep[];
  currentStep: number;
  totalTokens: number;
  status: "planning" | "executing" | "evaluating" | "complete" | "failed" | "cancelled";
  finalOutput?: string;
}

const OPS_PLAN_PROMPT = `You are the Ops Manager. Break complex goals into executable steps.

DEPARTMENTS: research, coder, artist, writer

Respond with ONLY valid JSON:
{"steps":[{"department":"research","task":"Detailed task"},{"department":"writer","task":"Detailed task"}]}

RULES: 2-6 steps max. Each step builds on the previous. Be specific. Order logically.`;

const OPS_EVAL_PROMPT = `You are the Ops Manager evaluating a step result.

Respond with ONLY valid JSON:
{"decision":"continue|adjust|retry|complete","reason":"Brief explanation"}

continue = next step (DEFAULT). adjust = change remaining steps. retry = redo step. Always continue unless step completely failed.`;

export async function runAutonomous(
  parentJobId: string,
  goal: string,
  level: IntelligenceLevel,
  signal?: AbortSignal,
): Promise<AutonomousPlan> {
  const bossModel = INTELLIGENCE_TIERS[level].bossModel;
  const plan: AutonomousPlan = {
    goal, steps: [], currentStep: 0, totalTokens: 0, status: "planning",
  };

  try {
    // Phase 1: Generate the plan
    eventBus.emit(parentJobId, "autonomous_status", {
      status: "planning", message: "Ops Manager creating execution plan...",
    });

    const planResult = await modelRouter.chat({
      model: bossModel,
      messages: [{ role: "user", content: `Goal: ${goal}` }],
      systemPrompt: OPS_PLAN_PROMPT,
      signal,
    });
    plan.totalTokens += planResult.usage.totalTokens;

    const planJson = extractJson(planResult.content);
    if (!planJson || !Array.isArray(planJson.steps)) {
      throw new Error("Ops Manager failed to create a valid plan");
    }

    const validDepts: DepartmentId[] = ["research", "coder", "artist", "writer"];
    plan.steps = planJson.steps
      .filter((s: any) => validDepts.includes(s.department) && s.task)
      .map((s: any, i: number) => ({
        stepNumber: i + 1, department: s.department as DepartmentId,
        task: s.task, status: "pending" as const,
      }));

    if (plan.steps.length === 0) throw new Error("Ops Manager created an empty plan");

    eventBus.emit(parentJobId, "autonomous_plan", {
      goal,
      steps: plan.steps.map(s => ({
        stepNumber: s.stepNumber, department: s.department,
        task: s.task.slice(0, 200), status: s.status,
      })),
      totalSteps: plan.steps.length,
    });

    // Phase 2: Execute each step
    plan.status = "executing";
    let previousOutput = "";

    for (let i = 0; i < plan.steps.length; i++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const step = plan.steps[i];
      plan.currentStep = i + 1;
      step.status = "running";

      eventBus.emit(parentJobId, "autonomous_step", {
        stepNumber: step.stepNumber, totalSteps: plan.steps.length,
        department: step.department, task: step.task.slice(0, 200),
        status: "running",
        message: `Step ${step.stepNumber}/${plan.steps.length}: ${step.department} department working...`,
      });

      const stepStart = Date.now();
      try {
        const taskWithContext = previousOutput
          ? `${step.task}\n\nContext from previous steps:\n${previousOutput.slice(0, 3000)}`
          : step.task;

        const result: DepartmentResult = await executeDepartment(
          parentJobId, { department: step.department, task: taskWithContext },
          level, estimateComplexity(taskWithContext), signal,
        );

        step.status = "complete";
        step.result = result.finalOutput;
        step.tokens = result.totalTokens;
        step.durationMs = Date.now() - stepStart;
        step.imageUrl = result.imageUrl;
        plan.totalTokens += result.totalTokens;
        previousOutput = result.finalOutput;

        const chunks = chunkText(result.finalOutput, 40);
        for (const chunk of chunks) {
          eventBus.emit(parentJobId, "token", {
            workerType: step.department, text: chunk,
            isAutonomous: true, stepNumber: step.stepNumber,
          });
        }

        eventBus.emit(parentJobId, "autonomous_step", {
          stepNumber: step.stepNumber, totalSteps: plan.steps.length,
          department: step.department, status: "complete",
          tokens: result.totalTokens, durationMs: step.durationMs,
          outputPreview: result.finalOutput.slice(0, 300),
          imageUrl: result.imageUrl,
        });

      } catch (err: any) {
        if (err?.name === "AbortError") throw err;
        step.status = "failed";
        step.durationMs = Date.now() - stepStart;
        eventBus.emit(parentJobId, "autonomous_step", {
          stepNumber: step.stepNumber, totalSteps: plan.steps.length,
          department: step.department, status: "failed", error: err.message,
        });
        console.warn(`[Autonomous] Step ${step.stepNumber} failed: ${err.message}`);
        continue;
      }

      // Phase 3: Evaluate after each step (except last)
      if (i < plan.steps.length - 1) {
        plan.status = "evaluating";
        eventBus.emit(parentJobId, "autonomous_status", {
          status: "evaluating", message: "Ops Manager evaluating results...",
        });
        try {
          const evalResult = await modelRouter.chat({
            model: bossModel,
            messages: [{
              role: "user",
              content: `Goal: ${goal}\n\nCompleted step ${step.stepNumber}: ${step.task}\n\nResult:\n${(step.result || "").slice(0, 2000)}\n\nRemaining steps: ${plan.steps.slice(i + 1).map(s => `${s.stepNumber}. [${s.department}] ${s.task}`).join("\n")}`,
            }],
            systemPrompt: OPS_EVAL_PROMPT,
            signal,
          });
          plan.totalTokens += evalResult.usage.totalTokens;
          const evalJson = extractJson(evalResult.content);
          if (evalJson) {
            eventBus.emit(parentJobId, "autonomous_evaluation", {
              decision: evalJson.decision, reason: evalJson.reason, stepNumber: step.stepNumber,
            });
            // Log decision but always continue — all planned steps run
          }
        } catch { /* evaluation failed, continue */ }
        plan.status = "executing";
      }
    }

    // Phase 4: Synthesize final output
    plan.status = "complete";
    const completedSteps = plan.steps.filter(s => s.status === "complete");
    const stepOutputs = completedSteps
      .map(s => `--- STEP ${s.stepNumber} [${s.department}] ---\n${s.result || "(no output)"}`)
      .join("\n\n");

    eventBus.emit(parentJobId, "autonomous_status", {
      status: "synthesizing", message: "Ops Manager compiling final deliverable...",
    });

    const synthesisResult = await modelRouter.chat({
      model: bossModel,
      messages: [{
        role: "user",
        content: `Compile results into a polished final deliverable.\n\nGoal: ${goal}\n\nStep outputs:\n${stepOutputs}\n\nPresent as a clean final result with markdown.`,
      }],
      systemPrompt: "Synthesize all step outputs into one polished deliverable.",
      signal,
    });
    plan.totalTokens += synthesisResult.usage.totalTokens;
    plan.finalOutput = synthesisResult.content;

    const finalChunks = chunkText(synthesisResult.content, 40);
    for (const chunk of finalChunks) {
      eventBus.emit(parentJobId, "token", {
        workerType: "boss", text: chunk, isSynthesis: true,
      });
    }

    return plan;
  } catch (err: any) {
    if (err?.name === "AbortError") { plan.status = "cancelled"; throw err; }
    plan.status = "failed";
    throw err;
  }
}

function extractJson(text: string): any | null {
  const fenceMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (fenceMatch) { try { return JSON.parse(fenceMatch[1]); } catch {} }
  const firstBrace = text.indexOf("{");
  if (firstBrace !== -1) {
    let depth = 0;
    for (let i = firstBrace; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") { depth--; if (depth === 0) { try { return JSON.parse(text.slice(firstBrace, i + 1)); } catch {} break; } }
    }
  }
  return null;
}

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}
