/**
 * Department Executor — runs sub-agents within a department.
 * Lead does main work → Support refines → Reviewer checks → output to Boss.
 */

import { modelRouter } from "../lib/modelRouter";
import { runCoderAgent } from "../agents/coder";
import { runArtAgent } from "../agents/art";
import { eventBus } from "../lib/eventBus";
import {
  type DepartmentId, type IntelligenceLevel, type TaskComplexity,
  DEPARTMENTS, getModel, getActiveSubAgents, estimateComplexity,
} from "./types";

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface DepartmentTask {
  department: DepartmentId;
  task: string;
  context?: string;
}

export interface SubAgentResult {
  agentId: string;
  label: string;
  content: string;
  tokens: number;
  durationMs: number;
  imageUrl?: string;
  type?: "text" | "image";
}

export interface DepartmentResult {
  department: DepartmentId;
  finalOutput: string;
  subAgentResults: SubAgentResult[];
  totalTokens: number;
  totalDurationMs: number;
  imageUrl?: string;
  type?: "text" | "image";
}

// ── Main: Execute a Department ──────────────────────────────────────────────

export async function executeDepartment(
  parentJobId: string,
  task: DepartmentTask,
  level: IntelligenceLevel,
  complexity: TaskComplexity,
  signal?: AbortSignal,
  github?: { token: string; repo: string },
): Promise<DepartmentResult> {
  const dept = DEPARTMENTS[task.department];
  const activeAgents = getActiveSubAgents(task.department, complexity);
  const startTime = Date.now();

  // Special routing for Artist (image gen) and Coder (tool use)
  if (task.department === "artist") return runArtistDept(parentJobId, task, activeAgents, level, signal);
  if (task.department === "coder") return runCoderDept(parentJobId, task, activeAgents, level, signal, github);

  // Standard departments (Research, Writer): run sub-agents in sequence
  return runStandardDept(parentJobId, task, activeAgents, level, signal);
}

// ── Standard Department (Research / Writer) ─────────────────────────────────

async function runStandardDept(
  parentJobId: string,
  task: DepartmentTask,
  agents: ReturnType<typeof getActiveSubAgents>,
  level: IntelligenceLevel,
  signal?: AbortSignal,
): Promise<DepartmentResult> {
  const results: SubAgentResult[] = [];
  let totalTokens = 0;
  const startTime = Date.now();
  let previousOutput = "";

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const model = getModel(task.department, level, agent.id);

    // Notify: sub-agent starting
    eventBus.emit(parentJobId, "progress", {
      workerType: task.department,
      subAgent: agent.label,
      workerIndex: i,
      status: "running",
      message: `${agent.label} is working...`,
      model,
    });

    const agentStart = Date.now();
    try {
      // First agent gets the task; subsequent agents get previous output as context
      let prompt: string;
      if (previousOutput) {
        prompt = `ORIGINAL TASK:\n${task.task}\n\nPREVIOUS OUTPUT:\n${previousOutput}\n\nYour job: Review, refine, or extend the above according to your role.`;
      } else {
        prompt = task.context ? `${task.task}\n\nContext:\n${task.context}` : task.task;
      }

      const result = await modelRouter.chat({
        model,
        messages: [{ role: "user", content: prompt }],
        systemPrompt: agent.systemPrompt,
        signal,
      });

      const durationMs = Date.now() - agentStart;
      const agentResult: SubAgentResult = {
        agentId: agent.id, label: agent.label,
        content: result.content, tokens: result.usage.totalTokens, durationMs,
      };

      results.push(agentResult);
      totalTokens += result.usage.totalTokens;
      previousOutput = result.content;

      // Stream tokens to client
      const chunks = chunkText(result.content, 30);
      for (const chunk of chunks) {
        eventBus.emit(parentJobId, "token", {
          workerType: task.department, subAgent: agent.label, workerIndex: i, text: chunk,
        });
      }

      eventBus.emit(parentJobId, "step_complete", {
        workerType: task.department, subAgent: agent.label, workerIndex: i,
        output: result.content.slice(0, 500), tokens: result.usage.totalTokens,
        durationMs, model: result.usage.model,
      });

    } catch (err: any) {
      if (err?.name === "AbortError") throw err;
      eventBus.emit(parentJobId, "step_complete", {
        workerType: task.department, subAgent: agent.label, workerIndex: i,
        status: "error", error: err.message, durationMs: Date.now() - agentStart,
      });
      // Lead failure = department failure
      if (agent.required) throw err;
      console.warn(`[Dept:${task.department}] ${agent.label} failed: ${err.message}, skipping`);
    }
  }

  return {
    department: task.department,
    finalOutput: previousOutput,
    subAgentResults: results,
    totalTokens,
    totalDurationMs: Date.now() - startTime,
  };
}

