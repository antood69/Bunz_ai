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
  error?: string;
}

export interface AutonomousPlan {
  goal: string;
  steps: AutonomousStep[];
  currentStep: number;
  totalTokens: number;
  status: "planning" | "executing" | "complete" | "failed" | "cancelled";
  finalOutput?: string;
}

const OPS_PLAN_PROMPT = `You are the Ops Manager. Break complex goals into executable steps.

DEPARTMENTS: research (web research/data), coder (programming), artist (images), writer (content/docs)

Respond with ONLY valid JSON — no other text:
{"steps":[{"department":"research","task":"Detailed task"},{"department":"writer","task":"Detailed task"}]}

RULES: 2-6 steps max. Each builds on previous. Be specific. Order logically.`;

export async function runAutonomous(
  parentJobId: string,
  goal: string,
  level: IntelligenceLevel,
  signal?: AbortSignal,
  github?: { token: string; repo: string },
): Promise<AutonomousPlan> {
  const bossModel = INTELLIGENCE_TIERS[level].bossModel;
  const plan: AutonomousPlan = {
    goal, steps: [], currentStep: 0, totalTokens: 0, status: "planning",
  };

  try {
    // Phase 1: Generate the plan
    eventBus.emit(parentJobId, "progress", {
      workerType: "boss", status: "running",
      message: "Ops Manager creating execution plan...",
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

    // Emit plan summary as a token so user sees it
    const planSummary = plan.steps.map(s =>
      `**Step ${s.stepNumber}** [${s.department}]: ${s.task.slice(0, 100)}`
    ).join("\n");
    eventBus.emit(parentJobId, "token", {
      workerType: "boss", text: `\n📋 **Execution Plan** (${plan.steps.length} steps):\n${planSummary}\n\n---\n`,
    });

    // Phase 2: Execute each step sequentially
    plan.status = "executing";
    let previousOutput = "";

    for (let i = 0; i < plan.steps.length; i++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const step = plan.steps[i];
      plan.currentStep = i + 1;
      step.status = "running";

      // Emit progress event that the CLIENT understands
      eventBus.emit(parentJobId, "progress", {
        workerType: step.department,
        subAgent: `Step ${step.stepNumber}`,
        workerIndex: i,
        status: "running",
        message: `Step ${step.stepNumber}/${plan.steps.length}: ${step.department} working...`,
      });

      // Also stream a header so user sees what's happening
      eventBus.emit(parentJobId, "token", {
        workerType: step.department,
        text: `\n🔄 **Step ${step.stepNumber}: ${step.department.toUpperCase()}**\n`,
        isAutonomous: true,
      });

      const stepStart = Date.now();
      try {
        const taskWithContext = previousOutput
          ? `${step.task}\n\nContext from previous steps:\n${previousOutput.slice(0, 2000)}`
          : step.task;

        const result: DepartmentResult = await executeDepartment(
          parentJobId, { department: step.department, task: taskWithContext },
          level, estimateComplexity(taskWithContext), signal,
          step.department === "coder" ? github : undefined,
        );

        step.status = "complete";
        step.result = result.finalOutput;
        step.tokens = result.totalTokens;
        step.durationMs = Date.now() - stepStart;
        step.imageUrl = result.imageUrl;
        plan.totalTokens += result.totalTokens;
        previousOutput = result.finalOutput;

        // Emit step_complete that the CLIENT understands
        eventBus.emit(parentJobId, "step_complete", {
          workerType: step.department,
          subAgent: `Step ${step.stepNumber}`,
          workerIndex: i,
          output: result.finalOutput.slice(0, 500),
          tokens: result.totalTokens,
          durationMs: step.durationMs,
        });

      } catch (err: any) {
        if (err?.name === "AbortError") throw err;
        step.status = "failed";
        step.error = err.message;
        step.durationMs = Date.now() - stepStart;

        console.error(`[Autonomous] Step ${step.stepNumber} FAILED: ${err.message}`);

        // Emit the error so client sees it
        eventBus.emit(parentJobId, "step_complete", {
          workerType: step.department,
          subAgent: `Step ${step.stepNumber}`,
          workerIndex: i,
          status: "error",
          error: err.message,
          durationMs: step.durationMs,
        });

        eventBus.emit(parentJobId, "token", {
          workerType: step.department,
          text: `\n❌ Step ${step.stepNumber} failed: ${err.message}\n`,
        });

        // Continue to next step despite failure
        continue;
      }
    }

    // Phase 3: Synthesize final output
    plan.status = "complete";
    const completedSteps = plan.steps.filter(s => s.status === "complete");
    const stepOutputs = completedSteps
      .map(s => `--- STEP ${s.stepNumber} [${s.department}] ---\n${s.result || "(no output)"}`)
      .join("\n\n");

    eventBus.emit(parentJobId, "progress", {
      workerType: "boss", status: "running",
      message: "Ops Manager compiling final deliverable...",
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
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(text.slice(firstBrace, i + 1)); } catch {}
          break;
        }
      }
    }
  }
  return null;
}

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}
