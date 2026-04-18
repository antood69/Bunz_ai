import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Zap, Plus, Play, Trash2, Loader2, GitBranch, ArrowRight,
  Search, FileText, BarChart3, Layout, CheckSquare, X, Save,
} from "lucide-react";

const TEMPLATE_ICONS: Record<string, typeof Zap> = {
  search: Search, "file-text": FileText, "bar-chart": BarChart3,
  layout: Layout, "check-square": CheckSquare, "git-branch": GitBranch, zap: Zap,
};

interface WorkflowTemplate {
  id: string;
  user_id: number;
  name: string;
  description: string;
  icon: string;
  category: string;
  variables: Array<{ key: string; label: string; placeholder?: string }>;
  steps: Array<{ department: string; label: string; prompt: string }>;
  is_public: number;
  use_count: number;
  avg_tokens: number;
}

const DEPARTMENTS = ["research", "coder", "artist", "writer", "reader"] as const;

export default function TemplatesPage() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState<WorkflowTemplate | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data: templates = [], isLoading } = useQuery<WorkflowTemplate[]>({
    queryKey: ["/api/workflow-templates"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/workflow-templates/${id}`, { method: "DELETE", credentials: "include" });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/workflow-templates"] }),
  });

  const run = async () => {
    if (!selected) return;
    setRunning(true);
    try {
      const r = await fetch(`/api/workflow-templates/${selected.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ variables: vars, level: "medium" }),
      });
      const data = await r.json();
      if (data.jobId) {
        try { sessionStorage.setItem("cortal-active-job", data.jobId); } catch {}
        try { sessionStorage.setItem("bunz-active-conv", data.conversationId); } catch {}
      }
      setSelected(null);
      setVars({});
      navigate("/boss");
    } catch {
      setRunning(false);
    }
  };

  const categories = Array.from(new Set(templates.map(t => t.category)));
  const filtered = categoryFilter === "all"
    ? templates
    : templates.filter(t => t.category === categoryFilter);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <GitBranch className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Templates</h1>
            <p className="text-xs text-muted-foreground">Multi-step workflows you can run with variables</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Template
        </button>
      </div>

      {/* Category filter */}
      {categories.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setCategoryFilter("all")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              categoryFilter === "all" ? "bg-primary/15 text-primary" : "bg-secondary/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            All ({templates.length})
          </button>
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                categoryFilter === c ? "bg-primary/15 text-primary" : "bg-secondary/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {c} ({templates.filter(t => t.category === c).length})
            </button>
          ))}
        </div>
      )}

      {/* Templates grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <GitBranch className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">No templates yet</p>
          <p className="text-xs mt-1">Create your first template to automate recurring tasks</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(t => {
            const Icon = TEMPLATE_ICONS[t.icon] || Zap;
            const isOwn = t.is_public === 0;
            return (
              <div
                key={t.id}
                className="group relative flex flex-col gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-foreground truncate">{t.name}</h3>
                      {isOwn && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">custom</span>}
                    </div>
                    <p className="text-[11px] text-muted-foreground/70 line-clamp-2 mt-0.5 leading-relaxed">{t.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="px-2 py-0.5 rounded-full bg-secondary">{t.category}</span>
                  <span>{t.steps.length} steps</span>
                  {t.use_count > 0 && <span>{t.use_count} runs</span>}
                </div>

                <div className="flex items-center gap-2 mt-auto">
                  <button
                    onClick={() => { setSelected(t); setVars({}); }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Play className="w-3 h-3" />
                    Run
                  </button>
                  {isOwn && (
                    <button
                      onClick={() => { if (confirm(`Delete "${t.name}"?`)) deleteMutation.mutate(t.id); }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Run dialog */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => !running && setSelected(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                {(() => { const Icon = TEMPLATE_ICONS[selected.icon] || Zap; return <Icon className="w-5 h-5 text-primary" />; })()}
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-foreground">{selected.name}</h3>
                <p className="text-[11px] text-muted-foreground">{selected.steps.length} steps</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 rounded-md hover:bg-secondary">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-1">
              {selected.steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="w-4 h-4 rounded-full bg-secondary flex items-center justify-center text-[9px] font-medium flex-shrink-0">{i + 1}</span>
                  <span className="text-foreground font-medium">{s.label || s.department}</span>
                  <ArrowRight className="w-2.5 h-2.5 opacity-40" />
                  <span className="truncate">{s.department}</span>
                </div>
              ))}
            </div>

            {selected.variables.length > 0 && (
              <div className="space-y-2.5">
                {selected.variables.map(v => (
                  <div key={v.key}>
                    <label className="text-[11px] font-medium text-foreground mb-1 block">{v.label}</label>
                    <textarea
                      value={vars[v.key] || ""}
                      onChange={e => setVars(prev => ({ ...prev, [v.key]: e.target.value }))}
                      placeholder={v.placeholder}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 resize-none"
                      rows={v.key === "notes" ? 5 : 2}
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={run}
              disabled={running || selected.variables.some(v => !vars[v.key]?.trim())}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? "Starting..." : "Run Template"}
            </button>
          </div>
        </div>
      )}

      {/* Create dialog */}
      {showCreate && <CreateTemplateDialog onClose={() => setShowCreate(false)} onCreated={() => qc.invalidateQueries({ queryKey: ["/api/workflow-templates"] })} />}
    </div>
  );
}

function CreateTemplateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [steps, setSteps] = useState<Array<{ department: string; label: string; prompt: string }>>([
    { department: "writer", label: "Step 1", prompt: "" },
  ]);
  const [variables, setVariables] = useState<Array<{ key: string; label: string; placeholder?: string }>>([]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || steps.some(s => !s.prompt.trim())) return;
    setSaving(true);
    try {
      await fetch("/api/workflow-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, description, category, icon: "zap", steps, variables }),
      });
      onCreated();
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">New Template</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-secondary">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-foreground mb-1 block">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Weekly Competitor Scan"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-foreground mb-1 block">Description</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this template do?"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-foreground mb-1 block">Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary/50"
            >
              <option value="general">General</option>
              <option value="research">Research</option>
              <option value="writing">Writing</option>
              <option value="coding">Coding</option>
              <option value="design">Design</option>
              <option value="productivity">Productivity</option>
            </select>
          </div>

          {/* Variables */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-foreground">Variables (use {"{{key}}"} in prompts)</label>
              <button
                onClick={() => setVariables(v => [...v, { key: "", label: "", placeholder: "" }])}
                className="text-[10px] text-primary hover:underline"
              >+ Add</button>
            </div>
            {variables.map((v, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  value={v.key}
                  onChange={e => setVariables(arr => arr.map((x, j) => j === i ? { ...x, key: e.target.value.replace(/\W/g, "") } : x))}
                  placeholder="key"
                  className="w-24 px-2 py-1.5 rounded border border-border bg-background text-xs"
                />
                <input
                  value={v.label}
                  onChange={e => setVariables(arr => arr.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                  placeholder="Display label"
                  className="flex-1 px-2 py-1.5 rounded border border-border bg-background text-xs"
                />
                <button onClick={() => setVariables(arr => arr.filter((_, j) => j !== i))} className="p-1.5 rounded hover:bg-red-500/10 text-red-400">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-foreground">Steps</label>
              <button
                onClick={() => setSteps(s => [...s, { department: "writer", label: `Step ${s.length + 1}`, prompt: "" }])}
                className="text-[10px] text-primary hover:underline"
              >+ Add Step</button>
            </div>
            {steps.map((s, i) => (
              <div key={i} className="rounded-lg border border-border p-2 mb-2 space-y-2">
                <div className="flex gap-2">
                  <select
                    value={s.department}
                    onChange={e => setSteps(arr => arr.map((x, j) => j === i ? { ...x, department: e.target.value } : x))}
                    className="px-2 py-1 rounded border border-border bg-background text-xs"
                  >
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <input
                    value={s.label}
                    onChange={e => setSteps(arr => arr.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                    placeholder="Step name"
                    className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs"
                  />
                  {steps.length > 1 && (
                    <button onClick={() => setSteps(arr => arr.filter((_, j) => j !== i))} className="p-1 rounded hover:bg-red-500/10 text-red-400">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <textarea
                  value={s.prompt}
                  onChange={e => setSteps(arr => arr.map((x, j) => j === i ? { ...x, prompt: e.target.value } : x))}
                  placeholder="Task prompt (use {{variable}} to reference inputs)"
                  rows={3}
                  className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs resize-none"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !name.trim() || steps.some(s => !s.prompt.trim())}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
