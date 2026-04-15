import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  GitBranch, Plus, Play, Trash2, Loader2, CheckCircle2, XCircle,
  Clock, ChevronDown, ChevronRight, Pencil, X, Save, Zap,
  Globe, Code, PenTool, Palette, Bot, Search, Send, ArrowLeft,
} from "lucide-react";
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

// ── Step Editor ───────────────────────────────────────────────────────
function StepEditor({ step, index, onChange, onRemove }: {
  step: PipelineStep; index: number;
  onChange: (step: PipelineStep) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-border rounded-lg p-3 bg-secondary/30 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Step {index + 1}</span>
        <button onClick={onRemove} className="text-muted-foreground hover:text-red-400">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Type</Label>
          <select
            value={step.type}
            onChange={(e) => onChange({ ...step, type: e.target.value as any })}
            className="w-full mt-1 bg-background border border-border rounded-md px-2 py-1.5 text-sm"
          >
            <option value="department">Department</option>
            <option value="connector">Connector</option>
            <option value="transform">Transform</option>
          </select>
        </div>
        {step.type === "department" && (
          <div>
            <Label className="text-xs">Department</Label>
            <select
              value={step.department || "research"}
              onChange={(e) => onChange({ ...step, department: e.target.value })}
              className="w-full mt-1 bg-background border border-border rounded-md px-2 py-1.5 text-sm"
            >
              <option value="research">Research</option>
              <option value="coder">Coder</option>
              <option value="writer">Writer</option>
              <option value="artist">Artist</option>
            </select>
          </div>
        )}
      </div>

      <div>
        <Label className="text-xs">
          Prompt / Task
          <span className="text-muted-foreground ml-1">
            (use {"{{prev}}"} for previous step output)
          </span>
        </Label>
        <textarea
          value={step.prompt}
          onChange={(e) => onChange({ ...step, prompt: e.target.value })}
          rows={3}
          className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm resize-y min-h-[60px]"
          placeholder="e.g. Research the top 5 competitors for {{prev}} and create a comparison table..."
        />
      </div>
    </div>
  );
}

