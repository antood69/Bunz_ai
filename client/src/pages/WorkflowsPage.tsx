import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  GitBranch, Plus, Play, Trash2, Loader2, CheckCircle2, XCircle,
  Clock, ChevronDown, ChevronRight, Pencil, X, Save, Zap,
  Globe, Code, PenTool, Palette, Bot, Send, Pause, SkipForward,
  RotateCcw, History, Coins, AlertTriangle, Square, Share2,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const DEPT_ICONS: Record<string, React.ElementType> = {
  research: Globe, coder: Code, writer: PenTool, artist: Palette, boss: Bot,
};

interface PipelineStep {
  id: string;
  type: "department" | "connector" | "transform";
  department?: string;
  connectorId?: number;
  connectorAction?: string;
  prompt: string;
  params?: Record<string, any>;
  retryCount?: number;
  skipOnFail?: boolean;
}

interface Pipeline {
  id: string;
  user_id: number;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: any;
  steps: PipelineStep[];
  status: string;
  last_run_at: number | null;
  run_count: number;
  created_at: number;
  updated_at: number;
}

interface ActiveStep {
  label: string;
  status: "pending" | "running" | "complete" | "failed" | "skipped";
  output?: string;
  tokens?: number;
  durationMs?: number;
  error?: string;
}

interface ActiveRun {
  runId: string;
  pipelineId: string;
  pipelineName: string;
  status: "running" | "paused" | "complete" | "failed" | "cancelled";
  steps: ActiveStep[];
  totalTokens: number;
  error?: string;
  expandedStep: number | null;
}

// ── Step Editor ───────────────────────────────────────────────────────
function StepEditor({ step, index, onChange, onRemove }: {
  step: PipelineStep; index: number;
  onChange: (step: PipelineStep) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-border rounded-xl p-4 bg-secondary/30 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Step {index + 1}</span>
        <button onClick={onRemove} className="text-muted-foreground hover:text-red-500">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Type</Label>
          <select value={step.type} onChange={(e) => onChange({ ...step, type: e.target.value as any })}
            className="w-full mt-1 bg-background border border-border rounded-xl px-2 py-1.5 text-sm">
            <option value="department">AI Department</option>
            <option value="connector">Connector Action</option>
            <option value="transform">Data Transform</option>
          </select>
        </div>
        {step.type === "department" && (
          <div>
            <Label className="text-xs">Department</Label>
            <select value={step.department || "research"} onChange={(e) => onChange({ ...step, department: e.target.value })}
              className="w-full mt-1 bg-background border border-border rounded-xl px-2 py-1.5 text-sm">
              <option value="research">Research</option>
              <option value="coder">Coder</option>
              <option value="writer">Writer</option>
              <option value="artist">Artist</option>
            </select>
          </div>
        )}
        {step.type === "connector" && (
          <div>
            <Label className="text-xs">Quick Action</Label>
            <select value={step.connectorAction || ""} onChange={(e) => {
              const val = e.target.value;
              const presets: Record<string, Partial<PipelineStep>> = {
                "send_email": { connectorAction: "send_email", prompt: "Send email to {{prev}}" },
                "create_post": { connectorAction: "create_post", prompt: "Post to LinkedIn: {{prev}}" },
                "search_emails": { connectorAction: "search_emails", prompt: "Search Gmail: from:fiverr.com is:unread" },
                "list_orders": { connectorAction: "list_orders", prompt: "Fetch Shopify orders" },
                "fulfill_order": { connectorAction: "fulfill_order", prompt: "Fulfill Shopify order {{prev}}" },
                "create_product": { connectorAction: "create_product", prompt: "Create product: {{prev}}" },
                "send_message": { connectorAction: "send_message", prompt: "Send Slack message: {{prev}}" },
                "write_note": { connectorAction: "write_note", prompt: "Save to Obsidian: {{prev}}" },
              };
              const preset = presets[val];
              if (preset) onChange({ ...step, ...preset, connectorAction: val });
            }}
              className="w-full mt-1 bg-background border border-border rounded-xl px-2 py-1.5 text-sm">
              <option value="">Select action...</option>
              <optgroup label="Email (Gmail)">
                <option value="send_email">Send Email</option>
                <option value="search_emails">Search Emails</option>
                <option value="read_email">Read Email</option>
              </optgroup>
              <optgroup label="LinkedIn">
                <option value="create_post">Publish Post</option>
              </optgroup>
              <optgroup label="Shopify">
                <option value="list_orders">List Orders</option>
                <option value="fulfill_order">Fulfill Order</option>
                <option value="create_product">Create Product</option>
              </optgroup>
              <optgroup label="Gumroad">
                <option value="list_sales">List Sales</option>
                <option value="create_product">Create Product</option>
              </optgroup>
              <optgroup label="Slack">
                <option value="send_message">Send Message</option>
                <option value="list_channels">List Channels</option>
              </optgroup>
              <optgroup label="Obsidian">
                <option value="write_note">Save Note</option>
                <option value="search_notes">Search Notes</option>
              </optgroup>
            </select>
          </div>
        )}
      </div>

      <div>
        <Label className="text-xs">
          Prompt / Task
          <span className="text-muted-foreground ml-1">(use {"{{prev}}"} for previous step output)</span>
        </Label>
        <textarea value={step.prompt} onChange={(e) => onChange({ ...step, prompt: e.target.value })}
          rows={3} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2 text-sm resize-y min-h-[60px]"
          placeholder="e.g. Research the top 5 competitors for {{prev}} and create a comparison table..." />
      </div>

      {/* Error handling config */}
      <div className="flex items-center gap-4 pt-1">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <RotateCcw className="w-3 h-3" />
          Retries:
          <select value={step.retryCount || 0} onChange={(e) => onChange({ ...step, retryCount: Number(e.target.value) })}
            className="bg-background border border-border rounded px-1 py-0.5 text-xs w-12">
            <option value={0}>0</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={step.skipOnFail || false}
            onChange={(e) => onChange({ ...step, skipOnFail: e.target.checked })}
            className="rounded border-border" />
          <SkipForward className="w-3 h-3" />
          Skip on fail
        </label>
      </div>
    </div>
  );
}

