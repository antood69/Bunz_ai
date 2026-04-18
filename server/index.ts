import { config as dotenvConfig } from "dotenv";
dotenvConfig();

import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { createRedisSessionMiddleware, sessionStore } from "./lib/session";
import { initDatabase } from "./storage";
import { setupWebSocketServer, shutdownWebSockets } from "./ws";
import { stopAllBots } from "./bots";
import { log } from "./lib/logger";
export { log } from "./lib/logger";

// ── Validate required environment on startup ─────────────────────────────────
function validateEnv() {
  const warnings: string[] = [];
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === "bunz-session-secret-change-me") {
    warnings.push("SESSION_SECRET is not set or using default — set a strong secret in production");
  }
  if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY === "bunz-dev-encryption-key-change-in-prod") {
    warnings.push("ENCRYPTION_KEY is not set or using default — user API keys are not securely encrypted");
  }
  const hasAnyAI = !!(
    process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY ||
    process.env.GOOGLE_AI_KEY || process.env.GROQ_API_KEY ||
    process.env.OPENROUTER_API_KEY
  );
  if (!hasAnyAI) {
    warnings.push("No AI provider API key set — AI features will not work");
  }
  for (const w of warnings) {
    log(`⚠ ENV WARNING: ${w}`);
  }
}

// ── Catch unhandled errors globally ──────────────────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
  // Don't exit — let graceful shutdown handle it if needed
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled promise rejection:", reason);
});

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// ── Compression — gzip all responses ─────────────────────────────────────────
app.use(compression());

// ── Security headers ─────────────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.removeHeader("X-Powered-By");
  next();
});

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false }));

// ── Request logging ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      log(`${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

// ── Request timeout (2 min for normal, SSE excluded) ─────────────────────────
app.use((req, res, next) => {
  // Skip timeout for SSE streams and long-running endpoints
  if (req.path.includes("/stream/") || req.path.includes("/events")) {
    return next();
  }
  req.setTimeout(120_000, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: "Request timeout" });
    }
  });
  next();
});

(async () => {
  validateEnv();

  // Initialize database tables, seeds, and migrations
  await initDatabase();

  // Session store (Redis in production, in-memory for local dev)
  const sessionMiddleware = await createRedisSessionMiddleware();
  app.use(sessionMiddleware);

  // WebSocket server for real-time cross-device sync
  setupWebSocketServer(httpServer, sessionStore);

  await registerRoutes(httpServer, app);

  // ── Global error handler (must be after routes) ────────────────────────────
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error(`[ERROR] ${status}:`, err.stack || err);
    if (res.headersSent) return next(err);
    return res.status(status).json({ error: message });
  });

  // Always serve generated images (Artist dept saves them here)
  app.use("/generated", express.static(path.join(process.cwd(), "dist", "public", "generated")));

  // Serve static files (built frontend)
  serveStatic(app);

  const port = parseInt(process.env.PORT || "3000", 10);
  httpServer.listen({ port, host: "0.0.0.0" }, () => {
    log(`serving on port ${port}`);
  });

  // ── Graceful shutdown ────────────────────────────────────────────────────────
  let isShuttingDown = false;

  async function gracefulShutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    log(`${signal} received — shutting down gracefully...`);

    // Stop accepting new connections
    httpServer.close(() => {
      log("HTTP server closed");
    });

    // Stop all running bots
    try { stopAllBots(); log("All bots stopped"); } catch {}

    // Close WebSocket connections
    try { shutdownWebSockets(); log("WebSocket connections closed"); } catch {}

    // Give in-flight requests 10s to finish
    setTimeout(() => {
      log("Shutdown timeout reached — exiting");
      process.exit(0);
    }, 10_000);
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
})();
