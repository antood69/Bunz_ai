import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot,
  Play,
  Square,
  Trash2,
  Loader2,
  Search,
  Code2,
  FileText,
  BarChart3,
  ShieldCheck,
  Palette,
  Globe,
  Zap,
} from "lucide-react";

interface ActiveAgent {
  jobId: string;
  type: string;
  status: string;
  taskDescription: string;
  workflowTitle: string | null;
  startedAt: number;
  tokens: number;
}

const WORKER_ICONS: Record<string, React.ElementType> = {
  boss: Bot,
  researcher: Search,
  coder: Code2,
  writer: FileText,
  analyst: BarChart3,
  reviewer: ShieldCheck,
  artgen: Palette,
  browser: Globe,
};

const WORKER_LABELS: Record<string, string> = {
  boss: "Boss",
  researcher: "Researcher",
  coder: "Coder",
  writer: "Writer",
  analyst: "Analyst",
  reviewer: "Reviewer",
  artgen: "Art Gen",
  browser: "Browser",
};

const STATUS_COLORS: Record<string, string> = {
  running:
    "bg-blue-500/15 text-blue-400 border-blue-500/30",
  pending:
    "bg-amber-500/15 text-amber-400 border-amber-500/30",
  complete:
    "bg-green-500/15 text-green-400 border-green-500/30",
  failed:
    "bg-red-500/15 text-red-400 border-red-500/30",
};

function formatElapsed(startedAt: number): string {
  if (!startedAt || isNaN(startedAt)) return "—";
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  if (isNaN(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function ActiveAgentsPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const { data: agents = [], isLoading } = useQuery<ActiveAgent[]>({
    queryKey: ["active-agents-all"],
    queryFn: async () => {
      const r = await fetch("/api/dashboard/active-agents?status=all");
      if (!r.ok) return [];
      return r.json();
    },
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });

  const stopMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await apiRequest("POST", `/api/dashboard/active-agents/${jobId}/stop`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["active-agents-all"],
      });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await apiRequest("POST", `/api/dashboard/active-agents/${jobId}/clear`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["active-agents-all"],
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[90vw] md:max-w-[80vw] lg:max-w-5xl max-h-[90vh] min-h-[500px] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Active Agents
            {agents.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {agents.length}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <Bot className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              No active agents. Start a chat with Boss to see AI activity
              here.
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1 px-6 pb-6">
            <div className="space-y-3">
              {agents.map((agent) => {
                const Icon =
                  WORKER_ICONS[agent.type.toLowerCase()] ?? Bot;
                const label =
                  WORKER_LABELS[agent.type.toLowerCase()] ?? agent.type;
                const statusColor =
                  STATUS_COLORS[agent.status] ?? STATUS_COLORS.running;
                const isRunning = agent.status === "running";

                return (
                  <div
                    key={agent.jobId}
                    className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/50"
                  >
                    {/* Icon + spinner */}
                    <div className="relative flex-shrink-0 mt-0.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/50">
                        <Icon className="h-4 w-4 text-foreground" />
                      </div>
                      {isRunning && (
                        <Loader2 className="absolute -right-1 -bottom-1 h-3.5 w-3.5 animate-spin text-blue-400" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">
                          {label}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${statusColor}`}
                        >
                          {agent.status}
                        </Badge>
                      </div>

                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {agent.workflowTitle ?? "Direct Chat"}
                      </p>

                      <p className="text-xs text-foreground/80 mt-1 line-clamp-2">
                        {agent.taskDescription}
                      </p>

                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                        <span>{formatElapsed(agent.startedAt)}</span>
                        <span>{agent.tokens.toLocaleString()} tokens</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Resume"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title="Stop"
                        disabled={stopMutation.isPending}
                        onClick={() => stopMutation.mutate(agent.jobId)}
                      >
                        <Square className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Clear"
                        disabled={clearMutation.isPending}
                        onClick={() => clearMutation.mutate(agent.jobId)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
