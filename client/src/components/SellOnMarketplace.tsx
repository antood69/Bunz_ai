import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Store, DollarSign, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";

interface SellOnMarketplaceProps {
  itemName: string;
  itemDescription?: string;
  listingType: "bot" | "workflow" | "automation" | "code" | "template" | "service";
  attachedItemId?: string;
  attachedItemData?: any;
  onSuccess?: () => void;
}

function mapListingTypeToCategory(listingType: string): string {
  if (listingType === "bot") return "agent";
  if (listingType === "code") return "tool";
  return "workflow";
}

export default function SellOnMarketplace({ itemName, itemDescription, listingType, attachedItemId, attachedItemData, onSuccess }: SellOnMarketplaceProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(itemName);
  const [description, setDescription] = useState(itemDescription || `${listingType} - ${itemName}`);
  const [price, setPrice] = useState("9.99");

  const sellMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/marketplace/listings", {
        title,
        description,
        shortDescription: description.slice(0, 120),
        priceUsd: parseFloat(price) || 0,
        priceType: parseFloat(price) === 0 ? "free" : "one_time",
        category: mapListingTypeToCategory(listingType),
        listingType,
        isPublished: true,
        contentRef: (attachedItemId || attachedItemData) ? { attachedItemId, attachedItemData } : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      setOpen(false);
      onSuccess?.();
    },
  });

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setOpen(true)}>
        <Store className="w-3 h-3" />
        Sell
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
      <div className="bg-card border border-border rounded-xl p-5 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <Store className="w-5 h-5 text-primary" />
          <h3 className="text-base font-semibold">Sell on Marketplace</h3>
        </div>

        {/* Error state */}
        {sellMutation.isError && (
          <div className="flex items-center gap-2 p-3 mb-3 rounded-lg border border-red-500/20 bg-red-500/5">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-xs text-red-400">
              {sellMutation.error instanceof Error ? sellMutation.error.message : "Failed to create listing. Please try again."}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Title</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} className="bg-background border-border" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} className="bg-background border-border min-h-[60px]" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Price ($)</label>
            <div className="relative">
              <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} className="bg-background border-border pl-7" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="flex-1" onClick={() => sellMutation.mutate()} disabled={!title.trim() || sellMutation.isPending}>
              {sellMutation.isPending ? "Listing..." : "List for Sale"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
