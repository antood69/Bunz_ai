/**
 * Services API — Fiverr-style gig management, client orders, earnings wallet.
 * Public order form + Stripe payment → auto-run workflow → deliver to client.
 */
import { Router, type Request, type Response } from "express";
import { storage } from "./storage";
import { stripe } from "./stripe";

export function createServicesRouter(): Router {
  const router = Router();

  // ══════════════════════════════════════════════════════════════════════
  // GIGS (seller manages their services)
  // ══════════════════════════════════════════════════════════════════════

  router.get("/gigs", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    res.json(await storage.getFiverrGigs(userId));
  });

  router.get("/gigs/:id", async (req: Request, res: Response) => {
    const gig = await storage.getFiverrGig(req.params.id as string);
    if (!gig) return res.status(404).json({ error: "Not found" });
    res.json(gig);
  });

  router.post("/gigs", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { title, category, description, priceTiers, autoResponse, aiModel, pipelineId } = req.body;
    if (!title) return res.status(400).json({ error: "Title required" });

    const gig = await storage.createFiverrGig({
      userId, title,
      category: category || "general",
      description: description || "",
      priceTiers: JSON.stringify(priceTiers || [
        { name: "Basic", price: 25, description: "Standard delivery", deliveryDays: 3 },
        { name: "Standard", price: 50, description: "Priority with revisions", deliveryDays: 2 },
        { name: "Premium", price: 100, description: "Rush + unlimited revisions", deliveryDays: 1 },
      ]),
      autoResponse: autoResponse || "",
      aiModel: aiModel || "gpt-5.4",
    });

    // Store pipeline reference if provided
    if (pipelineId) {
      await storage.updateFiverrGig(gig.id, { autoResponse: JSON.stringify({ pipelineId }) } as any);
    }

    res.json(gig);
  });

  router.put("/gigs/:id", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const gig = await storage.getFiverrGig(req.params.id as string);
    if (!gig) return res.status(404).json({ error: "Not found" });
    if ((gig as any).user_id !== userId) return res.status(403).json({ error: "Not yours" });
    await storage.updateFiverrGig(req.params.id as string, req.body);
    res.json(await storage.getFiverrGig(req.params.id as string));
  });

  router.delete("/gigs/:id", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const gig = await storage.getFiverrGig(req.params.id as string);
    if (!gig) return res.status(404).json({ error: "Not found" });
    if ((gig as any).user_id !== userId) return res.status(403).json({ error: "Not yours" });
    await storage.deleteFiverrGig(req.params.id as string);
    res.json({ ok: true });
  });

  // ══════════════════════════════════════════════════════════════════════
  // ORDERS (seller views incoming orders)
  // ══════════════════════════════════════════════════════════════════════

  router.get("/orders", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const status = req.query.status as string | undefined;
    const orders = await storage.getFiverrOrders(userId);
    const filtered = status ? orders.filter((o: any) => o.status === status) : orders;
    res.json(filtered);
  });

  router.get("/orders/:id", async (req: Request, res: Response) => {
    const order = await storage.getFiverrOrder(req.params.id as string);
    if (!order) return res.status(404).json({ error: "Not found" });
    res.json(order);
  });

  router.put("/orders/:id", async (req: Request, res: Response) => {
    const order = await storage.getFiverrOrder(req.params.id as string);
    if (!order) return res.status(404).json({ error: "Not found" });
    await storage.updateFiverrOrder(req.params.id as string, req.body);
    res.json(await storage.getFiverrOrder(req.params.id as string));
  });

  router.delete("/orders/:id", async (req: Request, res: Response) => {
    await storage.deleteFiverrOrderV2(req.params.id as string);
    res.json({ ok: true });
  });

  // ══════════════════════════════════════════════════════════════════════
  // EARNINGS / WALLET
  // ══════════════════════════════════════════════════════════════════════

  router.get("/earnings", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const orders = await storage.getFiverrOrders(userId);

    const delivered = orders.filter((o: any) => o.status === "delivered" || o.status === "complete");
    const pending = orders.filter((o: any) => o.status === "pending" || o.status === "active" || o.status === "in_progress");

    const totalEarnings = delivered.reduce((sum: number, o: any) => sum + (Number(o.revenue) || Number(o.amount) || 0), 0);
    const pendingEarnings = pending.reduce((sum: number, o: any) => sum + (Number(o.revenue) || Number(o.amount) || 0), 0);
    const totalOrders = orders.length;
    const completedOrders = delivered.length;

    res.json({
      totalEarnings,
      pendingEarnings,
      availableBalance: totalEarnings, // For now, all delivered = available
      totalOrders,
      completedOrders,
      recentOrders: orders.slice(0, 10),
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // PUBLIC ORDER FORM (no auth — clients use this)
  // ══════════════════════════════════════════════════════════════════════

  // Get gig details (public)
  router.get("/public/gigs/:id", async (req: Request, res: Response) => {
    const gig = await storage.getFiverrGig(req.params.id as string);
    if (!gig || !(gig as any).is_active) return res.status(404).json({ error: "Service not found" });
    // Strip sensitive info
    const g = gig as any;
    res.json({
      id: g.id, title: g.title, category: g.category,
      description: g.description,
      priceTiers: typeof g.price_tiers === "string" ? JSON.parse(g.price_tiers) : g.price_tiers,
    });
  });

  // Place order (public — creates Stripe checkout)
  router.post("/public/order", async (req: Request, res: Response) => {
    const { gigId, tierIndex, clientName, clientEmail, requirements } = req.body;
    if (!gigId || !clientName || !clientEmail) {
      return res.status(400).json({ error: "gigId, clientName, clientEmail required" });
    }

    const gig = await storage.getFiverrGig(gigId);
    if (!gig || !(gig as any).is_active) return res.status(404).json({ error: "Service not found" });

    const g = gig as any;
    const tiers = typeof g.price_tiers === "string" ? JSON.parse(g.price_tiers) : (g.price_tiers || []);
    const tier = tiers[tierIndex || 0] || tiers[0];
    if (!tier) return res.status(400).json({ error: "Invalid price tier" });

    const amount = Number(tier.price) || 0;

    // Create the order record
    const order = await storage.createFiverrOrder({
      gigId: g.id,
      userId: g.user_id,
      buyerName: clientName,
      requirements: requirements || "",
      amount,
    });
    // Update with extra fields
    await storage.updateFiverrOrder(order.id, {
      status: amount > 0 ? "awaiting_payment" : "pending",
      clientEmail, gigTitle: g.title, revenue: amount,
      orderId: `ORD-${Date.now().toString(36).toUpperCase()}`,
      specs: JSON.stringify({ tier: tier.name, deliveryDays: tier.deliveryDays }),
      autoGenerate: 1, dueAt: Date.now() + (tier.deliveryDays || 3) * 86400000,
    } as any);

    // If free, skip payment
    if (amount <= 0) {
      await triggerOrderWorkflow(order.id, g);
      return res.json({ ok: true, orderId: order.id, message: "Order placed!" });
    }

    // Create Stripe checkout for the client
    const origin = req.headers.origin || `https://${req.headers.host}`;
    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: `${g.title} — ${tier.name}` },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        }],
        customer_email: clientEmail,
        metadata: { orderId: order.id, gigId: g.id, sellerId: String(g.user_id) },
        success_url: `${origin}/#/order-success?order=${order.id}`,
        cancel_url: `${origin}/#/order/${gigId}?canceled=1`,
      });

      res.json({ ok: true, orderId: order.id, checkoutUrl: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

/** Trigger the linked workflow when a new order comes in */
async function triggerOrderWorkflow(orderId: string, gig: any) {
  try {
    const autoConfig = gig.auto_response ? JSON.parse(gig.auto_response) : null;
    if (!autoConfig?.pipelineId) return;
    // Mark as in progress — the pipeline will be run manually or via future automation
    await storage.updateFiverrOrder(orderId, { status: "in_progress" } as any);
  } catch {}
}
