import session from "express-session";
import createMemoryStore from "memorystore";

/**
 * Express session middleware.
 * Uses Redis in production (when REDIS_URL set), in-memory store otherwise.
 */
export async function createRedisSessionMiddleware() {
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };

  const sessionOpts: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "bunz-session-secret-change-me",
    resave: false,
    saveUninitialized: false,
    name: "bunz.sid",
    cookie: cookieOpts,
  };

  if (process.env.REDIS_URL) {
    // Dynamic require works in both ESM (tsx) and CJS (esbuild)
    const { RedisStore } = require("connect-redis");
    const { redis } = require("./redis");
    sessionOpts.store = new RedisStore({
      client: redis,
      prefix: "bunz:sess:",
      ttl: 30 * 24 * 60 * 60,
    });
    console.log("[session] Using Redis session store");
  } else {
    const MemoryStore = createMemoryStore(session);
    sessionOpts.store = new MemoryStore({ checkPeriod: 86400000 });
    console.log("[session] Using in-memory session store (no Redis)");
  }

  return session(sessionOpts);
}
