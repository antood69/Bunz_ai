import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Check } from "lucide-react";
import { WIDGET_REGISTRY } from "./widgets";

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "stats", label: "Stats" },
  { id: "workflows", label: "Workflows" },
  { id: "charts", label: "Charts" },
  { id: "activity", label: "Activity" },
  { id: "actions", label: "Actions" },
] as const;

interface WidgetCatalogProps {
  layout: { i: string; x: number; y: number; w: number; h: number }[];
  onAdd: (widgetId: string, defaultW: number, defaultH: number) => void;
}

export function WidgetCatalog({ layout, onAdd }: WidgetCatalogProps) {
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);

  const activeWidgetIds = new Set(layout.map(l => l.i));
  const filtered = filter === "all" ? WIDGET_REGISTRY : WIDGET_REGISTRY.filter(w => w.category === filter);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> Add Widget
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] sm:w-[440px]">
        <SheetHeader>
          <SheetTitle>Widget Catalog</SheetTitle>
        </SheetHeader>

        {/* Category Filter */}
        <div className="flex gap-1.5 mt-4 mb-4 flex-wrap">
          {CATEGORIES.map(cat => (
            <Badge
              key={cat.id}
              variant={filter === cat.id ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setFilter(cat.id)}
            >
              {cat.label}
            </Badge>
          ))}
        </div>

        {/* Widget Cards */}
        <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-200px)] pr-1">
          {filtered.map(widget => {
            const isActive = activeWidgetIds.has(widget.id);
            const Icon = widget.icon;
            return (
              <div
                key={widget.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  isActive ? "border-primary/30 bg-primary/5" : "border-border hover:border-border/80 bg-card"
                }`}
              >
                <div className="p-2 rounded-lg bg-muted/50 flex-shrink-0">
                  <Icon className="w-4 h-4 text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{widget.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{widget.description}</p>
                  <Badge variant="secondary" className="mt-1.5 text-[10px]">{widget.category}</Badge>
                </div>
                <Button
                  variant={isActive ? "ghost" : "outline"}
                  size="sm"
                  className="flex-shrink-0"
                  disabled={isActive}
                  onClick={() => {
                    onAdd(widget.id, widget.defaultW, widget.defaultH);
                  }}
                >
                  {isActive ? <Check className="w-4 h-4 text-emerald-400" /> : <Plus className="w-4 h-4" />}
                </Button>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
