/**
 * Art Agent — Receives image generation requests from Boss.
 * Routes to gpt-image-1 via OpenAI Responses API (existing callOpenAIImage).
 * Falls back to OpenRouter image models.
 */

import { modelRouter } from "../lib/modelRouter";
import type { ChatResult } from "../lib/modelRouter";

export const ART_DEFAULT_MODEL = "gpt-image-1";
export const ART_FALLBACK_MODEL = "openai/gpt-image-1";
export const ART_TIMEOUT_MS = 120_000;

export const ART_SYSTEM_PROMPT = `You are the Art agent for Cortal. You create images based on user descriptions. Enhance prompts for better results — add details about style, lighting, composition. Always aim for high-quality, professional output.`;

export interface ArtInput {
  task: string;
  context?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface ArtOutput {
  content: string;
  imageUrl?: string;
  type: "image" | "text";
  usage: ChatResult["usage"];
  agentType: "art";
}

export async function runArtAgent(input: ArtInput): Promise<ArtOutput> {
  const model = input.model || ART_DEFAULT_MODEL;

  // Build the image generation prompt
  const prompt = input.context
    ? `${input.task}\n\nAdditional context: ${input.context}`
    : input.task;

  const timeoutSignal = AbortSignal.timeout(ART_TIMEOUT_MS);
  const signal = input.signal
    ? AbortSignal.any([input.signal, timeoutSignal])
    : timeoutSignal;

  try {
    // modelRouter.chat already routes image models to the correct endpoint
    // (callOpenAIImage for gpt-image-*, callGoogleImagen for imagen-*, callOpenRouterImage for OpenRouter)
    const result = await modelRouter.chat({
      model,
      messages: [{ role: "user", content: prompt }],
      signal,
    });

    return {
      content: result.content || prompt,
      imageUrl: result.imageUrl,
      type: result.type || "text",
      usage: result.usage,
      agentType: "art",
    };
  } catch (err: any) {
    // If primary model fails, try fallback
    if (err?.name !== "AbortError" && model !== ART_FALLBACK_MODEL) {
      console.warn(`[ArtAgent] ${model} failed (${err.message}), trying fallback ${ART_FALLBACK_MODEL}`);
      try {
        const result = await modelRouter.chat({
          model: ART_FALLBACK_MODEL,
          messages: [{ role: "user", content: prompt }],
          signal: input.signal,
        });
        return {
          content: result.content || prompt,
          imageUrl: result.imageUrl,
          type: result.type || "text",
          usage: { ...result.usage, model: `${ART_FALLBACK_MODEL} (fallback)` },
          agentType: "art",
        };
      } catch (fallbackErr: any) {
        throw new Error(`Art generation failed: ${err.message}. Fallback also failed: ${fallbackErr.message}`);
      }
    }
    throw err;
  }
}
