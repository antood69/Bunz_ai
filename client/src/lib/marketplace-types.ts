// Marketplace shared types — single source of truth for all marketplace pages

export type MarketplaceCategory = "workflow" | "agent" | "tool" | "prompt_pack" | "theme";
export type PriceType = "one_time" | "monthly" | "free";

export interface MarketplaceListing {
  id: string;
  sellerId: number;
  title: string;
  description: string;
  shortDescription: string | null;
  category: MarketplaceCategory;
  listingType: string;
  priceUsd: number;
  priceType: PriceType;
  contentRef: string | null;
  version: string;
  isPublished: number;
  isVerified: number;
  installCount: number;
  ratingAvg: number;
  ratingCount: number;
  previewImages: string | null;
  tags: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceListingWithStats extends MarketplaceListing {
  purchaseCount?: number;
  revenue?: number;
}

export interface MarketplaceReview {
  id: string;
  listingId: string;
  buyerId: number;
  purchaseId: string;
  rating: number;
  reviewText: string | null;
  isVerifiedPurchase: number;
  createdAt: string;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export const categoryColors: Record<string, { badge: string; placeholder: string }> = {
  workflow:    { badge: "bg-blue-500/15 text-blue-400 border-blue-500/20",    placeholder: "from-blue-900/40 to-blue-800/20" },
  agent:       { badge: "bg-violet-500/15 text-violet-400 border-violet-500/20", placeholder: "from-violet-900/40 to-violet-800/20" },
  tool:        { badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", placeholder: "from-emerald-900/40 to-emerald-800/20" },
  prompt_pack: { badge: "bg-orange-500/15 text-orange-400 border-orange-500/20", placeholder: "from-orange-900/40 to-orange-800/20" },
  theme:       { badge: "bg-pink-500/15 text-pink-400 border-pink-500/20",    placeholder: "from-pink-900/40 to-pink-800/20" },
};

export const categoryLabels: Record<string, string> = {
  workflow: "Workflow",
  agent: "Agent",
  tool: "Tool",
  prompt_pack: "Prompt Pack",
  theme: "Theme",
};

export function parseJsonArray(val: string | null): string[] {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return []; }
}

export function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

export function getPriceLabel(listing: MarketplaceListing): string {
  const isFree = listing.priceType === "free" || listing.priceUsd === 0;
  if (isFree) return "FREE";
  if (listing.priceType === "monthly") return `$${listing.priceUsd.toFixed(2)}/mo`;
  return `$${listing.priceUsd.toFixed(2)}`;
}

export function isFreeItem(listing: MarketplaceListing): boolean {
  return listing.priceType === "free" || listing.priceUsd === 0;
}
