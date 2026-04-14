import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import {
  ArrowLeft,
  Star,
  Download,
  Calendar,
  Package,
  Tag,
  User,
  LogIn,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  type MarketplaceListing,
  type MarketplaceReview,
  categoryColors,
  categoryLabels,
  parseJsonArray,
  formatDate,
  getPriceLabel,
  isFreeItem,
} from "@/lib/marketplace-types";

function StarRating({ rating, interactive = false, onRate }: { rating: number; interactive?: boolean; onRate?: (r: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`w-4 h-4 transition-colors ${
            s <= (interactive ? (hover || rating) : rating)
              ? "fill-yellow-400 text-yellow-400"
              : "text-muted-foreground"
          } ${interactive ? "cursor-pointer" : ""}`}
          onMouseEnter={() => interactive && setHover(s)}
          onMouseLeave={() => interactive && setHover(0)}
          onClick={() => interactive && onRate?.(s)}
        />
      ))}
    </div>
  );
}

function SimpleMarkdown({ text }: { text: string }) {
  const paragraphs = (text ?? "").split(/\n{2,}/);
  return (
    <div className="space-y-3 text-sm text-foreground/90 leading-relaxed">
      {paragraphs.map((para, i) => {
        const parts = para.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, j) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={j}>{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith("`") && part.endsWith("`")) {
            return <code key={j} className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
          }
          return part;
        });
        return <p key={i}>{parts}</p>;
      })}
    </div>
  );
}

function SkeletonDetail() {
  return (
    <div className="p-6 max-w-[1200px] space-y-6 animate-pulse">
      <div className="h-5 bg-muted rounded w-24" />
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          <div className="h-8 bg-muted rounded w-2/3" />
          <div className="h-4 bg-muted rounded w-full" />
          <div className="h-4 bg-muted rounded w-4/5" />
          <div className="h-48 bg-muted rounded" />
        </div>
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    </div>
  );
}

