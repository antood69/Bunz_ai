/**
 * SSE endpoint handler — uses in-memory EventBus instead of Redis pub/sub.
 *
 * GET /api/agent/stream/:jobId
 *
 * Subscribes to the job's event channel and forwards events to the client as SSE.
 * Events are buffered so late-connecting clients get replay — no more dropped events.
 */

import type { Request, Response } from "express";
import { eventBus } from "./lib/eventBus";

export function handleSSEStream(req: Request, res: Response) {
  const { jobId } = req.params;
  if (!jobId) {
    return res.status(400).json({ error: "jobId required" });
  }

  // Check if job already completed before we even connect
  const lastEvent = eventBus.getLastEvent(jobId);
  if (lastEvent && ["complete", "cancelled", "error"].includes(lastEvent.event)) {
    // Job already done — send the final state immediately and close
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write(`event: connected\ndata: ${JSON.stringify({ jobId })}\n\n`);
    // Subscribe will replay all buffered events including the terminal one
    const unsub = eventBus.subscribe(jobId, (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    });
    unsub();
    setTimeout(() => res.end(), 100);
    return;
  }

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ jobId })}\n\n`);

  // Subscribe — this replays any buffered events then listens for new ones
  const unsub = eventBus.subscribe(jobId, (event, data) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      // Close stream on terminal events
      if (event === "complete" || event === "cancelled" || (event === "error" && !data?.workerType)) {
        setTimeout(() => {
          unsub();
          res.end();
        }, 100);
      }
    } catch {
      // Client disconnected — clean up silently
      unsub();
    }
  });

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    try { res.write(`:heartbeat\n\n`); } catch { clearInterval(heartbeat); }
  }, 15000);

  // Timeout: if job doesn't complete in 5 minutes, close the stream
  const timeout = setTimeout(() => {
    unsub();
    clearInterval(heartbeat);
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "Stream timeout (15min) — job may still be running" })}\n\n`);
      res.end();
    } catch {}
  }, 15 * 60 * 1000);

  // Clean up on client disconnect
  req.on("close", () => {
    unsub();
    clearInterval(heartbeat);
    clearTimeout(timeout);
  });
}
