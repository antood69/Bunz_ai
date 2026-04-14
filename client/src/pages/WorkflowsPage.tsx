import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Plus, GitBranch, Play, Pause, Trash2, Lock, ShoppingCart, Sparkles, Layout, Search, Eye, ShieldCheck, MessageSquare, Zap, FileText, Code, PenTool, BarChart3, Loader2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Workflow } from "@shared/schema";
// SellOnMarketplace removed
import { useAuth } from "@/hooks/useAuth";

const presetIconMap: Record<string, React.ElementType> = {
  Search, Eye, ShieldCheck, MessageSquare, Zap, Layout, Sparkles,
  FileText, Code, PenTool, BarChart3,
};

const templateIconMap: Record<string, React.ElementType> = {
  "blog-post-pipeline": FileText,
  "code-review": Code,
  "content-creation": PenTool,
  "data-report": BarChart3,
  "bunz-ai-architecture": GitBranch,
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    draft: "bg-muted text-muted-foreground border-border",
    paused: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    completed: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium capitalize border ${styles[status] || styles.draft}`}>
      {status}
    </span>
  );
}

export default function WorkflowsPage() {
  const { toast } = useToast();
  const { isOwner } = useAuth();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [activeTab, setActiveTab] = useState<"workflows" | "templates">("workflows");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const { data: workflows, isLoading } = useQuery<Workflow[]>({ queryKey: ["/api/workflows"] });

  const { data: builtInTemplates = [] } = useQuery<any[]>({
    queryKey: ["/api/workflow-templates"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/workflow-templates");
      return res.json();
    },
  });

  const { data: presets = [] } = useQuery<any[]>({
    queryKey: ["/api/workflow-presets"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/workflow-presets");
      return res.json();
    },
  });

  const { data: userProducts = [] } = useQuery<any[]>({
    queryKey: ["/api/user-products"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/user-products");
      return res.json();
    },
  });

  const { data: products = [] } = useQuery<any[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/products");
      return res.json();
    },
  });

  const ownsProduct = (productId: string) => isOwner || userProducts.some((up: any) => up.productId === productId);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/workflows", { name, description, priority });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      setOpen(false);
      setName(""); setDescription(""); setPriority("medium");
      toast({ title: "Workflow created" });
      if (data.id) setLocation(`/workflows/${data.id}`);
    },
  });

  const installTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const res = await apiRequest("POST", `/api/workflow-templates/${templateId}/install`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: "Workflow created from template" });
      setActiveTab("workflows");
    },
    onError: () => {
      toast({ title: "Failed to install template", variant: "destructive" });
    },
  });

  const applyPresetMutation = useMutation({
    mutationFn: async (presetId: string) => {
      const res = await apiRequest("POST", `/api/workflow-presets/${presetId}/apply`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: "Workflow created from template" });
      setActiveTab("workflows");
    },
    onError: () => {
      toast({ title: "Failed to apply template", variant: "destructive" });
    },
  });

  const purchaseProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      const res = await apiRequest("POST", `/api/products/${productId}/purchase`);
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      if (data.already_owned || data.purchased) {
        queryClient.invalidateQueries({ queryKey: ["/api/user-products"] });
        toast({ title: "Product unlocked!" });
      }
      return data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("PATCH", `/api/workflows/${id}`, { status: status === "active" ? "paused" : "active" });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/workflows"] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/workflows/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: "Workflow deleted" });
      setDeleteTarget(null);
    },
  });

  return (
    <div className="p-6 space-y-5 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Visual Editor</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Select a workflow to open in the visual editor</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-workflow" className="gap-2">
              <Plus className="w-4 h-4" />
              New Workflow
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader><DialogTitle>Create Workflow</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Name</label>
                <Input data-testid="input-workflow-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Blog Post Pipeline" required className="bg-background border-border" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
                <Textarea data-testid="input-workflow-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this workflow do?" className="bg-background border-border min-h-[80px]" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Priority</label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger data-testid="select-workflow-priority" className="bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button data-testid="button-submit-workflow" type="submit" className="w-full" disabled={!name.trim() || createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Workflow"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab("workflows")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "workflows" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          My Workflows
        </button>
        <button
          onClick={() => setActiveTab("templates")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === "templates" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Templates
        </button>
      </div>

      {activeTab === "workflows" && (
        <>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-32 rounded-lg bg-card animate-pulse border border-border" />
              ))}
            </div>
          ) : !workflows?.length ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <GitBranch className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-1">No workflows yet</p>
              <p className="text-xs text-muted-foreground">Click "New Workflow" or browse Templates to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {workflows.map((w) => (
                <div key={w.id} data-testid={`card-workflow-${w.id}`} className="rounded-lg border border-border bg-card p-4 bunz-card-hover transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <Link href={`/workflows/${w.id}`}>
                      <h3 className="text-sm font-medium hover:text-primary cursor-pointer transition-colors">{w.name}</h3>
                    </Link>
                    <StatusBadge status={w.status} />
                  </div>
                  {w.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{w.description}</p>}
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                      w.priority === "critical" ? "bg-red-500/15 text-red-400"
                      : w.priority === "high" ? "bg-orange-500/15 text-orange-400"
                      : "bg-muted text-muted-foreground"
                    }`}>{w.priority}</span>
                    <div className="flex items-center gap-1">
                      <button data-testid={`button-toggle-workflow-${w.id}`} onClick={() => toggleMutation.mutate({ id: w.id, status: w.status })} className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                        {w.status === "active" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        data-testid={`button-delete-workflow-${w.id}`}
                        onClick={() => setDeleteTarget({ id: w.id, name: w.name })}
                        className="p-1.5 rounded-md hover:bg-destructive/15 transition-colors text-muted-foreground hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === "templates" && (
        <div className="space-y-6">
          {/* Built-in AI workflow templates */}
          {builtInTemplates.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Built-in AI Workflow Templates</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {builtInTemplates.map((tpl: any) => {
                  const IconComp = templateIconMap[tpl.id] || Sparkles;
                  return (
                    <div key={tpl.id} className="border border-border rounded-lg p-4 bg-card/50 hover:border-primary/30 transition-colors">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 rounded-md bg-primary/10">
                          <IconComp className="w-4 h-4 text-primary" />
                        </div>
                        <h4 className="text-sm font-medium">{tpl.name}</h4>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{tpl.description}</p>
                      <div className="flex flex-wrap gap-1 mb-3">
                        {(tpl.nodes || []).filter((n: any) => n.type === "agent").map((n: any) => (
                          <span key={n.id} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            {n.data?.subtype || "agent"}
                          </span>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs"
                        onClick={() => installTemplateMutation.mutate(tpl.id)}
                        disabled={installTemplateMutation.isPending}
                      >
                        <Play className="w-3 h-3 mr-1" /> Install Template
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Product promotion */}
          {products.map((product: any) => {
            const owned = ownsProduct(product.id);
            const productPresets = presets.filter((p: any) => p.productId === product.id);
            const features = product.features ? JSON.parse(product.features) : [];
            return (
              <div key={product.id} className="border border-border rounded-xl overflow-hidden">
                <div className="bg-gradient-to-r from-amber-500/10 via-card to-card p-5 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold">{product.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{product.description}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {features.map((f: string) => (
                        <span key={f} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">{f}</span>
                      ))}
                    </div>
                  </div>
                  {!owned ? (
                    <Button
                      onClick={() => purchaseProductMutation.mutate(product.id)}
                      disabled={purchaseProductMutation.isPending}
                      className="gap-2 bg-amber-600 hover:bg-amber-700 text-white flex-shrink-0"
                    >
                      <ShoppingCart className="w-4 h-4" />
                      ${(product.priceCents / 100).toFixed(2)}
                    </Button>
                  ) : (
                    <span className="text-xs text-emerald-400 font-medium px-3 py-1.5 bg-emerald-500/10 rounded-full border border-emerald-500/20">Owned</span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                  {productPresets.map((preset: any) => {
                    const IconComp = presetIconMap[preset.icon] || Sparkles;
                    return (
                      <div key={preset.id} className="border border-border rounded-lg p-3 bg-card/50 relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="p-1.5 rounded-md bg-primary/10">
                            <IconComp className="w-4 h-4 text-primary" />
                          </div>
                          <h4 className="text-sm font-medium">{preset.name}</h4>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{preset.description}</p>
                        {owned ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full text-xs"
                            onClick={() => applyPresetMutation.mutate(preset.id)}
                            disabled={applyPresetMutation.isPending}
                          >
                            <Play className="w-3 h-3 mr-1" /> Use Template
                          </Button>
                        ) : (
                          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground py-1.5">
                            <Lock className="w-3 h-3" />
                            Purchase to unlock
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Free presets */}
          {presets.filter((p: any) => !p.productId).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Free Templates</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {presets.filter((p: any) => !p.productId).map((preset: any) => {
                  const IconComp = presetIconMap[preset.icon] || Sparkles;
                  return (
                    <div key={preset.id} className="border border-border rounded-lg p-3 bg-card/50">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 rounded-md bg-emerald-500/10"><IconComp className="w-4 h-4 text-emerald-400" /></div>
                        <h4 className="text-sm font-medium">{preset.name}</h4>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">{preset.description}</p>
                      <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => applyPresetMutation.mutate(preset.id)} disabled={applyPresetMutation.isPending}>
                        <Play className="w-3 h-3 mr-1" /> Use Template
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {presets.length === 0 && products.length === 0 && builtInTemplates.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Layout className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No templates available yet</p>
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-medium text-foreground">"{deleteTarget?.name}"</span>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
