/**
 * Stripe Product & Price Setup
 * Run once: npx tsx server/setup-stripe.ts
 * Creates products and prices, prints env vars to paste into Railway.
 */
import Stripe from "stripe";
import "dotenv/config";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-03-25.dahlia" });

const PLANS = [
  { id: "starter", name: "Cortal Starter", monthly: 1200, annual: 900 },
  { id: "pro",     name: "Cortal Pro",     monthly: 3900, annual: 2900 },
  { id: "agency",  name: "Cortal Agency",  monthly: 9900, annual: 7900 },
] as const;

async function main() {
  const envLines: string[] = [];

  for (const plan of PLANS) {
    // Create product
    const product = await stripe.products.create({
      name: plan.name,
      metadata: { tier: plan.id },
    });
    console.log(`Created product: ${product.name} (${product.id})`);

    // Monthly price
    const monthly = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.monthly,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { tier: plan.id, billing: "monthly" },
    });
    console.log(`  Monthly: $${plan.monthly / 100}/mo → ${monthly.id}`);
    envLines.push(`STRIPE_PRICE_${plan.id.toUpperCase()}_MONTHLY=${monthly.id}`);

    // Annual price
    const annual = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.annual,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { tier: plan.id, billing: "annual" },
    });
    console.log(`  Annual:  $${plan.annual / 100}/mo → ${annual.id}`);
    envLines.push(`STRIPE_PRICE_${plan.id.toUpperCase()}_ANNUAL=${annual.id}`);
  }

  console.log("\n── Add these to Railway Variables ──");
  console.log(envLines.join("\n"));
}

main().catch((e) => { console.error(e); process.exit(1); });