// ── Artist Department ───────────────────────────────────────────────────────

async function runArtistDept(
  parentJobId: string,
  task: DepartmentTask,
  agents: ReturnType<typeof getActiveSubAgents>,
  level: IntelligenceLevel,
  signal?: AbortSignal,
): Promise<DepartmentResult> {
  const results: SubAgentResult[] = [];
  let totalTokens = 0;
  const startTime = Date.now();
  let imagePrompt = task.task;

  // Style Director enhances the prompt first (if active)
  const styleDir = agents.find(a => a.id === "style_director");
  if (styleDir) {
    const sdModel = getModel("writer", level, "style_director"); // text model for prompt enhancement
    eventBus.emit(parentJobId, "progress", {
      workerType: "artist", subAgent: styleDir.label, workerIndex: 0,
      status: "running", message: "Style Director enhancing prompt...", model: sdModel,
    });

    try {
      const sdResult = await modelRouter.chat({
        model: sdModel,
        messages: [{ role: "user", content: `Enhance this image generation prompt. Output ONLY the enhanced prompt, nothing else:\n\n${task.task}` }],
        systemPrompt: styleDir.systemPrompt,
        signal,
      });
      imagePrompt = sdResult.content;
      const sdAgentResult: SubAgentResult = {
        agentId: styleDir.id, label: styleDir.label,
        content: sdResult.content, tokens: sdResult.usage.totalTokens,
        durationMs: Date.now() - startTime,
      };
      results.push(sdAgentResult);
      totalTokens += sdResult.usage.totalTokens;

      eventBus.emit(parentJobId, "step_complete", {
        workerType: "artist", subAgent: styleDir.label, workerIndex: 0,
        output: sdResult.content.slice(0, 300), tokens: sdResult.usage.totalTokens,
      });
    } catch (err: any) {
      console.warn(`[Artist] Style Director failed: ${err.message}, using original prompt`);
    }
  }

  // Lead Artist generates the image
  const artModel = getModel("artist", level);
  eventBus.emit(parentJobId, "progress", {
    workerType: "artist", subAgent: "Lead Artist", workerIndex: results.length,
    status: "running", message: "Generating image...", model: artModel,
  });

  const artStart = Date.now();
  const artResult = await runArtAgent({ task: imagePrompt, context: task.context, model: artModel, signal });

  const artAgentResult: SubAgentResult = {
    agentId: "lead_artist", label: "Lead Artist",
    content: artResult.content, tokens: artResult.usage.totalTokens,
    durationMs: Date.now() - artStart, imageUrl: artResult.imageUrl, type: artResult.type,
  };
  results.push(artAgentResult);
  totalTokens += artResult.usage.totalTokens;

  if (artResult.imageUrl) {
    eventBus.emit(parentJobId, "agent_image", {
      workerType: "artist", imageUrl: artResult.imageUrl, prompt: imagePrompt,
    });
  }

  eventBus.emit(parentJobId, "step_complete", {
    workerType: "artist", subAgent: "Lead Artist", workerIndex: results.length - 1,
    output: artResult.content.slice(0, 300), tokens: artResult.usage.totalTokens,
    imageUrl: artResult.imageUrl, type: artResult.type,
  });

  return {
    department: "artist", finalOutput: artResult.content, subAgentResults: results,
    totalTokens, totalDurationMs: Date.now() - startTime,
    imageUrl: artResult.imageUrl, type: artResult.type,
  };
}

// ── Coder Department ────────────────────────────────────────────────────────

