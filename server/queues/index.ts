import { Queue, FlowProducer } from "bullmq";
import { redisConnectionOpts } from "../lib/redis";

const defaultJobOpts = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 1000 },
  removeOnComplete: 100,
  removeOnFail: 50,
};

// ── Queue definitions ──────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  boss: "boss-queue",
  researcher: "researcher-queue",
  coder: "coder-queue",
  writer: "writer-queue",
  analyst: "analyst-queue",
  reviewer: "reviewer-queue",
  artgen: "artgen-queue",
  browser: "browser-queue",
} as const;

export type WorkerType = keyof typeof QUEUE_NAMES;

function createQueue(name: string): Queue {
  return new Queue(name, {
    ...redisConnectionOpts,
    defaultJobOptions: defaultJobOpts,
  });
}

export const bossQueue = createQueue(QUEUE_NAMES.boss);
export const researcherQueue = createQueue(QUEUE_NAMES.researcher);
export const coderQueue = createQueue(QUEUE_NAMES.coder);
export const writerQueue = createQueue(QUEUE_NAMES.writer);
export const analystQueue = createQueue(QUEUE_NAMES.analyst);
export const reviewerQueue = createQueue(QUEUE_NAMES.reviewer);
export const artgenQueue = createQueue(QUEUE_NAMES.artgen);
export const browserQueue = createQueue(QUEUE_NAMES.browser);

/** All queues for Bull Board registration */
export const allQueues = [
  bossQueue,
  researcherQueue,
  coderQueue,
  writerQueue,
  analystQueue,
  reviewerQueue,
  artgenQueue,
  browserQueue,
];

/** Lookup queue by worker type */
export function getQueue(type: WorkerType): Queue {
  const map: Record<WorkerType, Queue> = {
    boss: bossQueue,
    researcher: researcherQueue,
    coder: coderQueue,
    writer: writerQueue,
    analyst: analystQueue,
    reviewer: reviewerQueue,
    artgen: artgenQueue,
    browser: browserQueue,
  };
  return map[type];
}

// ── FlowProducer for dependent chains ──────────────────────────────────────────

export const flowProducer = new FlowProducer({
  ...redisConnectionOpts,
});

flowProducer.on("error", (err) => {
  console.error("[FlowProducer] Error:", err.message);
});
