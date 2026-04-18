import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Save, X, ChevronDown, ChevronRight,
  History, Pin, Target, Users, Package, AlertTriangle, CheckCircle,
} from "lucide-react";

interface Brief {
  id: string;
  objective: string;
  context: string;
  constraints: string;
  stakeholders: string;
  deliverables: string;
  decisions: string;
  version: number;
  updated_at: number;
}

const FIELDS = [
  { key: "objective", label: "Objective", icon: Target, placeholder: "What are you trying to accomplish?" },
  { key: "context", label: "Context", icon: FileText, placeholder: "Background info, prior work, references..." },
  { key: "constraints", label: "Constraints", icon: AlertTriangle, placeholder: "Budget, timeline, tech stack limits..." },
  { key: "stakeholders", label: "Stakeholders", icon: Users, placeholder: "Who's involved? Roles, reviewers..." },
  { key: "deliverables", label: "Deliverables", icon: Package, placeholder: "What outputs are expected?" },
  { key: "decisions", label: "Decisions Made", icon: CheckCircle, placeholder: "Key decisions so far..." },
] as const;

export default function ProjectBrief({
  conversationId,
  onClose,
}: {
  conversationId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["objective"]));
  const [showVersions, setShowVersions] = useState(false);

  const { data: brief, isLoading } = useQuery<Brief | null>({
    queryKey: ["/api/briefs", conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      const r = await fetch(`/api/briefs/${conversationId}`, { credentials: "include" });
      return r.ok ? r.json() : null;
    },
    enabled: !!conversationId,
  });

  const { data: versions } = useQuery<any[]>({
    queryKey: ["/api/briefs/versions", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const r = await fetch(`/api/briefs/${conversationId}/versions`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
    enabled: !!conversationId && showVersions,
  });

  // Sync draft from server
  useEffect(() => {
    if (brief) {
      setDraft({
        objective: brief.objective || "",
        context: brief.context || "",
        constraints: brief.constraints || "",
        stakeholders: brief.stakeholders || "",
        deliverables: brief.deliverables || "",
        decisions: brief.decisions || "",
      });
      setDirty(false);
    }
  }, [brief]);

  const saveMutation = useMutation({
    mutationFn: async (fields: Record<string, string>) => {
      const r = await fetch(`/api/briefs/${conversationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(fields),
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/briefs", conversationId] });
      setDirty(false);
    },
  });

  const updateField = useCallback((key: string, value: string) => {
    setDraft(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const toggleField = useCallback((key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const save = () => saveMutation.mutate(draft);

  if (!conversationId) {
    return (
      <div className="w-72 border-l border-border bg-card/50 flex flex-col items-center justify-center p-6 text-center">
        <FileText className="w-8 h-8 text-muted-foreground/30 mb-3" />
        <p className="text-xs text-muted-foreground">Start a conversation to create a project brief</p>
      </div>
    );
  }

  return (
    <div className="w-72 border-l border-border bg-card/50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Pin className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">Project Brief</span>
          {brief?.version && (
            <span className="text-[9px] text-muted-foreground/60">v{brief.version}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {dirty && (
            <button
              onClick={save}
              disabled={saveMutation.isPending}
              className="p-1 rounded-md bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
              title="Save brief"
            >
              <Save className="w-3 h-3" />
            </button>
          )}
          <button onClick={onClose} className="p-1 rounded-md hover:bg-secondary text-muted-foreground" title="Close">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-2 space-y-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          FIELDS.map(({ key, label, icon: Icon, placeholder }) => {
            const isOpen = expanded.has(key);
            const value = draft[key] || "";
            return (
              <div key={key} className="rounded-lg border border-border/40 overflow-hidden">
                <button
                  onClick={() => toggleField(key)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-secondary/50 transition-colors"
                >
                  {isOpen ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                  <Icon className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[11px] font-medium text-foreground flex-1">{label}</span>
                  {value && !isOpen && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <textarea
                    value={value}
                    onChange={(e) => updateField(key, e.target.value)}
                    placeholder={placeholder}
                    className="w-full px-2.5 pb-2 text-[11px] text-foreground bg-transparent resize-none outline-none min-h-[60px] placeholder:text-muted-foreground/40"
                    rows={3}
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border/50 px-3 py-2 space-y-1">
        {dirty && (
          <button
            onClick={save}
            disabled={saveMutation.isPending}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 transition-colors"
          >
            <Save className="w-3 h-3" />
            {saveMutation.isPending ? "Saving..." : "Save Brief"}
          </button>
        )}
        <button
          onClick={() => setShowVersions(!showVersions)}
          className="w-full flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          <History className="w-3 h-3" />
          {showVersions ? "Hide" : "Show"} version history
        </button>
        {showVersions && versions && versions.length > 0 && (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {versions.map((v: any) => (
              <div key={v.id} className="text-[10px] text-muted-foreground/70 px-1">
                v{v.version} — {v.change_summary || "Updated"} — {new Date(v.created_at).toLocaleDateString()}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