async function runCoderDept(
  parentJobId: string,
  task: DepartmentTask,
  agents: ReturnType<typeof getActiveSubAgents>,
  level: IntelligenceLevel,
  signal?: AbortSignal,
  github?: { token: string; repo: string },
): Promise<DepartmentResult> {
  const results: SubAgentResult[] = [];
  let totalTokens = 0;
  const startTime = Date.now();

  // Lead Developer (with GitHub tools if available)
  const leadModel = getModel("coder", level, "lead_developer");
  eventBus.emit(parentJobId, "progress", {
    workerType: "coder", subAgent: "Lead Developer", workerIndex: 0,
    status: "running", message: "Lead Developer working...", model: leadModel,
  });

  const devStart = Date.now();
  const coderResult = await runCoderAgent({
    task: task.task, context: task.context, model: leadModel, signal, github,
    onProgress: (event, data) => {
      eventBus.emit(parentJobId, "tool_use", { workerType: "coder", subAgent: "Lead Developer", event, ...data });
    },
  });

  let devContent = coderResult.content;
  if (coderResult.commits?.length) {
    devContent += "\n\n**Commits:**\n" + coderResult.commits.map(c => `- [\`${c.sha.slice(0,7)}\`](${c.url}) ${c.message}`).join("\n");
  }
  if (coderResult.pullRequests?.length) {
    devContent += "\n\n**Pull Requests:**\n" + coderResult.pullRequests.map(pr => `- [#${pr.number}](${pr.url}) ${pr.title}`).join("\n");
  }

  results.push({
    agentId: "lead_developer", label: "Lead Developer",
    content: devContent, tokens: coderResult.usage.totalTokens,
    durationMs: Date.now() - devStart,
  });
  totalTokens += coderResult.usage.totalTokens;

  eventBus.emit(parentJobId, "step_complete", {
    workerType: "coder", subAgent: "Lead Developer", workerIndex: 0,
    output: devContent.slice(0, 500), tokens: coderResult.usage.totalTokens,
  });

  // Code Reviewer (if complexity warrants it)
  const reviewer = agents.find(a => a.id === "code_reviewer");
  if (reviewer) {
    const revModel = getModel("coder", level, "code_reviewer");
    eventBus.emit(parentJobId, "progress", {
      workerType: "coder", subAgent: reviewer.label, workerIndex: 1,
      status: "running", message: "Code Reviewer checking...", model: revModel,
    });
    const revStart = Date.now();
    try {
      const revResult = await modelRouter.chat({
        model: revModel,
        messages: [{ role: "user", content: `Review this code output:\n\n${devContent}` }],
        systemPrompt: reviewer.systemPrompt,
        signal,
      });
      results.push({
        agentId: reviewer.id, label: reviewer.label,
        content: revResult.content, tokens: revResult.usage.totalTokens,
        durationMs: Date.now() - revStart,
      });
      totalTokens += revResult.usage.totalTokens;

      eventBus.emit(parentJobId, "step_complete", {
        workerType: "coder", subAgent: reviewer.label, workerIndex: 1,
        output: revResult.content.slice(0, 500), tokens: revResult.usage.totalTokens,
      });
    } catch (err: any) {
      console.warn(`[Coder] Code Reviewer failed: ${err.message}, skipping`);
    }
  }

  // Junior Dev for tests (if present)
  const junior = agents.find(a => a.id === "junior_dev");
  if (junior) {
    const jrModel = getModel("coder", level, "junior_dev");
    eventBus.emit(parentJobId, "progress", {
      workerType: "coder", subAgent: junior.label, workerIndex: 2,
      status: "running", message: "Junior Dev writing tests...", model: jrModel,
    });
    const jrStart = Date.now();
    try {
      const jrResult = await modelRouter.chat({
        model: jrModel,
        messages: [{ role: "user", content: `Write tests and documentation for this code:\n\n${devContent}` }],
        systemPrompt: junior.systemPrompt,
        signal,
      });
      results.push({
        agentId: junior.id, label: junior.label,
        content: jrResult.content, tokens: jrResult.usage.totalTokens,
        durationMs: Date.now() - jrStart,
      });
      totalTokens += jrResult.usage.totalTokens;

      eventBus.emit(parentJobId, "step_complete", {
        workerType: "coder", subAgent: junior.label, workerIndex: 2,
        output: jrResult.content.slice(0, 500), tokens: jrResult.usage.totalTokens,
      });
    } catch (err: any) {
      console.warn(`[Coder] Junior Dev failed: ${err.message}, skipping`);
    }
  }

  // Final output combines Lead + review notes
  const finalOutput = results.map(r => `### ${r.label}\n${r.content}`).join("\n\n---\n\n");

  return {
    department: "coder", finalOutput, subAgentResults: results,
    totalTokens, totalDurationMs: Date.now() - startTime,
  };
}

// ── Utility ─────────────────────────────────────────────────────────────────

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}