export default function MarketplaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [showReviewForm, setShowReviewForm] = useState(false);

  const listingQuery = useQuery<{ listing: MarketplaceListing; reviews: MarketplaceReview[] }>({
    queryKey: ["/api/marketplace/listings", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/marketplace/listings/${id}`);
      return res.json();
    },
    enabled: !!id,
  });

  const reviewsQuery = useQuery<{ reviews: MarketplaceReview[] }>({
    queryKey: ["/api/marketplace/listings", id, "reviews"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/marketplace/listings/${id}/reviews`);
      return res.json();
    },
    enabled: !!id,
  });

  const installMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/marketplace/listings/${id}/install`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/listings", id] });
      toast({ title: "Installed successfully" });
    },
    onError: () => toast({ title: "Install failed", variant: "destructive" }),
  });

  const purchaseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/marketplace/listings/${id}/purchase`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data?.url) window.location.href = data.url;
      else {
        queryClient.invalidateQueries({ queryKey: ["/api/marketplace/listings", id] });
        toast({ title: "Purchase successful" });
      }
    },
    onError: () => toast({ title: "Purchase failed", variant: "destructive" }),
  });

  const reviewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/marketplace/listings/${id}/reviews`, {
        rating: reviewRating,
        reviewText,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/listings", id, "reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/listings", id] });
      setReviewText("");
      setReviewRating(5);
      setShowReviewForm(false);
      toast({ title: "Review submitted" });
    },
    onError: () => toast({ title: "Failed to submit review", variant: "destructive" }),
  });

  if (listingQuery.isLoading) return <SkeletonDetail />;

  if (listingQuery.isError) {
    return (
      <div className="p-6 max-w-[1200px]">
        <Link href="/marketplace">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to Marketplace
          </button>
        </Link>
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-xl border border-red-500/20 bg-red-500/5">
          <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
          <p className="text-sm font-medium text-red-400 mb-1">Failed to load listing</p>
          <p className="text-xs text-red-400/70 mb-4">
            {listingQuery.error instanceof Error ? listingQuery.error.message : "This listing may not exist or there was a server error."}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-red-400 border-red-500/30 hover:bg-red-500/10"
            onClick={() => listingQuery.refetch()}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!listingQuery.data?.listing) {
    return (
      <div className="p-6 max-w-[1200px]">
        <Link href="/marketplace">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to Marketplace
          </button>
        </Link>
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-xl border border-amber-500/20 bg-amber-500/5">
          <Package className="w-10 h-10 text-amber-400 mb-3" />
          <p className="text-sm font-medium text-amber-400 mb-1">Listing not found</p>
          <p className="text-xs text-amber-400/70">This listing may have been removed or doesn't exist.</p>
        </div>
      </div>
    );
  }

  const listing = listingQuery.data.listing;
  const reviews = reviewsQuery.data?.reviews ?? listingQuery.data.reviews ?? [];
  const catColors = categoryColors[listing.category]?.badge ?? "bg-muted text-muted-foreground border-border";
  const catLabel = categoryLabels[listing.category] ?? listing.category;
  const isOwner = user?.role === "owner";
  const free = isOwner || isFreeItem(listing);
  const priceLabel = getPriceLabel(listing);
  const images = parseJsonArray(listing.previewImages);
  const tagsList = parseJsonArray(listing.tags);

  return (
    <div className="p-6 max-w-[1200px] space-y-6">
      {/* Back nav */}
      <Link href="/marketplace">
        <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Marketplace
        </button>
      </Link>

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: content */}
        <div className="lg:col-span-2 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${catColors}`}>{catLabel}</span>
              {listing.version && (
                <span className="text-[10px] text-muted-foreground px-2 py-0.5 rounded-full bg-muted">v{listing.version}</span>
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{listing.title}</h1>
            {listing.shortDescription && (
              <p className="text-sm text-muted-foreground">{listing.shortDescription}</p>
            )}
          </div>

          {/* Preview images */}
          {images.length > 0 && (
            <div className="space-y-2">
              {images.map((img, i) => (
                <div key={i} className="rounded-xl overflow-hidden border border-border">
                  <img
                    src={img}
                    alt={`${listing.title} preview ${i + 1}`}
                    className="w-full object-cover max-h-80"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).parentElement!.style.display = "none"; }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Full description */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold mb-3">Description</h2>
            <SimpleMarkdown text={listing.description} />
          </div>

          {/* Tags */}
          {tagsList.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Tag className="w-3.5 h-3.5 text-muted-foreground" />
              {tagsList.map((tag) => (
                <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right: price/action card */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5 space-y-4 sticky top-4">
            <div className="text-center">
              <span className="text-3xl font-bold">{free ? "Free" : priceLabel}</span>
              {listing.priceType === "monthly" && (
                <span className="text-xs text-muted-foreground ml-1">/ month</span>
              )}
            </div>

            {/* CTA */}
            {!isAuthenticated ? (
              <Button
                className="w-full gap-2"
                variant="outline"
                onClick={() => navigate("/login")}
              >
                <LogIn className="w-4 h-4" />
                Login to install
              </Button>
            ) : free ? (
              <Button
                className="w-full gap-2"
                onClick={() => installMutation.mutate()}
                disabled={installMutation.isPending}
              >
                <Download className="w-4 h-4" />
                {installMutation.isPending ? "Installing..." : "Install Free"}
              </Button>
            ) : (
              <Button
                className="w-full gap-2"
                onClick={() => purchaseMutation.mutate()}
                disabled={purchaseMutation.isPending}
              >
                {purchaseMutation.isPending ? "Redirecting..." : `Purchase — ${priceLabel}`}
              </Button>
            )}

            {/* Stats */}
            <div className="space-y-2.5 border-t border-border pt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Rating</span>
                <div className="flex items-center gap-1.5">
                  <StarRating rating={listing.ratingAvg ?? 0} />
                  <span className="text-muted-foreground">({listing.ratingCount ?? 0})</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Installs</span>
                <span className="font-medium">{(listing.installCount ?? 0).toLocaleString()}</span>
              </div>
              {listing.createdAt && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Published</span>
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-muted-foreground" />
                    <span>{formatDate(listing.createdAt)}</span>
                  </div>
                </div>
              )}
              {listing.updatedAt && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Updated</span>
                  <span>{formatDate(listing.updatedAt)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reviews section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            Reviews
            {reviews.length > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">({reviews.length})</span>
            )}
          </h2>
          {isAuthenticated && !showReviewForm && (
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowReviewForm(true)}>
              Write a Review
            </Button>
          )}
        </div>

        {/* Review form */}
        {showReviewForm && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-medium">Your Review</h3>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Rating</label>
              <StarRating rating={reviewRating} interactive onRate={setReviewRating} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Comment</label>
              <Textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Share your experience..."
                className="bg-background border-border min-h-[80px] text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => reviewMutation.mutate()}
                disabled={!reviewText.trim() || reviewMutation.isPending}
              >
                {reviewMutation.isPending ? "Submitting..." : "Submit Review"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setShowReviewForm(false); setReviewText(""); setReviewRating(5); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Review list */}
        {reviewsQuery.isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse space-y-2">
                <div className="h-3 bg-muted rounded w-1/4" />
                <div className="h-3 bg-muted rounded w-full" />
                <div className="h-3 bg-muted rounded w-3/4" />
              </div>
            ))}
          </div>
        ) : reviewsQuery.isError ? (
          <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-red-500/20 bg-red-500/5">
            <AlertTriangle className="w-8 h-8 text-red-400 mb-2" />
            <p className="text-sm font-medium text-red-400 mb-1">Failed to load reviews</p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-red-400 border-red-500/30 hover:bg-red-500/10 mt-2"
              onClick={() => reviewsQuery.refetch()}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </Button>
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            No reviews yet. Be the first to review this listing.
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <div key={review.id} className="bg-card border border-border rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                      <User className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="text-sm font-medium">Buyer #{review.buyerId}</span>
                    {review.isVerifiedPurchase === 1 && (
                      <span className="text-[10px] text-emerald-400">Verified</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StarRating rating={review.rating} />
                    <span className="text-[11px] text-muted-foreground">{formatDate(review.createdAt)}</span>
                  </div>
                </div>
                {review.reviewText && (
                  <p className="text-sm text-muted-foreground leading-relaxed pl-9">{review.reviewText}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
