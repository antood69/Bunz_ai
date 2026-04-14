import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext, closestCenter, DragEndEvent, DragStartEvent, DragOverlay, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Briefcase, Plus, Trash2, Eye, Sparkles, DollarSign, Package, CheckCircle,
  ArrowRight, BarChart2, FileText, PenTool, Globe, Search, Zap, Clock, Send,
  Settings, Shield, Copy, TestTube, Download, Edit3, RefreshCw, ChevronDown,
  ChevronUp, X, AlertCircle, TrendingUp, PieChart as PieChartIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import ModelSelector from "@/components/ModelSelector";
import { findModel, BADGE_CONFIG, COST_TIER_CONFIG } from "@/lib/ai-providers";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import FiverrAIChat from "@/components/FiverrAIChat";

// ── Types ────────────────────────────────────────────────────────────────────

type FiverrOrder = {
  id: string;
  orderId: string | null;
  gigTitle: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  specs: string | null;
  status: string;
  revenue: number | null;
  generatedOutput: string | null;
  generationJobId: string | null;
  templateId: string | null;
  autoGenerate: number;
  dueAt: number | null;
  deliveredAt: number | null;
  reviewedAt: number | null;
  reviewNote: string | null;
  models: string | null;
  amount: number;
  createdAt: string;
  updatedAt: number | null;
};

type Workflow = {
  id: number;
  name: string;
  description: string | null;
  status: string;
};

type GigTemplate = {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  outputFormat: string;
  defaultModel: string | null;
  estimatedTokens: number | null;
  turnaroundHours: number | null;
  autoGenerate: number;
  workflowId: number | null;
  createdAt: number;
  updatedAt: number;
};

type WebhookSecret = {
  id: string;
  secret: string;
  source: string;
  createdAt: number;
};

// ── Pipeline columns ─────────────────────────────────────────────────────────

const COLUMNS = [
  { key: "intake", label: "Intake", icon: Package, color: "text-blue-400 bg-blue-500/10", borderColor: "border-blue-500/30" },
  { key: "generation", label: "Generation", icon: Sparkles, color: "text-violet-400 bg-violet-500/10", borderColor: "border-violet-500/30" },
  { key: "quality_check", label: "Quality Check", icon: Eye, color: "text-amber-400 bg-amber-500/10", borderColor: "border-amber-500/30" },
  { key: "delivered", label: "Delivered", icon: CheckCircle, color: "text-emerald-400 bg-emerald-500/10", borderColor: "border-emerald-500/30" },
];

const CHART_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseOrderModels(order: FiverrOrder): string[] {
  if (order.models) {
    try { return JSON.parse(order.models); } catch { /* fall through */ }
  }
  return [];
}

// ── Sortable Order Card ─────────────────────────────────────────────────────

