import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Trash2, Loader2, Search, Code2, FileText, Zap, CheckCircle, XCircle } from "lucide-react";

interface TaskJob {
  jobId: string;
  type: string;
  status: string;
  taskDescription: string;
  startedAt: number;
  tokens: number;
}

const ICONS: Record<string, React.ElementType> = {
  boss: Bot, researcher: Search, coder: Code2, writer: FileText, research: Search,
};

function formatTime(ts: number): string {
  if (!ts || isNaN(ts)) return "—";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function TaskHistoryPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: tasks = [], isLoading } = useQuery<TaskJob[]>({
    queryKey: ["task-history"],
    queryFn: async () => {
      const r = await fetch("/api/dashboard/active-agents?status=all");
      if (!r.ok) return [];
      return r.json();
    },
    enabled: open,
    refetchInterval: open ? 10000 : false,
  });

  const deleteMut = useMutation({
    mutationFn: async (jobId: string) => {
      await apiRequest("POST", `/api/dashboard/active-agents/${jobId}/clear`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-history"] }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[90vw] md:max-w-[80vw] lg:max-w-5xl max-h-[90vh] min-h-[500px] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-violet-400" />
            Task History
            {tasks.length > 0 && <Badge variant="secondary" className="ml-2 text-xs">{tasks.length}</Badge>}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <Bot className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">No tasks yet. Use Boss chat to run department tasks.</p>
          </div>
        ) : (
          <ScrollArea className="flex-1 px-6 pb-6">
            <div className="space-y-2">
              {tasks.map((t) => {
                const Icon = ICONS[t.type?.toLowerCase()] ?? Bot;
                const isComplete = t.status === "complete";
                const isFailed = t.status === "failed";
                return (
                  <div key={t.jobId} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:bg-accent/50">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 flex-shrink-0">
                      <Icon className="h-4 w-4 text-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium capitalize">{t.type || "boss"}</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${isComplete ? "text-green-400 border-green-500/30" : isFailed ? "text-red-400 border-red-500/30" : "text-blue-400 border-blue-500/30"}`}>
                          {isComplete ? "complete" : isFailed ? "failed" : t.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{t.taskDescription}</p>
                      <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                        <span>{formatTime(t.startedAt)}</span>
                        {t.tokens > 0 && <span>{t.tokens.toLocaleString()} tokens</span>}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive flex-shrink-0"
                      onClick={() => deleteMut.mutate(t.jobId)} disabled={deleteMut.isPending} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
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