// ── Pipeline Builder Dialog ──────────────────────────────────────────
function PipelineBuilderDialog({ open, pipeline, onClose, onSave }: {
  open: boolean; pipeline: Pipeline | null; onClose: () => void;
  onSave: (data: { name: string; description: string; triggerType: string; steps: PipelineStep[] }) => void;
}) {
  const [name, setName] = useState(pipeline?.name || "");
  const [description, setDescription] = useState(pipeline?.description || "");
  const [triggerType, setTriggerType] = useState(pipeline?.trigger_type || "manual");
  const [steps, setSteps] = useState<PipelineStep[]>(pipeline?.steps || []);

  useEffect(() => {
    setName(pipeline?.name || "");
    setDescription(pipeline?.description || "");
    setTriggerType(pipeline?.trigger_type || "manual");
    setSteps(pipeline?.steps || []);
  }, [pipeline, open]);

  const addStep = () => {
    setSteps([...steps, { id: crypto.randomUUID(), type: "department", department: "research", prompt: "" }]);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-primary" />
            {pipeline ? "Edit Workflow" : "New Workflow"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fiverr Order Pipeline" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Trigger</Label>
              <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)}
                className="w-full mt-1 bg-background border border-border rounded-xl px-2 py-1.5 text-sm h-9">
                <option value="manual">Manual</option>
                <option value="cron">Scheduled (Cron)</option>
                <option value="webhook">Webhook</option>
              </select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this workflow do?" className="mt-1" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Steps ({steps.length})</Label>
              <Button size="sm" variant="outline" onClick={addStep} className="h-7 text-xs gap-1">
                <Plus className="w-3 h-3" /> Add Step
              </Button>
            </div>
            <div className="space-y-3">
              {steps.map((step, i) => (
                <StepEditor key={step.id} step={step} index={i}
                  onChange={(s) => { const u = [...steps]; u[i] = s; setSteps(u); }}
                  onRemove={() => setSteps(steps.filter((_, j) => j !== i))} />
              ))}
              {steps.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-xl">
                  No steps yet — click "Add Step" to build your workflow
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!name.trim() || steps.length === 0 || steps.some(s => !s.prompt.trim())}
            onClick={() => onSave({ name, description, triggerType, steps })}>
            <Save className="w-4 h-4 mr-1" /> {pipeline ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Workflow AI Assistant ────────────────────────────────────────────
function WorkflowAssistant({ onClose, onCreate }: { onClose: () => void; onCreate: (data: any) => void }) {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [workflow, setWorkflow] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = { role: "user" as const, content: input.trim() };
    const newMsgs = [...messages, msg];
    setMessages(newMsgs); setInput(""); setLoading(true);
    setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 50);
    try {
      const res = await fetch("/api/pipelines/assist", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ messages: newMsgs }),
      });
      const data = await res.json();
      if (data.reply) setMessages(p => [...p, { role: "assistant", content: data.reply }]);
      if (data.workflow) setWorkflow(data.workflow);
    } catch { setMessages(p => [...p, { role: "assistant", content: "Something went wrong." }]); }
    finally { setLoading(false); setTimeout(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); inputRef.current?.focus(); }, 50); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0"><X className="w-4 h-4" /></Button>
        <GitBranch className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">Workflow Architect</h2>
          <p className="text-[11px] text-muted-foreground">Describe what you want to automate — I'll design the workflow</p>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">What do you want to automate?</p>
            <p className="text-xs mt-2 max-w-md mx-auto">Describe your workflow and I'll design the steps.</p>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {["Fiverr order pipeline", "Daily newsletter digest", "Competitor research report", "Social media content batch"].map(s => (
                <button key={s} onClick={() => setInput(s)} className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all">{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
              m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground"
            }`}>{m.content}</div>
          </div>
        ))}
        {loading && <div className="flex justify-start"><div className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Thinking...</div></div>}
      </div>
      {workflow && (
        <div className="mx-4 mb-2 border border-emerald-500/30 bg-emerald-500/10 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-emerald-500">Workflow ready: {workflow.name}</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">{workflow.steps?.length} steps</p>
          </div>
          <Button size="sm" className="gap-1" onClick={() => onCreate(workflow)}><Save className="w-3.5 h-3.5" /> Create</Button>
        </div>
      )}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-end gap-2">
          <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            disabled={loading} rows={1} placeholder="Describe your workflow..."
            className="flex-1 bg-secondary border border-border rounded-xl px-4 py-3 text-sm resize-none min-h-[44px] max-h-[120px] focus:outline-none focus:ring-1 focus:ring-primary"
            onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 120) + "px"; }} />
          <Button className="h-11 w-11 rounded-xl p-0" onClick={send} disabled={loading || !input.trim()}><Send className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  );
}

// ── Execution History Dialog ─────────────────────────────────────────
function RunHistoryDialog({ open, pipeline, onClose }: { open: boolean; pipeline: Pipeline | null; onClose: () => void }) {
  const { data: runs = [] } = useQuery<any[]>({
    queryKey: ["pipeline-runs", pipeline?.id],
    queryFn: async () => {
      const res = await fetch(`/api/pipelines/${pipeline!.id}/runs`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: open && !!pipeline,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" /> Run History — {pipeline?.name}
          </DialogTitle>
        </DialogHeader>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No runs yet</p>
        ) : (
          <div className="space-y-2">
            {runs.map((run: any) => {
              const date = new Date(run.started_at).toLocaleString();
              const duration = run.completed_at ? ((run.completed_at - run.started_at) / 1000).toFixed(1) + "s" : "—";
              const tokensStr = run.total_tokens >= 1000 ? `${(run.total_tokens / 1000).toFixed(1)}K` : String(run.total_tokens || 0);
              return (
                <div key={run.id} className="border border-border rounded-xl p-3 flex items-center gap-3">
                  {run.status === "complete" ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> :
                   run.status === "failed" ? <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" /> :
                   run.status === "cancelled" ? <Square className="w-4 h-4 text-orange-500 flex-shrink-0" /> :
                   <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">{date}</span>
                      <Badge variant={run.status === "complete" ? "default" : "destructive"} className="text-[9px] h-4">{run.status}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                      <span>{run.steps_completed}/{run.total_steps} steps</span>
                      <span>{duration}</span>
                      <span className="flex items-center gap-0.5"><Coins className="w-2.5 h-2.5" />{tokensStr} tokens</span>
                    </div>
                  </div>
                  {run.error && <span className="text-[10px] text-red-500 max-w-[150px] truncate">{run.error}</span>}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ────────────────────────────────────────────────────────
export default function WorkflowsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editPipeline, setEditPipeline] = useState<Pipeline | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assistMode, setAssistMode] = useState(false);
  const [historyPipeline, setHistoryPipeline] = useState<Pipeline | null>(null);
  const [publishPipeline, setPublishPipeline] = useState<Pipeline | null>(null);

  const { data: pipelines = [], isLoading } = useQuery<Pipeline[]>({
    queryKey: ["/api/pipelines"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", "/api/pipelines", data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/pipelines"] }); setBuilderOpen(false); setEditPipeline(null); toast({ title: "Workflow created" }); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => { const res = await apiRequest("PUT", `/api/pipelines/${id}`, data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/pipelines"] }); setBuilderOpen(false); setEditPipeline(null); toast({ title: "Workflow updated" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/pipelines/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/pipelines"] }); toast({ title: "Workflow deleted" }); },
  });

  // ── Live Run State ─────────────────────────────────────────────────
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const runPipeline = (pipeline: Pipeline) => {
    apiRequest("POST", `/api/pipelines/${pipeline.id}/run`, { level: "medium" })
      .then(r => r.json())
      .then(({ runId }) => {
        const steps: ActiveStep[] = pipeline.steps.map(s => ({
          label: s.type === "department" ? (s.department || s.type) : s.type,
          status: "pending",
        }));
        setActiveRun({ runId, pipelineId: pipeline.id, pipelineName: pipeline.name, status: "running", steps, totalTokens: 0, expandedStep: null });

        if (eventSourceRef.current) eventSourceRef.current.close();
        const es = new EventSource(`/api/pipelines/${runId}/stream`);
        eventSourceRef.current = es;

        es.addEventListener("step_start", (e) => {
          const data = JSON.parse(e.data);
          setActiveRun(prev => {
            if (!prev) return prev;
            const steps = [...prev.steps];
            if (steps[data.stepIndex]) steps[data.stepIndex] = { ...steps[data.stepIndex], status: "running" };
            return { ...prev, steps };
          });
        });

        es.addEventListener("step_complete", (e) => {
          const data = JSON.parse(e.data);
          setActiveRun(prev => {
            if (!prev) return prev;
            const steps = [...prev.steps];
            if (steps[data.stepIndex]) steps[data.stepIndex] = {
              ...steps[data.stepIndex],
              status: data.status || "complete",
              output: data.output, tokens: data.tokens, durationMs: data.durationMs, error: data.error,
            };
            return { ...prev, steps, totalTokens: (prev.totalTokens || 0) + (data.tokens || 0) };
          });
        });

        es.addEventListener("step_retry", (e) => {
          const data = JSON.parse(e.data);
          setActiveRun(prev => {
            if (!prev) return prev;
            const steps = [...prev.steps];
            if (steps[data.stepIndex]) steps[data.stepIndex] = {
              ...steps[data.stepIndex], status: "running",
              error: `Retry ${data.attempt}/${data.maxRetries}: ${data.error}`,
            };
            return { ...prev, steps };
          });
        });

        es.addEventListener("pipeline_paused", () => {
          setActiveRun(prev => prev ? { ...prev, status: "paused" } : prev);
        });

        es.addEventListener("pipeline_resumed", () => {
          setActiveRun(prev => prev ? { ...prev, status: "running" } : prev);
        });

        es.addEventListener("pipeline_complete", (e) => {
          const data = JSON.parse(e.data);
          setActiveRun(prev => prev ? { ...prev, status: data.status, error: data.error } : prev);
          queryClient.invalidateQueries({ queryKey: ["/api/pipelines"] });
          es.close();
          eventSourceRef.current = null;
          if (data.status === "complete") toast({ title: "Workflow completed!" });
          else if (data.status === "cancelled") toast({ title: "Workflow cancelled" });
          else toast({ title: "Workflow failed", variant: "destructive" });
        });

        es.addEventListener("error", () => { es.close(); eventSourceRef.current = null; });
      })
      .catch(err => toast({ title: "Run failed", description: err.message, variant: "destructive" }));
  };

  const pauseRun = async () => {
    if (!activeRun) return;
    await fetch(`/api/pipelines/runs/${activeRun.runId}/pause`, { method: "POST", credentials: "include" });
    setActiveRun(prev => prev ? { ...prev, status: "paused" } : prev);
  };

  const resumeRun = async () => {
    if (!activeRun) return;
    await fetch(`/api/pipelines/runs/${activeRun.runId}/resume`, { method: "POST", credentials: "include" });
    setActiveRun(prev => prev ? { ...prev, status: "running" } : prev);
  };

  const cancelRun = async () => {
    if (!activeRun) return;
    await fetch(`/api/pipelines/runs/${activeRun.runId}/cancel`, { method: "POST", credentials: "include" });
    setActiveRun(prev => prev ? { ...prev, status: "cancelled" } : prev);
    if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
  };

  useEffect(() => {
    return () => { if (eventSourceRef.current) eventSourceRef.current.close(); };
  }, []);

  if (assistMode) {
    return (
      <div className="h-[calc(100vh-48px)]">
        <WorkflowAssistant onClose={() => setAssistMode(false)} onCreate={(data) => { createMutation.mutate(data); setAssistMode(false); }} />
      </div>
    );
  }

  const isRunActive = activeRun && (activeRun.status === "running" || activeRun.status === "paused");

  const totalRuns = pipelines.reduce((s, p) => s + (p.run_count || 0), 0);
  const totalSteps = pipelines.reduce((s, p) => s + (p.steps?.length || 0), 0);

  return (
    <div className="p-3 sm:p-4 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-primary" /> Workflows
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Build and run multi-step AI automations</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAssistMode(true)} className="gap-1.5 text-xs">
            <Bot className="w-3.5 h-3.5" /> AI Assist
          </Button>
          <Button size="sm" onClick={() => { setEditPipeline(null); setBuilderOpen(true); }} className="gap-1.5 text-xs">
            <Plus className="w-3.5 h-3.5" /> New Workflow
          </Button>
        </div>
      </div>

      {/* Stats row */}
      {pipelines.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: "Workflows", value: pipelines.length, color: "text-blue-400" },
            { label: "Total Steps", value: totalSteps, color: "text-violet-400" },
            { label: "Total Runs", value: totalRuns, color: "text-emerald-400" },
            { label: "Active", value: pipelines.filter(p => p.status === "active").length, color: "text-amber-400" },
          ].map(s => (
            <div key={s.label} className="glass-card rounded-xl px-3 py-2.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</span>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Quick Start Templates — show when empty or always as collapsible */}
      {pipelines.length === 0 && (
        <div className="mb-4">
          <div className="glass-card rounded-2xl p-5 mb-3">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Get Started</h2>
                <p className="text-[10px] text-muted-foreground">Pick a template or create from scratch. Each workflow chains AI departments to automate tasks.</p>
              </div>
            </div>

            {/* How it works */}
            <div className="flex items-center gap-2 mb-4 px-2">
              {["Create workflow", "Add AI steps", "Run it"].map((step, i) => (
                <div key={step} className="flex items-center gap-2 flex-1">
                  <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0">{i + 1}</div>
                  <span className="text-[10px] text-muted-foreground">{step}</span>
                  {i < 2 && <div className="flex-1 h-px bg-border" />}
                </div>
              ))}
            </div>
          </div>

          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Templates</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {[
              { name: "Fiverr SEO Article", desc: "Research → Write → Format SEO article", icon: "📝", difficulty: "Beginner", est: "~2 min", steps: [
                { id: "1", type: "department", department: "research", prompt: "Research SEO keywords and competitor articles for: {{prev}}" },
                { id: "2", type: "department", department: "writer", prompt: "Write a 1500-word SEO-optimized blog article based on this research:\n\n{{prev}}" },
                { id: "3", type: "transform", prompt: "Format this article with proper headings, meta description, and keyword density analysis:\n\n{{prev}}" },
              ]},
              { name: "LinkedIn Content", desc: "Research trends → Write engaging post", icon: "💼", difficulty: "Beginner", est: "~1 min", steps: [
                { id: "1", type: "department", department: "research", prompt: "Research the latest trending topics and insights in AI, tech, and entrepreneurship. Find 3 interesting angles for a LinkedIn post." },
                { id: "2", type: "department", department: "writer", prompt: "Write a compelling LinkedIn post (200-300 words) based on this research. Make it engaging, personal, and end with a question to drive comments:\n\n{{prev}}" },
              ]},
              { name: "Client Report", desc: "Research → Analyze → Professional report", icon: "📊", difficulty: "Intermediate", est: "~3 min", steps: [
                { id: "1", type: "department", department: "research", prompt: "Research and gather comprehensive data on: {{prev}}" },
                { id: "2", type: "department", department: "writer", prompt: "Write a professional client-ready report with executive summary, key findings, analysis, and recommendations based on:\n\n{{prev}}" },
              ]},
              { name: "Social Media Batch", desc: "Research → Posts + Graphics for all platforms", icon: "📱", difficulty: "Intermediate", est: "~4 min", steps: [
                { id: "1", type: "department", department: "research", prompt: "Research trending topics and content ideas for social media in the niche: {{prev}}" },
                { id: "2", type: "department", department: "writer", prompt: "Create a batch of 5 social media posts optimized for different platforms (Twitter/X, LinkedIn, Instagram) based on:\n\n{{prev}}" },
                { id: "3", type: "department", department: "artist", prompt: "Create a social media graphic for this content:\n\n{{step.2}}" },
              ]},
            ].map((tpl) => (
              <button key={tpl.name} onClick={() => createMutation.mutate({ name: tpl.name, description: tpl.desc, triggerType: "manual", steps: tpl.steps })}
                className="glass-card rounded-xl p-4 text-left group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xl">{tpl.icon}</span>
                  <Badge variant="outline" className="text-[8px] h-4">{tpl.difficulty}</Badge>
                </div>
                <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">{tpl.name}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{tpl.desc}</p>
                <div className="flex items-center gap-2 mt-2 text-[9px] text-muted-foreground">
                  <span>{tpl.steps.length} steps</span>
                  <span>{tpl.est}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
        </div>
      ) : pipelines.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground glass-card rounded-2xl">
          <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-20" />
          <p className="text-xs font-medium">No workflows yet — pick a template above or create your own</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pipelines.map((p) => {
            const expanded = expandedId === p.id;
            const thisRunning = activeRun?.pipelineId === p.id && isRunActive;
            const thisRun = activeRun?.pipelineId === p.id ? activeRun : null;
            return (
              <div key={p.id} className="glass-card rounded-2xl overflow-hidden">
                {/* Header row */}
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpandedId(expanded ? null : p.id)}>
                  <div className="text-muted-foreground">
                    {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <GitBranch className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{p.name}</span>
                      <Badge variant="outline" className="text-[9px] h-4">{p.trigger_type}</Badge>
                      <Badge variant="secondary" className="text-[9px] h-4">{p.steps.length} steps</Badge>
                    </div>
                    {p.description && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{p.description}</p>}
                  </div>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{p.run_count} runs</span>

                  {/* Actions */}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 border-0 rounded-lg"
                      onClick={() => runPipeline(p)} disabled={!!thisRunning}>
                      {thisRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      {thisRunning ? "Running" : "Run"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setHistoryPipeline(p)} title="History">
                      <History className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-primary/70 hover:text-primary" onClick={() => setPublishPipeline(p)} title="Publish">
                      <Share2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setEditPipeline(p); setBuilderOpen(true); }} title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500" onClick={() => deleteMutation.mutate(p.id)} title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Visual step pipeline — always visible */}
                {expanded && (
                  <div className="px-4 pb-4 border-t border-white/[0.04] pt-3">
                    <div className="flex items-center gap-1 overflow-x-auto pb-1">
                      {p.steps.map((step, i) => {
                        const Icon = (step.department && DEPT_ICONS[step.department]) || Zap;
                        const runStep = thisRun?.steps[i];
                        const stepStatus = runStep?.status;
                        return (
                          <div key={step.id} className="flex items-center gap-1 flex-shrink-0">
                            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                              stepStatus === "complete" ? "border-emerald-500/30 bg-emerald-500/5" :
                              stepStatus === "running" ? "border-blue-500/30 bg-blue-500/5" :
                              stepStatus === "failed" ? "border-red-500/30 bg-red-500/5" :
                              "border-white/[0.06] bg-white/[0.02]"
                            }`}>
                              <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                                stepStatus === "complete" ? "bg-emerald-500/15" :
                                stepStatus === "running" ? "bg-blue-500/15" :
                                "bg-primary/10"
                              }`}>
                                {stepStatus === "running" ? <Loader2 className="w-3 h-3 animate-spin text-blue-400" /> :
                                 stepStatus === "complete" ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> :
                                 stepStatus === "failed" ? <XCircle className="w-3 h-3 text-red-400" /> :
                                 <Icon className="w-3 h-3 text-primary" />}
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold text-foreground capitalize">{step.type === "department" ? step.department : step.type}</p>
                                <p className="text-[8px] text-muted-foreground max-w-[100px] truncate">{step.prompt.slice(0, 40)}</p>
                                {runStep?.tokens ? <span className="text-[8px] text-emerald-500">{runStep.tokens >= 1000 ? `${(runStep.tokens / 1000).toFixed(1)}K` : runStep.tokens} tok</span> : null}
                              </div>
                            </div>
                            {i < p.steps.length - 1 && (
                              <div className="w-4 h-px bg-white/10 flex-shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Inline run output */}
                    {thisRun && thisRun.steps.some(s => s.output) && (
                      <div className="mt-3 space-y-1.5">
                        {thisRun.steps.filter(s => s.output || s.error).map((step, i) => (
                          <div key={i} className="rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-semibold text-foreground capitalize">Step {i + 1}: {step.label}</span>
                              <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                                {step.tokens && <span className="flex items-center gap-0.5"><Coins className="w-2.5 h-2.5" />{step.tokens}</span>}
                                {step.durationMs && <span>{(step.durationMs / 1000).toFixed(1)}s</span>}
                              </div>
                            </div>
                            {step.output && <pre className="text-[9px] text-muted-foreground whitespace-pre-wrap break-words line-clamp-4">{step.output}</pre>}
                            {step.error && <p className="text-[9px] text-red-500 flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" />{step.error}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Inline progress bar when running */}
                {thisRunning && thisRun && (
                  <div className="px-4 py-2 border-t border-white/[0.04] flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(thisRun.steps.filter(s => s.status === "complete").length / thisRun.steps.length) * 100}%` }} />
                    </div>
                    <span className="text-[9px] text-muted-foreground">{thisRun.steps.filter(s => s.status === "complete").length}/{thisRun.steps.length}</span>
                    <div className="flex gap-1">
                      {activeRun?.status === "running" ? (
                        <button onClick={pauseRun} className="text-orange-500 hover:text-orange-400"><Pause className="w-3.5 h-3.5" /></button>
                      ) : (
                        <button onClick={resumeRun} className="text-emerald-500 hover:text-emerald-400"><Play className="w-3.5 h-3.5" /></button>
                      )}
                      <button onClick={cancelRun} className="text-red-500 hover:text-red-400"><Square className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <PipelineBuilderDialog open={builderOpen} pipeline={editPipeline}
        onClose={() => { setBuilderOpen(false); setEditPipeline(null); }}
        onSave={(data) => { editPipeline ? updateMutation.mutate({ id: editPipeline.id, data }) : createMutation.mutate(data); }} />

      <RunHistoryDialog open={!!historyPipeline} pipeline={historyPipeline} onClose={() => setHistoryPipeline(null)} />

      {/* Publish to Workshop Dialog */}
      {publishPipeline && (
        <PublishDialog pipeline={publishPipeline} onClose={() => setPublishPipeline(null)}
          onPublished={() => { setPublishPipeline(null); toast({ title: "Published to Workshop!" }); }} />
      )}
    </div>
  );
}

