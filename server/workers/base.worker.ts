import { Worker, Job } from "bullmq";
import { redisConnectionOpts } from "../lib/redis";
import { redis } from "../lib/redis";
import { modelRouter } from "../lib/modelRouter";
import { getDefaultModel } from "../lib/modelDefaults";
import { WORKER_PROMPTS } from "./prompts";
import { recordStep, clearJobHistory } from "../watchdog";
import type { WorkerType } from "../queues";
import { v4 as uuidv4 } from "uuid";

export interface WorkerJobData {
  jobId: string;          // Our agent_jobs.id (UUID)
  conversationId: string;
  userId: number;
  task: string;
  context?: string;       // Output from parent/previous workers
  model?: string;
  workerType: WorkerType;
}

export interface WorkerJobResult {
  output: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  model: string;
  provider: string;
}

/**
 * Publish a streaming event to Redis pub/sub for the SSE endpoint.
 */
async function publishEvent(jobId: string, event: string, data: any) {
  await redis.publish(
    `job:${jobId}:tokens`,
    JSON.stringify({ event, data })
  );
}

/**
 * Create a BullMQ Worker for a given worker type.
 * Uses the modelRouter with per-worker default models and fallback chains.
 */
export function createAgentWorker(workerType: WorkerType, queueName: string): Worker<WorkerJobData, WorkerJobResult> {
  const worker = new Worker<WorkerJobData, WorkerJobResult>(
    queueName,
    async (job: Job<WorkerJobData, WorkerJobResult>) => {
      const { jobId, task, context, conversationId, userId } = job.data;
      const { storage } = await import("../storage");

      // Check for user-specific agent config (custom model/prompt with multi-model support)
      let customModel: string | null = null;
      let customPrompt: string | null = null;
      let modelsList: string[] = [];
      try {
        const config = await storage.getAgentConfig(userId, workerType);
        if (config) {
          // Parse multi-model array, fall back to single model
          if (config.models) {
            try { modelsList = JSON.parse(config.models); } catch { modelsList = []; }
          }
          if (modelsList.length === 0 && config.model) {
            modelsList = [config.model];
          }
          customModel = modelsList[0] || config.model || null;
          customPrompt = config.systemPrompt || null;
        }
      } catch { /* config lookup is non-critical */ }

      // Auto-route: pick best model from the list based on task complexity
      function pickBestModel(models: string[], taskText: string): string {
        if (models.length <= 1) return models[0] || "";
        // Simple heuristic: long/complex tasks → use first (most capable) model
        // Short/simple tasks → use cheapest model
        const cheapIndicators = ["$"];
        const isSimple = taskText.length < 200 && !taskText.includes("complex") && !taskText.includes("analyze") && !taskText.includes("reason");
        if (isSimple) {
          // Pick the last model (convention: user adds cheaper models later, or just pick last)
          return models[models.length - 1];
        }
        return models[0]; // Default: first model is most capable
      }

      // Priority: multi-model auto-route > single model > job-specified > per-worker default
      const workerModel = modelsList.length > 1
        ? pickBestModel(modelsList, task)
        : (customModel || job.data.model || getDefaultModel(workerType));
      const startTime = Date.now();

      await publishEvent(jobId, "progress", {
        workerType,
        status: "running",
        message: `${workerType} is working...`,
        model: workerModel,
      });

      // Update agent_jobs status to running
      await storage.updateAgentJob(jobId, { status: "running" });

      const systemPrompt = customPrompt || WORKER_PROMPTS[workerType];
      const fullPrompt = context
        ? `${task}\n\nContext from previous steps:\n${context}`
        : task;

      try {
        // Try the selected model first, then fall back through the models list
        let result: any = null;
        let lastError: any = null;
        const modelsToTry = modelsList.length > 1
          ? [workerModel, ...modelsList.filter(m => m !== workerModel)]
          : [workerModel];

        for (const tryModel of modelsToTry) {
          try {
            result = await modelRouter.chat({
              model: tryModel,
              messages: [{ role: "user", content: fullPrompt }],
              systemPrompt,
            });
            if (tryModel !== workerModel) {
              result.fallbackUsed = tryModel;
            }
            break;
          } catch (err: any) {
            lastError = err;
            await publishEvent(jobId, "fallback", {
              workerType,
              originalModel: tryModel,
              reason: `Model ${tryModel} failed — trying next`,
            });
            continue;
          }
        }

        if (!result) throw lastError;

        // Emit fallback event if a fallback model was used
        if (result.fallbackUsed) {
          await publishEvent(jobId, "fallback", {
            workerType,
            originalModel: workerModel,
            fallbackModel: result.fallbackUsed,
            reason: "Provider error — switched to fallback",
          });
        }

        // Stream the response as tokens (simulate chunked delivery for SSE)
        const chunks = chunkText(result.content, 20);
        for (const chunk of chunks) {
          await publishEvent(jobId, "token", {
            workerType,
            text: chunk,
          });
        }

        const durationMs = Date.now() - startTime;

        // Record in watchdog
        await recordStep(
          parseInt(jobId.replace(/\D/g, "").slice(0, 8)) || 1,
          0,
          task,
          result.content
        );

        // Update agent_jobs to complete
        await storage.updateAgentJob(jobId, {
          status: "complete",
          output: JSON.stringify({ text: result.content }),
          tokenCount: result.usage.totalTokens,
          durationMs,
          completedAt: Date.now(),
        });

        // Record token usage
        await storage.recordTokenUsage({
          userId,
          model: result.usage.model,
          inputTokens: result.usage.promptTokens,
          outputTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
          endpoint: `boss_worker_${workerType}`,
        });

        await publishEvent(jobId, "step_complete", {
          workerType,
          output: result.content,
          tokens: result.usage.totalTokens,
          durationMs,
          model: result.usage.model,
          provider: result.usage.provider,
        });

        return {
          output: result.content,
          inputTokens: result.usage.promptTokens,
          outputTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
          durationMs,
          model: result.usage.model,
          provider: result.usage.provider,
        };
      } catch (err: any) {
        const durationMs = Date.now() - startTime;

        const { storage } = await import("../storage");
        await storage.updateAgentJob(jobId, {
          status: "failed",
          output: JSON.stringify({ error: err.message }),
          durationMs,
          completedAt: Date.now(),
        });

        await publishEvent(jobId, "error", {
          workerType,
          error: err.message,
        });

        throw err;
      }
    },
    {
      ...redisConnectionOpts,
      concurrency: 3,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`[Worker:${workerType}] Job ${job?.id} failed:`, err.message);
  });

  worker.on("completed", (job) => {
    console.log(`[Worker:${workerType}] Job ${job.id} completed`);
  });

  return worker;
}

/** Split text into chunks for streaming simulation */
function chunkText(text: string, charsPerChunk: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += charsPerChunk) {
    chunks.push(text.slice(i, i + charsPerChunk));
  }
  return chunks;
}
