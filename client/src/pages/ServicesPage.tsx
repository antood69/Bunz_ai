import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase, Plus, DollarSign, Package, Clock, CheckCircle2, XCircle,
  Loader2, Pencil, Trash2, X, Save, Link2, Copy, ExternalLink,
  TrendingUp, Wallet, ShoppingCart, CreditCard, Globe, Zap, Star,
  Users, BarChart3, ArrowUpRight, Eye, ToggleLeft, ToggleRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
  pending: { color: "text-yellow-500", bg: "bg-yellow-500/10", icon: Clock },
  awaiting_payment: { color: "text-orange-500", bg: "bg-orange-500/10", icon: CreditCard },
  in_progress: { color: "text-blue-500", bg: "bg-blue-500/10", icon: Loader2 },
  active: { color: "text-blue-500", bg: "bg-blue-500/10", icon: Loader2 },
  delivered: { color: "text-emerald-500", bg: "bg-emerald-500/10", icon: CheckCircle2 },
  complete: { color: "text-emerald-500", bg: "bg-emerald-500/10", icon: CheckCircle2 },
  cancelled: { color: "text-red-500", bg: "bg-red-500/10", icon: XCircle },
  failed: { color: "text-red-500", bg: "bg-red-500/10", icon: XCircle },
};

const CATEGORIES = [
  { value: "general", label: "General", icon: Briefcase },
  { value: "writing", label: "Writing & Content", icon: Briefcase },
  { value: "research", label: "Research & Analysis", icon: BarChart3 },
  { value: "coding", label: "Programming & Tech", icon: Zap },
  { value: "design", label: "Design & Creative", icon: Star },
  { value: "marketing", label: "Marketing & SEO", icon: TrendingUp },
  { value: "consulting", label: "Consulting & Strategy", icon: Users },
];

