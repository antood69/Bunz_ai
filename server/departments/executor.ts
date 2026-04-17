/**
 * Department Executor — runs sub-agents within a department.
 * Lead does main work → Support refines → Reviewer checks → output to Boss.
 */

import { modelRouter } from "../lib/modelRouter";
import { runCoderAgent } from "../agents/coder";
import { runArtAgent } from "../agents/art";
import { eventBus } from "../lib/eventBus";
import { chunkText } from "../lib/utils";
import fs from "fs";
import path from "path";
import {
  type DepartmentId, type IntelligenceLevel, type TaskComplexity,
  DEPARTMENTS, getModel, getActiveSubAgents,
} from "./types";
import { startTrace, type TraceInput } from "../traces";

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
  traceContext?: { userId?: number; source?: string; sourceId?: string; sourceName?: string; parentTraceId?: string },
): Promise<DepartmentResult> {
  const dept = DEPARTMENTS[task.department];
  const activeAgents = getActiveSubAgents(task.department, complexity);
  const startTime = Date.now();

  // Start trace for this department execution
  const userId = traceContext?.userId || 1;
  const { traceId, finish } = startTrace({
    userId,
    source: (traceContext?.source || "boss") as any,
    sourceId: traceContext?.sourceId || parentJobId,
    sourceName: traceContext?.sourceName,
    department: task.department,
    model: getModel(task.department, level, activeAgents[0]?.id || "lead"),
    provider: detectProvider(getModel(task.department, level, activeAgents[0]?.id || "lead")),
    inputPrompt: task.task,
    parentTraceId: traceContext?.parentTraceId,
  });

  try {
    let result: DepartmentResult;
    // Special routing for Artist (image gen) and Coder (tool use)
    if (task.department === "artist") {
      result = await runArtistDept(parentJobId, task, activeAgents, level, signal);
    } else if (task.department === "coder") {
      result = await runCoderDept(parentJobId, task, activeAgents, level, signal, github);
    } else {
      result = await runStandardDept(parentJobId, task, activeAgents, level, signal);
    }

    // Finish trace with success
    await finish({
      outputPreview: result.finalOutput,
      totalTokens: result.totalTokens,
      inputTokens: Math.floor(result.totalTokens * 0.3),
      outputTokens: Math.floor(result.totalTokens * 0.7),
      status: "success",
      metadata: {
        subAgents: result.subAgentResults.map(r => ({
          id: r.agentId, label: r.label, tokens: r.tokens, durationMs: r.durationMs,
        })),
        imageUrl: result.imageUrl,
      },
    });

    return result;
  } catch (err: any) {
    await finish({
      status: "error",
      error: err.message,
      totalTokens: 0,
    });
    throw err;
  }
}

function detectProvider(model: string): string {
  if (model.includes("claude")) return "anthropic";
  if (model.includes("gpt") || model.includes("o1") || model.includes("o3") || model.includes("o4")) return "openai";
  if (model.includes("gemini") || model.includes("gemma")) return "google";
  if (model.includes("sonar")) return "perplexity";
  if (model.includes("mistral")) return "mistral";
  return "unknown";
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

  // Detect how many images requested (default 1, max 3)
  const countMatch = task.task.match(/(\d+)\s*(?:images?|variations?|versions?|options?)/i);
  const imageCount = Math.min(Math.max(countMatch ? parseInt(countMatch[1]) : 1, 1), 3);

  const artModel = getModel("artist", level);
  const allImageUrls: string[] = [];
  let firstImageUrl: string | undefined;
  let firstType: string | undefined;
  let allContent = "";

  for (let imgIdx = 0; imgIdx < imageCount; imgIdx++) {
    const label = imageCount > 1 ? `Image ${imgIdx + 1}/${imageCount}` : "Lead Artist";
    eventBus.emit(parentJobId, "progress", {
      workerType: "artist", subAgent: label, workerIndex: results.length,
      status: "running", message: `Generating ${label.toLowerCase()}...`, model: artModel,
    });

    const artStart = Date.now();
    // Vary the prompt slightly for multiple images
    const variedPrompt = imageCount > 1 && imgIdx > 0
      ? `${imagePrompt}\n\n(Create a different variation — variation ${imgIdx + 1} of ${imageCount})`
      : imagePrompt;

    const artResult = await runArtAgent({ task: variedPrompt, context: task.context, model: artModel, signal });

    const artAgentResult: SubAgentResult = {
      agentId: `artist_${imgIdx}`, label,
      content: artResult.content, tokens: artResult.usage.totalTokens,
      durationMs: Date.now() - artStart, imageUrl: artResult.imageUrl, type: artResult.type,
    };
    results.push(artAgentResult);
    totalTokens += artResult.usage.totalTokens;
    allContent += (allContent ? "\n\n" : "") + artResult.content;

    if (artResult.imageUrl) {
      let servedUrl = artResult.imageUrl;
      if (artResult.imageUrl.startsWith("data:image/")) {
        try {
          const b64 = artResult.imageUrl.replace(/^data:image\/\w+;base64,/, "");
          const imgDir = path.join(process.cwd(), "dist", "public", "generated");
          if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
          const imgName = `img_${parentJobId.slice(0, 8)}_${Date.now()}_${imgIdx}.png`;
          fs.writeFileSync(path.join(imgDir, imgName), Buffer.from(b64, "base64"));
          servedUrl = `/generated/${imgName}`;
        } catch (e: any) { console.error("[Artist] Failed to save image:", e.message); }
      }
      eventBus.emit(parentJobId, "agent_image", {
        workerType: "artist", imageUrl: servedUrl, prompt: variedPrompt,
      });
      artAgentResult.imageUrl = servedUrl;
      allImageUrls.push(servedUrl);
      if (!firstImageUrl) { firstImageUrl = servedUrl; firstType = artResult.type; }
    }

    eventBus.emit(parentJobId, "step_complete", {
      workerType: "artist", subAgent: label, workerIndex: results.length - 1,
      output: artResult.content.slice(0, 300), tokens: artResult.usage.totalTokens,
      imageUrl: artResult.imageUrl, type: artResult.type,
    });
  }

  return {
    department: "artist", finalOutput: allContent, subAgentResults: results,
    totalTokens, totalDurationMs: Date.now() - startTime,
    imageUrl: firstImageUrl, type: (firstType as "text" | "image" | undefined),
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

