/**
 * Visual Workflow Canvas — node-based editor using React Flow.
 * Drag nodes from palette, connect them, save as pipeline steps.
 */
import { useCallback, useRef, useMemo, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, Panel,
  useNodesState, useEdgesState, addEdge,
  Handle, Position,
  type Node, type Edge, type Connection, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Globe, Code, PenTool, Palette, Zap, Mail, Linkedin,
  ShoppingBag, MessageSquare, FileText, Bot, ArrowRight,
  Save, X, Play, GripVertical, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Node palette items ──────────────────────────────────────────────
const PALETTE_ITEMS = [
  { type: "department", department: "research", label: "Research", icon: Globe, color: "#3b82f6", description: "Deep research & analysis" },
  { type: "department", department: "writer", label: "Writer", icon: PenTool, color: "#8b5cf6", description: "Content & copywriting" },
  { type: "department", department: "coder", label: "Coder", icon: Code, color: "#10b981", description: "Code generation & review" },
  { type: "department", department: "artist", label: "Artist", icon: Palette, color: "#f59e0b", description: "Image generation" },
  { type: "transform", label: "Transform", icon: Zap, color: "#ec4899", description: "Data processing & formatting" },
  { type: "connector", connectorAction: "send_email", label: "Send Email", icon: Mail, color: "#ef4444", description: "Send via Gmail" },
  { type: "connector", connectorAction: "create_post", label: "LinkedIn Post", icon: Linkedin, color: "#0077b5", description: "Publish to LinkedIn" },
  { type: "connector", connectorAction: "send_message", label: "Slack Message", icon: MessageSquare, color: "#4a154b", description: "Post to Slack" },
  { type: "connector", connectorAction: "write_note", label: "Obsidian Note", icon: FileText, color: "#7c3aed", description: "Save to vault" },
  { type: "connector", connectorAction: "search_emails", label: "Search Email", icon: Search, color: "#f97316", description: "Search Gmail inbox" },
];

// ── Custom Node Component ───────────────────────────────────────────
function WorkflowNode({ data, selected }: NodeProps) {
  const d = data as any;
  const Icon = d.icon || Zap;
  const color = d.color || "#3b82f6";

  return (
    <div className={`relative rounded-xl border-2 transition-all min-w-[180px] ${
      selected ? "shadow-lg shadow-blue-500/20" : ""
    }`} style={{ borderColor: selected ? color : "rgba(255,255,255,0.1)", background: "rgba(15,17,25,0.9)" }}>
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !border-2 !bg-background" style={{ borderColor: color }} />

      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}20` }}>
            <Icon className="w-3.5 h-3.5" style={{ color }} />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">{d.label}</p>
            <p className="text-[9px] text-muted-foreground capitalize">{d.stepType === "department" ? d.department : d.stepType}</p>
          </div>
        </div>
        {d.prompt && (
          <p className="text-[9px] text-muted-foreground bg-white/[0.03] rounded px-1.5 py-1 line-clamp-2 mt-1">{d.prompt}</p>
        )}

        {/* Status indicator during execution */}
        {d.status && (
          <div className={`mt-1.5 text-[9px] font-medium px-1.5 py-0.5 rounded ${
            d.status === "complete" ? "bg-emerald-500/15 text-emerald-400" :
            d.status === "running" ? "bg-blue-500/15 text-blue-400" :
            d.status === "failed" ? "bg-red-500/15 text-red-400" :
            "bg-white/5 text-muted-foreground"
          }`}>
            {d.status === "running" ? "Running..." : d.status}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !border-2 !bg-background" style={{ borderColor: color }} />
    </div>
  );
}

// ── Main Canvas Component ───────────────────────────────────────────
interface WorkflowCanvasProps {
  steps: any[];
  onSave: (steps: any[]) => void;
  onClose: () => void;
  onRun?: () => void;
  pipelineName: string;
}

export default function WorkflowCanvas({ steps, onSave, onClose, onRun, pipelineName }: WorkflowCanvasProps) {
  const nodeTypes = useMemo(() => ({ workflow: WorkflowNode }), []);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");

  // Convert pipeline steps to React Flow nodes/edges
  const initialNodes: Node[] = steps.map((step, i) => ({
    id: step.id || `step-${i}`,
    type: "workflow",
    position: { x: 250, y: i * 140 },
    data: {
      label: step.type === "department" ? (step.department || "AI").charAt(0).toUpperCase() + (step.department || "ai").slice(1) : step.connectorAction || step.type,
      stepType: step.type,
      department: step.department,
      connectorAction: step.connectorAction,
      prompt: step.prompt,
      icon: PALETTE_ITEMS.find(p => p.department === step.department || p.connectorAction === step.connectorAction)?.icon || Zap,
      color: PALETTE_ITEMS.find(p => p.department === step.department || p.connectorAction === step.connectorAction)?.color || "#3b82f6",
    },
  }));

  const initialEdges: Edge[] = steps.slice(1).map((_, i) => ({
    id: `e-${i}`,
    source: steps[i].id || `step-${i}`,
    target: steps[i + 1].id || `step-${i + 1}`,
    type: "smoothstep",
    animated: true,
    style: { stroke: "rgba(255,255,255,0.15)", strokeWidth: 2 },
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, type: "smoothstep", animated: true, style: { stroke: "rgba(255,255,255,0.15)", strokeWidth: 2 } }, eds));
  }, [setEdges]);

  // Drag from palette
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const data = JSON.parse(event.dataTransfer.getData("application/json") || "{}");
    if (!data.type) return;

    const bounds = reactFlowWrapper.current?.getBoundingClientRect();
    if (!bounds) return;

    const position = { x: event.clientX - bounds.left - 90, y: event.clientY - bounds.top - 30 };
    const newId = `step-${Date.now()}`;

    const newNode: Node = {
      id: newId,
      type: "workflow",
      position,
      data: {
        label: data.label,
        stepType: data.type,
        department: data.department,
        connectorAction: data.connectorAction,
        prompt: "",
        icon: PALETTE_ITEMS.find(p => p.label === data.label)?.icon || Zap,
        color: data.color || "#3b82f6",
      },
    };

    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  // Double-click to edit prompt
  const onNodeDoubleClick = useCallback((_: any, node: Node) => {
    setEditingNode(node.id);
    setEditPrompt((node.data as any).prompt || "");
  }, []);

  const savePrompt = () => {
    if (!editingNode) return;
    setNodes((nds) => nds.map(n => n.id === editingNode ? { ...n, data: { ...n.data, prompt: editPrompt } } : n));
    setEditingNode(null);
    setEditPrompt("");
  };

  // Save: convert nodes/edges back to pipeline steps
  const handleSave = () => {
    // Topological sort by edges
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const visited = new Set<string>();
    const sorted: Node[] = [];

    // Find root nodes (no incoming edges)
    const hasIncoming = new Set(edges.map(e => e.target));
    const roots = nodes.filter(n => !hasIncoming.has(n.id));
    if (roots.length === 0 && nodes.length > 0) roots.push(nodes[0]);

    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      const node = nodeMap.get(id);
      if (node) sorted.push(node);
      edges.filter(e => e.source === id).forEach(e => visit(e.target));
    };
    roots.forEach(r => visit(r.id));
    // Add any unvisited
    nodes.forEach(n => { if (!visited.has(n.id)) sorted.push(n); });

    const pipelineSteps = sorted.map(n => {
      const d = n.data as any;
      return {
        id: n.id,
        type: d.stepType || "department",
        department: d.department,
        connectorAction: d.connectorAction,
        prompt: d.prompt || "",
      };
    });

    onSave(pipelineSteps);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold text-foreground">{pipelineName}</span>
          <span className="text-[10px] text-muted-foreground">{nodes.length} nodes</span>
        </div>
        <div className="flex items-center gap-2">
          {onRun && (
            <Button size="sm" className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 border-0" onClick={onRun}>
              <Play className="w-3.5 h-3.5" /> Run
            </Button>
          )}
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleSave}>
            <Save className="w-3.5 h-3.5" /> Save
          </Button>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Node Palette */}
        <div className="w-52 border-r border-white/[0.06] bg-background/50 p-3 overflow-y-auto flex-shrink-0">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Drag to add</p>
          <div className="space-y-1.5">
            {PALETTE_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/json", JSON.stringify(item));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-white/[0.06] cursor-grab active:cursor-grabbing hover:border-white/[0.12] hover:bg-white/[0.03] transition-all group"
                >
                  <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${item.color}15` }}>
                    <Icon className="w-3 h-3" style={{ color: item.color }} />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-foreground group-hover:text-white">{item.label}</p>
                    <p className="text-[8px] text-muted-foreground">{item.description}</p>
                  </div>
                  <GripVertical className="w-3 h-3 text-muted-foreground/30 ml-auto flex-shrink-0" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Canvas */}
        <div ref={reactFlowWrapper} className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onNodeDoubleClick={onNodeDoubleClick}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            style={{ background: "hsl(228, 10%, 7%)" }}
            defaultEdgeOptions={{ type: "smoothstep", animated: true }}
          >
            <Background color="rgba(255,255,255,0.03)" gap={20} />
            <Controls className="!bg-background/80 !border-white/[0.08] !rounded-xl [&>button]:!bg-background/80 [&>button]:!border-white/[0.08] [&>button]:!text-foreground" />
            <MiniMap
              className="!bg-background/80 !border-white/[0.08] !rounded-xl"
              nodeColor={(n) => (n.data as any)?.color || "#3b82f6"}
              maskColor="rgba(0,0,0,0.7)"
            />
            <Panel position="bottom-center">
              <p className="text-[9px] text-muted-foreground/50">Double-click a node to edit its prompt. Drag from palette to add nodes. Connect handles to define flow.</p>
            </Panel>
          </ReactFlow>
        </div>
      </div>

      {/* Prompt Editor Modal */}
      {editingNode && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditingNode(null)}>
          <div className="bg-card border border-white/[0.08] rounded-2xl p-5 w-[500px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-foreground mb-3">Edit Step Prompt</h3>
            <textarea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              rows={6}
              className="w-full bg-background border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-foreground resize-y focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Describe what this step should do... Use {{prev}} for previous step output"
              autoFocus
            />
            <p className="text-[9px] text-muted-foreground mt-1 mb-3">Use {"{{prev}}"} for previous step output, {"{{step.N}}"} for step N output</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingNode(null)}>Cancel</Button>
              <Button size="sm" onClick={savePrompt}><Save className="w-3 h-3 mr-1" /> Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
