import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search,
  Download,
  Check,
  Star,
  Briefcase,
  Target,
  BookOpen,
  Layers,
  Cpu,
  Trophy,
  Building2,
  Package,
  Loader2,
} from "lucide-react";

interface WorkshopMod {
  id: number;
  slug: string;
  name: string;
  description: string;
  longDescription: string | null;
  category: string;
  icon: string;
  price: number;
  version: string;
  installCount: number;
  rating: number | null;
  isOfficial: number;
  isInstalled: boolean;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Briefcase,
  Target,
  BookOpen,
  Layers,
  Cpu,
  Trophy,
  Building2,
};

const CATEGORIES = ["All", "Trading", "Freelance", "Development", "Productivity"];

function StarRating({ rating }: { rating: number | null }) {
  const value = rating ?? 0;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`w-3.5 h-3.5 ${
            s <= value
              ? "fill-yellow-400 text-yellow-400"
              : "text-muted-foreground/40"
          }`}
        />
      ))}
    </div>
  );
}

function ModCard({
  mod,
  onInstall,
  onUninstall,
  isPending,
}: {
  mod: WorkshopMod;
  onInstall: (slug: string) => void;
  onUninstall: (slug: string) => void;
  isPending: boolean;
}) {
  const IconComponent = ICON_MAP[mod.icon] ?? Package;
  const isFree = mod.price === 0;

  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200">
      {/* Header: icon + name + category */}
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
          <IconComponent className="w-5 h-5 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">{mod.name}</h3>
            {mod.isOfficial === 1 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-indigo-500/15 text-indigo-400 border-indigo-500/20">
                Official
              </Badge>
            )}
          </div>
          <Badge
            variant="outline"
            className="mt-1 text-[10px] px-1.5 py-0 h-4 font-medium"
          >
            {mod.category}
          </Badge>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground line-clamp-2 flex-1">
        {mod.description}
      </p>

      {/* Stats row */}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <StarRating rating={mod.rating} />
        <div className="flex items-center gap-1">
          <Download className="w-3 h-3" />
          <span>{mod.installCount.toLocaleString()}</span>
        </div>
      </div>

      {/* Footer: price + install button */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
        <span
          className={`text-sm font-semibold ${
            isFree ? "text-emerald-400" : "text-foreground"
          }`}
        >
          {isFree ? "Free" : `$${(mod.price / 100).toFixed(2)}`}
        </span>

        {mod.isInstalled ? (
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-colors"
            onClick={() => onUninstall(mod.slug)}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            {isPending ? "Processing..." : "Installed"}
          </Button>
        ) : (
          <Button
            size="sm"
            className="text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={() => onInstall(mod.slug)}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            {isPending ? "Installing..." : "Install"}
          </Button>
        )}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-xl p-5 animate-pulse space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-lg bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-muted rounded w-2/3" />
          <div className="h-3 bg-muted rounded w-1/4" />
        </div>
      </div>
      <div className="h-3 bg-muted rounded w-full" />
      <div className="h-3 bg-muted rounded w-4/5" />
      <div className="flex justify-between">
        <div className="h-3 bg-muted rounded w-20" />
        <div className="h-3 bg-muted rounded w-12" />
      </div>
      <div className="h-8 bg-muted rounded w-full" />
    </div>
  );
}

export default function WorkshopPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const modsQuery = useQuery<WorkshopMod[]>({
    queryKey: ["/api/workshop/mods"],
  });

  const installMutation = useMutation({
    mutationFn: async (slug: string) => {
      setPendingSlug(slug);
      await apiRequest("POST", `/api/workshop/mods/${slug}/install`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workshop/mods"] });
    },
    onSettled: () => {
      setPendingSlug(null);
    },
  });

  const uninstallMutation = useMutation({
    mutationFn: async (slug: string) => {
      setPendingSlug(slug);
      await apiRequest("POST", `/api/workshop/mods/${slug}/uninstall`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workshop/mods"] });
    },
    onSettled: () => {
      setPendingSlug(null);
    },
  });

  // Filter mods by search and category
  const filteredMods = (modsQuery.data ?? []).filter((mod) => {
    const matchesSearch =
      !search ||
      mod.name.toLowerCase().includes(search.toLowerCase()) ||
      mod.description.toLowerCase().includes(search.toLowerCase());

    const matchesCategory =
      activeCategory === "All" ||
      mod.category.toLowerCase() === activeCategory.toLowerCase();

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Hero Banner */}
      <div className="rounded-xl overflow-hidden bg-gradient-to-r from-indigo-600 to-purple-600 p-10 text-center space-y-3">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm mb-2">
          <Package className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Bunz Workshop
        </h1>
        <p className="text-indigo-100 text-sm max-w-lg mx-auto">
          Extend your AI workspace with community-built mods, tools, and integrations
        </p>
      </div>

      {/* Search Bar */}
      <div className="max-w-xl mx-auto relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search mods by name or description..."
          className="pl-9 bg-background border-border"
        />
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeCategory === cat
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Mod Grid */}
      {modsQuery.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : modsQuery.isError ? (
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-xl border border-red-500/20 bg-red-500/5">
          <Package className="w-10 h-10 text-red-400 mb-3" />
          <p className="text-sm font-medium text-red-400 mb-1">
            Failed to load workshop mods
          </p>
          <p className="text-xs text-red-400/70 mb-4 max-w-md">
            {modsQuery.error instanceof Error
              ? modsQuery.error.message
              : "An unexpected error occurred. Please try again."}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-red-400 border-red-500/30 hover:bg-red-500/10"
            onClick={() => modsQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : filteredMods.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="w-12 h-12 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-1">No mods found</p>
          <p className="text-xs text-muted-foreground">
            {search || activeCategory !== "All"
              ? "Try adjusting your search or category filter"
              : "Check back soon for new mods!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredMods.map((mod) => (
            <ModCard
              key={mod.id}
              mod={mod}
              onInstall={(slug) => installMutation.mutate(slug)}
              onUninstall={(slug) => uninstallMutation.mutate(slug)}
              isPending={pendingSlug === mod.slug}
            />
          ))}
        </div>
      )}
    </div>
  );
}
