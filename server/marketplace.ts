import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { storage } from "./storage";
import { stripe } from "./stripe";

const PLATFORM_FEE_RATE = 0.20; // 20% platform fee

function noCacheHeaders(res: Response) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
}

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.user) {
    noCacheHeaders(res);
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

export function createMarketplaceRouter(): Router {
  const router = Router();

  // ── HEALTH CHECK ──────────────────────────────────────────────────────────
  router.get("/health", (_req: Request, res: Response) => {
    noCacheHeaders(res);
    res.json({ ok: true });
  });

  // ── PUBLIC ROUTES ─────────────────────────────────────────────────────────

  // GET /api/marketplace/listings — browse with filters
  router.get("/listings", async (req: Request, res: Response) => {
    try {
      const category = req.query.category as string | undefined;
      const search = req.query.search as string | undefined;
      const minRating = req.query.minRating as string | undefined;
      const priceType = req.query.priceType as string | undefined;
      const sortBy = req.query.sortBy as string | undefined;
      const limit = req.query.limit as string | undefined;
      const offset = req.query.offset as string | undefined;

      const listings = await storage.getListings({
        category: category || undefined,
        search: search || undefined,
        minRating: minRating ? parseFloat(minRating) : undefined,
        priceType: priceType || undefined,
        isPublished: 1,
        sortBy: sortBy || "popular",
        limit: limit ? parseInt(limit) : 20,
        offset: offset ? parseInt(offset) : 0,
      });

      noCacheHeaders(res);
      res.json({ listings, total: listings.length });
    } catch (err: any) {
      console.error("[marketplace] GET /listings error:", err.message);
      noCacheHeaders(res);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/marketplace/listings/:id — single listing detail with reviews
  router.get("/listings/:id", async (req: Request, res: Response) => {
    try {
      const listing = await storage.getListing(req.params.id);
      if (!listing || !listing.isPublished) {
        noCacheHeaders(res);
        return res.status(404).json({ error: "Listing not found" });
      }
      const reviews = await storage.getReviewsByListing(listing.id, 10, 0);
      noCacheHeaders(res);
      res.json({ listing, reviews });
    } catch (err: any) {
      console.error("[marketplace] GET /listings/:id error:", err.message);
      noCacheHeaders(res);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/marketplace/listings/:id/reviews — paginated reviews
  router.get("/listings/:id/reviews", async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit as string | undefined;
      const offset = req.query.offset as string | undefined;
      const listing = await storage.getListing(req.params.id);
      if (!listing) {
        noCacheHeaders(res);
        return res.status(404).json({ error: "Listing not found" });
      }
      const reviews = await storage.getReviewsByListing(
        req.params.id,
        limit ? parseInt(limit) : 20,
        offset ? parseInt(offset) : 0
      );
      noCacheHeaders(res);
      res.json({ reviews });
    } catch (err: any) {
      console.error("[marketplace] GET /listings/:id/reviews error:", err.message);
      noCacheHeaders(res);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/marketplace/featured
  router.get("/featured", async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit as string | undefined;
      const listings = await storage.getFeaturedListings(limit ? parseInt(limit) : 10);
      noCacheHeaders(res);
      res.json({ listings });
    } catch (err: any) {
      console.error("[marketplace] GET /featured error:", err.message);
      noCacheHeaders(res);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/marketplace/trending
  router.get("/trending", async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit as string | undefined;
      const listings = await storage.getTrendingListings(limit ? parseInt(limit) : 10);
      noCacheHeaders(res);
      res.json({ listings });
    } catch (err: any) {
      console.error("[marketplace] GET /trending error:", err.message);
      noCacheHeaders(res);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/marketplace/categories — 5 categories with counts
  router.get("/categories", async (_req: Request, res: Response) => {
    try {
      const all = ["workflow", "agent", "tool", "prompt_pack", "theme"];
      const counts = await storage.getCategoryCounts();
      const countMap: Record<string, number> = {};
      for (const c of counts) countMap[c.category] = c.count;
      const categories = all.map(cat => ({ category: cat, count: countMap[cat] || 0 }));
      noCacheHeaders(res);
      res.json({ categories });
    } catch (err: any) {
      console.error("[marketplace] GET /categories error:", err.message);
      noCacheHeaders(res);
      res.status(500).json({ error: err.message });
    }
  });

  // ── AUTHENTICATED ROUTES ──────────────────────────────────────────────────

  // POST /api/marketplace/listings — create listing
  router.post("/listings", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const {
        title,
        description,
        shortDescription,
        category,
        listingType,
        priceUsd,
        priceType,
        contentRef,
        version,
        isPublished,
        previewImages,
        tags,
        attachedItemId,
        attachedItemData,
      } = req.body;

      if (!title || !description || !category) {
        noCacheHeaders(res);
        return res.status(400).json({ error: "title, description, and category are required" });
      }

      const validCategories = ["workflow", "agent", "tool", "prompt_pack", "theme"];
      if (!validCategories.includes(category)) {
        noCacheHeaders(res);
        return res.status(400).json({ error: `category must be one of: ${validCategories.join(", ")}` });
      }

      const validPriceTypes = ["one_time", "monthly", "free"];
      const resolvedPriceType = priceType || ((!priceUsd || priceUsd === 0) ? "free" : "one_time");
      if (!validPriceTypes.includes(resolvedPriceType)) {
        noCacheHeaders(res);
        return res.status(400).json({ error: `priceType must be one of: ${validPriceTypes.join(", ")}` });
      }

      // Build contentRef from attachedItemId/Data if provided
      let resolvedContentRef = contentRef ? JSON.stringify(contentRef) : null;
      if (!resolvedContentRef && (attachedItemId || attachedItemData)) {
        resolvedContentRef = JSON.stringify({ attachedItemId, attachedItemData });
      }

      const listing = await storage.createListing({
        sellerId: user.id,
        title,
        description,
        shortDescription: shortDescription || null,
        category,
        listingType: listingType || "standalone",
        priceUsd: priceUsd ?? 0,
        priceType: resolvedPriceType,
        contentRef: resolvedContentRef,
        version: version || "1.0.0",
        isPublished: isPublished ? 1 : 0,
        isVerified: 0,
        previewImages: previewImages ? JSON.stringify(previewImages) : null,
        tags: tags ? JSON.stringify(tags) : null,
      });

      noCacheHeaders(res);
      res.status(201).json({ listing });
    } catch (err: any) {
      console.error("[marketplace] POST /listings error:", err.message);
      noCacheHeaders(res);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/marketplace/sell-item — alias for POST /listings (used by SellOnMarketplace component)
  router.post("/sell-item", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const { title, description, price, priceType, category, listingType, attachedItemId, attachedItemData } = req.body;

      if (!title || !description || !category) {
        noCacheHeaders(res);
        return res.status(400).json({ error: "title, description, and category are required" });
      }

      const resolvedPriceType = priceType || ((price === 0 || !price) ? "free" : "one_time");
      let contentRef = null;
      if (attachedItemId || attachedItemData) {
        contentRef = JSON.stringify({ attachedItemId, attachedItemData });
      }

      const listing = await storage.createListing({
        sellerId: user.id,
        title,
        description,
        shortDescription: null,
        category,
        listingType: listingType || "standalone",
        priceUsd: price ?? 0,
        priceType: resolvedPriceType,
        contentRef,
        version: "1.0.0",
        isPublished: 1,
        isVerified: 0,
        previewImages: null,
        tags: null,
      });

      noCacheHeaders(res);
      res.status(201).json({ listing });
    } catch (err: any) {
      console.error("[marketplace] POST /sell-item error:", err.message);
      noCacheHeaders(res);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/marketplace/listings/:id — update own listing
  router.put("/listings/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const listing = await storage.getListing(req.params.id);
      if (!listing) {
        noCacheHeaders(res);
        return res.status(404).json({ error: "Listing not found" });
      }
      if (listing.sellerId !== user.id && user.role !== "owner" && user.role !== "admin") {
        noCacheHeaders(res);
        return res.status(403).json({ error: "Not authorized to edit this listing" });
      }

      const allowedFields = [
        "title", "description", "shortDescription", "category", "listingType",
        "priceUsd", "priceType", "version", "isPublished", "previewImages", "tags",
      ];
      const updates: Record<string, any> = {};
      for (const field of allowedFields) {
        if (field in req.body) {
          if (field === "previewImages" || field === "tags") {
            updates[field] = req.body[field] ? JSON.stringify(req.body[field]) : null;
          } else {
            updates[field] = req.body[field];
          }
        }
      }
      if ("contentRef" in req.body) {
        updates["contentRef"] = req.body.contentRef ? JSON.stringify(req.body.contentRef) : null;
      }

      const updated = await storage.updateListing(req.params.id, updates);
      noCacheHeaders(res);
      res.json({ listing: updated });
    } catch (err: any) {
      console.error("[marketplace] PUT /listings/:id error:", err.message);
      noCacheHeaders(res);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/marketplace/listings/:id — delete own listing (only if no purchases)
  router.delete("/listings/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const listing = await storage.getListing(req.params.id);
      if (!listing) {
        noCacheHeaders(res);
        return res.status(404).json({ error: "Listing not found" });
      }
      if (listing.sellerId !== user.id && user.role !== "owner" && user.role !== "admin") {
        noCacheHeaders(res);
        return res.status(403).json({ error: "Not authorized to delete this listing" });
      }
      const purchases = await storage.getPurchasesBySeller(listing.sellerId);
      const hasPurchasesForListing = purchases.some(p => p.listingId === listing.id);
      if (hasPurchasesForListing) {
        noCacheHeaders(res);
        return res.status(409).json({ error: "Cannot delete a listing that has been purchased" });
      }
      await storage.deleteListing(req.params.id);
      noCacheHeaders(res);
      res.status(204).end();
    } catch (err: any) {
      console.error("[marketplace] DELETE /listings/:id error:", err.message);
      noCacheHeaders(res);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/marketplace/listings/:id/install — install a free listing
  router.post("/listings/:id/install", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const listing = await storage.getListing(req.params.id);
      if (!listing || !listing.isPublished) {
        noCacheHeaders(res);
        return res.status(404).json({ error: "Listing not found" });
      }
      if (listing.priceUsd > 0 && listing.priceType !== "free" && user.role !== "owner") {
        noCacheHeaders(res);
        return res.status(400).json({ error: "This listing is not free. Use /purchase instead." });
      }
      const already = await storage.hasPurchased(user.id, listing.id);
      if (already) {
        noCacheHeaders(res);
        return res.status(409).json({ error: "Already installed" });
      }
      const purchase = await storage.createPurchase({
        listingId: listing.id,
        buyerId: user.id,
        sellerId: listing.sellerId,
        amountUsd: 0,
        platformFeeUsd: 0,
        sellerPayoutUsd: 0,
        stripePaymentId: null,
        stripeTransferId: null,
      });
      await storage.incrementInstallCount(listing.id);
      noCacheHeaders(res);
      res.status(201).json({ purchase });
    } catch (err: any) {
      console.error("[marketplace] POST /listings/:id/install error:", err.message);
      noCacheHeaders(res);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/marketplace/listings/:id/purchase — purchase paid listing
  router.post("/listings/:id/purchase", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const listing = await storage.getListing(req.params.id);
      if (!listing || !listing.isPublished) {
        noCacheHeaders(res);
        return res.status(404).json({ error: "Listing not found" });
      }
      if (listing.priceUsd <= 0 || listing.priceType === "free") {
        noCacheHeaders(res);
        return res.status(400).json({ error: "This listing is free. Use /install instead." });
      }
      const already = await storage.hasPurchased(user.id, listing.id);
      if (already) {
        noCacheHeaders(res);
        return res.status(409).json({ error: "Already purchased" });
      }

      // Owner bypasses payment — auto-install for free
      if (user.role === "owner") {
        const purchase = await storage.createPurchase({
          listingId: listing.id,
          buyerId: user.id,
          sellerId: listing.sellerId,
          amountUsd: 0,
          platformFeeUsd: 0,
          sellerPayoutUsd: 0,
          stripePaymentId: null,
          stripeTransferId: null,
        });
        await storage.incrementInstallCount(listing.id);
        noCacheHeaders(res);
        return res.status(201).json({ purchase });
      }

      const origin = req.headers.origin || `https://${req.headers.host}`;
      const amountCents = Math.round(listing.priceUsd * 100);

      try {
        const session = await stripe.checkout.sessions.create({
          mode: listing.priceType === "monthly" ? "subscription" : "payment",
          payment_method_types: ["card"],
          line_items: [{
            price_data: {
              currency: "usd",
              unit_amount: amountCents,
              ...(listing.priceType === "monthly" ? {
                recurring: { interval: "month" },
              } : {}),
              product_data: {
                name: listing.title,
                description: listing.shortDescription || listing.description.slice(0, 200),
              },
            },
            quantity: 1,
          }],
          success_url: `${origin}/marketplace/listing/${listing.id}?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/marketplace/listing/${listing.id}?purchase=canceled`,
          customer_email: user.email,
          metadata: {
            listingId: listing.id,
            buyerId: String(user.id),
            sellerId: String(listing.sellerId),
            amountUsd: String(listing.priceUsd),
          },
        });

        noCacheHeaders(res);
        res.json({ url: session.url, sessionId: session.id });
      } catch (stripeErr: any) {
        console.error("[marketplace] Stripe checkout error:", stripeErr.message);
        noCacheHeaders(res);
        res.status(500).json({ error: stripeErr.message });
      }
    } catch (err: any) {
      console.error("[marketplace] POST /listings/:id/purchase error:", err.message);
      noCacheHeaders(res);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/marketplace/listings/:id/reviews — leave a review
  router.post("/listings/:id/reviews", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const listing = await storage.getListing(req.params.id);
      if (!listing) {
        noCacheHeaders(res);
        return res.status(404).json({ error: "Listing not found" });
      }

      const purchased = await storage.hasPurchased(user.id, listing.id);
      if (!purchased) {
        noCacheHeaders(res);
        return res.status(403).json({ error: "You must purchase this listing before reviewing it" });
      }
      const existing = await storage.getReviewByBuyerAndListing(user.id, listing.id);
      if (existing) {
        noCacheHeaders(res);
        return res.status(409).json({ error: "You have already reviewed this listing" });
      }

      const { rating, reviewText } = req.body;
      if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
        noCacheHeaders(res);
        return res.status(400).json({ error: "rating must be a number between 1 and 5" });
      }

      const purchases = await storage.getPurchasesByBuyer(user.id);
      const purchase = purchases.find(p => p.listingId === listing.id);
      if (!purchase) {
        noCacheHeaders(res);
        return res.status(400).json({ error: "Purchase record not found" });
      }

      const review = await storage.createReview({
        listingId: listing.id,
        buyerId: user.id,
        purchaseId: purchase.id,
        rating,
        reviewText: reviewText || null,
        isVerifiedPurchase: 1,
      });

      noCacheHeaders(res);
      res.status(201).json({ review });
    } catch (err: any) {
      console.error("[marketplace] POST /listings/:id/reviews error:", err.message);
      noCacheHeaders(res);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/marketplace/my/listings — seller's own listings with stats
  router.get("/my/listings", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const listings = await storage.getListingsBySeller(user.id);
      const withStats = await Promise.all(listings.map(async l => {
        const purchases = await storage.getPurchasesBySeller(user.id);
        const listingPurchases = purchases.filter(p => p.listingId === l.id);
        return {
          ...l,
          purchaseCount: listingPurchases.length,
          revenue: listingPurchases.reduce((sum, p) => sum + p.sellerPayoutUsd, 0),
        };
      }));
      noCacheHeaders(res);
      res.json({ listings: withStats });
    } catch (err: any) {
      console.error("[marketplace] GET /my/listings error:", err.message);
      noCacheHeaders(res);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/marketplace/my/purchases — buyer's purchase history
  router.get("/my/purchases", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const purchases = await storage.getPurchasesByBuyer(user.id);
      const enriched = await Promise.all(purchases.map(async p => {
        const listing = await storage.getListing(p.listingId);
        return { ...p, listing: listing ? { id: listing.id, title: listing.title, category: listing.category } : null };
      }));
      noCacheHeaders(res);
      res.json({ purchases: enriched });
    } catch (err: any) {
      console.error("[marketplace] GET /my/purchases error:", err.message);
      noCacheHeaders(res);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/marketplace/my/sales — seller's sales + revenue summary
  router.get("/my/sales", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const sales = await storage.getPurchasesBySeller(user.id);
      const totalRevenue = sales.reduce((sum, s) => sum + s.sellerPayoutUsd, 0);
      const totalGross = sales.reduce((sum, s) => sum + s.amountUsd, 0);
      const totalFees = sales.reduce((sum, s) => sum + s.platformFeeUsd, 0);
      const enriched = await Promise.all(sales.map(async s => {
        const listing = await storage.getListing(s.listingId);
        return { ...s, listing: listing ? { id: listing.id, title: listing.title, category: listing.category } : null };
      }));
      noCacheHeaders(res);
      res.json({
        sales: enriched,
        summary: {
          totalSales: sales.length,
          totalGross,
          totalFees,
          totalRevenue,
        },
      });
    } catch (err: any) {
      console.error("[marketplace] GET /my/sales error:", err.message);
      noCacheHeaders(res);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
