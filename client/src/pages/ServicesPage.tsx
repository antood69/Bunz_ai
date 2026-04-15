import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase, Plus, DollarSign, Package, Clock, CheckCircle2, XCircle,
  Loader2, Pencil, Trash2, X, Save, Link2, Copy, ExternalLink,
  TrendingUp, Wallet, ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType }> = {
  pending: { color: "text-yellow-500", icon: Clock },
  awaiting_payment: { color: "text-orange-500", icon: DollarSign },
  in_progress: { color: "text-blue-500", icon: Loader2 },
  active: { color: "text-blue-500", icon: Loader2 },
  delivered: { color: "text-emerald-500", icon: CheckCircle2 },
  complete: { color: "text-emerald-500", icon: CheckCircle2 },
  cancelled: { color: "text-red-500", icon: XCircle },
  failed: { color: "text-red-500", icon: XCircle },
};

export default function ServicesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"gigs" | "orders" | "earnings">("gigs");
  const [gigDialog, setGigDialog] = useState(false);
  const [editGig, setEditGig] = useState<any>(null);

  // ── Data ────────────────────────────────────────────────────────────
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

  // ── Actions ─────────────────────────────────────────────────────────
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
    toast({ title: "Order link copied!" });
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-primary" /> Services
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your AI-powered services, orders, and earnings</p>
        </div>
        <Button onClick={() => { setEditGig(null); setGigDialog(true); }} className="gap-1.5">
          <Plus className="w-4 h-4" /> New Service
        </Button>
      </div>

      {/* Earnings Summary Cards */}
      {earnings && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="border border-border rounded-xl bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Wallet className="w-3.5 h-3.5" /> Balance</div>
            <p className="text-2xl font-bold text-foreground">${(earnings.availableBalance || 0).toFixed(2)}</p>
          </div>
          <div className="border border-border rounded-xl bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><TrendingUp className="w-3.5 h-3.5" /> Total Earned</div>
            <p className="text-2xl font-bold text-emerald-500">${(earnings.totalEarnings || 0).toFixed(2)}</p>
          </div>
          <div className="border border-border rounded-xl bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Clock className="w-3.5 h-3.5" /> Pending</div>
            <p className="text-2xl font-bold text-orange-500">${(earnings.pendingEarnings || 0).toFixed(2)}</p>
          </div>
          <div className="border border-border rounded-xl bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><ShoppingCart className="w-3.5 h-3.5" /> Orders</div>
            <p className="text-2xl font-bold text-foreground">{earnings.completedOrders || 0}<span className="text-sm text-muted-foreground font-normal">/{earnings.totalOrders || 0}</span></p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center border border-border rounded-xl overflow-hidden w-fit">
        {(["gigs", "orders", "earnings"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium capitalize ${tab === t ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
            {t === "gigs" ? "My Services" : t === "orders" ? "Orders" : "Earnings"}
          </button>
        ))}
      </div>

      {/* ── My Services Tab ─────────────────────────────────────────── */}
      {tab === "gigs" && (
        gigsLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto mt-8" /> :
        gigs.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-xl text-muted-foreground">
            <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No services yet</p>
            <p className="text-xs mt-1 mb-4">Create a service and share the link with clients</p>
            <Button variant="outline" onClick={() => setGigDialog(true)}><Plus className="w-4 h-4 mr-1" /> Create Service</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {gigs.map((gig: any) => {
              const tiers = typeof gig.price_tiers === "string" ? JSON.parse(gig.price_tiers || "[]") : (gig.price_tiers || []);
              const minPrice = tiers.length ? Math.min(...tiers.map((t: any) => t.price || 0)) : 0;
              return (
                <div key={gig.id} className="border border-border rounded-2xl bg-card p-5 flex flex-col">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{gig.title}</h3>
                      <Badge variant="outline" className="text-[9px] mt-1">{gig.category || "general"}</Badge>
                    </div>
                    <span className="text-lg font-bold text-emerald-500">${minPrice}+</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2 flex-1">{gig.description || "No description"}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-3">
                    <span>{gig.total_orders || 0} orders</span>
                    <span>${(gig.total_revenue || 0).toFixed(2)} earned</span>
                    <Badge variant={gig.is_active ? "default" : "secondary"} className="text-[9px] h-4">
                      {gig.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="flex-1 text-xs gap-1" onClick={() => copyOrderLink(gig.id)}>
                      <Link2 className="w-3 h-3" /> Copy Link
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setEditGig(gig); setGigDialog(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500" onClick={() => deleteGig(gig.id)}>
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
        ordersLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto mt-8" /> :
        orders.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-xl text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No orders yet</p>
            <p className="text-xs mt-1">Share your service links with clients to get orders</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order: any) => {
              const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
              const StatusIcon = cfg.icon;
              const amount = Number(order.revenue) || Number(order.amount) || 0;
              return (
                <div key={order.id} className="border border-border rounded-xl bg-card p-4 flex items-center gap-4">
                  <StatusIcon className={`w-5 h-5 flex-shrink-0 ${cfg.color} ${order.status === "in_progress" || order.status === "active" ? "animate-spin" : ""}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{order.gig_title || order.gigTitle || "Order"}</span>
                      <Badge variant="outline" className="text-[9px] h-4 capitalize">{order.status}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                      <span>{order.buyer_name || order.buyerName || order.client_name}</span>
                      <span>{order.client_email}</span>
                      <span>{order.order_id || order.orderId}</span>
                      <span>{new Date(order.created_at).toLocaleDateString()}</span>
                    </div>
                    {order.requirements && <p className="text-[10px] text-muted-foreground mt-1 truncate max-w-lg">{order.requirements}</p>}
                  </div>
                  <span className="text-sm font-bold text-foreground">${amount.toFixed(2)}</span>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    {(order.status === "pending" || order.status === "in_progress") && (
                      <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => updateOrderStatus(order.id, "delivered")}>
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Deliver
                      </Button>
                    )}
                    {order.status === "pending" && (
                      <Button size="sm" variant="ghost" className="text-xs h-7 text-red-500" onClick={() => updateOrderStatus(order.id, "cancelled")}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Earnings Tab ────────────────────────────────────────────── */}
      {tab === "earnings" && earnings && (
        <div className="space-y-4">
          <div className="border border-border rounded-2xl bg-card p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">Earnings Overview</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Available to withdraw</p>
                <p className="text-3xl font-bold text-emerald-500">${(earnings.availableBalance || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending clearance</p>
                <p className="text-3xl font-bold text-orange-500">${(earnings.pendingEarnings || 0).toFixed(2)}</p>
              </div>
            </div>
            <Button className="mt-4 gap-1.5" disabled={!earnings.availableBalance}>
              <Wallet className="w-4 h-4" /> Withdraw
            </Button>
            <p className="text-[10px] text-muted-foreground mt-2">Withdrawals via Stripe Connect (coming soon)</p>
          </div>

          {/* Recent transactions */}
          {earnings.recentOrders?.length > 0 && (
            <div className="border border-border rounded-2xl bg-card p-6">
              <h3 className="text-sm font-semibold text-foreground mb-3">Recent Transactions</h3>
              <div className="space-y-2">
                {earnings.recentOrders.map((o: any) => {
                  const amount = Number(o.revenue) || Number(o.amount) || 0;
                  const isDelivered = o.status === "delivered" || o.status === "complete";
                  return (
                    <div key={o.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                      <div>
                        <span className="text-xs font-medium text-foreground">{o.gig_title || o.gigTitle || "Order"}</span>
                        <span className="text-[10px] text-muted-foreground ml-2">{o.buyer_name || o.buyerName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={isDelivered ? "default" : "secondary"} className="text-[9px] h-4 capitalize">{o.status}</Badge>
                        <span className={`text-sm font-semibold ${isDelivered ? "text-emerald-500" : "text-muted-foreground"}`}>
                          {isDelivered ? "+" : ""}${amount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
      { name: "Basic", price: 25, description: "Standard delivery", deliveryDays: 3 },
      { name: "Standard", price: 50, description: "Priority with revisions", deliveryDays: 2 },
      { name: "Premium", price: 100, description: "Rush + unlimited revisions", deliveryDays: 1 },
    ];

  const [title, setTitle] = useState(gig?.title || "");
  const [category, setCategory] = useState(gig?.category || "general");
  const [description, setDescription] = useState(gig?.description || "");
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
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-primary" />
            {gig ? "Edit Service" : "New Service"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="SEO Blog Article" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full mt-1 bg-background border border-border rounded-xl px-2 py-1.5 text-sm h-9">
                <option value="general">General</option>
                <option value="writing">Writing</option>
                <option value="research">Research</option>
                <option value="coding">Coding</option>
                <option value="design">Design</option>
                <option value="marketing">Marketing</option>
              </select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1"
              placeholder="Describe what this service delivers..." />
          </div>

          <div>
            <Label className="text-xs">Auto-run Workflow (optional)</Label>
            <select value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}
              className="w-full mt-1 bg-background border border-border rounded-xl px-2 py-1.5 text-sm">
              <option value="">None — manual fulfillment</option>
              {pipelines.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name} ({p.steps?.length || 0} steps)</option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground mt-1">If set, this workflow runs automatically when a client places an order</p>
          </div>

          {/* Price Tiers */}
          <div>
            <Label className="text-sm font-medium">Pricing Tiers</Label>
            <div className="space-y-3 mt-2">
              {tiers.map((tier: any, i: number) => (
                <div key={i} className="border border-border rounded-xl p-3 bg-secondary/30 grid grid-cols-4 gap-2">
                  <div>
                    <Label className="text-[10px]">Name</Label>
                    <Input value={tier.name} onChange={(e) => updateTier(i, "name", e.target.value)} className="h-7 text-xs mt-0.5" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Price ($)</Label>
                    <Input type="number" min="0" value={tier.price} onChange={(e) => updateTier(i, "price", Number(e.target.value))} className="h-7 text-xs mt-0.5" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Days</Label>
                    <Input type="number" min="1" value={tier.deliveryDays} onChange={(e) => updateTier(i, "deliveryDays", Number(e.target.value))} className="h-7 text-xs mt-0.5" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Description</Label>
                    <Input value={tier.description} onChange={(e) => updateTier(i, "description", e.target.value)} className="h-7 text-xs mt-0.5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!title.trim() || saving} onClick={handleSave}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            {gig ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
