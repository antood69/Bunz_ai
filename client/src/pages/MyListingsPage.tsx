import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Plus,
  Pencil,
  Trash2,
  Package,
  Eye,
  EyeOff,
  ArrowLeft,
  Star,
  Download,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  type MarketplaceListingWithStats,
  categoryColors,
  categoryLabels,
  parseJsonArray,
  getPriceLabel,
} from "@/lib/marketplace-types";

interface ListingFormData {
  title: string;
  shortDescription: string;
  description: string;
  category: string;
  priceUsd: string;
  priceType: string;
  tags: string;
  previewImages: string;
  isPublished: boolean;
}

const emptyForm: ListingFormData = {
  title: "",
  shortDescription: "",
  description: "",
  category: "tool",
  priceUsd: "0",
  priceType: "free",
  tags: "",
  previewImages: "",
  isPublished: false,
};

function listingToForm(l: MarketplaceListingWithStats): ListingFormData {
  return {
    title: l.title,
    shortDescription: l.shortDescription ?? "",
    description: l.description,
    category: l.category,
    priceUsd: String(l.priceUsd ?? 0),
    priceType: l.priceType,
    tags: parseJsonArray(l.tags).join(", "),
    previewImages: parseJsonArray(l.previewImages).join(", "),
    isPublished: l.isPublished === 1,
  };
}

