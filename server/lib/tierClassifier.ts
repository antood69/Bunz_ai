/**
 * 4-Tier Model Routing — heuristic classifier for "Auto" mode.
 * Analyzes user message complexity and routes to the appropriate tier.
 */

export type Tier = 1 | 2 | 3 | 4;

export interface TierResult {
  tier: Tier;
  label: string;
  model: string;
  reason: string;
}

// Tier model mappings
const TIER_MODELS: Record<Tier, { model: string; label: string }> = {
  1: { model: "claude-haiku-4-5", label: "Simple" },
  2: { model: "claude-sonnet-4-6", label: "Standard" },
  3: { model: "claude-sonnet-4-6", label: "Complex" },
  4: { model: "claude-opus-4-6", label: "Expert" },
};

// Complexity keywords that push toward higher tiers
const COMPLEX_KEYWORDS = [
  "analyze", "compare", "evaluate", "synthesize", "refactor",
  "architecture", "design pattern", "implement", "debug", "optimize",
  "trade-off", "pros and cons", "in-depth", "comprehensive",
  "step by step", "walk me through", "explain in detail",
];

const EXPERT_KEYWORDS = [
  "research synthesis", "long analysis", "write a report",
  "full implementation", "production-ready", "review all",
  "audit", "security review", "performance analysis",
  "multi-part", "complete solution",
];

const SIMPLE_PATTERNS = [
  /^(hi|hello|hey|thanks|thank you|ok|okay|sure|yes|no|yep|nope)[.!?]?$/i,
  /^what (is|are) .{3,30}\??$/i,
  /^(who|when|where) .{3,40}\??$/i,
  /^(define|meaning of) .{3,30}$/i,
  /^(how do (i|you)|can you) .{3,50}\??$/i,
];

/**
 * Classify message complexity into a tier for auto model routing.
 * This is a heuristic classifier — not ML.
 */
export function classifyTier(message: string): TierResult {
  const text = message.trim();
  const wordCount = text.split(/\s+/).length;
  const hasCodeBlock = /```[\s\S]*```/.test(text);
  const questionCount = (text.match(/\?/g) || []).length;
  const lineCount = text.split("\n").length;
  const lower = text.toLowerCase();

  // Tier 1: Simple — short factual questions, greetings
  for (const pat of SIMPLE_PATTERNS) {
    if (pat.test(text)) {
      return { tier: 1, ...TIER_MODELS[1], reason: "Simple query" };
    }
  }
  if (wordCount <= 8 && questionCount <= 1 && !hasCodeBlock) {
    return { tier: 1, ...TIER_MODELS[1], reason: "Short message" };
  }

  // Tier 4: Expert — research synthesis, long analysis
  const expertHits = EXPERT_KEYWORDS.filter(kw => lower.includes(kw)).length;
  if (expertHits >= 2 || (wordCount > 200 && lineCount > 10)) {
    return { tier: 4, ...TIER_MODELS[4], reason: "Expert-level complexity" };
  }
  if (hasCodeBlock && wordCount > 150) {
    return { tier: 4, ...TIER_MODELS[4], reason: "Large code + analysis" };
  }

  // Tier 3: Complex — multi-step reasoning, code generation
  const complexHits = COMPLEX_KEYWORDS.filter(kw => lower.includes(kw)).length;
  if (complexHits >= 2 || (hasCodeBlock && wordCount > 50)) {
    return { tier: 3, ...TIER_MODELS[3], reason: "Multi-step or code task" };
  }
  if (questionCount >= 3 || (wordCount > 80 && lineCount > 5)) {
    return { tier: 3, ...TIER_MODELS[3], reason: "Multiple sub-questions" };
  }
  if (expertHits >= 1 && wordCount > 40) {
    return { tier: 3, ...TIER_MODELS[3], reason: "Complex analysis request" };
  }

  // Tier 2: Standard — normal conversation
  return { tier: 2, ...TIER_MODELS[2], reason: "Standard conversation" };
}