// ── Pipeline Builder Dialog ──────────────────────────────────────────
function PipelineBuilderDialog({ open, pipeline, onClose, onSave }: {
  open: boolean;
  pipeline: Pipeline | null;
  onClose: () => void;
  onSave: (data: { name: string; description: string; triggerType: string; steps: PipelineStep[] }) => void;
}) {
  const [name, setName] = useState(pipeline?.name || "");
  const [description, setDescription] = useState(pipeline?.description || "");
  const [triggerType, setTriggerType] = useState(pipeline?.trigger_type || "manual");
  const [steps, setSteps] = useState<PipelineStep[]>(pipeline?.steps || []);

  const addStep = () => {
    setSteps([...steps, {
      id: crypto.randomUUID(),
      type: "department",
      department: "research",
      prompt: "",
    }]);
  };

  const updateStep = (index: number, step: PipelineStep) => {
    const updated = [...steps];
    updated[index] = step;
    setSteps(updated);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
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
              <select
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value)}
                className="w-full mt-1 bg-background border border-border rounded-md px-2 py-1.5 text-sm h-9"
              >
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

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-semibold uppercase tracking-wider">Steps ({steps.length})</Label>
              <Button size="sm" variant="outline" onClick={addStep} className="h-7 text-xs gap-1">
                <Plus className="w-3 h-3" /> Add Step
              </Button>
            </div>
            <div className="space-y-3">
              {steps.map((step, i) => (
                <StepEditor key={step.id} step={step} index={i} onChange={(s) => updateStep(i, s)} onRemove={() => removeStep(i)} />
              ))}
              {steps.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">
                  No steps yet — click "Add Step" to build your workflow
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!name.trim() || steps.length === 0 || steps.some(s => !s.prompt.trim())}
            onClick={() => onSave({ name, description, triggerType, steps })}
          >
            <Save className="w-4 h-4 mr-1" /> {pipeline ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Full-Page Workflow AI Assistant ───────────────────────────────────
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
            <p className="text-xs mt-2 max-w-md mx-auto">Describe your workflow and I'll ask about steps, triggers, data sources, and anything else needed.</p>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {["Fiverr order pipeline", "Daily newsletter digest", "Competitor research report", "Social media content batch"].map(s => (
                <button key={s} onClick={() => setInput(s)} className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">{s}</button>
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
            <span className="text-sm font-medium text-emerald-400">Workflow ready: {workflow.name}</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">{workflow.steps?.length} steps · {workflow.triggerType}</p>
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

// ── Main Page ────────────────────────────────────────────────────────
export default function WorkflowsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editPipeline, setEditPipeline] = useState<Pipeline | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assistMode, setAssistMode] = useState(false);

  const { data: pipelines = [], isLoading } = useQuery<Pipeline[]>({
    queryKey: ["/api/pipelines"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/pipelines", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines"] });
      setBuilderOpen(false);
      setEditPipeline(null);
      toast({ title: "Workflow created" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/pipelines/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines"] });
      setBuilderOpen(false);
      setEditPipeline(null);
      toast({ title: "Workflow updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/pipelines/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines"] });
      toast({ title: "Workflow deleted" });
    },
  });

  // Live run state
  const [activeRun, setActiveRun] = useState<{
    runId: string; pipelineId: string; pipelineName: string;
    status: "running" | "complete" | "failed";
    steps: Array<{ label: string; status: "pending" | "running" | "complete" | "failed"; output?: string; tokens?: number; durationMs?: number }>;
    error?: string;
  } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const runPipeline = (pipeline: Pipeline) => {
    // Start run
    apiRequest("POST", `/api/pipelines/${pipeline.id}/run`, { level: "medium" })
      .then(r => r.json())
      .then(({ runId }) => {
        // Init steps
        const steps = pipeline.steps.map(s => ({
          label: s.type === "department" ? (s.department || s.type) : s.type,
          status: "pending" as const,
        }));
        setActiveRun({ runId, pipelineId: pipeline.id, pipelineName: pipeline.name, status: "running", steps });

        // Connect SSE
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
              ...steps[data.stepIndex], status: "complete",
              output: data.output, tokens: data.tokens, durationMs: data.durationMs,
            };
            return { ...prev, steps };
          });
        });

        es.addEventListener("pipeline_complete", (e) => {
          const data = JSON.parse(e.data);
          setActiveRun(prev => prev ? { ...prev, status: data.status, error: data.error } : prev);
          queryClient.invalidateQueries({ queryKey: ["/api/pipelines"] });
          es.close();
          eventSourceRef.current = null;
          toast({ title: data.status === "complete" ? "Workflow completed!" : "Workflow failed", variant: data.status === "complete" ? "default" : "destructive" });
        });

        es.addEventListener("error", () => { es.close(); eventSourceRef.current = null; });
      })
      .catch(err => toast({ title: "Run failed", description: err.message, variant: "destructive" }));
  };

  useEffect(() => {
    return () => { if (eventSourceRef.current) eventSourceRef.current.close(); };
  }, []);

  // Full-page AI assistant mode
  if (assistMode) {
    return (
      <div className="h-[calc(100vh-48px)]">
        <WorkflowAssistant onClose={() => setAssistMode(false)} onCreate={(data) => { createMutation.mutate(data); setAssistMode(false); }} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-primary" />
            Workflows
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Build multi-step automations using departments & connectors</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setAssistMode(true)} className="gap-1.5">
            <Bot className="w-4 h-4" /> AI Assist
          </Button>
          <Button onClick={() => { setEditPipeline(null); setBuilderOpen(true); }} className="gap-1.5">
            <Plus className="w-4 h-4" /> New Workflow
          </Button>
        </div>
      </div>

      {/* Pipeline list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
        </div>
      ) : pipelines.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
          <GitBranch className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No workflows yet</p>
          <p className="text-xs mt-1 mb-4">Create your first workflow to automate multi-step tasks</p>
          <Button variant="outline" onClick={() => { setEditPipeline(null); setBuilderOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Create Workflow
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {pipelines.map((p) => {
            const expanded = expandedId === p.id;
            const isRunning = activeRun?.pipelineId === p.id && activeRun.status === "running";
            return (
              <div key={p.id} className="border border-border rounded-xl bg-card">
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpandedId(expanded ? null : p.id)}>
                  <div className="text-muted-foreground">
                    {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                  <GitBranch className="w-5 h-5 text-primary" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{p.name}</span>
                      <Badge variant="outline" className="text-[10px]">{p.trigger_type}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{p.steps.length} steps</Badge>
                    </div>
                    {p.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{p.description}</p>}
                  </div>
                  <div className="text-xs text-muted-foreground flex-shrink-0">
                    {p.run_count} runs
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" className="h-8 gap-1 text-emerald-400 hover:text-emerald-300" onClick={() => runPipeline(p)} disabled={activeRun?.pipelineId === p.id && activeRun.status === "running"}>
                      {activeRun?.pipelineId === p.id && activeRun.status === "running" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      Run
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setEditPipeline(p); setBuilderOpen(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400" onClick={() => deleteMutation.mutate(p.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {expanded && (
                  <div className="px-4 pb-4 border-t border-border pt-3 space-y-2">
                    {p.steps.map((step, i) => {
                      const Icon = (step.department && DEPT_ICONS[step.department]) || Zap;
                      return (
                        <div key={step.id} className="flex items-start gap-2 text-xs">
                          <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Icon className="w-3 h-3 text-primary" />
                          </div>
                          <div>
                            <span className="font-medium text-foreground capitalize">{step.type === "department" ? step.department : step.type}</span>
                            <p className="text-muted-foreground mt-0.5">{step.prompt.slice(0, 150)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Builder Dialog */}
      {/* Live Progress Panel */}
      {activeRun && (
        <div className="fixed bottom-4 right-4 w-96 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
            <div className="flex items-center gap-2">
              {activeRun.status === "running" ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
              ) : activeRun.status === "complete" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400" />
              )}
              <span className="text-sm font-medium text-foreground">{activeRun.pipelineName}</span>
            </div>
            <button onClick={() => setActiveRun(null)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
            {activeRun.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="mt-0.5 flex-shrink-0">
                  {step.status === "complete" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : step.status === "running" ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                  ) : step.status === "failed" ? (
                    <XCircle className="w-4 h-4 text-red-400" />
                  ) : (
                    <Clock className="w-4 h-4 text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium capitalize ${step.status === "complete" ? "text-foreground" : step.status === "running" ? "text-blue-400" : "text-muted-foreground"}`}>
                      Step {i + 1}: {step.label}
                    </span>
                    {step.durationMs && (
                      <span className="text-[10px] text-muted-foreground">{(step.durationMs / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                  {step.output && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{step.output}</p>
                  )}
                </div>
              </div>
            ))}
            {activeRun.error && (
              <p className="text-xs text-red-400 bg-red-500/10 px-2 py-1.5 rounded">{activeRun.error}</p>
            )}
          </div>
        </div>
      )}

      <PipelineBuilderDialog
        open={builderOpen}
        pipeline={editPipeline}
        onClose={() => { setBuilderOpen(false); setEditPipeline(null); }}
        onSave={(data) => {
          if (editPipeline) {
            updateMutation.mutate({ id: editPipeline.id, data });
          } else {
            createMutation.mutate(data);
          }
        }}
      />
    </div>
  );
}
