// Worker types (previously imported from deleted queues module)
export type WorkerType = "boss" | "researcher" | "coder" | "writer" | "analyst" | "reviewer" | "artgen" | "browser";

/**
 * Default model assignment per agent/worker type.
 * Used when the user doesn't explicitly choose a model.
 * Users can override per-agent defaults later (Phase 7 AI Preferences).
 */
export const MODEL_DEFAULTS: Record<WorkerType, string> = {
  boss: "gpt-5.4-mini",       // Fast, good at routing/function calling
  researcher: "sonar-pro",
  coder: "claude-sonnet-4-6", // Best at code generation
  writer: "claude-haiku-4-5",
  analyst: "gemini-3-flash",
  reviewer: "claude-sonnet-4-6",
  artgen: "gpt-image-1",      // Image generation via OpenAI Responses API
  browser: "gpt-5.4-mini",
};

/**
 * Provider fallback chains: when a provider returns 429/500/502/503,
 * automatically retry with the next model in the chain.
 * Max 2 fallback attempts (3 total tries).
 * All model IDs verified April 2026 — no retired models.
 */
export const FALLBACK_CHAINS: Record<string, string[]> = {
  "claude-opus-4-6": ["gpt-5.4", "gemini-3.1-pro"],
  "claude-sonnet-4-6": ["gpt-5.4-mini", "gemini-3.1-pro"],
  "claude-haiku-4-5": ["gpt-5.4-nano", "gemini-3-flash"],
  "gpt-5.4": ["claude-sonnet-4-6", "gemini-3.1-pro"],
  "gpt-5.4-mini": ["claude-haiku-4-5", "gemini-3-flash"],
  "gpt-5.4-nano": ["gemini-3.1-flash-lite", "claude-haiku-4-5"],
  "gemini-3.1-pro": ["claude-sonnet-4-6", "gpt-5.4"],
  "gemini-3-flash": ["claude-haiku-4-5", "gpt-5.4-mini"],
  "gemini-3.1-flash-lite": ["gpt-5.4-nano", "claude-haiku-4-5"],
  "sonar-pro": ["claude-sonnet-4-6", "gpt-5.4-mini"],
  "sonar-reasoning-pro": ["claude-sonnet-4-6", "gpt-5.4"],
  "mistral-large-latest": ["claude-sonnet-4-6", "gpt-5.4"],
  "mistral-small-2603": ["claude-haiku-4-5", "gpt-5.4-mini"],
};

/**
 * Get the default model for a given worker type.
 */
export function getDefaultModel(workerType: WorkerType): string {
  return MODEL_DEFAULTS[workerType] || "claude-sonnet-4-6";
}

/**
 * Get fallback chain for a model.
 */
export function getFallbackChain(model: string): string[] {
  return FALLBACK_CHAINS[model] || [];
}
