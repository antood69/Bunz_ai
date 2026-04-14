import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * Shared Redis connection for general use (sessions, pub/sub publisher, etc.).
 * BullMQ creates its own connections internally — pass it the connection options.
 */
export const redis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null, // Required for BullMQ blocking commands
  enableReadyCheck: false,
  retryStrategy(times) {
    return Math.min(times * 200, 5000);
  },
});

redis.on("error", (err) => {
  console.error("[Redis] Connection error:", err.message);
});

redis.on("connect", () => {
  console.log("[Redis] Connected");
});

/** IORedis connection options to pass into BullMQ Queue / Worker / FlowProducer */
export const redisConnectionOpts = {
  connection: {
    host: new URL(REDIS_URL).hostname,
    port: parseInt(new URL(REDIS_URL).port || "6379"),
    password: new URL(REDIS_URL).password || undefined,
    username: new URL(REDIS_URL).username || undefined,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
  },
};

/** Create a new IORedis subscriber instance (each subscriber needs its own connection) */
export function createSubscriber(): IORedis {
  return new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      return Math.min(times * 200, 5000);
    },
  });
}
