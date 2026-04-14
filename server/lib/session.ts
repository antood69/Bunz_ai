import session from "express-session";
import { RedisStore } from "connect-redis";
import { redis } from "./redis";

/**
 * Express session middleware backed by Redis.
 * Survives server restarts and scales across processes.
 */
export function createRedisSessionMiddleware() {
  const store = new RedisStore({
    client: redis,
    prefix: "bunz:sess:",
    ttl: 30 * 24 * 60 * 60, // 30 days in seconds
  });

  return session({
    store,
    secret: process.env.SESSION_SECRET || "bunz-session-secret-change-me",
    resave: false,
    saveUninitialized: false,
    name: "bunz.sid",
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  });
}
