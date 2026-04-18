export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

/** Structured log for job state transitions — easy to grep in Railway logs */
export function logJob(jobId: string, status: string, details?: Record<string, any>) {
  const ts = new Date().toISOString();
  const extra = details ? " " + JSON.stringify(details) : "";
  console.log(`[JOB] ${ts} ${jobId} → ${status}${extra}`);
}

/** Structured log for AI call metrics */
export function logAI(model: string, latencyMs: number, tokens: number, endpoint?: string) {
  console.log(`[AI] model=${model} latency=${latencyMs}ms tokens=${tokens}${endpoint ? ` endpoint=${endpoint}` : ""}`);
}

/** Structured error log — always includes stack trace */
export function logError(source: string, err: any) {
  console.error(`[ERROR:${source}] ${err?.message || err}${err?.stack ? "\n" + err.stack : ""}`);
}
