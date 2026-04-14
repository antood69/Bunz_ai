/**
 * One-time script to create Stripe products and prices for Bunz.
 * Run once: npx tsx server/setup-stripe.ts
 * 
 * It will output the price IDs — paste them into your .env file.
 */
import { config } from "dotenv";
config();

import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  console.error("❌ STRIPE_SECRET_KEY not found in .env");
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-03-31.basil",
});

async function main() {
  console.log("🚀 Setting up Stripe products for Bunz...\n");

  // ── PRO PLAN ──────────────────────────────────────────────────────────────
  const pro = await stripe.products.create({
    name: "Bunz Pro",
    description: "Scale your AI workforce without limits — 10 agents, 10 workflows, all 4 AI models.",
    metadata: { tier: "pro" },
  });

  const proMonthly = await stripe.prices.create({
    product: pro.id,
    unit_amount: 2900,          // $29.00
    currency: "usd",
    recurring: { interval: "month" },
    nickname: "Pro Monthly",
  });

  const proAnnual = await stripe.prices.create({
    product: pro.id,
    unit_amount: 27600,         // $23/mo × 12 = $276/yr
    currency: "usd",
    recurring: { interval: "year" },
    nickname: "Pro Annual",
  });

  // ── AGENCY PLAN ───────────────────────────────────────────────────────────
  const agency = await stripe.products.create({
    name: "Bunz Agency",
    description: "Unlimited power for teams & white-label deployments.",
    metadata: { tier: "agency" },
  });

  const agencyMonthly = await stripe.prices.create({
    product: agency.id,
    unit_amount: 9900,          // $99.00
    currency: "usd",
    recurring: { interval: "month" },
    nickname: "Agency Monthly",
  });

  const agencyAnnual = await stripe.prices.create({
    product: agency.id,
    unit_amount: 94800,         // $79/mo × 12 = $948/yr
    currency: "usd",
    recurring: { interval: "year" },
    nickname: "Agency Annual",
  });

  console.log("✅ Products and prices created!\n");
  console.log("Add these to your .env file:\n");
  console.log(`STRIPE_PRICE_PRO_MONTHLY=${proMonthly.id}`);
  console.log(`STRIPE_PRICE_PRO_ANNUAL=${proAnnual.id}`);
  console.log(`STRIPE_PRICE_AGENCY_MONTHLY=${agencyMonthly.id}`);
  console.log(`STRIPE_PRICE_AGENCY_ANNUAL=${agencyAnnual.id}`);
  console.log("\nDone! 🎉");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
