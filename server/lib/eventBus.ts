/**
 * In-Memory Event Bus — replaces Redis pub/sub for SSE streaming.
 *
 * Why: Redis pub/sub drops events if subscriber connects after publish.
 * This EventEmitter buffers events per job and replays them for late clients.
 * Single-process (Railway) = no need for cross-process messaging.
 */

import { EventEmitter } from "events";

type EventCallback = (event: string, data: any) => void;

class JobEventBus {
  private emitter = new EventEmitter();
  private jobBuffers = new Map<string, Array<{ event: string; data: any; ts: number }>>();

  constructor() {
    this.emitter.setMaxListeners(500);
  }

  /** Emit an event for a job. Buffers for late-connecting SSE clients. */
  emit(jobId: string, event: string, data: any): void {
    let buffer = this.jobBuffers.get(jobId);
    if (!buffer) {
      buffer = [];
      this.jobBuffers.set(jobId, buffer);
    }
    buffer.push({ event, data, ts: Date.now() });
    if (buffer.length > 300) buffer.shift();

    this.emitter.emit(`job:${jobId}`, event, data);

    // Clean up buffer 60s after terminal events
    if (event === "complete" || event === "cancelled" || event === "error") {
      setTimeout(() => this.jobBuffers.delete(jobId), 60_000);
    }
  }

  /** Subscribe to job events. Replays buffered events first. Returns unsubscribe fn. */
  subscribe(jobId: string, callback: EventCallback): () => void {
    const channel = `job:${jobId}`;
    const listener = (event: string, data: any) => callback(event, data);

    // Replay buffered events
    const buffer = this.jobBuffers.get(jobId);
    if (buffer) {
      for (const { event, data } of buffer) {
        try { callback(event, data); } catch {}
      }
    }

    this.emitter.on(channel, listener);
    return () => { this.emitter.removeListener(channel, listener); };
  }

  /** Check if a job already completed (for instant-reply on reconnect) */
  getLastEvent(jobId: string): { event: string; data: any } | null {
    const buffer = this.jobBuffers.get(jobId);
    if (!buffer || buffer.length === 0) return null;
    return buffer[buffer.length - 1];
  }
}

export const eventBus = new JobEventBus();
