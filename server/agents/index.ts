/**
 * Agent system index — exports all specialist agents and the dispatch function.
 */

export { runCoderAgent, CODER_SYSTEM_PROMPT, CODER_DEFAULT_MODEL } from "./coder";
export type { CoderInput, AgentOutput } from "./coder";

export { runArtAgent, ART_SYSTEM_PROMPT, ART_DEFAULT_MODEL } from "./art";
export type { ArtInput, ArtOutput } from "./art";

export { runReasoningAgent, REASONING_SYSTEM_PROMPT, REASONING_DEFAULT_MODEL } from "./reasoning";
export type { ReasoningInput, ReasoningOutput } from "./reasoning";

export type AgentType = "coder" | "art" | "reasoning";

export const AGENT_DEFAULTS: Record<AgentType, { model: string; label: string }> = {
  coder: { model: "claude-sonnet-4-6", label: "Coder" },
  art: { model: "gpt-image-1", label: "Art" },
  reasoning: { model: "gpt-5.4", label: "Reasoning" },
};
