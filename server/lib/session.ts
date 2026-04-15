import session from "express-session";
import createMemoryStore from "memorystore";

/**
 * Express session middleware.
 * Uses Redis in production, in-memory store for local development.
 */
export async function createRedisSessionMiddleware() {
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  };

  const sessionOpts: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "bunz-session-secret-change-me",
    resave: false,
    saveUninitialized: false,
    name: "bunz.sid",
    cookie: cookieOpts,
  };

  if (process.env.REDIS_URL || process.env.NODE_ENV === "production") {
    const { RedisStore } = await import("connect-redis");
    const { redis } = await import("./redis.js");
    sessionOpts.store = new RedisStore({
      client: redis,
      prefix: "bunz:sess:",
      ttl: 30 * 24 * 60 * 60,
    });
  } else {
    const MemoryStore = createMemoryStore(session);
    sessionOpts.store = new MemoryStore({ checkPeriod: 86400000 });
    console.log("[session] Using in-memory session store (no Redis)");
  }

  return session(sessionOpts);
}
