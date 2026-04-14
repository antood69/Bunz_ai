import type { Request, Response } from "express";
import { createSubscriber } from "./lib/redis";

/**
 * SSE endpoint handler: GET /api/agent/stream/:jobId
 *
 * Subscribes to Redis pub/sub channel `job:{jobId}:tokens` and forwards events
 * to the client as SSE. Event types: token, progress, step_complete, complete, error.
 */
export function handleSSEStream(req: Request, res: Response) {
  const { jobId } = req.params;
  if (!jobId) {
    return res.status(400).json({ error: "jobId required" });
  }

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // Disable nginx buffering
  });
  res.flushHeaders();

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ jobId })}\n\n`);

  // Subscribe to the job's token channel
  const subscriber = createSubscriber();
  const channel = `job:${jobId}:tokens`;

  subscriber.subscribe(channel, (err) => {
    if (err) {
      console.error(`[SSE] Subscribe error for ${channel}:`, err.message);
      res.write(`event: error\ndata: ${JSON.stringify({ error: "Subscribe failed" })}\n\n`);
      res.end();
      return;
    }
  });

  subscriber.on("message", (_ch: string, message: string) => {
    try {
      const parsed = JSON.parse(message);
      const eventType = parsed.event || "token";
      const data = parsed.data || parsed;

      res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);

      // If this is a terminal event for the whole job, close the stream
      if (eventType === "complete" || eventType === "cancelled" || (eventType === "error" && !data.workerType)) {
        setTimeout(() => {
          subscriber.unsubscribe(channel);
          subscriber.quit();
          res.end();
        }, 100);
      }
    } catch {
      // Ignore malformed messages
    }
  });

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(`:heartbeat\n\n`);
  }, 15000);

  // Clean up on client disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    subscriber.unsubscribe(channel).catch(() => {});
    subscriber.quit().catch(() => {});
  });
}
