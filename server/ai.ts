/**
 * server/ai.ts — Backward-compatible exports that delegate to the new modelRouter.
 *
 * All callers (boss.ts, workers, routes) can still import from here.
 * The actual provider routing logic now lives in server/lib/modelRouter.ts.
 */

export type { ChatMessage, Usage, ChatOptions, ChatResult } from "./lib/modelRouter";
export { modelRouter, runAgentChat, runAgentChatWithUserKey, detectProvider, useMaxCompletionTokens, isImageGenerationModel } from "./lib/modelRouter";
