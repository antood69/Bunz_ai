import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  BaseEdge,
  getSmoothStepPath,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
  type NodeTypes,
  type EdgeTypes,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Play, Zap, Clock, Bell, Brain, Code, Pen, Shield, BarChart3, Crown,
  GitBranch, Merge, Timer, Repeat, ArrowRight, Save, File, Send, Workflow,
  Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Trash2, Map,
  CheckCircle2, XCircle, Loader2, Coins,
  Copy, Clipboard, CopyPlus, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

// ── Types ────────────────────────────────────────────────────────────────────

export interface WorkflowCanvasHandle {
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  getNode: (nodeId: string) => Node | undefined;
}

export interface WorkflowCanvasProps {
  workflowId: number;
  initialNodes?: Node[];
  initialEdges?: Edge[];
  onSave: (nodes: Node[], edges: Edge[]) => void;
  isRunning?: boolean;
  executionData?: any[];
  onNodeClick?: (node: Node) => void;
  canvasRef?: React.MutableRefObject<WorkflowCanvasHandle | null>;
}

interface CanvasState {
  nodes: Node[];
  edges: Edge[];
}

type CanvasAction =
  | { type: "SET"; nodes: Node[]; edges: Edge[] }
  | { type: "NODES_CHANGE"; changes: any[] }
  | { type: "EDGES_CHANGE"; changes: any[] }
  | { type: "ADD_EDGE"; edge: Edge }
  | { type: "ADD_NODE"; node: Node }
  | { type: "UPDATE_NODE_DATA"; nodeId: string; data: Record<string, unknown> }
  | { type: "DELETE_SELECTED" }
  | { type: "PASTE"; nodes: Node[]; edges: Edge[] };

// ── History (undo/redo) ──────────────────────────────────────────────────────

interface HistoryState {
  past: CanvasState[];
  present: CanvasState;
  future: CanvasState[];
}

type HistoryAction =
  | { type: "PUSH"; state: CanvasState }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "REPLACE"; state: CanvasState };

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "PUSH":
      return {
        past: [...state.past.slice(-50), state.present],
        present: action.state,
        future: [],
      };
    case "UNDO": {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: prev,
        future: [state.present, ...state.future],
      };
    }
    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      };
    }
    case "REPLACE":
      return { past: state.past, present: action.state, future: state.future };
    default:
      return state;
  }
}

// ── Node Icons ───────────────────────────────────────────────────────────────

const TRIGGER_ICONS: Record<string, React.ElementType> = {
  manual: Play,
  webhook: Zap,
  schedule: Clock,
  event: Bell,
};

const AGENT_ICONS: Record<string, React.ElementType> = {
  researcher: Brain,
  coder: Code,
  writer: Pen,
  reviewer: Shield,
  analyst: BarChart3,
  boss: Crown,
};

const LOGIC_ICONS: Record<string, React.ElementType> = {
  if_else: GitBranch,
  switch: GitBranch,
  merge: Merge,
  delay: Timer,
  loop: Repeat,
};

const OUTPUT_ICONS: Record<string, React.ElementType> = {
  return: ArrowRight,
  save_file: File,
  post: Send,
  trigger_workflow: Workflow,
};

// ── Custom Nodes ─────────────────────────────────────────────────────────────

const nodeBaseClass =
  "rounded-xl border border-border bg-card min-w-[180px] shadow-md transition-shadow";

// Shared handle styles
const handleStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: "50%",
  border: "2px solid hsl(var(--border))",
  background: "hsl(var(--card))",
};

const TriggerNode = React.memo(({ data, selected }: NodeProps) => {
  const subtype = (data.subtype as string) || "manual";
  const Icon = TRIGGER_ICONS[subtype] || Play;
  return (
    <div
      className={`${nodeBaseClass} ${
        selected ? "ring-2 ring-primary shadow-[0_0_12px_hsl(var(--primary)/0.3)]" : ""
      }`}
    >
      <div className="h-1.5 rounded-t-xl bg-emerald-500" />
      <div className="px-3 py-2.5 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
          <Icon className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-emerald-400 font-medium uppercase tracking-wide">Trigger</p>
          <p className="text-xs text-foreground truncate capitalize">
            {(data.label as string) || subtype}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ ...handleStyle, background: "hsl(160 60% 45%)" }} />
    </div>
  );
});
TriggerNode.displayName = "TriggerNode";