export default function ServicesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"gigs" | "orders" | "earnings">("gigs");
  const [gigDialog, setGigDialog] = useState(false);
  const [editGig, setEditGig] = useState<any>(null);
  const [orderDetail, setOrderDetail] = useState<any>(null);

  const { data: gigs = [], isLoading: gigsLoading } = useQuery<any[]>({
    queryKey: ["/api/services/gigs"],
    queryFn: async () => { const r = await fetch("/api/services/gigs", { credentials: "include" }); return r.ok ? r.json() : []; },
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery<any[]>({
    queryKey: ["/api/services/orders"],
    queryFn: async () => { const r = await fetch("/api/services/orders", { credentials: "include" }); return r.ok ? r.json() : []; },
  });

  const { data: earnings } = useQuery<any>({
    queryKey: ["/api/services/earnings"],
    queryFn: async () => { const r = await fetch("/api/services/earnings", { credentials: "include" }); return r.ok ? r.json() : null; },
  });

  const { data: pipelines = [] } = useQuery<any[]>({
    queryKey: ["/api/pipelines"],
    queryFn: async () => { const r = await fetch("/api/pipelines", { credentials: "include" }); return r.ok ? r.json() : []; },
  });

  const saveGig = async (data: any) => {
    const method = editGig ? "PUT" : "POST";
    const url = editGig ? `/api/services/gigs/${editGig.id}` : "/api/services/gigs";
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify(data),
    });
    if (res.ok) {
      toast({ title: editGig ? "Service updated" : "Service created" });
      queryClient.invalidateQueries({ queryKey: ["/api/services/gigs"] });
      setGigDialog(false); setEditGig(null);
    } else {
      const d = await res.json();
      toast({ title: "Error", description: d.error, variant: "destructive" });
    }
  };

  const deleteGig = async (id: string) => {
    await fetch(`/api/services/gigs/${id}`, { method: "DELETE", credentials: "include" });
    queryClient.invalidateQueries({ queryKey: ["/api/services/gigs"] });
    toast({ title: "Service deleted" });
  };

  const toggleGig = async (gig: any) => {
    await fetch(`/api/services/gigs/${gig.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ isActive: gig.is_active ? 0 : 1 }),
    });
    queryClient.invalidateQueries({ queryKey: ["/api/services/gigs"] });
    toast({ title: gig.is_active ? "Service paused" : "Service activated" });
  };

  const updateOrderStatus = async (id: string, status: string) => {
    await fetch(`/api/services/orders/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ status }),
    });
    queryClient.invalidateQueries({ queryKey: ["/api/services/orders"] });
    queryClient.invalidateQueries({ queryKey: ["/api/services/earnings"] });
    toast({ title: `Order marked as ${status}` });
  };

  const copyOrderLink = (gigId: string) => {
    const url = `${window.location.origin}/#/order/${gigId}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Order link copied to clipboard!" });
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-primary" /> Services
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Create AI-powered services, accept payments, and fulfill orders automatically</p>
        </div>
        <Button onClick={() => { setEditGig(null); setGigDialog(true); }} className="gap-1.5" size="lg">
          <Plus className="w-4 h-4" /> New Service
        </Button>
      </div>

      {/* Earnings Summary */}
      {earnings && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Balance", value: earnings.availableBalance, icon: Wallet, color: "text-foreground", format: "dollar" },
            { label: "Total Earned", value: earnings.totalEarnings, icon: TrendingUp, color: "text-emerald-500", format: "dollar" },
            { label: "Pending", value: earnings.pendingEarnings, icon: Clock, color: "text-orange-500", format: "dollar" },
            { label: "Orders", value: earnings.completedOrders, icon: ShoppingCart, color: "text-foreground", format: "count", extra: `/${earnings.totalOrders || 0}` },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="border border-border rounded-2xl bg-card p-5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Icon className="w-4 h-4" /> {card.label}
                </div>
                <p className={`text-2xl font-bold ${card.color}`}>
                  {card.format === "dollar" ? `$${(card.value || 0).toFixed(2)}` : card.value || 0}
                  {card.extra && <span className="text-sm text-muted-foreground font-normal">{card.extra}</span>}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border border-border rounded-xl p-1 w-fit bg-secondary/30">
        {([
          { key: "gigs", label: "My Services", icon: Briefcase },
          { key: "orders", label: "Orders", icon: Package },
          { key: "earnings", label: "Earnings", icon: DollarSign },
        ] as const).map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all ${
                tab === t.key ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"
              }`}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ── My Services Tab ─────────────────────────────────────────── */}
      {tab === "gigs" && (
        gigsLoading ? <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin mr-2 text-muted-foreground" /> Loading...</div> :
        gigs.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-2xl text-muted-foreground">
            <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-base font-medium">No services yet</p>
            <p className="text-sm mt-1 mb-6 max-w-md mx-auto">Create AI-powered services that clients can order and pay for. Link a workflow to auto-fulfill orders.</p>
            <Button onClick={() => setGigDialog(true)} size="lg"><Plus className="w-4 h-4 mr-1.5" /> Create Your First Service</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {gigs.map((gig: any) => {
              const tiers = typeof gig.price_tiers === "string" ? JSON.parse(gig.price_tiers || "[]") : (gig.price_tiers || []);
              const minPrice = tiers.length ? Math.min(...tiers.map((t: any) => t.price || 0)) : 0;
              const maxPrice = tiers.length ? Math.max(...tiers.map((t: any) => t.price || 0)) : 0;
              const catInfo = CATEGORIES.find(c => c.value === gig.category) || CATEGORIES[0];

              return (
                <div key={gig.id} className="border border-border rounded-2xl bg-card overflow-hidden">
                  {/* Card header */}
                  <div className="p-5 pb-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Briefcase className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-foreground">{gig.title}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px]">{catInfo.label}</Badge>
                            {gig.is_active ? (
                              <Badge className="text-[10px] bg-emerald-500/15 text-emerald-500 border-0">Active</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">Paused</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xl font-bold text-emerald-500">${minPrice}</span>
                        {maxPrice > minPrice && <span className="text-sm text-muted-foreground"> — ${maxPrice}</span>}
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{gig.description || "No description"}</p>

                    {/* Price tiers preview */}
                    <div className="flex gap-2 mb-4">
                      {tiers.map((tier: any, i: number) => (
                        <div key={i} className="flex-1 border border-border rounded-xl p-2.5 text-center bg-secondary/30">
                          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{tier.name}</p>
                          <p className="text-sm font-bold text-foreground mt-0.5">${tier.price}</p>
                          <p className="text-[10px] text-muted-foreground">{tier.deliveryDays}d delivery</p>
                        </div>
                      ))}
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><ShoppingCart className="w-3 h-3" /> {gig.total_orders || 0} orders</span>
                      <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> ${(gig.total_revenue || 0).toFixed(2)} earned</span>
                    </div>
                  </div>

                  {/* Card actions */}
                  <div className="px-5 py-3 border-t border-border bg-secondary/20 flex items-center gap-2">
                    <Button size="sm" variant="default" className="text-xs gap-1.5 flex-1" onClick={() => copyOrderLink(gig.id)}>
                      <Link2 className="w-3 h-3" /> Copy Order Link
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs gap-1 h-8" onClick={() => toggleGig(gig)}>
                      {gig.is_active ? <ToggleRight className="w-3.5 h-3.5 text-emerald-500" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => { setEditGig(gig); setGigDialog(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500 hover:border-red-500/50" onClick={() => deleteGig(gig.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Orders Tab ──────────────────────────────────────────────── */}
      {tab === "orders" && (
        ordersLoading ? <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin mr-2 text-muted-foreground" /> Loading...</div> :
        orders.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-2xl text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-base font-medium">No orders yet</p>
            <p className="text-sm mt-1">Share your service links with clients to start getting orders</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order: any) => {
              const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
              const StatusIcon = cfg.icon;
              const amount = Number(order.revenue) || Number(order.amount) || 0;
              const isAnimated = order.status === "in_progress" || order.status === "active";
              return (
                <div key={order.id} className="border border-border rounded-2xl bg-card p-5 flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                    <StatusIcon className={`w-5 h-5 ${cfg.color} ${isAnimated ? "animate-spin" : ""}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-foreground">{order.gig_title || order.gigTitle || "Order"}</span>
                      <Badge className={`text-[10px] h-5 capitalize border-0 ${cfg.bg} ${cfg.color}`}>{order.status.replace("_", " ")}</Badge>
                      <span className="text-xs text-muted-foreground ml-auto">{order.order_id || order.orderId}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {order.buyer_name || order.buyerName || order.client_name}</span>
                      {order.client_email && <span>{order.client_email}</span>}
                      <span>{new Date(order.created_at).toLocaleDateString()}</span>
                    </div>
                    {order.requirements && (
                      <p className="text-xs text-muted-foreground mt-2 bg-secondary/50 rounded-lg p-2 line-clamp-2">{order.requirements}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-lg font-bold text-foreground">${amount.toFixed(2)}</span>
                    <div className="flex gap-1.5 mt-2">
                      {(order.status === "pending" || order.status === "in_progress") && (
                        <Button size="sm" className="text-xs h-8 gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => updateOrderStatus(order.id, "delivered")}>
                          <CheckCircle2 className="w-3 h-3" /> Deliver
                        </Button>
                      )}
                      {order.status === "pending" && (
                        <Button size="sm" variant="outline" className="text-xs h-8 text-red-500 hover:border-red-500/50" onClick={() => updateOrderStatus(order.id, "cancelled")}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Earnings Tab ────────────────────────────────────────────── */}
      {tab === "earnings" && earnings && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Wallet card */}
          <div className="lg:col-span-1 border border-border rounded-2xl bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Wallet</p>
                <p className="text-[10px] text-muted-foreground">Your earnings balance</p>
              </div>
            </div>
            <p className="text-4xl font-bold text-emerald-500 mb-1">${(earnings.availableBalance || 0).toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mb-6">Available to withdraw</p>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Lifetime earnings</span>
                <span className="font-medium text-foreground">${(earnings.totalEarnings || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pending clearance</span>
                <span className="font-medium text-orange-500">${(earnings.pendingEarnings || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Completed orders</span>
                <span className="font-medium text-foreground">{earnings.completedOrders || 0}</span>
              </div>
            </div>

            <Button className="w-full gap-1.5" size="lg" disabled={!earnings.availableBalance}>
              <CreditCard className="w-4 h-4" /> Withdraw Funds
            </Button>
            <p className="text-[10px] text-muted-foreground mt-2 text-center">Stripe Connect payouts coming soon</p>
          </div>

          {/* Recent transactions */}
          <div className="lg:col-span-2 border border-border rounded-2xl bg-card p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> Recent Transactions
            </h3>
            {(earnings.recentOrders?.length || 0) === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No transactions yet</p>
            ) : (
              <div className="space-y-1">
                {earnings.recentOrders.map((o: any) => {
                  const amount = Number(o.revenue) || Number(o.amount) || 0;
                  const isDelivered = o.status === "delivered" || o.status === "complete";
                  const cfg = STATUS_CONFIG[o.status] || STATUS_CONFIG.pending;
                  return (
                    <div key={o.id} className="flex items-center gap-3 py-3 border-b border-border/50 last:border-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                        <cfg.icon className={`w-4 h-4 ${cfg.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground">{o.gig_title || o.gigTitle || "Order"}</span>
                        <p className="text-[10px] text-muted-foreground">{o.buyer_name || o.buyerName} — {new Date(o.created_at).toLocaleDateString()}</p>
                      </div>
                      <Badge className={`text-[9px] h-4 capitalize border-0 ${cfg.bg} ${cfg.color}`}>{o.status}</Badge>
                      <span className={`text-sm font-bold tabular-nums ${isDelivered ? "text-emerald-500" : "text-muted-foreground"}`}>
                        {isDelivered ? "+" : ""}${amount.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Gig Create/Edit Dialog ──────────────────────────────────── */}
      {gigDialog && (
        <GigDialog gig={editGig} pipelines={pipelines}
          onClose={() => { setGigDialog(false); setEditGig(null); }}
          onSave={saveGig} />
      )}
    </div>
  );
}

function GigDialog({ gig, pipelines, onClose, onSave }: {
  gig: any; pipelines: any[]; onClose: () => void; onSave: (data: any) => void;
}) {
  const existingTiers = gig?.price_tiers
    ? (typeof gig.price_tiers === "string" ? JSON.parse(gig.price_tiers) : gig.price_tiers)
    : [
      { name: "Basic", price: 25, description: "Standard delivery", deliveryDays: 3, revisions: 1 },
      { name: "Standard", price: 50, description: "Priority with revisions", deliveryDays: 2, revisions: 3 },
      { name: "Premium", price: 100, description: "Rush + unlimited revisions", deliveryDays: 1, revisions: -1 },
    ];

  const [title, setTitle] = useState(gig?.title || "");
  const [category, setCategory] = useState(gig?.category || "general");
  const [description, setDescription] = useState(gig?.description || "");
  const [requirements, setRequirements] = useState(gig?.requirements_template || "");
  const [pipelineId, setPipelineId] = useState(() => {
    try { return JSON.parse(gig?.auto_response || "{}").pipelineId || ""; } catch { return ""; }
  });
  const [tiers, setTiers] = useState(existingTiers);
  const [saving, setSaving] = useState(false);

  const updateTier = (i: number, field: string, value: any) => {
    const updated = [...tiers];
    updated[i] = { ...updated[i], [field]: value };
    setTiers(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave({ title, category, description, priceTiers: tiers, pipelineId: pipelineId || undefined });
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Briefcase className="w-6 h-6 text-primary" />
            {gig ? "Edit Service" : "Create New Service"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Service Details</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Label className="text-xs">Service Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Professional SEO Blog Article" className="mt-1 h-10" />
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}
                  className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2 text-sm h-10">
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <Label className="text-xs">Description — what do clients get?</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="mt-1"
                placeholder="Describe what this service delivers, what's included, and what makes it unique. This is what clients see before ordering." />
            </div>

            <div className="mt-4">
              <Label className="text-xs">Requirements Template (shown to client when ordering)</Label>
              <Textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} rows={3} className="mt-1"
                placeholder="e.g. Please provide:&#10;1. Topic or keyword&#10;2. Target audience&#10;3. Preferred tone (formal/casual)&#10;4. Word count" />
              <p className="text-[10px] text-muted-foreground mt-1">Helps clients give you the info you need</p>
            </div>
          </div>

          {/* Automation */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Automation
            </h3>
            <div className="border border-border rounded-xl p-4 bg-secondary/20">
              <Label className="text-xs">Auto-run Workflow on New Order</Label>
              <select value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}
                className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2 text-sm">
                <option value="">None — fulfill manually</option>
                {pipelines.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.steps?.length || 0} steps)</option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground mt-2">
                When a client places an order, this workflow runs automatically with their requirements as input. The output gets attached to the order for you to review and deliver.
              </p>
            </div>
          </div>

          {/* Pricing Tiers */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-500" /> Pricing Tiers
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {tiers.map((tier: any, i: number) => (
                <div key={i} className={`border rounded-2xl p-4 space-y-3 ${
                  i === 1 ? "border-primary bg-primary/5" : "border-border bg-secondary/20"
                }`}>
                  {i === 1 && <Badge className="text-[9px] bg-primary text-primary-foreground -mt-1">Popular</Badge>}
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tier Name</Label>
                    <Input value={tier.name} onChange={(e) => updateTier(i, "name", e.target.value)}
                      className="h-9 text-sm font-semibold mt-1" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Price (USD)</Label>
                    <div className="relative mt-1">
                      <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input type="number" min="0" value={tier.price}
                        onChange={(e) => updateTier(i, "price", Number(e.target.value))}
                        className="h-9 text-sm pl-7 font-bold" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Delivery (days)</Label>
                    <Input type="number" min="1" value={tier.deliveryDays}
                      onChange={(e) => updateTier(i, "deliveryDays", Number(e.target.value))}
                      className="h-9 text-sm mt-1" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">What's included</Label>
                    <Input value={tier.description} onChange={(e) => updateTier(i, "description", e.target.value)}
                      className="h-9 text-sm mt-1" placeholder="e.g. 1500 words, 2 revisions" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Payment info */}
          <div className="border border-border rounded-xl p-4 bg-secondary/20 flex items-start gap-3">
            <CreditCard className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Stripe Payments</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Clients pay via Stripe Checkout when they order. Payments are processed securely and added to your wallet balance.
                Share the order link with clients to accept payments.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} size="lg">Cancel</Button>
          <Button disabled={!title.trim() || saving} onClick={handleSave} size="lg" className="px-8">
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
            {gig ? "Save Changes" : "Create Service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