// ── Publish to Workshop Dialog ───────────────────────────────────────
function PublishDialog({ pipeline, onClose, onPublished }: {
  pipeline: Pipeline; onClose: () => void; onPublished: () => void;
}) {
  const [title, setTitle] = useState(pipeline.name);
  const [description, setDescription] = useState(pipeline.description || "");
  const [tags, setTags] = useState("");
  const [price, setPrice] = useState("0");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handlePublish = async () => {
    if (!title.trim() || !description.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/workshop/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title, description,
          shortDescription: description.slice(0, 120),
          category: "workflow",
          priceUsd: Number(price) || 0,
          pipelineId: pipeline.id,
          tags,
        }),
      });
      if (res.ok) {
        onPublished();
      } else {
        const data = await res.json();
        toast({ title: "Publish failed", description: data.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary" /> Publish to Workshop
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
              rows={3} className="mt-1" placeholder="What does this workflow do? Who is it for?" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Price (USD)</Label>
              <Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1" />
              <p className="text-[10px] text-muted-foreground mt-1">Set to 0 for free</p>
            </div>
            <div>
              <Label className="text-xs">Tags (comma-separated)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="research, seo, fiverr" className="mt-1" />
            </div>
          </div>
          <div className="bg-secondary/50 rounded-xl p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">What gets published:</p>
            <p>Your workflow's structure ({pipeline.steps.length} steps) will be cloneable by other users. Your prompt text is included.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!title.trim() || !description.trim() || loading} onClick={handlePublish}>
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Share2 className="w-4 h-4 mr-1" />}
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
