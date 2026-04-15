import Stripe from "stripe";
import express from "express";
import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { TIER_CREDIT_LIMITS } from "./lib/rateLimiter";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("[stripe] STRIPE_SECRET_KEY is not set — Stripe features will be disabled");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: "2026-03-25.dahlia",
});

export const PRICE_IDS = {
  starter_monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || "",
  starter_annual:  process.env.STRIPE_PRICE_STARTER_ANNUAL  || "",
  pro_monthly:     process.env.STRIPE_PRICE_PRO_MONTHLY     || "",
  pro_annual:      process.env.STRIPE_PRICE_PRO_ANNUAL      || "",
  agency_monthly:  process.env.STRIPE_PRICE_AGENCY_MONTHLY  || "",
  agency_annual:   process.env.STRIPE_PRICE_AGENCY_ANNUAL   || "",
};

export function registerStripeRoutes(app: Express) {
  // ── Create Checkout Session ──────────────────────────────────────────────
  app.post("/api/stripe/checkout", async (req: Request, res: Response) => {
    const { tier, billing } = req.body as { tier: "starter" | "pro" | "agency"; billing: "monthly" | "annual" };
    const user = req.user;

    const priceKey = `${tier}_${billing}` as keyof typeof PRICE_IDS;
    const priceId = PRICE_IDS[priceKey];

    if (!priceId) {
      return res.status(400).json({ error: `Price not configured for ${tier}/${billing}. Run setup-stripe.ts first.` });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    try {
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/pricing?success=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${origin}/pricing?canceled=1`,
        allow_promotion_codes: true,
        metadata: { userId: String(user?.id || ""), tier, billing },
        subscription_data: {
          metadata: { userId: String(user?.id || ""), tier, billing },
        },
      };

      // Pre-fill email if we have it
      if (user?.email) {
        sessionParams.customer_email = user.email;
      }

      // Reuse existing Stripe customer if user already has one
      if (user && (user as any).stripeCustomerId) {
        sessionParams.customer = (user as any).stripeCustomerId;
        delete sessionParams.customer_email;
      }

      const session = await stripe.checkout.sessions.create(sessionParams);
      res.json({ url: session.url });
    } catch (err: any) {
      console.error("Stripe checkout error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Customer Portal (manage subscription) ───────────────────────────────
  app.post("/api/stripe/portal", async (req: Request, res: Response) => {
    const user = req.user;
    const customerId = req.body.customerId || (user as any)?.stripeCustomerId;

    if (!customerId) {
      return res.status(400).json({ error: "No Stripe customer ID found. Please subscribe first." });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/pricing`,
      });
      res.json({ url: session.url });
    } catch (err: any) {
      console.error("Stripe portal error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Get publishable key (safe to expose) ────────────────────────────────
  app.get("/api/stripe/config", (_req, res) => {
    res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
  });

  // ── Webhook Handler ──────────────────────────────────────────────────────
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const sig = req.headers["stripe-signature"] as string;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        console.warn("STRIPE_WEBHOOK_SECRET not set — skipping signature verification");
        return res.status(200).send("webhook received (unverified)");
      }

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
      } catch (err: any) {
        console.error("Webhook signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const customerId = session.customer as string;
          const subscriptionId = session.subscription as string;
          const tier = session.metadata?.tier || "pro";
          const userId = session.metadata?.userId ? Number(session.metadata.userId) : null;
          const email = session.customer_email || session.customer_details?.email;

          // Find the user
          let user = userId ? await storage.getUser(userId) : null;
          if (!user && email) {
            user = await storage.getUserByEmail(email) || null;
          }

          if (user) {
            // Save Stripe customer ID and subscription on user record
            await storage.updateUser(user.id, {
              tier,
              stripeCustomerId: customerId,
              subscriptionId,
            });

            // Update their plan tokens
            const monthlyTokens = TIER_CREDIT_LIMITS[tier] || TIER_CREDIT_LIMITS.free;
            const plan = await storage.getUserPlan(user.id);
            if (plan) {
              await storage.updateUserPlan(plan.id, {
                tier,
                monthlyTokens,
                tokensUsed: 0,
                periodStart: new Date().toISOString(),
                periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              });
            } else {
              await storage.createUserPlan({
                userId: user.id,
                tier,
                monthlyTokens,
                tokensUsed: 0,
                periodStart: new Date().toISOString(),
                periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              });
            }

            console.log(`[stripe] Upgraded user ${user.id} (${email}) to ${tier}`);
          } else {
            console.warn(`[stripe] Checkout completed but no user found — customerId: ${customerId}, email: ${email}`);
          }
          break;
        }

        case "customer.subscription.updated": {
          const sub = event.data.object as Stripe.Subscription;
          const tier = sub.metadata?.tier;
          if (tier && sub.status === "active") {
            const user = await findUserByStripeCustomer(sub.customer as string);
            if (user) {
              const monthlyTokens = TIER_CREDIT_LIMITS[tier] || TIER_CREDIT_LIMITS.free;
              await storage.updateUser(user.id, { tier });
              const plan = await storage.getUserPlan(user.id);
              if (plan) {
                await storage.updateUserPlan(plan.id, { tier, monthlyTokens });
              }
            }
          }
          break;
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const user = await findUserByStripeCustomer(sub.customer as string);
          if (user) {
            await storage.updateUser(user.id, { tier: "free", subscriptionId: "" });
            const plan = await storage.getUserPlan(user.id);
            if (plan) {
              await storage.updateUserPlan(plan.id, {
                tier: "free",
                monthlyTokens: TIER_CREDIT_LIMITS.free,
              });
            }
            console.log(`[stripe] Downgraded user ${user.id} to free (subscription cancelled)`);
          }
          break;
        }

        case "invoice.payment_failed": {
          const inv = event.data.object as Stripe.Invoice;
          const user = await findUserByStripeCustomer(inv.customer as string);
          if (user) {
            console.warn(`[stripe] Payment failed for user ${user.id} (${user.email})`);
          }
          break;
        }
      }

      res.json({ received: true });
    }
  );
}

/** Find a user by their stored Stripe customer ID */
async function findUserByStripeCustomer(customerId: string): Promise<any | null> {
  const allUsers = await storage.getAllUsers();
  return allUsers.find((u: any) => u.stripeCustomerId === customerId) || null;
}
