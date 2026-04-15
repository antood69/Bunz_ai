import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Store, Search, Download, GitBranch, Bot, FileText, Plug, Wrench,
  Star, Loader2, ChevronDown, Filter, Coins, CheckCircle2, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  workflow: GitBranch, bot: Bot, template: FileText, connector: Plug, tool: Wrench,
};

const CATEGORY_COLORS: Record<string, string> = {
  workflow: "text-blue-500 bg-blue-500/15",
  bot: "text-violet-500 bg-violet-500/15",
  template: "text-emerald-500 bg-emerald-500/15",
  connector: "text-orange-500 bg-orange-500/15",
  tool: "text-pink-500 bg-pink-500/15",
};

export default function WorkshopPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");
  const [priceFilter, setPriceFilter] = useState<string>("");
  const [installing, setInstalling] = useState<string | null>(null);

  const { data: listings = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/workshop/listings", category, search, priceFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (search) params.set("search", search);
      if (priceFilter) params.set("priceType", priceFilter);
      const res = await fetch(`/api/workshop/listings?${params}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ["/api/workshop/categories"],
    queryFn: async () => {
      const res = await fetch("/api/workshop/categories", { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const installItem = async (listingId: string) => {
    setInstalling(listingId);
    try {
      const res = await fetch(`/api/workshop/listings/${listingId}/install`, {
        method: "POST", credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Installed!", description: data.message });
        queryClient.invalidateQueries({ queryKey: ["/api/workshop/listings"] });
        queryClient.invalidateQueries({ queryKey: ["/api/pipelines"] });
      } else {
        toast({ title: "Install failed", description: data.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Store className="w-5 h-5 text-primary" /> Workshop
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse community workflows, bots, and tools — install with one click
        </p>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workflows, bots, tools..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground min-w-[130px]">
            <option value="">All Categories</option>
            {categories.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={priceFilter} onChange={(e) => setPriceFilter(e.target.value)}
            className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground min-w-[100px]">
            <option value="">All Prices</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </select>
        </div>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCategory("")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            !category ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"
          }`}
        >
          All
        </button>
        {categories.map((c: any) => {
          const Icon = CATEGORY_ICONS[c.id] || Wrench;
          const active = category === c.id;
          return (
            <button key={c.id} onClick={() => setCategory(active ? "" : c.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${
                active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"
              }`}>
              <Icon className="w-3 h-3" /> {c.name}
            </button>
          );
        })}
      </div>

      {/* Listings Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading workshop...
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
          <Store className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No listings yet</p>
          <p className="text-xs mt-1 mb-4">
            {search ? `No results for "${search}"` : "Be the first to publish a workflow to the workshop!"}
          </p>
          <p className="text-xs text-muted-foreground">
            Go to Workflows → click the share icon on any workflow to publish it here
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.map((listing: any) => {
            const catId = listing.category || "workflow";
            const Icon = CATEGORY_ICONS[catId] || Wrench;
            const colorClass = CATEGORY_COLORS[catId] || "text-muted-foreground bg-secondary";
            const isFree = listing.price_type === "free" || listing.priceType === "free" || !listing.price_usd;
            const price = listing.price_usd || listing.priceUsd || 0;
            const installs = listing.install_count || listing.installCount || 0;
            const rating = listing.rating_avg || listing.ratingAvg || 0;
            const isInstalling = installing === listing.id;

            return (
              <div key={listing.id} className="border border-border rounded-2xl bg-card p-5 flex flex-col hover:shadow-lg hover:shadow-primary/5 transition-all">
                {/* Header */}
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground truncate">{listing.title}</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      by {listing.sellerName || "Unknown"}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {isFree ? (
                      <Badge variant="secondary" className="text-[10px] text-emerald-500 bg-emerald-500/10">Free</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] font-semibold">${price.toFixed(2)}</Badge>
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-muted-foreground mb-4 line-clamp-2 flex-1">
                  {listing.short_description || listing.shortDescription || listing.description || "No description"}
                </p>

                {/* Stats */}
                <div className="flex items-center gap-3 mb-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Download className="w-3 h-3" /> {installs} installs
                  </span>
                  {rating > 0 && (
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3 text-yellow-500" /> {rating.toFixed(1)}
                    </span>
                  )}
                  <Badge variant="outline" className="text-[9px] h-4 capitalize">{catId}</Badge>
                </div>

                {/* Tags */}
                {(listing.tags) && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {(typeof listing.tags === "string" ? listing.tags.split(",") : []).filter(Boolean).slice(0, 4).map((tag: string) => (
                      <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{tag.trim()}</span>
                    ))}
                  </div>
                )}

                {/* Install button */}
                <Button
                  size="sm" className="w-full text-xs gap-1.5"
                  variant={isFree ? "default" : "secondary"}
                  disabled={isInstalling}
                  onClick={() => installItem(listing.id)}
                >
                  {isInstalling ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Installing...</>
                  ) : (
                    <><Download className="w-3 h-3" /> {isFree ? "Install" : `Buy $${price.toFixed(2)}`}</>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
