/**
 * Workshop API — community marketplace for workflows, bots, and tools.
 */
import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { storage } from "./storage";

export function createWorkshopRouter(): Router {
  const router = Router();

  // ── Browse listings (public-ish) ───────────────────────────────────
  router.get("/listings", async (req: Request, res: Response) => {
    const { category, search, priceType, sortBy, limit, offset } = req.query;
    const listings = await storage.getListings({
      category: category as string,
      search: search as string,
      priceType: priceType as string,
      sortBy: (sortBy as string) || "install_count",
      isPublished: 1,
      limit: Number(limit) || 30,
      offset: Number(offset) || 0,
    });

    // Attach seller info
    const enriched = await Promise.all(listings.map(async (l: any) => {
      const seller = await storage.getUser(l.seller_id || l.sellerId);
      return {
        ...l,
        sellerName: seller?.displayName || seller?.username || "Unknown",
        sellerAvatar: seller?.avatarUrl || null,
      };
    }));

    res.json(enriched);
  });

  // ── Get single listing detail ──────────────────────────────────────
  router.get("/listings/:id", async (req: Request, res: Response) => {
    const listing = await storage.getListing(req.params.id as string);
    if (!listing) return res.status(404).json({ error: "Not found" });

    const seller = await storage.getUser((listing as any).seller_id || (listing as any).sellerId);

    res.json({
      ...listing,
      sellerName: seller?.displayName || seller?.username || "Unknown",
      sellerAvatar: seller?.avatarUrl || null,
    });
  });

  // ── Publish a workflow to the workshop ─────────────────────────────
  router.post("/publish", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { title, description, shortDescription, category, priceUsd, pipelineId, tags } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: "Title and description required" });
    }

    // Get the pipeline data to attach
    let attachedData: any = null;
    if (pipelineId) {
      const pipeline = await storage.getPipeline(pipelineId);
      if (pipeline) {
        attachedData = {
          name: pipeline.name,
          description: pipeline.description,
          steps: pipeline.steps,
          triggerType: pipeline.trigger_type,
        };
      }
    }

    const listing = await storage.createListing({
      sellerId: userId,
      title,
      description,
      shortDescription: shortDescription || description.slice(0, 120),
      category: (category || "workflow") as any,
      priceUsd: Number(priceUsd) || 0,
      priceType: Number(priceUsd) > 0 ? "one_time" : "free",
      isPublished: 1,
      isVerified: 0,
      tags: tags || "",
      previewImages: "",
      version: "1.0.0",
      contentRef: attachedData ? JSON.stringify(attachedData) : pipelineId || "",
      listingType: pipelineId ? "workflow" : "standalone",
    });

    res.json(listing);
  });

  // ── Install / clone a workshop item ────────────────────────────────
  router.post("/listings/:id/install", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const listing = await storage.getListing(req.params.id as string);
    if (!listing) return res.status(404).json({ error: "Listing not found" });

    const l = listing as any;

    // For paid items, check purchase (skip for now — free first)
    if (l.price_type === "paid" || l.priceType === "paid") {
      return res.status(402).json({ error: "Paid listings not yet supported. Coming soon!" });
    }

    // Clone the workflow into user's pipelines
    const attachedData = l.content_ref || l.contentRef;
    if (attachedData) {
      let data: any;
      try { data = typeof attachedData === "string" ? JSON.parse(attachedData) : attachedData; } catch { data = null; }

      if (data?.steps) {
        const pipeline = await storage.createPipeline({
          id: uuidv4(),
          userId,
          name: data.name || l.title,
          description: data.description || l.description || "",
          triggerType: data.triggerType || "manual",
          triggerConfig: null,
          steps: data.steps,
        });

        // Increment install count
        await storage.updateListing(l.id, { installCount: (l.install_count || l.installCount || 0) + 1 });

        return res.json({ ok: true, pipelineId: pipeline.id, message: `Installed "${data.name || l.title}" to your workflows` });
      }
    }

    res.status(400).json({ error: "This listing has no installable content" });
  });

  // ── My listings (seller dashboard) ─────────────────────────────────
  router.get("/my-listings", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const listings = await storage.getListingsBySeller(userId);
    res.json(listings);
  });

  // ── Update listing ─────────────────────────────────────────────────
  router.put("/listings/:id", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const listing = await storage.getListing(req.params.id as string);
    if (!listing) return res.status(404).json({ error: "Not found" });
    const l = listing as any;
    if ((l.seller_id || l.sellerId) !== userId && req.user!.role !== "owner") {
      return res.status(403).json({ error: "Not your listing" });
    }
    const updated = await storage.updateListing(req.params.id as string, req.body);
    res.json(updated);
  });

  // ── Delete listing ─────────────────────────────────────────────────
  router.delete("/listings/:id", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const listing = await storage.getListing(req.params.id as string);
    if (!listing) return res.status(404).json({ error: "Not found" });
    const l = listing as any;
    if ((l.seller_id || l.sellerId) !== userId && req.user!.role !== "owner") {
      return res.status(403).json({ error: "Not your listing" });
    }
    await storage.updateListing(req.params.id as string, { isPublished: 0 } as any);
    res.json({ ok: true });
  });

  // ── Categories summary ─────────────────────────────────────────────
  router.get("/categories", async (_req: Request, res: Response) => {
    res.json([
      { id: "workflow", name: "Workflows", icon: "GitBranch", description: "Multi-step automations" },
      { id: "bot", name: "Bots", icon: "Bot", description: "Autonomous agents" },
      { id: "template", name: "Templates", icon: "FileText", description: "Pre-built prompts & configs" },
      { id: "connector", name: "Connectors", icon: "Plug", description: "Service integrations" },
      { id: "tool", name: "Tools", icon: "Wrench", description: "Custom tools & scripts" },
    ]);
  });

  return router;
}
