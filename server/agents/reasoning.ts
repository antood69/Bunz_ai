/**
 * Reasoning Agent — Receives complex analysis tasks from Boss.
 * Uses reasoning-optimized models (gpt-5.4, deepseek-r1).
 * Returns structured analysis.
 */

import { modelRouter } from "../lib/modelRouter";
import type { ChatResult } from "../lib/modelRouter";

export const REASONING_DEFAULT_MODEL = "gpt-5.4";
export const REASONING_FALLBACK_MODEL = "claude-sonnet-4-6";
export const REASONING_TIMEOUT_MS = 60_000;

export const REASONING_SYSTEM_PROMPT = `You are the Reasoning agent for Bunz. You handle complex analysis, research, math, and multi-step logic problems. Think step-by-step. Show your work. Provide structured, thorough analysis.

Rules:
- Break complex problems into clear steps
- Show your reasoning process
- Use structured formatting (headers, bullet points, numbered steps)
- Provide confidence levels when making assessments
- Cite assumptions explicitly`;

export interface ReasoningInput {
  task: string;
  context?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface ReasoningOutput {
  content: string;
  usage: ChatResult["usage"];
  agentType: "reasoning";
}

export async function runReasoningAgent(input: ReasoningInput): Promise<ReasoningOutput> {
  const model = input.model || REASONING_DEFAULT_MODEL;
  const prompt = input.context
    ? `${input.task}\n\nContext:\n${input.context}`
    : input.task;

  const timeoutSignal = AbortSignal.timeout(REASONING_TIMEOUT_MS);
  const signal = input.signal
    ? AbortSignal.any([input.signal, timeoutSignal])
    : timeoutSignal;

  try {
    const result = await modelRouter.chat({
      model,
      messages: [{ role: "user", content: prompt }],
      systemPrompt: REASONING_SYSTEM_PROMPT,
      signal,
    });

    return {
      content: result.content,
      usage: result.usage,
      agentType: "reasoning",
    };
  } catch (err: any) {
    // If primary model fails, try fallback
    if (err?.name !== "AbortError" && model !== REASONING_FALLBACK_MODEL) {
      console.warn(`[ReasoningAgent] ${model} failed, trying fallback ${REASONING_FALLBACK_MODEL}`);
      const result = await modelRouter.chat({
        model: REASONING_FALLBACK_MODEL,
        messages: [{ role: "user", content: prompt }],
        systemPrompt: REASONING_SYSTEM_PROMPT,
        signal: input.signal,
      });
      return {
        content: result.content,
        usage: { ...result.usage, model: `${REASONING_FALLBACK_MODEL} (fallback)` },
        agentType: "reasoning",
      };
    }
    throw err;
  }
}