function SortableOrderCard({ order, onView, templates }: { order: FiverrOrder; onView: (o: FiverrOrder) => void; templates: GigTemplate[] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: order.id, data: { status: order.status } });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const template = templates.find(t => t.id === order.templateId);

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className="bg-card border border-border rounded-lg p-3 space-y-2 cursor-grab active:cursor-grabbing hover:border-primary/30 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground truncate block">{order.gigTitle || order.buyerName || "Order"}</span>
          {order.orderId && <span className="text-[10px] text-muted-foreground">#{order.orderId}</span>}
        </div>
        {(order.revenue || order.amount) ? (
          <span className="text-xs text-emerald-400 font-medium ml-2">${((order.revenue ?? order.amount ?? 0) / 100).toFixed(0)}</span>
        ) : null}
      </div>
      {order.buyerName && order.gigTitle && (
        <p className="text-xs text-muted-foreground">{order.buyerName}</p>
      )}
      {order.specs && (
        <p className="text-xs text-muted-foreground line-clamp-2">{order.specs}</p>
      )}
      <div className="flex items-center gap-1 flex-wrap">
        {template && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{template.name}</span>
        )}
        {template?.defaultModel && (() => {
          const found = findModel(template.defaultModel);
          return (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 flex items-center gap-0.5">
              <Sparkles className="w-2.5 h-2.5" />
              {found?.model.name || template.defaultModel}
            </span>
          );
        })()}
        {!template?.defaultModel && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-0.5">
            <Zap className="w-2.5 h-2.5" />
            Auto
          </span>
        )}
        {order.dueAt && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" />
            {new Date(order.dueAt).toLocaleDateString()}
          </span>
        )}
        {order.status === "generation" && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 animate-pulse">Generating...</span>
        )}
      </div>
      {/* Model chips */}
      {parseOrderModels(order).length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {parseOrderModels(order).map(modelId => {
            const found = findModel(modelId);
            const name = found?.model.name || modelId;
            const badges = found?.model.badges || [];
            return (
              <span key={modelId} className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-secondary border border-border">
                <span className="truncate max-w-[70px] font-medium text-foreground">{name}</span>
                {badges.slice(0, 1).map(b => {
                  const cfg = BADGE_CONFIG[b];
                  return cfg ? <span key={b} className={`px-0.5 rounded text-[7px] font-medium border ${cfg.color}`}>{cfg.label}</span> : null;
                })}
              </span>
            );
          })}
        </div>
      )}
      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 w-full" onClick={(e) => { e.stopPropagation(); onView(order); }}>
        <Eye className="w-3 h-3 mr-0.5" /> View Details
      </Button>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function FiverrPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pipeline" | "templates" | "webhooks" | "revenue" | "income">("pipeline");
  const [viewOrder, setViewOrder] = useState<FiverrOrder | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<GigTemplate | null>(null);
  const [editingOutput, setEditingOutput] = useState<string>("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [approveRevenue, setApproveRevenue] = useState("");
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [revenuePeriod, setRevenuePeriod] = useState("30d");
  const [incomePeriod, setIncomePeriod] = useState("30d");
  const [showAddIncome, setShowAddIncome] = useState(false);

  // ── Form states ─────────────────────────────────────────────────────
  const [orderForm, setOrderForm] = useState({ gigTitle: "", buyerName: "", specs: "", revenue: "", dueAt: "", templateId: "" });
  const [templateForm, setTemplateForm] = useState({ name: "", description: "", systemPrompt: "", outputFormat: "markdown", defaultModel: "", turnaroundHours: "", autoGenerate: false, workflowId: "" });
  const [incomeForm, setIncomeForm] = useState({ amount: "", description: "", platform: "manual", date: new Date().toISOString().slice(0, 10) });

  // ── Queries ─────────────────────────────────────────────────────────
  const { data: orders = [] } = useQuery<FiverrOrder[]>({
    queryKey: ["/api/fiverr/orders"],
    refetchInterval: 10000,
  });
  const { data: templates = [] } = useQuery<GigTemplate[]>({ queryKey: ["/api/fiverr/templates"] });
  const { data: workflows = [] } = useQuery<Workflow[]>({ queryKey: ["/api/workflows"] });
  const { data: webhookSecrets = [] } = useQuery<WebhookSecret[]>({ queryKey: ["/api/fiverr/webhook-secrets"] });
  const { data: revenueData } = useQuery<any>({
    queryKey: ["/api/fiverr/revenue", revenuePeriod],
    queryFn: async () => { const res = await apiRequest("GET", `/api/fiverr/revenue?period=${revenuePeriod}`); return res.json(); },
  });
  const { data: incomeData } = useQuery<any>({
    queryKey: ["/api/fiverr/income", incomePeriod],
    queryFn: async () => { const res = await apiRequest("GET", `/api/fiverr/income?period=${incomePeriod}`); return res.json(); },
  });

  // ── Mutations ───────────────────────────────────────────────────────
  const createOrder = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", "/api/fiverr/orders", data); return res.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/fiverr/orders"] }); setShowCreate(false); setOrderForm({ gigTitle: "", buyerName: "", specs: "", revenue: "", dueAt: "", templateId: "" }); },
  });

  const updateOrder = useMutation({
    mutationFn: async ({ id, ...data }: any) => { const res = await apiRequest("PATCH", `/api/fiverr/orders/${id}`, data); return res.json(); },
    onSuccess: (data: FiverrOrder) => { qc.invalidateQueries({ queryKey: ["/api/fiverr/orders"] }); setViewOrder(data); },
  });

  const deleteOrder = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/fiverr/orders/${id}`); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/fiverr/orders"] }); setViewOrder(null); },
  });

  const generateOrder = useMutation({
    mutationFn: async ({ id, templateId, feedback }: { id: string; templateId?: string; feedback?: string }) => {
      const res = await apiRequest("POST", `/api/fiverr/orders/${id}/generate`, { templateId, feedback });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/fiverr/orders"] }); },
  });

  const approveOrder = useMutation({
    mutationFn: async ({ id, revenue }: { id: string; revenue?: number }) => {
      const res = await apiRequest("POST", `/api/fiverr/orders/${id}/approve`, { revenue });
      return res.json();
    },
    onSuccess: (data: FiverrOrder) => { qc.invalidateQueries({ queryKey: ["/api/fiverr/orders"] }); qc.invalidateQueries({ queryKey: ["/api/fiverr/revenue"] }); setViewOrder(data); },
  });

  const rejectOrder = useMutation({
    mutationFn: async ({ id, feedback }: { id: string; feedback: string }) => {
      const res = await apiRequest("POST", `/api/fiverr/orders/${id}/reject`, { feedback });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/fiverr/orders"] }); setShowReject(false); setRejectFeedback(""); },
  });

  const moveOrderStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/fiverr/orders/${id}`, { status });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/fiverr/orders"] }); },
  });

  // Templates
  const createTemplate = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", "/api/fiverr/templates", data); return res.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/fiverr/templates"] }); setShowTemplateForm(false); resetTemplateForm(); },
  });
  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...data }: any) => { const res = await apiRequest("PATCH", `/api/fiverr/templates/${id}`, data); return res.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/fiverr/templates"] }); setEditingTemplate(null); setShowTemplateForm(false); resetTemplateForm(); },
  });
  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/fiverr/templates/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/fiverr/templates"] }),
  });

  // Webhooks
  const createWebhookSecret = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/fiverr/webhook-secrets"); return res.json(); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/fiverr/webhook-secrets"] }),
  });
  const deleteWebhookSecretMut = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/fiverr/webhook-secrets/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/fiverr/webhook-secrets"] }),
  });

  // Income
  const createIncome = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", "/api/fiverr/income", data); return res.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/fiverr/income"] }); setShowAddIncome(false); setIncomeForm({ amount: "", description: "", platform: "manual", date: new Date().toISOString().slice(0, 10) }); },
  });
  const deleteIncome = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/fiverr/income/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/fiverr/income"] }),
  });

  // ── Helpers ─────────────────────────────────────────────────────────
  const resetTemplateForm = () => setTemplateForm({ name: "", description: "", systemPrompt: "", outputFormat: "markdown", defaultModel: "", turnaroundHours: "", autoGenerate: false, workflowId: "" });

  const ordersByColumn = useMemo(() => {
    const map: Record<string, FiverrOrder[]> = {};
    COLUMNS.forEach(c => { map[c.key] = []; });
    orders.forEach(o => {
      const s = o.status || "intake";
      const mapped = s === "pending" ? "intake" : s === "draft_ready" ? "quality_check" : s === "completed" ? "delivered" : s;
      if (map[mapped]) map[mapped].push(o);
      else map.intake.push(o);
    });
    return map;
  }, [orders]);

  // ── DnD ─────────────────────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragStart = (event: DragStartEvent) => { setDragActiveId(event.active.id as string); };

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDragActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const orderId = active.id as string;
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    // Determine target column
    let targetStatus: string | null = null;
    // Check if dropped over a column container
    const overStr = over.id as string;
    if (COLUMNS.some(c => c.key === overStr)) {
      targetStatus = overStr;
    } else {
      // Dropped over another card — find which column it's in
      const overOrder = orders.find(o => o.id === overStr);
      if (overOrder) targetStatus = overOrder.status;
    }

    if (!targetStatus || targetStatus === order.status) return;
    // NEVER auto-deliver via drag — use approve
    if (targetStatus === "delivered") return;

    moveOrderStatus.mutate({ id: orderId, status: targetStatus });
  }, [orders, moveOrderStatus]);

  const draggedOrder = dragActiveId ? orders.find(o => o.id === dragActiveId) : null;

  // ── Quick Stats ─────────────────────────────────────────────────────
  const quickStats = useMemo(() => {
    const delivered = orders.filter(o => o.status === "delivered");
    const totalRev = delivered.reduce((s, o) => s + (o.revenue ?? o.amount ?? 0), 0);
    return {
      total: orders.length,
      revenue: totalRev,
      avg: delivered.length ? totalRev / delivered.length : 0,
      completed: delivered.length,
    };
  }, [orders]);

  const TABS = ["pipeline", "templates", "webhooks", "revenue", "income"] as const;

  return (
    <>
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-primary" /> Fiverr Automation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">End-to-end freelance order management with AI generation</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-1">
          <Plus className="w-4 h-4" /> New Order
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Package className="w-3.5 h-3.5" /> Total Orders</div>
          <p className="text-xl font-bold text-foreground mt-1">{quickStats.total}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><DollarSign className="w-3.5 h-3.5" /> Revenue</div>
          <p className="text-xl font-bold text-emerald-400 mt-1">${(quickStats.revenue / 100).toFixed(2)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><BarChart2 className="w-3.5 h-3.5" /> Avg Order</div>
          <p className="text-xl font-bold text-foreground mt-1">${(quickStats.avg / 100).toFixed(2)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle className="w-3.5 h-3.5" /> Delivered</div>
          <p className="text-xl font-bold text-foreground mt-1">{quickStats.completed}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize whitespace-nowrap ${
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "webhooks" ? "Webhooks" : t}
          </button>
        ))}
      </div>

      {/* ═══════ PIPELINE TAB — Kanban with DnD ═══════ */}
      {tab === "pipeline" && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {COLUMNS.map(col => {
              const colOrders = ordersByColumn[col.key] || [];
              const Icon = col.icon;
              return (
                <div key={col.key} className={`flex-shrink-0 w-72 bg-card/50 border ${col.borderColor} rounded-lg`}>
                  <div className="p-3 border-b border-border flex items-center gap-2">
                    <div className={`p-1 rounded ${col.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-sm font-medium">{col.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{colOrders.length}</span>
                  </div>
                  <SortableContext items={colOrders.map(o => o.id)} strategy={verticalListSortingStrategy} id={col.key}>
                    <div className="p-2 space-y-2 min-h-[200px]" data-column={col.key}>
                      {colOrders.map(order => (
                        <SortableOrderCard key={order.id} order={order} onView={setViewOrder} templates={templates} />
                      ))}
                      {colOrders.length === 0 && (
                        <div className="text-center py-8 text-xs text-muted-foreground">
                          {col.key === "intake" ? "Drop orders here or create new" : "No orders"}
                        </div>
                      )}
                    </div>
                  </SortableContext>
                </div>
              );
            })}
          </div>
          <DragOverlay>
            {draggedOrder ? (
              <div className="bg-card border border-primary rounded-lg p-3 shadow-xl w-72 rotate-2">
                <span className="text-sm font-medium">{draggedOrder.gigTitle || draggedOrder.buyerName || "Order"}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* ═══════ TEMPLATES TAB ═══════ */}
      {tab === "templates" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">AI generation templates with system prompts, output formats, and model selection.</p>
            <Button onClick={() => { resetTemplateForm(); setEditingTemplate(null); setShowTemplateForm(true); }} className="gap-1">
              <Plus className="w-4 h-4" /> New Template
            </Button>
          </div>

          {showTemplateForm && (
            <div className="bg-card border border-border rounded-lg p-5 space-y-3">
              <h3 className="font-semibold text-foreground">{editingTemplate ? "Edit Template" : "New Template"}</h3>
              <input className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" placeholder="Template name" value={templateForm.name} onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })} />
              <input className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" placeholder="Description (optional)" value={templateForm.description} onChange={e => setTemplateForm({ ...templateForm, description: e.target.value })} />
              <div>
                <label className="text-xs font-medium text-muted-foreground">System Prompt (AI instructions)</label>
                <textarea className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground min-h-[120px] font-mono" placeholder="You are a professional..." value={templateForm.systemPrompt} onChange={e => setTemplateForm({ ...templateForm, systemPrompt: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Output Format</label>
                  <select className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" value={templateForm.outputFormat} onChange={e => setTemplateForm({ ...templateForm, outputFormat: e.target.value })}>
                    <option value="markdown">Markdown</option>
                    <option value="code">Code</option>
                    <option value="document">Document</option>
                    <option value="design_brief">Design Brief</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">AI Model</label>
                  <div className="mt-1">
                    <ModelSelector
                      compact
                      value={(() => {
                        const m = templateForm.defaultModel;
                        if (!m) return null;
                        const found = findModel(m);
                        if (found) return { provider: found.provider.id, model: m };
                        return { provider: "auto", model: m };
                      })()}
                      onChange={(val) => setTemplateForm({ ...templateForm, defaultModel: val?.model || "" })}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Turnaround (hours)</label>
                  <input type="number" className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" placeholder="24" value={templateForm.turnaroundHours} onChange={e => setTemplateForm({ ...templateForm, turnaroundHours: e.target.value })} />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input type="checkbox" checked={templateForm.autoGenerate} onChange={e => setTemplateForm({ ...templateForm, autoGenerate: e.target.checked })} className="rounded" />
                    Auto-generate
                  </label>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Workflow (optional)</label>
                <select className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" value={templateForm.workflowId} onChange={e => setTemplateForm({ ...templateForm, workflowId: e.target.value })}>
                  <option value="">None — direct AI generation</option>
                  {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">Select a workflow to run instead of a single AI prompt when generating deliverables.</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => {
                  const payload = {
                    ...templateForm,
                    turnaroundHours: templateForm.turnaroundHours ? parseInt(templateForm.turnaroundHours) : null,
                    defaultModel: templateForm.defaultModel || null,
                    workflowId: templateForm.workflowId ? parseInt(templateForm.workflowId) : null,
                  };
                  if (editingTemplate) {
                    updateTemplate.mutate({ id: editingTemplate.id, ...payload });
                  } else {
                    createTemplate.mutate(payload);
                  }
                }} disabled={!templateForm.name || !templateForm.systemPrompt}>
                  {editingTemplate ? "Update" : "Create"}
                </Button>
                <Button variant="outline" onClick={() => { setShowTemplateForm(false); setEditingTemplate(null); }}>Cancel</Button>
              </div>
            </div>
          )}

          {templates.length === 0 && !showTemplateForm && (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No templates yet. Create one to speed up order fulfillment.</p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map(tmpl => (
              <div key={tmpl.id} className="bg-card border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">{tmpl.name}</h3>
                    {tmpl.description && <p className="text-xs text-muted-foreground mt-0.5">{tmpl.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    {tmpl.workflowId && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400">
                        {workflows.find(w => w.id === tmpl.workflowId)?.name || "Workflow"}
                      </span>
                    )}
                    {tmpl.autoGenerate ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">Auto</span>
                    ) : null}
                  </div>
                </div>
                <pre className="text-xs text-muted-foreground bg-background p-2 rounded-md max-h-20 overflow-hidden">{tmpl.systemPrompt}</pre>
                <div className="flex gap-2 text-xs text-muted-foreground flex-wrap">
                  <span className="px-1.5 py-0.5 rounded bg-muted">{tmpl.outputFormat}</span>
                  {tmpl.defaultModel ? (() => {
                    const found = findModel(tmpl.defaultModel);
                    return (
                      <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 flex items-center gap-0.5">
                        <Sparkles className="w-2.5 h-2.5" />
                        {found?.model.name || tmpl.defaultModel}
                      </span>
                    );
                  })() : (
                    <span className="px-1.5 py-0.5 rounded bg-muted flex items-center gap-0.5">
                      <Zap className="w-2.5 h-2.5" />
                      Auto (Smart Routing)
                    </span>
                  )}
                  {tmpl.turnaroundHours && <span className="px-1.5 py-0.5 rounded bg-muted">{tmpl.turnaroundHours}h</span>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-xs flex-1" onClick={() => {
                    setEditingTemplate(tmpl);
                    setTemplateForm({
                      name: tmpl.name, description: tmpl.description || "", systemPrompt: tmpl.systemPrompt,
                      outputFormat: tmpl.outputFormat || "markdown", defaultModel: tmpl.defaultModel || "",
                      turnaroundHours: tmpl.turnaroundHours?.toString() || "", autoGenerate: !!tmpl.autoGenerate,
                      workflowId: tmpl.workflowId?.toString() || "",
                    });
                    setShowTemplateForm(true);
                  }}>
                    <Edit3 className="w-3 h-3 mr-1" /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs text-destructive" onClick={() => deleteTemplate.mutate(tmpl.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════ WEBHOOKS TAB ═══════ */}
      {tab === "webhooks" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-foreground">Webhook Configuration</h3>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Webhook URL</label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground font-mono">
                  {window.location.origin}/api/webhooks/fiverr-order
                </code>
                <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/fiverr-order`)}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-muted-foreground">Webhook Secrets</label>
                <Button size="sm" onClick={() => createWebhookSecret.mutate()} disabled={createWebhookSecret.isPending}>
                  <Plus className="w-3 h-3 mr-1" /> Generate Secret
                </Button>
              </div>
              {webhookSecrets.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No secrets configured. Generate one to enable webhooks.</p>
              ) : (
                <div className="space-y-2">
                  {webhookSecrets.map(ws => (
                    <div key={ws.id} className="flex items-center gap-2 bg-background border border-border rounded-md px-3 py-2">
                      <code className="flex-1 text-sm font-mono text-foreground">{ws.secret}</code>
                      <span className="text-xs text-muted-foreground">{ws.source}</span>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteWebhookSecretMut.mutate(ws.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-border pt-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Integration Setup</h4>
              <div className="text-xs text-muted-foreground space-y-2">
                <p>Send a POST request with JSON body and <code className="bg-muted px-1 rounded">X-Webhook-Signature</code> header (HMAC-SHA256 of the body using your secret).</p>
                <pre className="bg-background p-3 rounded-md overflow-x-auto">{`{
  "orderId": "FVR-123",
  "gigTitle": "Logo Design",
  "buyerName": "John Doe",
  "buyerEmail": "john@example.com",
  "specs": "Modern minimalist logo for tech startup",
  "dueAt": "2026-04-20T00:00:00Z",
  "revenue": 150
}`}</pre>
                <p className="mt-2">Works with <strong>Zapier</strong>, <strong>Make (Integromat)</strong>, or any webhook-capable tool. Create a Zap/Scenario that triggers on new Fiverr orders and sends the data to your webhook URL.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ REVENUE TAB ═══════ */}
      {tab === "revenue" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Revenue Dashboard</h3>
            <div className="flex gap-1">
              {["7d", "30d", "90d", "all"].map(p => (
                <button key={p} onClick={() => setRevenuePeriod(p)}
                  className={`px-3 py-1 text-xs rounded-md ${revenuePeriod === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                >{p}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-xs text-muted-foreground">Total Revenue</div>
              <p className="text-xl font-bold text-emerald-400">${((revenueData?.totalRevenue ?? 0) / 100).toFixed(2)}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-xs text-muted-foreground">Orders Completed</div>
              <p className="text-xl font-bold text-foreground">{revenueData?.orderCount ?? 0}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-xs text-muted-foreground">Avg Order Value</div>
              <p className="text-xl font-bold text-foreground">${((revenueData?.avgOrderValue ?? 0) / 100).toFixed(2)}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-xs text-muted-foreground">Completion Rate</div>
              <p className="text-xl font-bold text-foreground">{revenueData?.completionRate ?? 0}%</p>
            </div>
          </div>

          {/* Revenue Bar Chart */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h4 className="text-sm font-semibold text-foreground mb-4">Daily Revenue</h4>
            {revenueData?.daily?.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={revenueData.daily.map((d: any) => ({ ...d, revenue: d.revenue / 100 }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => `$${v}`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`$${v.toFixed(2)}`, "Revenue"]} />
                  <Bar dataKey="revenue" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-muted-foreground text-sm">No revenue data for this period</div>
            )}
          </div>

          {/* Recent Delivered Orders */}
          {revenueData?.recentOrders?.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-5">
              <h4 className="text-sm font-semibold text-foreground mb-3">Recent Deliveries</h4>
              <div className="space-y-2">
                {revenueData.recentOrders.map((o: any) => (
                  <div key={o.id} className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0">
                    <div>
                      <span className="text-foreground">{o.gigTitle || "Order"}</span>
                      <span className="text-xs text-muted-foreground ml-2">{o.buyerName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{o.deliveredAt ? new Date(o.deliveredAt).toLocaleDateString() : ""}</span>
                      <span className="text-emerald-400 font-medium">${((o.revenue ?? o.amount ?? 0) / 100).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ INCOME TAB ═══════ */}
      {tab === "income" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Income Tracking</h3>
            <div className="flex gap-2">
              <div className="flex gap-1">
                {["7d", "30d", "90d", "all"].map(p => (
                  <button key={p} onClick={() => setIncomePeriod(p)}
                    className={`px-3 py-1 text-xs rounded-md ${incomePeriod === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                  >{p}</button>
                ))}
              </div>
              <Button size="sm" onClick={() => setShowAddIncome(true)} className="gap-1"><Plus className="w-3 h-3" /> Add Income</Button>
              <Button size="sm" variant="outline" onClick={() => window.open("/api/fiverr/income/export", "_blank")} className="gap-1"><Download className="w-3 h-3" /> CSV</Button>
            </div>
          </div>

          {showAddIncome && (
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <h4 className="font-semibold text-foreground text-sm">Add Manual Income</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Amount ($)</label>
                  <input type="number" step="0.01" className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" placeholder="0.00" value={incomeForm.amount} onChange={e => setIncomeForm({ ...incomeForm, amount: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Description</label>
                  <input className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" placeholder="Payment for..." value={incomeForm.description} onChange={e => setIncomeForm({ ...incomeForm, description: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Platform</label>
                  <select className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" value={incomeForm.platform} onChange={e => setIncomeForm({ ...incomeForm, platform: e.target.value })}>
                    <option value="manual">Manual</option>
                    <option value="fiverr">Fiverr</option>
                    <option value="upwork">Upwork</option>
                    <option value="freelancer">Freelancer</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Date</label>
                  <input type="date" className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" value={incomeForm.date} onChange={e => setIncomeForm({ ...incomeForm, date: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => createIncome.mutate(incomeForm)} disabled={!incomeForm.amount || !incomeForm.description}>Add</Button>
                <Button variant="outline" onClick={() => setShowAddIncome(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {/* Income Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-xs text-muted-foreground">Total Income</div>
              <p className="text-xl font-bold text-emerald-400">${((incomeData?.totalIncome ?? 0) / 100).toFixed(2)}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-xs text-muted-foreground">Est. Tax ({Math.round((incomeData?.taxRate ?? 0.25) * 100)}%)</div>
              <p className="text-xl font-bold text-amber-400">${((incomeData?.estimatedTax ?? 0) / 100).toFixed(2)}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-xs text-muted-foreground">Net After Tax</div>
              <p className="text-xl font-bold text-foreground">${(((incomeData?.totalIncome ?? 0) - (incomeData?.estimatedTax ?? 0)) / 100).toFixed(2)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Platform Breakdown Pie Chart */}
            <div className="bg-card border border-border rounded-lg p-5">
              <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2"><PieChartIcon className="w-4 h-4" /> Platform Breakdown</h4>
              {incomeData?.platforms && Object.keys(incomeData.platforms).length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={Object.entries(incomeData.platforms).map(([name, value]: [string, any]) => ({ name, value: value / 100 }))}
                      cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}
                    >
                      {Object.keys(incomeData.platforms).map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-12 text-muted-foreground text-sm">No income data</div>
              )}
            </div>

            {/* Monthly Trend Line Chart */}
            <div className="bg-card border border-border rounded-lg p-5">
              <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Monthly Trend</h4>
              {incomeData?.monthlyTrend?.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={incomeData.monthlyTrend.map((d: any) => ({ ...d, amount: d.amount / 100 }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => `$${v}`} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`$${v.toFixed(2)}`, "Income"]} />
                    <Line type="monotone" dataKey="amount" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-12 text-muted-foreground text-sm">No trend data</div>
              )}
            </div>
          </div>

          {/* Income Items List */}
          {incomeData?.items?.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-5">
              <h4 className="text-sm font-semibold text-foreground mb-3">Income Entries</h4>
              <div className="space-y-1">
                {incomeData.items.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${item.platform === "fiverr" ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                        {item.platform}
                      </span>
                      <span className="text-foreground">{item.description}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{new Date(item.date).toLocaleDateString()}</span>
                      <span className="text-emerald-400 font-medium">${(item.amount / 100).toFixed(2)}</span>
                      {item.type === "manual" && (
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => deleteIncome.mutate(item.id)}>
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ NEW ORDER MODAL ═══════ */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-card border border-border rounded-lg p-6 max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-lg text-foreground mb-4">New Order</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Gig Title</label>
                <input className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" placeholder="e.g., Logo Design" value={orderForm.gigTitle} onChange={e => setOrderForm({ ...orderForm, gigTitle: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Buyer Name</label>
                  <input className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" placeholder="Client name" value={orderForm.buyerName} onChange={e => setOrderForm({ ...orderForm, buyerName: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Revenue ($)</label>
                  <input type="number" step="0.01" className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" placeholder="0.00" value={orderForm.revenue} onChange={e => setOrderForm({ ...orderForm, revenue: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Specifications / Requirements</label>
                <textarea className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground min-h-[80px]" placeholder="Describe what the buyer wants..." value={orderForm.specs} onChange={e => setOrderForm({ ...orderForm, specs: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Due Date</label>
                  <input type="date" className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" value={orderForm.dueAt} onChange={e => setOrderForm({ ...orderForm, dueAt: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Template</label>
                  <select className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" value={orderForm.templateId} onChange={e => setOrderForm({ ...orderForm, templateId: e.target.value })}>
                    <option value="">None</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={() => createOrder.mutate({
                gigTitle: orderForm.gigTitle,
                buyerName: orderForm.buyerName,
                specs: orderForm.specs,
                revenue: orderForm.revenue ? Math.round(parseFloat(orderForm.revenue) * 100) : undefined,
                dueAt: orderForm.dueAt ? new Date(orderForm.dueAt).getTime() : undefined,
                templateId: orderForm.templateId || undefined,
              })} disabled={!orderForm.gigTitle}>
                Create Order
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ ORDER DETAIL / HITL MODAL ═══════ */}
      {viewOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setViewOrder(null); setIsEditMode(false); setShowReject(false); }}>
          <div className="bg-card border border-border rounded-lg p-6 max-w-3xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-lg text-foreground">{viewOrder.gigTitle || "Order Details"}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    viewOrder.status === "delivered" ? "bg-emerald-500/10 text-emerald-400" :
                    viewOrder.status === "quality_check" ? "bg-amber-500/10 text-amber-400" :
                    viewOrder.status === "generation" ? "bg-violet-500/10 text-violet-400" :
                    "bg-blue-500/10 text-blue-400"
                  }`}>
                    {viewOrder.status.replace(/_/g, " ")}
                  </span>
                  {viewOrder.orderId && <span className="text-xs text-muted-foreground">#{viewOrder.orderId}</span>}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setViewOrder(null); setIsEditMode(false); setShowReject(false); }}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-muted-foreground">Buyer:</span> <span className="text-foreground ml-1">{viewOrder.buyerName || "Anonymous"}</span></div>
                <div><span className="text-muted-foreground">Revenue:</span> <span className="text-emerald-400 ml-1">${((viewOrder.revenue ?? viewOrder.amount ?? 0) / 100).toFixed(2)}</span></div>
                {viewOrder.dueAt && <div><span className="text-muted-foreground">Due:</span> <span className="text-foreground ml-1">{new Date(viewOrder.dueAt).toLocaleDateString()}</span></div>}
                {viewOrder.deliveredAt && <div><span className="text-muted-foreground">Delivered:</span> <span className="text-foreground ml-1">{new Date(viewOrder.deliveredAt).toLocaleDateString()}</span></div>}
              </div>

              {viewOrder.specs && (
                <div>
                  <span className="text-muted-foreground text-xs font-medium">Specifications</span>
                  <p className="text-foreground mt-1 bg-background p-3 rounded-md whitespace-pre-wrap">{viewOrder.specs}</p>
                </div>
              )}

              {/* Template selector for intake orders */}
              {viewOrder.status === "intake" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Template:</span>
                  <select className="px-2 py-1 bg-background border border-border rounded-md text-xs text-foreground"
                    value={viewOrder.templateId || ""}
                    onChange={e => {
                      const tid = e.target.value || null;
                      updateOrder.mutate({ id: viewOrder.id, templateId: tid });
                    }}
                  >
                    <option value="">None</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}

              {/* Models — multi-model assignment */}
              <div>
                <span className="text-muted-foreground text-xs font-medium">AI Models</span>
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                  {parseOrderModels(viewOrder).map(modelId => {
                    const found = findModel(modelId);
                    const name = found?.model.name || modelId;
                    const badges = found?.model.badges || [];
                    const costTier = found?.model.costTier;
                    return (
                      <div key={modelId} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary border border-border text-xs group">
                        <span className="truncate max-w-[100px] font-medium text-foreground">{name}</span>
                        <div className="flex items-center gap-0.5">
                          {badges.slice(0, 2).map(b => {
                            const cfg = BADGE_CONFIG[b];
                            return cfg ? (
                              <span key={b} className={`inline-flex items-center px-1 py-0 rounded text-[7px] font-medium border ${cfg.color}`}>
                                {cfg.label}
                              </span>
                            ) : null;
                          })}
                        </div>
                        {costTier && (
                          <span className={`text-[8px] font-mono ${COST_TIER_CONFIG[costTier].color}`}>
                            {COST_TIER_CONFIG[costTier].label}
                          </span>
                        )}
                        <button
                          onClick={() => {
                            const current = parseOrderModels(viewOrder);
                            const updated = current.filter(m => m !== modelId);
                            updateOrder.mutate({ id: viewOrder.id, models: JSON.stringify(updated) });
                          }}
                          className="ml-0.5 p-0.5 rounded hover:bg-destructive/15 text-muted-foreground hover:text-red-400 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                  <ModelSelector
                    compact
                    value={null}
                    onChange={(val) => {
                      if (!val || !val.model || val.model === "auto") return;
                      const current = parseOrderModels(viewOrder);
                      if (current.includes(val.model)) return;
                      const updated = [...current, val.model];
                      updateOrder.mutate({ id: viewOrder.id, models: JSON.stringify(updated) });
                    }}
                  />
                </div>
              </div>

              {/* Generated Output — HITL Review */}
              {viewOrder.generatedOutput && (
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs font-medium">Generated Output</span>
                    {viewOrder.status === "quality_check" && (
                      <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setIsEditMode(!isEditMode); setEditingOutput(viewOrder.generatedOutput || ""); }}>
                        <Edit3 className="w-3 h-3 mr-1" /> {isEditMode ? "Cancel Edit" : "Edit"}
                      </Button>
                    )}
                  </div>
                  {isEditMode ? (
                    <div className="mt-1 space-y-2">
                      <textarea className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground min-h-[200px] font-mono"
                        value={editingOutput}
                        onChange={e => setEditingOutput(e.target.value)}
                      />
                      <Button size="sm" onClick={() => {
                        updateOrder.mutate({ id: viewOrder.id, generatedOutput: editingOutput });
                        setIsEditMode(false);
                      }}>Save Changes</Button>
                    </div>
                  ) : (
                    <div className="mt-1 bg-background p-4 rounded-md prose prose-sm prose-invert max-w-none max-h-96 overflow-y-auto">
                      <pre className="whitespace-pre-wrap text-foreground text-xs">{viewOrder.generatedOutput}</pre>
                    </div>
                  )}
                </div>
              )}

              {viewOrder.reviewNote && (
                <div>
                  <span className="text-muted-foreground text-xs font-medium">Review Note</span>
                  <p className="text-foreground mt-1 bg-amber-500/5 border border-amber-500/20 p-3 rounded-md text-xs">{viewOrder.reviewNote}</p>
                </div>
              )}

              {/* Reject feedback form */}
              {showReject && (
                <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 space-y-2">
                  <label className="text-xs font-medium text-destructive">Regeneration Feedback</label>
                  <textarea className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground min-h-[60px]"
                    placeholder="What should be improved..."
                    value={rejectFeedback}
                    onChange={e => setRejectFeedback(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" onClick={() => rejectOrder.mutate({ id: viewOrder.id, feedback: rejectFeedback })} disabled={!rejectFeedback}>
                      <RefreshCw className="w-3 h-3 mr-1" /> Regenerate
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowReject(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex justify-between gap-2 mt-6 pt-4 border-t border-border">
              <div className="flex gap-2">
                {viewOrder.status === "intake" && (
                  <Button size="sm" onClick={() => generateOrder.mutate({ id: viewOrder.id, templateId: viewOrder.templateId || undefined })} disabled={generateOrder.isPending}>
                    <Sparkles className="w-4 h-4 mr-1" /> Generate
                  </Button>
                )}
                {viewOrder.status === "quality_check" && !showReject && (
                  <>
                    <div className="flex items-center gap-2">
                      <input type="number" step="0.01" placeholder="Revenue $" className="w-24 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-foreground"
                        value={approveRevenue}
                        onChange={e => setApproveRevenue(e.target.value)}
                      />
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => {
                        approveOrder.mutate({
                          id: viewOrder.id,
                          revenue: approveRevenue ? Math.round(parseFloat(approveRevenue) * 100) : undefined,
                        });
                      }} disabled={approveOrder.isPending}>
                        <CheckCircle className="w-4 h-4 mr-1" /> Approve & Deliver
                      </Button>
                    </div>
                    <Button size="sm" variant="outline" className="text-amber-400 border-amber-400/30" onClick={() => setShowReject(true)}>
                      <RefreshCw className="w-4 h-4 mr-1" /> Regenerate
                    </Button>
                  </>
                )}
                {viewOrder.status === "generation" && (
                  <span className="flex items-center gap-2 text-xs text-violet-400 animate-pulse">
                    <Sparkles className="w-4 h-4" /> AI is generating...
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteOrder.mutate(viewOrder.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setViewOrder(null); setIsEditMode(false); setShowReject(false); }}>Close</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    <FiverrAIChat />
    </>
  );
}
