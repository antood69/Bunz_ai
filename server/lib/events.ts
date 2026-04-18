/**
 * Typed Orchestration Event Taxonomy
 *
 * All server→client events and their payloads are defined here.
 * The eventBus uses these event names. The SSE stream forwards them.
 * The useAgentStream hook on the client consumes them.
 *
 * Event categories:
 *   lifecycle: job.created, job.complete, job.failed, job.cancelled
 *   progress:  step.started, step.complete, step.failed
 *   streaming: token (text chunks during generation)
 *   tools:     tool.called, tool.succeeded, tool.failed
 *   handoff:   handoff.created (context passed between departments)
 *   output:    output.approved, output.rejected
 */

// ── Event Types ────────────────────────────────────────────────────────────

export type OrchestrationEvent =
  // Lifecycle
  | "connected"
  | "complete"
  | "cancelled"
  | "error"
  // Progress
  | "progress"
  | "step_complete"
  // Streaming
  | "token"
  // Images
  | "agent_image";

// ── Payload Types ──────────────────────────────────────────────────────────

export interface ProgressPayload {
  workerType: string;
  subAgent?: string;
  workerIndex?: number;
  status: "running" | "synthesizing" | "complete" | "error";
  message?: string;
  model?: string;
}

export interface StepCompletePayload {
  workerType: string;
  subAgent?: string;
  workerIndex?: number;
  status?: "complete" | "error";
  output?: string;
  tokens?: number;
  durationMs?: number;
  model?: string;
  error?: string;
  imageUrl?: string;
  type?: string;
}

export interface TokenPayload {
  workerType?: string;
  subAgent?: string;
  workerIndex?: number;
  text: string;
  isSynthesis?: boolean;
  isAutonomous?: boolean;
}

export interface CompletePayload {
  synthesis?: string;
  totalTokens?: number;
  departments?: Array<{ id: string; output: string; imageUrl?: string }>;
  agentOutputs?: Array<{ agent: string; imageUrl?: string; type?: string }>;
  autonomous?: boolean;
}

export interface ErrorPayload {
  error: string;
  workerType?: string;
  recoverable?: boolean;
}

export interface AgentImagePayload {
  workerType: string;
  imageUrl: string;
  prompt?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Check if an event is terminal (job ended) */
export function isTerminalEvent(event: string): boolean {
  return event === "complete" || event === "cancelled" || event === "error";
}

/** Check if an event indicates progress (non-terminal, non-token) */
export function isProgressEvent(event: string): boolean {
  return event === "progress" || event === "step_complete";
}
