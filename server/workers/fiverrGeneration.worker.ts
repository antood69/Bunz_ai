import { Worker, Queue, Job } from "bullmq";
import { redisConnectionOpts, redis } from "../lib/redis";
import { modelRouter } from "../lib/modelRouter";
import { v4 as uuidv4 } from "uuid";

export const FIVERR_QUEUE_NAME = "fiverr-generation-queue";

export const fiverrGenerationQueue = new Queue(FIVERR_QUEUE_NAME, {
  ...redisConnectionOpts,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential" as const, delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export interface FiverrJobData {
  orderId: string;
  templateId?: string;
  userId: number;
  feedback?: string; // For regeneration with feedback
}

async function publishEvent(orderId: string, event: string, data: any) {
  await redis.publish(
    `fiverr:${orderId}:progress`,
    JSON.stringify({ event, data })
  );
}

export function startFiverrGenerationWorker(): Worker<FiverrJobData> {
  const worker = new Worker<FiverrJobData>(
    FIVERR_QUEUE_NAME,
    async (job: Job<FiverrJobData>) => {
      const { orderId, templateId, userId, feedback } = job.data;
      const { storage } = await import("../storage");

      const order = await storage.getFiverrOrderV2(orderId);
      if (!order) throw new Error(`Order ${orderId} not found`);

      await publishEvent(orderId, "progress", {
        status: "running",
        message: "Starting AI generation...",
      });

      // Update order status to generation
      await storage.updateFiverrOrderV2(orderId, { status: "generation" });

      // Load template if specified
      let template: any = null;
      if (templateId) {
        template = await storage.getGigTemplate(templateId);
      }

      // Check if the template has a linked workflow — run that instead of direct generation
      if (template?.workflowId) {
        try {
          const workflow = await storage.getWorkflow(template.workflowId);
          if (workflow && (workflow as any).canvasState) {
            await publishEvent(orderId, "progress", {
              status: "generating",
              message: `Running workflow pipeline...`,
            });

            const { executeWorkflow } = await import("../workflowEngine");
            const canvas = JSON.parse((workflow as any).canvasState);
            const executionId = uuidv4();

            await storage.createWorkflowExecution({
              id: executionId,
              workflowId: template.workflowId,
              userId,
              status: "running",
              inputPrompt: `Order: ${order.gigTitle}\nSpecs: ${order.specs || "N/A"}\nBuyer: ${order.buyerName || "Anonymous"}`,
              startedAt: new Date().toISOString(),
            });

            const wfResult = await executeWorkflow(
              executionId,
              canvas.nodes || [],
              canvas.edges || [],
              userId,
              `Order: ${order.gigTitle}\nSpecs: ${order.specs || "N/A"}\nBuyer: ${order.buyerName || "Anonymous"}`
            );

            await storage.updateWorkflowExecution(executionId, {
              status: "completed",
              totalTokens: wfResult.totalTokens,
              completedAt: new Date().toISOString(),
            });

            await storage.updateFiverrOrderV2(orderId, {
              generatedOutput: wfResult.finalOutput,
              status: "quality_check",
              generationJobId: job.id,
            });

            await publishEvent(orderId, "complete", {
              status: "quality_check",
              message: "Workflow pipeline complete — deliverable ready for review",
              outputPreview: wfResult.finalOutput.slice(0, 200),
              tokens: wfResult.totalTokens,
            });

            return { output: wfResult.finalOutput, tokens: wfResult.totalTokens };
          }
        } catch (wfErr: any) {
          console.warn(`[FiverrWorker] Workflow execution failed, falling back to direct generation:`, wfErr.message);
          // Fall through to direct generation below
        }
      }

      const systemPrompt = template?.systemPrompt ||
        `You are a professional freelancer. Generate a high-quality deliverable based on the order specifications. Be thorough, professional, and deliver exactly what was requested. Format your output cleanly.`;

      let userMessage = `Order: ${order.gigTitle || "Freelance order"}\n\nSpecifications:\n${order.specs || order.buyerName || "No specific requirements provided"}\n\nBuyer: ${order.buyerName || "Anonymous"}`;

      if (feedback) {
        userMessage += `\n\n--- REVISION REQUESTED ---\nFeedback: ${feedback}\n\nPrevious output:\n${order.generatedOutput || "(no previous output)"}\n\nPlease regenerate based on this feedback.`;
      }

      const model = template?.defaultModel || "claude-sonnet";

      await publishEvent(orderId, "progress", {
        status: "generating",
        message: `Generating with ${model}...`,
        model,
      });

      try {
        const result = await modelRouter.chat({
          model,
          messages: [{ role: "user", content: userMessage }],
          systemPrompt,
        });

        // Store output and advance to quality_check
        await storage.updateFiverrOrderV2(orderId, {
          generatedOutput: result.content,
          status: "quality_check",
          generationJobId: job.id,
        });

        // Record token usage
        await storage.recordTokenUsage({
          userId,
          model: result.usage.model,
          inputTokens: result.usage.promptTokens,
          outputTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
          endpoint: "fiverr_generation",
        });

        await publishEvent(orderId, "complete", {
          status: "quality_check",
          message: "Deliverable ready for review",
          outputPreview: result.content.slice(0, 200),
          tokens: result.usage.totalTokens,
        });

        // Create in-app notification
        try {
          const { db } = await import("../storage");
          const { notifications } = await import("@shared/schema");
          await db.insert(notifications).values({
            userId,
            type: "workflow_complete",
            title: "Deliverable Ready",
            message: `AI-generated deliverable for "${order.gigTitle || "order"}" is ready for review.`,
            link: "/fiverr",
            createdAt: new Date().toISOString(),
          }).run();
        } catch (_) { /* notification is non-critical */ }

        return { output: result.content, tokens: result.usage.totalTokens };
      } catch (err: any) {
        await storage.updateFiverrOrderV2(orderId, { status: "intake" });
        await publishEvent(orderId, "error", {
          status: "error",
          message: `Generation failed: ${err.message}`,
        });
        throw err;
      }
    },
    {
      ...redisConnectionOpts,
      concurrency: 2,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`[FiverrWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on("completed", (job) => {
    console.log(`[FiverrWorker] Job ${job.id} completed`);
  });

  console.log("[Workers] Started fiverr-generation worker on", FIVERR_QUEUE_NAME);
  return worker;
}