const AgentNode = React.memo(({ data, selected }: NodeProps) => {
  const subtype = (data.subtype as string) || "researcher";
  const Icon = AGENT_ICONS[subtype] || Brain;
  const status = (data.status as string) || "idle";
  const tokens = data.totalTokens as number | undefined;
  const model = data.model as string | undefined;

  const isNodeRunning = status === "running";
  const isSuccess = status === "success" || status === "completed";
  const isError = status === "error" || status === "failed";

  return (
    <div
      className={`${nodeBaseClass} ${
        selected ? "ring-2 ring-primary shadow-[0_0_12px_hsl(var(--primary)/0.3)]" : ""
      } ${isNodeRunning ? "animate-pulse-glow" : ""}`}
      style={
        isNodeRunning
          ? { boxShadow: "0 0 16px hsl(211 100% 50% / 0.35)" }
          : isSuccess
          ? { boxShadow: "0 0 10px hsl(160 60% 45% / 0.25)" }
          : isError
          ? { boxShadow: "0 0 10px hsl(0 72% 51% / 0.25)" }
          : undefined
      }
    >
      <Handle type="target" position={Position.Left} style={{ ...handleStyle, background: "hsl(211 100% 50%)" }} />
      <div className="h-1.5 rounded-t-xl bg-blue-500" />
      <div className="px-3 py-2.5 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0 relative">
          <Icon className="w-3.5 h-3.5 text-blue-400" />
          {isNodeRunning && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-400 rounded-full animate-ping" />
          )}
          {isSuccess && (
            <CheckCircle2 className="absolute -top-1 -right-1 w-3 h-3 text-emerald-400" />
          )}
          {isError && (
            <XCircle className="absolute -top-1 -right-1 w-3 h-3 text-red-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-blue-400 font-medium uppercase tracking-wide">Agent</p>
          <p className="text-xs text-foreground truncate capitalize">
            {(data.label as string) || subtype}
          </p>
        </div>
      </div>
      {/* Badges row */}
      {(model || tokens) && (
        <div className="px-3 pb-2 flex items-center gap-1.5 flex-wrap">
          {model && (
            <span className="text-[9px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
              {model}
            </span>
          )}
          {tokens !== undefined && tokens > 0 && (
            <span className="text-[9px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground flex items-center gap-0.5">
              <Coins className="w-2 h-2" />
              {tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}K` : tokens}
            </span>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ ...handleStyle, background: "hsl(211 100% 50%)" }} />
    </div>
  );
});
AgentNode.displayName = "AgentNode";

const LogicNode = React.memo(({ data, selected }: NodeProps) => {
  const subtype = (data.subtype as string) || "if_else";
  const Icon = LOGIC_ICONS[subtype] || GitBranch;

  return (
    <div
      className={`${nodeBaseClass} ${
        selected ? "ring-2 ring-primary shadow-[0_0_12px_hsl(var(--primary)/0.3)]" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} style={{ ...handleStyle, background: "hsl(280 65% 55%)" }} />
      <div className="h-1.5 rounded-t-xl bg-purple-500" />
      <div className="px-3 py-2.5 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center flex-shrink-0">
          <Icon className="w-3.5 h-3.5 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-purple-400 font-medium uppercase tracking-wide">Logic</p>
          <p className="text-xs text-foreground truncate capitalize">
            {(data.label as string) || subtype.replace("_", " ")}
          </p>
        </div>
      </div>
      {subtype === "delay" && data.duration ? (
        <div className="px-3 pb-2">
          <span className="text-[9px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
            {String(data.duration)}
          </span>
        </div>
      ) : null}
      {/* Multiple outputs for certain types */}
      {subtype === "if_else" ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            style={{ ...handleStyle, background: "hsl(160 60% 45%)", top: "35%" }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            style={{ ...handleStyle, background: "hsl(0 72% 51%)", top: "65%" }}
          />
        </>
      ) : subtype === "loop" ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="body"
            style={{ ...handleStyle, background: "hsl(280 65% 55%)", top: "35%" }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="done"
            style={{ ...handleStyle, background: "hsl(160 60% 45%)", top: "65%" }}
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          style={{ ...handleStyle, background: "hsl(280 65% 55%)" }}
        />
      )}
    </div>
  );
});
LogicNode.displayName = "LogicNode";

const OutputNode = React.memo(({ data, selected }: NodeProps) => {
  const subtype = (data.subtype as string) || "return";
  const Icon = OUTPUT_ICONS[subtype] || ArrowRight;

  return (
    <div
      className={`${nodeBaseClass} ${
        selected ? "ring-2 ring-primary shadow-[0_0_12px_hsl(var(--primary)/0.3)]" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} style={{ ...handleStyle, background: "hsl(180 50% 45%)" }} />
      <div className="h-1.5 rounded-t-xl bg-teal-500" />
      <div className="px-3 py-2.5 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-teal-500/15 flex items-center justify-center flex-shrink-0">
          <Icon className="w-3.5 h-3.5 text-teal-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-teal-400 font-medium uppercase tracking-wide">Output</p>
          <p className="text-xs text-foreground truncate capitalize">
            {(data.label as string) || subtype.replace("_", " ")}
          </p>
        </div>
      </div>
    </div>
  );
});
OutputNode.displayName = "OutputNode";

// ── Custom Edge ──────────────────────────────────────────────────────────────

const EDGE_COLORS: Record<string, string> = {
  execution: "hsl(var(--foreground))",
  text: "hsl(211 100% 50%)",
  json: "hsl(160 60% 45%)",
  file: "hsl(43 96% 56%)",
  error: "hsl(0 72% 51%)",
  boolean: "hsl(280 65% 55%)",
};

const AnimatedEdge = React.memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
    style: edgeStyle,
  }: EdgeProps) => {
    const dataType = (data?.dataType as string) || "execution";
    const isAnimated = (data?.animated as boolean) || false;
    const color = EDGE_COLORS[dataType] || EDGE_COLORS.execution;

    const [edgePath] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 8,
    });

    return (
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: selected ? 2.5 : 1.5,
          strokeDasharray: isAnimated ? "6 4" : undefined,
          animation: isAnimated ? "dashFlow 0.5s linear infinite" : undefined,
          ...edgeStyle,
        }}
      />
    );
  }
);
AnimatedEdge.displayName = "AnimatedEdge";

// ── CSS for animated edges ───────────────────────────────────────────────────

const canvasStyles = `
@keyframes dashFlow {
  from { stroke-dashoffset: 10; }
  to { stroke-dashoffset: 0; }
}
.react-flow__minimap {
  background: hsl(var(--card)) !important;
  border: 1px solid hsl(var(--border)) !important;
  border-radius: 8px !important;
}
.react-flow__controls {
  border: 1px solid hsl(var(--border)) !important;
  border-radius: 8px !important;
  overflow: hidden;
}
.react-flow__controls-button {
  background: hsl(var(--card)) !important;
  border-bottom: 1px solid hsl(var(--border)) !important;
  fill: hsl(var(--foreground)) !important;
}
.react-flow__controls-button:hover {
  background: hsl(var(--secondary)) !important;
}
.react-flow__background {
  background: hsl(var(--background)) !important;
}
`;

// ── Node type registry ───────────────────────────────────────────────────────

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  agent: AgentNode,
  logic: LogicNode,
  output: OutputNode,
};

const edgeTypes: EdgeTypes = {
  animated: AnimatedEdge,
};

// ── Inner Canvas (needs ReactFlowProvider above) ─────────────────────────────

function CanvasInner({
  workflowId,
  initialNodes = [],
  initialEdges = [],
  onSave,
  isRunning,
  executionData,
  onNodeClick: onNodeClickProp,
  canvasRef,
}: WorkflowCanvasProps) {
  const { fitView, screenToFlowPosition, zoomIn, zoomOut } = useReactFlow();
  const [showMinimap, setShowMinimap] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);

  // ── History ──────────────────────────────────────────────────────────────

  const [history, dispatchHistory] = useReducer(historyReducer, {
    past: [],
    present: { nodes: initialNodes, edges: initialEdges },
    future: [],
  });

  const nodes = history.present.nodes;
  const edges = history.present.edges;

  // Sync execution data into node data
  const nodesWithExecution = useMemo(() => {
    if (!executionData || executionData.length === 0) return nodes;
    const execByNodeId: Record<string, any> = {};
    for (const exec of executionData) {
      const nodeId = exec.nodeId || exec.agentId?.toString();
      if (nodeId) execByNodeId[String(nodeId)] = exec;
    }
    if (Object.keys(execByNodeId).length === 0) return nodes;
    return nodes.map((n) => {
      const exec = execByNodeId[n.id];
      if (!exec) return n;
      return {
        ...n,
        data: {
          ...n.data,
          status: exec.status,
          totalTokens: exec.totalTokens,
          model: exec.modelUsed,
        },
      };
    });
  }, [nodes, executionData]);

  // Edges with animation when running
  const edgesWithAnimation = useMemo(() => {
    if (!isRunning) return edges;
    return edges.map((e) => ({
      ...e,
      data: { ...e.data, animated: true },
    }));
  }, [edges, isRunning]);

  // ── State mutation helpers ────────────────────────────────────────────────

  const pushState = useCallback(
    (ns: Node[], es: Edge[]) => {
      dispatchHistory({ type: "PUSH", state: { nodes: ns, edges: es } });
    },
    []
  );

  const replaceState = useCallback(
    (ns: Node[], es: Edge[]) => {
      dispatchHistory({ type: "REPLACE", state: { nodes: ns, edges: es } });
    },
    []
  );

  // ── Auto-save (debounced 2s) ──────────────────────────────────────────────

  const scheduleSave = useCallback(
    (ns: Node[], es: Edge[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        onSave(ns, es);
      }, 2000);
    },
    [onSave]
  );

  // ── Expose canvas handle to parent ─────────────────────────────────────────

  useEffect(() => {
    if (canvasRef) {
      canvasRef.current = {
        updateNodeData: (nodeId: string, data: Record<string, unknown>) => {
          const updated = nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
          );
          pushState(updated, edges);
          scheduleSave(updated, edges);
        },
        getNode: (nodeId: string) => nodes.find((n) => n.id === nodeId),
      };
    }
  }, [canvasRef, nodes, edges, pushState, scheduleSave]);

  // ── React Flow callbacks ──────────────────────────────────────────────────

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      const updated = applyNodeChanges(changes, nodes);
      // Only push to history for adds/removes, not for moves
      const hasStructural = changes.some(
        (c) => c.type === "add" || c.type === "remove"
      );
      if (hasStructural) {
        pushState(updated, edges);
      } else {
        replaceState(updated, edges);
      }
      scheduleSave(updated, edges);
    },
    [nodes, edges, pushState, replaceState, scheduleSave]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      const updated = applyEdgeChanges(changes, edges);
      const hasStructural = changes.some(
        (c) => c.type === "add" || c.type === "remove"
      );
      if (hasStructural) {
        pushState(nodes, updated);
      } else {
        replaceState(nodes, updated);
      }
      scheduleSave(nodes, updated);
    },
    [nodes, edges, pushState, replaceState, scheduleSave]
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const newEdge: Edge = {
        ...connection,
        id: `e-${connection.source}-${connection.sourceHandle || "out"}-${connection.target}-${connection.targetHandle || "in"}`,
        type: "animated",
        data: { dataType: "execution" },
      };
      const updated = addEdge(newEdge, edges);
      pushState(nodes, updated);
      scheduleSave(nodes, updated);
    },
    [nodes, edges, pushState, scheduleSave]
  );

  // ── Drop handler (from NodePalette) ───────────────────────────────────────

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const rawData = e.dataTransfer.getData("application/reactflow");
      if (!rawData) return;

      let parsed: { type: string; subtype: string };
      try {
        parsed = JSON.parse(rawData);
      } catch {
        return;
      }

      const position: XYPosition = screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      const newNode: Node = {
        id: `${parsed.type}-${Date.now()}`,
        type: parsed.type,
        position,
        data: {
          subtype: parsed.subtype,
          label: parsed.subtype.replace("_", " "),
        },
      };

      const updatedNodes = [...nodes, newNode];
      pushState(updatedNodes, edges);
      scheduleSave(updatedNodes, edges);
    },
    [nodes, edges, pushState, scheduleSave, screenToFlowPosition]
  );

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Close context menu on any key
      if (contextMenu) setContextMenu(null);

      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      // Undo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        dispatchHistory({ type: "UNDO" });
        return;
      }
      // Redo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        dispatchHistory({ type: "REDO" });
        return;
      }
      // Save
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        onSave(nodes, edges);
        return;
      }
      // Copy
      if ((e.metaKey || e.ctrlKey) && e.key === "c") {
        const selectedNodes = nodes.filter((n) => n.selected);
        const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
        const selectedEdges = edges.filter(
          (edge) => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)
        );
        clipboardRef.current = { nodes: selectedNodes, edges: selectedEdges };
        return;
      }
      // Paste
      if ((e.metaKey || e.ctrlKey) && e.key === "v") {
        const { nodes: clipNodes, edges: clipEdges } = clipboardRef.current;
        if (clipNodes.length === 0) return;
        e.preventDefault();
        const idMap: Record<string, string> = {};
        const offset = 40;
        const pastedNodes = clipNodes.map((n) => {
          const newId = `${n.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          idMap[n.id] = newId;
          return {
            ...n,
            id: newId,
            position: { x: n.position.x + offset, y: n.position.y + offset },
            selected: true,
          };
        });
        const pastedEdges = clipEdges
          .map((edge) => {
            const newSource = idMap[edge.source];
            const newTarget = idMap[edge.target];
            if (!newSource || !newTarget) return null;
            return {
              ...edge,
              id: `e-${newSource}-${newTarget}-${Date.now()}`,
              source: newSource,
              target: newTarget,
            };
          })
          .filter(Boolean) as Edge[];

        const deselectOld = nodes.map((n) => ({ ...n, selected: false }));
        const updatedNodes = [...deselectOld, ...pastedNodes];
        const updatedEdges = [...edges, ...pastedEdges];
        pushState(updatedNodes, updatedEdges);
        scheduleSave(updatedNodes, updatedEdges);
        return;
      }
      // Select All
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault();
        const allSelected = nodes.map((n) => ({ ...n, selected: true }));
        replaceState(allSelected, edges);
        return;
      }
      // Duplicate
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        const selectedNodes = nodes.filter((n) => n.selected);
        if (selectedNodes.length === 0) return;
        e.preventDefault();
        const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
        const selectedEdges = edges.filter(
          (edge) => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)
        );
        const idMap: Record<string, string> = {};
        const offset = 40;
        const dupNodes = selectedNodes.map((n) => {
          const newId = `${n.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          idMap[n.id] = newId;
          return {
            ...n,
            id: newId,
            position: { x: n.position.x + offset, y: n.position.y + offset },
            selected: true,
          };
        });
        const dupEdges = selectedEdges
          .map((edge) => {
            const newSource = idMap[edge.source];
            const newTarget = idMap[edge.target];
            if (!newSource || !newTarget) return null;
            return {
              ...edge,
              id: `e-${newSource}-${newTarget}-${Date.now()}`,
              source: newSource,
              target: newTarget,
            };
          })
          .filter(Boolean) as Edge[];

        const deselectOld = nodes.map((n) => ({ ...n, selected: false }));
        const updatedNodes = [...deselectOld, ...dupNodes];
        const updatedEdges = [...edges, ...dupEdges];
        pushState(updatedNodes, updatedEdges);
        scheduleSave(updatedNodes, updatedEdges);
        return;
      }
      // Delete
      if (e.key === "Backspace" || e.key === "Delete") {
        const selectedIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
        if (selectedIds.size === 0) return;
        const remainingNodes = nodes.filter((n) => !n.selected);
        const selectedEdgeIds = new Set(edges.filter((edge) => edge.selected).map((edge) => edge.id));
        const remainingEdges = edges.filter(
          (edge) =>
            !selectedEdgeIds.has(edge.id) &&
            !selectedIds.has(edge.source) &&
            !selectedIds.has(edge.target)
        );
        pushState(remainingNodes, remainingEdges);
        scheduleSave(remainingNodes, remainingEdges);
        return;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [nodes, edges, onSave, pushState, replaceState, scheduleSave, contextMenu]);

  // Fit view on initial load
  useEffect(() => {
    const timeout = setTimeout(() => fitView({ padding: 0.2 }), 200);
    return () => clearTimeout(timeout);
  }, [fitView]);

  // ── Toolbar actions ───────────────────────────────────────────────────────

  const handleUndo = useCallback(() => dispatchHistory({ type: "UNDO" }), []);
  const handleRedo = useCallback(() => dispatchHistory({ type: "REDO" }), []);
  const handleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    onSave(nodes, edges);
  }, [nodes, edges, onSave]);
  const handleFitView = useCallback(() => fitView({ padding: 0.2 }), [fitView]);

  const handleDelete = useCallback(() => {
    const selectedIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    if (selectedIds.size === 0) return;
    const remainingNodes = nodes.filter((n) => !n.selected);
    const selectedEdgeIds = new Set(edges.filter((edge) => edge.selected).map((edge) => edge.id));
    const remainingEdges = edges.filter(
      (edge) =>
        !selectedEdgeIds.has(edge.id) &&
        !selectedIds.has(edge.source) &&
        !selectedIds.has(edge.target)
    );
    pushState(remainingNodes, remainingEdges);
    scheduleSave(remainingNodes, remainingEdges);
  }, [nodes, edges, pushState, scheduleSave]);

  const handleCopy = useCallback(() => {
    const selectedNodes = nodes.filter((n) => n.selected);
    const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
    const selectedEdges = edges.filter(
      (edge) => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)
    );
    clipboardRef.current = { nodes: selectedNodes, edges: selectedEdges };
  }, [nodes, edges]);

  const handlePaste = useCallback(() => {
    const { nodes: clipNodes, edges: clipEdges } = clipboardRef.current;
    if (clipNodes.length === 0) return;
    const idMap: Record<string, string> = {};
    const offset = 40;
    const pastedNodes = clipNodes.map((n) => {
      const newId = `${n.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      idMap[n.id] = newId;
      return {
        ...n,
        id: newId,
        position: { x: n.position.x + offset, y: n.position.y + offset },
        selected: true,
      };
    });
    const pastedEdges = clipEdges
      .map((edge) => {
        const newSource = idMap[edge.source];
        const newTarget = idMap[edge.target];
        if (!newSource || !newTarget) return null;
        return {
          ...edge,
          id: `e-${newSource}-${newTarget}-${Date.now()}`,
          source: newSource,
          target: newTarget,
        };
      })
      .filter(Boolean) as Edge[];
    const deselectOld = nodes.map((n) => ({ ...n, selected: false }));
    const updatedNodes = [...deselectOld, ...pastedNodes];
    const updatedEdges = [...edges, ...pastedEdges];
    pushState(updatedNodes, updatedEdges);
    scheduleSave(updatedNodes, updatedEdges);
  }, [nodes, edges, pushState, scheduleSave]);

  const handleDuplicate = useCallback(() => {
    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length === 0) return;
    const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
    const selectedEdges = edges.filter(
      (edge) => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)
    );
    const idMap: Record<string, string> = {};
    const offset = 40;
    const dupNodes = selectedNodes.map((n) => {
      const newId = `${n.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      idMap[n.id] = newId;
      return {
        ...n,
        id: newId,
        position: { x: n.position.x + offset, y: n.position.y + offset },
        selected: true,
      };
    });
    const dupEdges = selectedEdges
      .map((edge) => {
        const newSource = idMap[edge.source];
        const newTarget = idMap[edge.target];
        if (!newSource || !newTarget) return null;
        return {
          ...edge,
          id: `e-${newSource}-${newTarget}-${Date.now()}`,
          source: newSource,
          target: newTarget,
        };
      })
      .filter(Boolean) as Edge[];
    const deselectOld = nodes.map((n) => ({ ...n, selected: false }));
    const updatedNodes = [...deselectOld, ...dupNodes];
    const updatedEdges = [...edges, ...dupEdges];
    pushState(updatedNodes, updatedEdges);
    scheduleSave(updatedNodes, updatedEdges);
  }, [nodes, edges, pushState, scheduleSave]);

  const selectedCount = nodes.filter((n) => n.selected).length;

  return (
    <div className="relative w-full h-full">
      <style>{canvasStyles}</style>

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-card/90 backdrop-blur border border-border rounded-lg px-2 py-1 shadow-md">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleUndo}
                disabled={history.past.length === 0}
              >
                <Undo2 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">Undo (Ctrl+Z)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleRedo}
                disabled={history.future.length === 0}
              >
                <Redo2 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">Redo (Ctrl+Shift+Z)</p>
            </TooltipContent>
          </Tooltip>

          <div className="w-px h-4 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => zoomIn()}>
                <ZoomIn className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">Zoom In</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => zoomOut()}>
                <ZoomOut className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">Zoom Out</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleFitView}>
                <Maximize2 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">Fit View</p>
            </TooltipContent>
          </Tooltip>

          <div className="w-px h-4 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 w-7 p-0 ${showMinimap ? "bg-secondary" : ""}`}
                onClick={() => setShowMinimap(!showMinimap)}
              >
                <Map className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">Toggle Minimap</p>
            </TooltipContent>
          </Tooltip>

          <div className="w-px h-4 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={handleSave}>
                <Save className="w-3.5 h-3.5" />
                Save
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">Save (Ctrl+S)</p>
            </TooltipContent>
          </Tooltip>

          <div className="w-px h-4 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleCopy}
                disabled={selectedCount === 0}
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">Copy (Ctrl+C)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handlePaste}
                disabled={clipboardRef.current.nodes.length === 0}
              >
                <Clipboard className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">Paste (Ctrl+V)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleDuplicate}
                disabled={selectedCount === 0}
              >
                <CopyPlus className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">Duplicate (Ctrl+D)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                onClick={handleDelete}
                disabled={selectedCount === 0}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">Delete (Del)</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* ── React Flow Canvas ────────────────────────────────────────────────── */}
      <ReactFlow
        nodes={nodesWithExecution}
        edges={edgesWithAnimation}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_event, node) => onNodeClickProp?.(node)}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
        }}
        onPaneClick={() => setContextMenu(null)}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: "animated", data: { dataType: "execution" } }}
        snapToGrid
        snapGrid={[15, 15]}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        multiSelectionKeyCode="Shift"
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        className="bg-background"
        colorMode="dark"
      >
        <Background gap={15} size={1} color="hsl(var(--border))" />
        <Controls showInteractive={false} position="bottom-right" />
        {showMinimap && (
          <MiniMap
            nodeStrokeWidth={3}
            position="bottom-right"
            style={{ bottom: 50 }}
            maskColor="hsl(var(--background) / 0.7)"
          />
        )}
      </ReactFlow>

      {/* ── Right-click Context Menu ─────────────────────────────────────────── */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-lg border border-border bg-card shadow-xl py-1 animate-in fade-in-0 zoom-in-95"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
            onClick={() => {
              handleCopy();
              setContextMenu(null);
            }}
          >
            <Copy className="w-3.5 h-3.5" />
            Copy
            <span className="ml-auto text-muted-foreground text-[10px]">Ctrl+C</span>
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
            onClick={() => {
              handlePaste();
              setContextMenu(null);
            }}
          >
            <Clipboard className="w-3.5 h-3.5" />
            Paste
            <span className="ml-auto text-muted-foreground text-[10px]">Ctrl+V</span>
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
            onClick={() => {
              handleDuplicate();
              setContextMenu(null);
            }}
          >
            <CopyPlus className="w-3.5 h-3.5" />
            Duplicate
            <span className="ml-auto text-muted-foreground text-[10px]">Ctrl+D</span>
          </button>
          <div className="h-px bg-border my-1" />
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-secondary transition-colors"
            onClick={() => {
              handleDelete();
              setContextMenu(null);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
            <span className="ml-auto text-muted-foreground text-[10px]">Del</span>
          </button>
          <div className="h-px bg-border my-1" />
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
            onClick={() => {
              const node = nodes.find((n) => n.id === contextMenu.nodeId);
              if (node) onNodeClickProp?.(node);
              setContextMenu(null);
            }}
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

// ── Exported wrapper with Provider ───────────────────────────────────────────

export default function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
