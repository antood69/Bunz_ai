import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Search, Code2, FileText, BarChart3, ShieldCheck, Palette, Globe,
  Save, ChevronDown, ChevronUp, Loader2, CheckCircle, Clock, Zap,
  Settings2, Plus, X,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { findModel, BADGE_CONFIG, COST_TIER_CONFIG } from "@/lib/ai-providers";
import type { ModelBadge, CostTier } from "@/lib/ai-providers";

// ── Built-in agent definitions ──────────────────────────────────────────────

const AGENT_TYPES = [
  { type: "researcher", name: "Researcher", description: "Web research, data gathering, competitive analysis, fact-finding", icon: Search, color: "text-violet-400 bg-violet-500/15 border-violet-500/20" },
  { type: "coder", name: "Coder", description: "Code generation, debugging, refactoring, technical tasks", icon: Code2, color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/20" },
  { type: "writer", name: "Writer", description: "Blog posts, copy, documentation, creative writing", icon: FileText, color: "text-blue-400 bg-blue-500/15 border-blue-500/20" },
  { type: "analyst", name: "Analyst", description: "Data analysis, reports, spreadsheets, statistical insights", icon: BarChart3, color: "text-amber-400 bg-amber-500/15 border-amber-500/20" },
  { type: "reviewer", name: "Reviewer", description: "Quality checks, code review, fact-checking, editing", icon: ShieldCheck, color: "text-cyan-400 bg-cyan-500/15 border-cyan-500/20" },
  { type: "artgen", name: "Art Gen", description: "Image generation prompts, visual descriptions, art direction", icon: Palette, color: "text-pink-400 bg-pink-500/15 border-pink-500/20" },
  { type: "browser", name: "Browser", description: "Web browsing tasks, URL analysis, scraping strategies", icon: Globe, color: "text-orange-400 bg-orange-500/15 border-orange-500/20" },
] as const;


interface AgentConfig {
  id: string;
  agentType: string;
  model: string | null;
  models: string | null; // JSON array of model IDs
  systemPrompt: string | null;
  isActive: number;
}

interface AgentJobSummary {
  type: string;
  totalJobs: number;
  completedJobs: number;
  totalTokens: number;
  avgDurationMs: number;
}

// ── Agent Card ──────────────────────────────────────────────────────────────

function ModelChip({ modelId, onRemove }: { modelId: string; onRemove: () => void }) {
  const found = findModel(modelId);
  const name = found?.model.name || modelId;
  const badges = found?.model.badges || [];
  const costTier = found?.model.costTier;
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary border border-border text-xs group">
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
        onClick={onRemove}
        className="ml-0.5 p-0.5 rounded hover:bg-destructive/15 text-muted-foreground hover:text-red-400 transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function AgentCard({
  agent,
  config,
  jobSummary,
  onSave,
  isSaving,
}: {
  agent: typeof AGENT_TYPES[number];
  config?: AgentConfig;
  jobSummary?: AgentJobSummary;
  onSave: (agentType: string, models: string[], systemPrompt: string) => void;
  isSaving: boolean;
}) {
  // Parse models from config — support both new `models` JSON array and legacy `model` string
  const parseModels = (cfg?: AgentConfig): string[] => {
    if (!cfg) return [];
    if (cfg.models) {
      try { return JSON.parse(cfg.models); } catch { /* fall through */ }
    }
    return cfg.model ? [cfg.model] : [];
  };

  const [models, setModels] = useState<string[]>(parseModels(config));
  const [systemPrompt, setSystemPrompt] = useState(config?.systemPrompt || "");
  const [expanded, setExpanded] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [dirty, setDirty] = useState(false);
  const Icon = agent.icon;

  useEffect(() => {
    setModels(parseModels(config));
    setSystemPrompt(config?.systemPrompt || "");
    setDirty(false);
  }, [config]);

  const handleAddModel = (val: { provider: string; model: string } | null) => {
    if (!val || !val.model || val.model === "auto") return;
    if (models.includes(val.model)) return; // no duplicates
    setModels([...models, val.model]);
    setShowPicker(false);
    setDirty(true);
  };

  const handleRemoveModel = (modelId: string) => {
    setModels(models.filter(m => m !== modelId));
    setDirty(true);
  };

  const handlePromptChange = (val: string) => {
    setSystemPrompt(val);
    setDirty(true);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3 transition-all hover:border-primary/20">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${agent.color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{agent.name}</h3>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              idle
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{agent.description}</p>
        </div>
      </div>

      {/* Multi-model section */}
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
          Models {models.length > 0 && `(${models.length})`}
        </label>
        {models.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {models.map(m => (
              <ModelChip key={m} modelId={m} onRemove={() => handleRemoveModel(m)} />
            ))}
          </div>
        )}
        {models.length === 0 && !showPicker && (
          <p className="text-[10px] text-muted-foreground mb-1.5">Auto (Smart Routing)</p>
        )}
        {showPicker ? (
          <div className="relative">
            <button
              onClick={() => setShowPicker(false)}
              className="absolute -top-1 -right-1 p-0.5 rounded-full bg-card border border-border text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="text-[10px] h-7 gap-1"
            onClick={() => setShowPicker(true)}
          >
            <Plus className="w-3 h-3" />
            Add Model
          </Button>
        )}
      </div>

      {/* System prompt (collapsible) */}
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
        >
          <Settings2 className="w-3 h-3" />
          System Prompt
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {expanded && (
          <Textarea
            value={systemPrompt}
            onChange={(e) => handlePromptChange(e.target.value)}
            placeholder="Custom system prompt for this agent..."
            className="bg-background border-border mt-1.5 text-xs min-h-[100px] font-mono"
          />
        )}
      </div>

      {/* Stats row */}
      {jobSummary && jobSummary.totalJobs > 0 && (
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3" />
            {jobSummary.totalJobs} jobs
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            {jobSummary.completedJobs} done
          </span>
          {jobSummary.totalTokens > 0 && (
            <span>{(jobSummary.totalTokens / 1000).toFixed(1)}K tokens</span>
          )}
          {jobSummary.avgDurationMs > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {(jobSummary.avgDurationMs / 1000).toFixed(1)}s avg
            </span>
          )}
        </div>
      )}

      {/* Save button */}
      {dirty && (
        <Button
          size="sm"
          className="w-full text-xs gap-1.5"
          onClick={() => onSave(agent.type, models, systemPrompt)}
          disabled={isSaving}
        >
          {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save Configuration
        </Button>
      )}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const { toast } = useToast();

  const { data: configs = [] } = useQuery<AgentConfig[]>({
    queryKey: ["/api/agent-configs"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/agent-configs");
        return res.json();
      } catch {
        return [];
      }
    },
  });

  const { data: jobSummaries = [] } = useQuery<AgentJobSummary[]>({
    queryKey: ["/api/agent-jobs/summary"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/agent-jobs/summary");
        return res.json();
      } catch {
        return [];
      }
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ agentType, models, systemPrompt }: { agentType: string; models: string[]; systemPrompt: string }) => {
      const res = await apiRequest("PUT", `/api/agent-configs/${agentType}`, {
        models,
        systemPrompt: systemPrompt || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-configs"] });
      toast({ title: "Agent configuration saved" });
    },
    onError: () => {
      toast({ title: "Failed to save configuration", variant: "destructive" });
    },
  });

  return (
    <div className="p-6 space-y-5 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-xl font-semibold">Agents</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure AI worker agents — pick models, customize prompts, and monitor performance
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {AGENT_TYPES.map((agent) => (
          <AgentCard
            key={agent.type}
            agent={agent}
            config={configs.find(c => c.agentType === agent.type)}
            jobSummary={jobSummaries.find(j => j.type === agent.type)}
            onSave={(agentType, models, systemPrompt) => saveMutation.mutate({ agentType, models, systemPrompt })}
            isSaving={saveMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
}