function ListingFormModal({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: MarketplaceListingWithStats | null;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<ListingFormData>(() =>
    editing ? listingToForm(editing) : emptyForm
  );

  const set = (key: keyof ListingFormData, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const buildPayload = () => ({
    title: form.title.trim(),
    shortDescription: form.shortDescription.trim(),
    description: form.description.trim(),
    category: form.category,
    priceUsd: parseFloat(form.priceUsd) || 0,
    priceType: form.priceType,
    tags: form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    previewImages: form.previewImages
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean),
    isPublished: form.isPublished,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/marketplace/listings", buildPayload());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/my/listings"] });
      toast({ title: "Listing created" });
      onClose();
    },
    onError: () => toast({ title: "Failed to create listing", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/marketplace/listings/${editing!.id}`, buildPayload());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/my/listings"] });
      toast({ title: "Listing updated" });
      onClose();
    },
    onError: () => toast({ title: "Failed to update listing", variant: "destructive" }),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) updateMutation.mutate();
    else createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Listing" : "Create New Listing"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Title *</label>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. SEO Audit Workflow"
              required
              className="bg-background border-border"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Short Description *</label>
            <Input
              value={form.shortDescription}
              onChange={(e) => set("shortDescription", e.target.value)}
              placeholder="One-line summary for listing cards"
              required
              className="bg-background border-border"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Full Description</label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Detailed description..."
              className="bg-background border-border min-h-[120px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Category *</label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="workflow">Workflow</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="tool">Tool</SelectItem>
                  <SelectItem value="prompt_pack">Prompt Pack</SelectItem>
                  <SelectItem value="theme">Theme</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Price Type *</label>
              <Select
                value={form.priceType}
                onValueChange={(v) => {
                  set("priceType", v);
                  if (v === "free") set("priceUsd", "0");
                }}
              >
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="one_time">One-time</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.priceType !== "free" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Price (USD) *</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.priceUsd}
                onChange={(e) => set("priceUsd", e.target.value)}
                placeholder="9.99"
                className="bg-background border-border"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Tags <span className="font-normal">(comma-separated)</span>
            </label>
            <Input
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              placeholder="automation, seo, research"
              className="bg-background border-border"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Preview Image URLs <span className="font-normal">(comma-separated)</span>
            </label>
            <Input
              value={form.previewImages}
              onChange={(e) => set("previewImages", e.target.value)}
              placeholder="https://example.com/preview.png"
              className="bg-background border-border"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => set("isPublished", !form.isPublished)}
              className={`relative w-10 rounded-full transition-colors ${
                form.isPublished ? "bg-primary" : "bg-muted"
              }`}
              style={{ height: "22px" }}
            >
              <span
                className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow"
                style={{ transform: form.isPublished ? "translateX(18px)" : "translateX(0)" }}
              />
            </button>
            <span className="text-sm text-muted-foreground">
              {form.isPublished ? "Published — visible in marketplace" : "Draft — not visible publicly"}
            </span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" disabled={!form.title.trim() || isPending} className="flex-1">
              {isPending ? "Saving..." : editing ? "Save Changes" : "Create Listing"}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function MyListingsPage() {
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<MarketplaceListingWithStats | null>(null);

  const listingsQuery = useQuery<MarketplaceListingWithStats[]>({
    queryKey: ["/api/marketplace/my/listings"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/marketplace/my/listings");
      const json = await res.json();
      return json.listings ?? [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/marketplace/listings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/my/listings"] });
      toast({ title: "Listing deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const openCreate = () => {
    setEditingListing(null);
    setModalOpen(true);
  };

  const openEdit = (listing: MarketplaceListingWithStats) => {
    setEditingListing(listing);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingListing(null);
  };

  return (
    <div className="p-6 space-y-5 max-w-[1100px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/marketplace">
            <button className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold">My Listings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage your marketplace listings</p>
          </div>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Create Listing
        </Button>
      </div>

      {/* Listings */}
      {listingsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      ) : listingsQuery.isError ? (
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-xl border border-red-500/20 bg-red-500/5">
          <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
          <p className="text-sm font-medium text-red-400 mb-1">Failed to load your listings</p>
          <p className="text-xs text-red-400/70 mb-4">
            {listingsQuery.error instanceof Error ? listingsQuery.error.message : "An unexpected error occurred."}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-red-400 border-red-500/30 hover:bg-red-500/10"
            onClick={() => listingsQuery.refetch()}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </Button>
        </div>
      ) : !listingsQuery.data?.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="w-12 h-12 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-1">No listings yet</p>
          <p className="text-xs text-muted-foreground mb-4">Create your first listing to sell in the marketplace</p>
          <Button size="sm" className="gap-2" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            Create Listing
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {listingsQuery.data.map((listing) => {
            const catColor = categoryColors[listing.category]?.badge ?? "bg-muted text-muted-foreground border-border";
            const catLabel = categoryLabels[listing.category] ?? listing.category;
            const priceLabel = getPriceLabel(listing);

            return (
              <div
                key={listing.id}
                className="bg-card border border-border rounded-xl p-4 flex items-center gap-4"
              >
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    listing.isPublished === 1 ? "bg-emerald-400" : "bg-muted-foreground"
                  }`}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-sm font-medium truncate">{listing.title}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${catColor}`}>
                      {catLabel}
                    </span>
                    {listing.isPublished === 1 ? (
                      <span className="flex items-center gap-0.5 text-[10px] text-emerald-400">
                        <Eye className="w-2.5 h-2.5" /> Published
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <EyeOff className="w-2.5 h-2.5" /> Draft
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{listing.shortDescription ?? ""}</p>
                </div>

                <div className="hidden md:flex items-center gap-4 flex-shrink-0 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Download className="w-3 h-3" />
                    {(listing.installCount ?? 0).toLocaleString()}
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    {(listing.ratingAvg ?? 0).toFixed(1)}
                  </div>
                  <span className="font-medium text-foreground">{priceLabel}</span>
                  {listing.revenue !== undefined && listing.revenue > 0 && (
                    <span className="text-emerald-400 font-medium">${listing.revenue.toFixed(2)}</span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Link href={`/marketplace/${listing.id}`}>
                    <button className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </Link>
                  <button
                    onClick={() => openEdit(listing)}
                    className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Delete this listing?")) deleteMutation.mutate(listing.id);
                    }}
                    className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit modal */}
      {modalOpen && (
        <ListingFormModal
          open={modalOpen}
          onClose={handleCloseModal}
          editing={editingListing}
        />
      )}
    </div>
  );
}
