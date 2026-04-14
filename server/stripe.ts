import Stripe from "stripe";
import type { Express, Request, Response } from "express";
import { storage } from "./storage";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("[stripe] STRIPE_SECRET_KEY is not set — Stripe features will be disabled");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: "2025-03-31.basil",
});

// Price IDs — populated by setup-stripe.ts or set manually here after running setup
// Replace these with your real price IDs after running: npx tsx server/setup-stripe.ts
export const PRICE_IDS = {
  pro_monthly:    process.env.STRIPE_PRICE_PRO_MONTHLY    || "",
  pro_annual:     process.env.STRIPE_PRICE_PRO_ANNUAL     || "",
  agency_monthly: process.env.STRIPE_PRICE_AGENCY_MONTHLY || "",
  agency_annual:  process.env.STRIPE_PRICE_AGENCY_ANNUAL  || "",
};

export function registerStripeRoutes(app: Express) {
  // ── Create Checkout Session ──────────────────────────────────────────────
  app.post("/api/stripe/checkout", async (req: Request, res: Response) => {
    const { tier, billing } = req.body as { tier: "pro" | "agency"; billing: "monthly" | "annual" };

    const priceKey = `${tier}_${billing}` as keyof typeof PRICE_IDS;
    const priceId = PRICE_IDS[priceKey];

    if (!priceId) {
      return res.status(400).json({ error: `Price not configured for ${tier}/${billing}. Run setup-stripe.ts first.` });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/pricing?success=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${origin}/pricing?canceled=1`,
        allow_promotion_codes: true,
        subscription_data: {
          metadata: { tier, billing },
        },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      console.error("Stripe checkout error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Customer Portal (manage subscription) ───────────────────────────────
  app.post("/api/stripe/portal", async (req: Request, res: Response) => {
    const { customerId } = req.body as { customerId: string };

    if (!customerId) {
      return res.status(400).json({ error: "customerId is required" });
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

      console.log(`[stripe webhook] ${event.type}`);

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const customerId = session.customer as string;
          const subscriptionId = session.subscription as string;
          const tier = (session.metadata?.tier as string) ||
                       (session.subscription_data as any)?.metadata?.tier || "pro";

          // Find user by stripeCustomerId if they've checked out before,
          // or update the most recently created user (fallback for now until auth is wired)
          // For now log it so we can wire to real auth later
          console.log(`✅ Checkout completed — customerId: ${customerId}, sub: ${subscriptionId}, tier: ${tier}`);
          // TODO: once auth is live, look up user by session.customer_email and update their tier
          break;
        }
        case "customer.subscription.updated": {
          const sub = event.data.object as Stripe.Subscription;
          console.log(`🔄 Subscription updated — ${sub.id}, status: ${sub.status}`);
          break;
        }
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          console.log(`❌ Subscription cancelled — ${sub.id}`);
          // TODO: downgrade user back to free tier
          break;
        }
        case "invoice.payment_failed": {
          const inv = event.data.object as Stripe.Invoice;
          console.log(`⚠️  Payment failed — customer: ${inv.customer}`);
          break;
        }
      }

      res.json({ received: true });
    }
  );
}

// Need express for raw body parsing in webhook
import express from "express";
