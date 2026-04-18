import express, { type Express } from "express";
import fs from "fs";
import path from "path";

// Works in both ESM (dev/tsx) and CJS (production/esbuild)
function getDirname(): string {
  try {
    // CJS — __dirname is available
    if (typeof __dirname !== "undefined") return __dirname;
  } catch {}
  // ESM fallback
  const { fileURLToPath } = require("url");
  return path.dirname(fileURLToPath(import.meta.url));
}

export function serveStatic(app: Express) {
  // In dev mode (tsx), getDirname() points to server/ — look for dist/public relative to cwd
  // In production (built), getDirname() points to dist/ — look for public/ next to it
  let distPath = path.resolve(getDirname(), "public");
  if (!fs.existsSync(distPath)) {
    distPath = path.resolve(process.cwd(), "dist", "public");
  }
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }
  // Cache hashed assets (JS/CSS) for 1 year, HTML for 0 (always revalidate)
  app.use(express.static(distPath, {
    maxAge: "1y",
    immutable: true,
    setHeaders: (res, filePath) => {
      // HTML files should not be cached — they reference hashed assets
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }));
  app.use("/{*path}", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
