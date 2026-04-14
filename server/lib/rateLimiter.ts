/**
 * Rate Limiting Middleware
 * Enforces per-tier monthly credit limits:
 *   Free:    3,000 credits/mo
 *   Starter: 40,000 credits/mo
 *   Pro:     200,000 credits/mo
 *   Agency:  800,000 credits/mo
 *
 * 1 credit ≈ $0.001 API cost
 */

import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

export const TIER_CREDIT_LIMITS: Record<string, number> = {
  free: 3000,
  starter: 40000,
  pro: 200000,
  agency: 800000,
};

/** Overage pack sizes per tier (credits per $5 pack) */
export const OVERAGE_PACKS: Record<string, number> = {
  starter: 5000,
  pro: 10000,
  agency: 20000,
};

interface PlanCheck {
  allowed: boolean;
  plan: {
    tier: string;
    monthlyTokens: number;
    tokensUsed: number;
    tokensRemaining: number;
    bonusTokens: number;
    periodEnd: string;
  };
  reason?: string;
}

/**
 * Shared logic: check whether a user has credits remaining.
 * Used by both the middleware and ad-hoc pre-flight checks.
 */
export async function checkTokenBudget(userId: number): Promise<PlanCheck> {
  let plan = await storage.getUserPlan(userId);

  if (!plan) {
    // Auto-create free plan
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    plan = await storage.createUserPlan({
      userId,
      tier: "free",
      monthlyTokens: TIER_CREDIT_LIMITS.free,
      tokensUsed: 0,
      periodStart: now.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });
  }

  // Auto-reset if the billing period has elapsed
  if (new Date(plan.periodEnd) < new Date()) {
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const tierLimit = TIER_CREDIT_LIMITS[plan.tier] ?? TIER_CREDIT_LIMITS.free;
    plan = await storage.updateUserPlan(plan.id, {
      tokensUsed: 0,
      monthlyTokens: tierLimit,
      periodStart: now.toISOString(),
      periodEnd: periodEnd.toISOString(),
    }) || plan;
  }

  // Calculate bonus tokens from purchased packs
  const packs = await storage.getTokenPacksByUser(userId);
  const bonusTokens = packs
    .filter((p: any) => p.status === "active")
    .reduce((sum: number, p: any) => sum + p.tokensRemaining, 0);

  const tokensRemaining = Math.max(0, plan.monthlyTokens - plan.tokensUsed) + bonusTokens;

  const planInfo = {
    tier: plan.tier,
    monthlyTokens: plan.monthlyTokens,
    tokensUsed: plan.tokensUsed,
    tokensRemaining,
    bonusTokens,
    periodEnd: plan.periodEnd,
  };

  if (tokensRemaining <= 0) {
    const isFree = plan.tier === "free";
    return {
      allowed: false,
      plan: planInfo,
      reason: isFree
        ? "Monthly credit limit reached. Upgrade to a paid plan to continue."
        : "Monthly credit limit reached. Purchase an overage pack or wait for your next billing cycle.",
    };
  }

  return { allowed: true, plan: planInfo };
}

/**
 * Express middleware that blocks API requests when the user is over quota.
 * Attach to any route that consumes credits (boss chat, workflow runs, agent chat, etc.)
 */
export function requireCredits() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Owner bypasses all credit checks
      if ((req as any).user?.role === "owner") {
        (req as any).userPlan = { tier: "agency", monthlyTokens: 999999999, tokensUsed: 0, tokensRemaining: 999999999, bonusTokens: 0, periodEnd: "" };
        return next();
      }

      const userId = (req as any).user?.id ?? 1;
      const result = await checkTokenBudget(userId);

      if (!result.allowed) {
        return res.status(429).json({
          error: result.reason,
          plan: result.plan,
          code: "CREDIT_LIMIT_EXCEEDED",
        });
      }

      // Attach plan info so downstream handlers can reference it
      (req as any).userPlan = result.plan;
      next();
    } catch (err) {
      console.error("[rateLimiter] Error checking token budget:", err);
      // Fail open — don't block the user on an internal error
      next();
    }
  };
}
