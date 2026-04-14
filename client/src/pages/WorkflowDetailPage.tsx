import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Play, Square, ArrowLeft, Loader2, CheckCircle, XCircle,
  PanelRightOpen, PanelRightClose, ChevronDown,
} from "lucide-react";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import ModelSelector from "@/components/ModelSelector";
import { findModel } from "@/lib/ai-providers";
import WorkflowCanvas from "@/components/WorkflowCanvas";
import type { WorkflowCanvasHandle } from "@/components/WorkflowCanvas";
import NodePalette from "@/components/NodePalette";
import type { Node, Edge } from "@xyflow/react";

interface NodeUpdate {
  nodeId: string;
  status: string;
  tokenCount?: number;
  durationMs?: number;
  output?: string;
  error?: string;
}

export default function WorkflowDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const { toast } = useToast();

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const canvasRef = useRef<WorkflowCanvasHandle | null>(null);
  const [showPanel, setShowPanel] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [nodeUpdates, setNodeUpdates] = useState<NodeUpdate[]>([]);
  const [executionLog, setExecutionLog] = useState<Array<{ nodeId: string; status: string; output?: string; time: string }>>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  const { data: workflow, isLoading } = useQuery<any>({
    queryKey: [`/api/workflows/${id}`],
  });

  // Parse canvas state
  const canvasState = workflow?.canvasState ? JSON.parse(workflow.canvasState) : null;
  const initialNodes: Node[] = canvasState?.nodes || [];
  const initialEdges: Edge[] = canvasState?.edges || [];

  // Save canvas (visual editor)
  const saveMutation = useMutation({
    mutationFn: async ({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) => {
      await apiRequest("PUT", `/api/workflows/${id}/canvas`, {
        canvasState: { nodes, edges },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workflows/${id}`] });
    },
  });

  const handleSave = useCallback(
    (nodes: Node[], edges: Edge[]) => {
      saveMutation.mutate({ nodes, edges });
    },
    [saveMutation]
  );

  // Execute workflow
  const executeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/workflows/${id}/execute`, {
        prompt: "Execute workflow",
      });
      return res.json();
    },
    onSuccess: (data) => {
      setExecutionId(data.executionId);
      setIsRunning(true);
      setNodeUpdates([]);
      setExecutionLog([]);
      setShowLog(true);
      toast({ title: "Workflow started" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to start workflow", description: err.message, variant: "destructive" });
    },
  });

  // Kill execution
  const killMutation = useMutation({
    mutationFn: async () => {
      if (!executionId) return;
      await apiRequest("POST", `/api/workflows/executions/${executionId}/kill`);
    },
    onSuccess: () => {
      setIsRunning(false);
      toast({ title: "Workflow stopped" });
    },
  });

  // SSE for execution updates
  useEffect(() => {
    if (!executionId || !isRunning) return;

    const es = new EventSource(`/api/workflows/executions/${executionId}/stream`);
    eventSourceRef.current = es;

    es.addEventListener("node_update", (e) => {
      const data: NodeUpdate = JSON.parse(e.data);
      setNodeUpdates((prev) => {
        const existing = prev.findIndex((u) => u.nodeId === data.nodeId);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = data;
          return updated;
        }
        return [...prev, data];
      });
      setExecutionLog((prev) => [
        ...prev,
        {
          nodeId: data.nodeId,
          status: data.status,
          output: data.output,
          time: new Date().toLocaleTimeString(),
        },
      ]);
    });

    es.addEventListener("execution_complete", () => {
      setIsRunning(false);
      toast({ title: "Workflow completed" });
    });

    es.addEventListener("execution_error", (e) => {
      const data = JSON.parse(e.data);
      setIsRunning(false);
      toast({ title: "Workflow failed", description: data.error, variant: "destructive" });
    });

    es.onerror = () => {};

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [executionId, isRunning, toast]);

  // Map node updates to execution data for canvas
  const executionData = nodeUpdates.map((u) => ({
    nodeId: u.nodeId,
    status: u.status === "done" ? "completed" : u.status,
    totalTokens: u.tokenCount || 0,
    modelUsed: undefined,
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card/50 flex-shrink-0">
        <Link href="/workflows">
          <button className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-foreground truncate">{workflow?.name || "Workflow"}</h1>
          {workflow?.description && (
            <p className="text-[10px] text-muted-foreground truncate">{workflow.description}</p>
          )}
        </div>

        {isRunning ? (
          <Button
            size="sm"
            variant="destructive"
            className="gap-1.5 text-xs"
            onClick={() => killMutation.mutate()}
          >
            <Square className="w-3 h-3" />
            Stop
          </Button>
        ) : (
          <Button
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => executeMutation.mutate()}
            disabled={executeMutation.isPending}
          >
            {executeMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            Run Workflow
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => setShowPanel(!showPanel)}
        >
          {showPanel ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {/* Visual Editor — the only editor */}
      <div className="flex flex-1 overflow-hidden">
        {/* Node palette */}
        <NodePalette />

        {/* Canvas */}
        <div className="flex-1 relative">
          <WorkflowCanvas
            workflowId={id}
            initialNodes={initialNodes}
            initialEdges={initialEdges}
            onSave={handleSave}
            isRunning={isRunning}
            executionData={executionData}
            onNodeClick={(node) => setSelectedNode(node)}
            canvasRef={canvasRef}
          />
        </div>

        {/* Right panel: node config */}
        {showPanel && selectedNode && (
          <div className="w-64 border-l border-border bg-sidebar overflow-y-auto flex-shrink-0">
            <div className="p-3 border-b border-border">
              <h3 className="text-xs font-semibold text-foreground">Node Config</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">
                {selectedNode.type} — {String(selectedNode.data.subtype || selectedNode.data.label)}
              </p>
            </div>
            <div className="p-3 space-y-3">
              <div>
                <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Label</label>
                <Input
                  value={String(selectedNode.data.label || "")}
                  className="h-7 text-xs bg-background"
                  readOnly
                />
              </div>
              {selectedNode.type === "agent" && (
                <>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Model</label>
                    <ModelSelector
                      compact
                      value={(() => {
                        const m = String(selectedNode.data.model || "");
                        if (!m) return null;
                        const found = findModel(m);
                        if (found) return { provider: found.provider.id, model: m };
                        return { provider: "auto", model: m };
                      })()}
                      onChange={(val) => {
                        const modelId = val?.model || "";
                        canvasRef.current?.updateNodeData(selectedNode.id, { model: modelId });
                        setSelectedNode((prev) =>
                          prev ? { ...prev, data: { ...prev.data, model: modelId } } : prev
                        );
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground mb-1 block">System Prompt</label>
                    <Textarea
                      value={String(selectedNode.data.systemPrompt || "")}
                      placeholder="Custom prompt..."
                      className="text-xs bg-background min-h-[80px] font-mono"
                      onChange={(e) => {
                        const val = e.target.value;
                        canvasRef.current?.updateNodeData(selectedNode.id, { systemPrompt: val });
                        setSelectedNode((prev) =>
                          prev ? { ...prev, data: { ...prev.data, systemPrompt: val } } : prev
                        );
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Execution log */}
      {showLog && (
        <div className="border-t border-border bg-card/50 flex-shrink-0">
          <button
            onClick={() => setShowLog(!showLog)}
            className="w-full flex items-center justify-between px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="font-medium">Execution Log ({executionLog.length} events)</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          <div className="max-h-40 overflow-y-auto px-4 pb-2 space-y-1">
            {executionLog.map((entry, i) => (
              <div key={i} className="flex items-start gap-2 text-[10px]">
                <span className="text-muted-foreground/60 w-14 flex-shrink-0">{entry.time}</span>
                {entry.status === "running" && <Loader2 className="w-3 h-3 text-blue-400 animate-spin flex-shrink-0 mt-0.5" />}
                {entry.status === "done" && <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0 mt-0.5" />}
                {entry.status === "failed" && <XCircle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />}
                <span className="text-foreground font-mono">{entry.nodeId}</span>
                <span className="text-muted-foreground">{entry.status}</span>
                {entry.output && (
                  <span className="text-muted-foreground/80 truncate max-w-[300px]">{entry.output}</span>
                )}
              </div>
            ))}
            {executionLog.length === 0 && (
              <p className="text-[10px] text-muted-foreground py-2">No execution events yet. Click "Run" to start.</p>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
