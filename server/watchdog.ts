/**
 * Bunz Agent Watchdog
 * Detects stuck agents, loop patterns, and escalates automatically.
 */

import { storage } from "./storage";

interface StepRecord {
  fingerprint: string;
  timestamp: number;
  input: string;
  output: string;
}

// In-memory step history per job (keyed by jobId)
const jobStepHistory = new Map<number, StepRecord[]>();

const MAX_STEPS = 20;
const LOOP_DETECT_WINDOW = 3; // same fingerprint N times in a row = loop

function fingerprint(input: string, toolCalls?: string[]): string {
  const combined = input.trim().toLowerCase().slice(0, 200) + (toolCalls?.join(",") || "");
  // Simple hash
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) - hash) + combined.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

export async function recordStep(
  jobId: number,
  agentId: number,
  input: string,
  output: string,
  toolCalls?: string[]
): Promise<{ escalate: boolean; reason?: string; level?: number }> {
  const fp = fingerprint(input, toolCalls);

  if (!jobStepHistory.has(jobId)) {
    jobStepHistory.set(jobId, []);
  }

  const history = jobStepHistory.get(jobId)!;
  history.push({ fingerprint: fp, timestamp: Date.now(), input, output });

  // Check step budget
  if (history.length >= MAX_STEPS) {
    await createEscalation(jobId, agentId, 2, "step_budget", history);
    return { escalate: true, reason: "step_budget", level: 2 };
  }

  // Check for loop (same fingerprint N times in a row)
  if (history.length >= LOOP_DETECT_WINDOW) {
    const recent = history.slice(-LOOP_DETECT_WINDOW);
    const allSame = recent.every(s => s.fingerprint === fp);
    if (allSame) {
      const level = history.filter(s => s.fingerprint === fp).length >= 6 ? 3 : 2;
      await createEscalation(jobId, agentId, level, "loop_detected", history);
      return { escalate: true, reason: "loop_detected", level };
    }
  }

  return { escalate: false };
}

async function createEscalation(
  jobId: number,
  agentId: number,
  level: number,
  reason: string,
  history: StepRecord[]
) {
  const context = JSON.stringify(history.slice(-5)); // last 5 steps
  await storage.createEscalation({
    jobId,
    agentId,
    level,
    reason,
    context,
    status: "pending",
  });

  // Update job status to escalated
  await storage.updateJob(jobId, { status: "failed", result: `Escalated: ${reason} at level ${level}` });

  console.log(`🚨 [Watchdog] Job ${jobId} escalated — reason: ${reason}, level: ${level}`);
}

export function clearJobHistory(jobId: number) {
  jobStepHistory.delete(jobId);
}
