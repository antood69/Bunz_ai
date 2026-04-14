import { createAgentWorker } from "./base.worker";
import { startFiverrGenerationWorker } from "./fiverrGeneration.worker";
import { QUEUE_NAMES, type WorkerType } from "../queues";
import type { Worker } from "bullmq";

/** All active worker instances */
const workers: Map<string, Worker> = new Map();

/**
 * Start all agent workers. Call once during server initialization.
 */
export function startAllWorkers() {
  const workerTypes: WorkerType[] = [
    "boss",
    "researcher",
    "coder",
    "writer",
    "analyst",
    "reviewer",
    "artgen",
    "browser",
  ];

  for (const type of workerTypes) {
    const queueName = QUEUE_NAMES[type];
    const worker = createAgentWorker(type, queueName);
    workers.set(type, worker);
    console.log(`[Workers] Started ${type} worker on ${queueName}`);
  }

  // Start Fiverr generation worker
  try {
    const fiverrWorker = startFiverrGenerationWorker();
    workers.set("fiverr-generation", fiverrWorker);
  } catch (err: any) {
    console.warn("[Workers] Fiverr generation worker failed to start (Redis may be unavailable):", err.message);
  }

  return workers;
}

/**
 * Gracefully shut down all workers.
 */
export async function stopAllWorkers() {
  const entries = Array.from(workers.entries());
  for (const [type, worker] of entries) {
    await worker.close();
    console.log(`[Workers] Stopped ${type} worker`);
  }
  workers.clear();
}
