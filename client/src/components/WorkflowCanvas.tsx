/**
 * Visual Workflow Canvas — node-based editor using React Flow.
 * Drag nodes from palette, connect them, run with input, see output.
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
  MessageSquare, Bot,
  Save, X, Play, GripVertical, Search, ChevronRight,
  Loader2, CheckCircle2, XCircle, Send, FileOutput,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  { type: "connector", connectorAction: "search_emails", label: "Search Email", icon: Search, color: "#f97316", description: "Search Gmail inbox" },
  { type: "connector", connectorAction: "list_orders", label: "Shopify Orders", icon: ShoppingBag, color: "#96bf48", description: "Fetch Shopify orders" },
];

// ── Custom Node Component ───────────────────────────────────────────
function WorkflowNode({ data, selected }: NodeProps) {
  const d = data as any;
  const Icon = d.icon || Zap;
  const color = d.color || "#3b82f6";
  const status = d.status;

  return (
    <div className={`relative rounded-2xl border-2 transition-all min-w-[200px] max-w-[240px] backdrop-blur-sm ${
      selected ? "shadow-lg" : ""
    }`} style={{
      borderColor: status === "complete" ? "#10b981" : status === "running" ? "#3b82f6" : status === "failed" ? "#ef4444" : selected ? color : "rgba(255,255,255,0.08)",
      background: "rgba(12,14,22,0.95)",
      boxShadow: status === "running" ? `0 0 20px ${color}30` : selected ? `0 0 16px ${color}20` : "0 4px 12px rgba(0,0,0,0.3)",
    }}>
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !border-2 !bg-background" style={{ borderColor: color }} />

      {/* Header bar with color accent */}
      <div className="h-1 rounded-t-xl" style={{ background: `linear-gradient(90deg, ${color}, ${color}60)` }} />

      <div className="px-3 py-3">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}18` }}>
            {status === "running" ? <Loader2 className="w-4 h-4 animate-spin" style={{ color }} /> :
             status === "complete" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
             status === "failed" ? <XCircle className="w-4 h-4 text-red-400" /> :
             <Icon className="w-4 h-4" style={{ color }} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-foreground truncate">{d.label}</p>
            <p className="text-[9px] text-muted-foreground capitalize">{d.stepType === "department" ? `${d.department} dept` : d.stepType}</p>
          </div>
          {status && (
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              status === "complete" ? "bg-emerald-400" : status === "running" ? "bg-blue-400 animate-pulse" : status === "failed" ? "bg-red-400" : ""
            }`} />
          )}
        </div>

        {d.prompt && (
          <div className="bg-white/[0.03] rounded-lg px-2.5 py-1.5 border border-white/[0.04]">
            <p className="text-[9px] text-muted-foreground line-clamp-2 leading-relaxed">{d.prompt}</p>
          </div>
        )}
        {!d.prompt && (
          <div className="bg-white/[0.03] rounded-lg px-2.5 py-1.5 border border-dashed border-white/[0.08] text-center">
            <p className="text-[9px] text-muted-foreground/50 italic">Double-click to add prompt</p>
          </div>
        )}

        {/* Token/time info during execution */}
        {d.tokens && (
          <div className="flex items-center gap-2 mt-1.5 text-[8px] text-muted-foreground">
            <span className="text-emerald-400">{d.tokens >= 1000 ? `${(d.tokens / 1000).toFixed(1)}K` : d.tokens} tokens</span>
            {d.durationMs && <span>{(d.durationMs / 1000).toFixed(1)}s</span>}
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
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [showOutput, setShowOutput] = useState(false);

  // Convert pipeline steps to React Flow nodes/edges
  const initialNodes: Node[] = steps.map((step, i) => ({
    id: step.id || `step-${i}`,
    type: "workflow",
    position: { x: 300, y: i * 160 + 40 },
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
    style: { stroke: "rgba(255,255,255,0.12)", strokeWidth: 2 },
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, type: "smoothstep", animated: true, style: { stroke: "rgba(255,255,255,0.12)", strokeWidth: 2 } }, eds));
  }, [setEdges]);

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

    const position = { x: event.clientX - bounds.left - 100, y: event.clientY - bounds.top - 40 };
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
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const visited = new Set<string>();
    const sorted: Node[] = [];
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
    nodes.forEach(n => { if (!visited.has(n.id)) sorted.push(n); });

    const pipelineSteps = sorted.map(n => {
      const d = n.data as any;
      return { id: n.id, type: d.stepType || "department", department: d.department, connectorAction: d.connectorAction, prompt: d.prompt || "" };
    });

    onSave(pipelineSteps);
  };

  const deleteNode = (nodeId: string) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId));
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="w-4 h-4" />
          </Button>
          <div className="w-px h-5 bg-white/[0.08]" />
          <span className="text-sm font-semibold text-foreground">{pipelineName}</span>
          <Badge variant="outline" className="text-[9px] h-4">{nodes.length} nodes</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setShowOutput(!showOutput)}>
            <FileOutput className="w-3.5 h-3.5" /> {showOutput ? "Hide Output" : "Show Output"}
          </Button>
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

      <div className="flex-1 flex overflow-hidden">
        {/* Node Palette */}
        <div className="w-56 border-r border-white/[0.06] bg-background/80 backdrop-blur flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-white/[0.04]">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Nodes</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {PALETTE_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/json", JSON.stringify(item));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-grab active:cursor-grabbing hover:bg-white/[0.04] transition-all group border border-transparent hover:border-white/[0.06]"
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${item.color}15` }}>
                    <Icon className="w-3.5 h-3.5" style={{ color: item.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-foreground">{item.label}</p>
                    <p className="text-[9px] text-muted-foreground">{item.description}</p>
                  </div>
                  <GripVertical className="w-3 h-3 text-muted-foreground/20 group-hover:text-muted-foreground/50 ml-auto flex-shrink-0" />
                </div>
              );
            })}
          </div>

          {/* Input section at bottom of palette */}
          <div className="p-3 border-t border-white/[0.04]">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Input</p>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={3}
              placeholder="Enter the topic or data for this workflow..."
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-2 text-[11px] text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/40"
            />
            <p className="text-[8px] text-muted-foreground/50 mt-1">This becomes {"{{prev}}"} for the first step</p>
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
            deleteKeyCode={["Backspace", "Delete"]}
          >
            <Background color="rgba(255,255,255,0.02)" gap={24} size={1} />
            <Controls className="!bg-background/90 !border-white/[0.06] !rounded-xl [&>button]:!bg-background/90 [&>button]:!border-white/[0.06] [&>button]:!text-foreground" />
            <MiniMap
              className="!bg-background/90 !border-white/[0.06] !rounded-xl"
              nodeColor={(n) => (n.data as any)?.color || "#3b82f6"}
              maskColor="rgba(0,0,0,0.8)"
            />
            <Panel position="bottom-center">
              <div className="bg-background/80 backdrop-blur border border-white/[0.06] rounded-full px-4 py-1.5 text-[9px] text-muted-foreground/60">
                Drag nodes from palette · Double-click to edit · Delete key removes · Connect handles to define flow
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {/* Output Panel */}
        {showOutput && (
          <div className="w-80 border-l border-white/[0.06] bg-background/80 backdrop-blur flex flex-col flex-shrink-0">
            <div className="p-3 border-b border-white/[0.04] flex items-center justify-between">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Output</p>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowOutput(false)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {outputText ? (
                <pre className="text-[11px] text-foreground whitespace-pre-wrap break-words leading-relaxed">{outputText}</pre>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground/40">
                  <FileOutput className="w-8 h-8 mb-2" />
                  <p className="text-xs">No output yet</p>
                  <p className="text-[10px] mt-1">Run the workflow to see results here</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Prompt Editor Modal */}
      {editingNode && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setEditingNode(null)}>
          <div className="glass-card rounded-2xl p-6 w-[520px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <PenTool className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Edit Step Prompt</h3>
                <p className="text-[10px] text-muted-foreground">Tell this step exactly what to do</p>
              </div>
            </div>
            <textarea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              rows={8}
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-foreground resize-y focus:outline-none focus:ring-1 focus:ring-primary/50"
              placeholder="e.g. Research the top 5 competitors for {{prev}} and create a comparison table with pricing, features, and market position..."
              autoFocus
            />
            <div className="flex items-center gap-2 mt-2 mb-4">
              <Badge variant="outline" className="text-[9px] cursor-pointer hover:bg-primary/10" onClick={() => setEditPrompt(p => p + "{{prev}}")}>{"{{prev}}"}</Badge>
              <Badge variant="outline" className="text-[9px] cursor-pointer hover:bg-primary/10" onClick={() => setEditPrompt(p => p + "{{step.1}}")}>{"{{step.1}}"}</Badge>
              <Badge variant="outline" className="text-[9px] cursor-pointer hover:bg-primary/10" onClick={() => setEditPrompt(p => p + "{{step.2}}")}>{"{{step.2}}"}</Badge>
              <span className="text-[9px] text-muted-foreground ml-1">Click to insert variable</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingNode(null)}>Cancel</Button>
              <Button size="sm" onClick={savePrompt} className="gap-1"><Save className="w-3 h-3" /> Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
