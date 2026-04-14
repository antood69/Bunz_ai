// server/workflowEngine.ts — Executes visual workflows via BullMQ + topological sort

import { v4 as uuidv4 } from "uuid";
import { redis } from "./lib/redis";
import { modelRouter } from "./lib/modelRouter";
import { getDefaultModel } from "./lib/modelDefaults";
import { WORKER_PROMPTS } from "./workers/prompts";
import type { WorkerType } from "./queues";

// ── Types ───────────────────────────────────────────────────────────────────

interface CanvasNode {
  id: string;
  type: string; // trigger | agent | logic | output
  data: {
    subtype?: string;
    label?: string;
    model?: string;
    systemPrompt?: string;
    condition?: string;
    duration?: string;
    [key: string]: unknown;
  };
  position: { x: number; y: number };
}

interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface ExecutionCallbacks {
  onNodeStart: (nodeId: string, agentType: string) => Promise<void>;
  onNodeComplete: (nodeId: string, agentType: string, output: string, tokens: number, durationMs: number) => Promise<void>;
  onNodeError: (nodeId: string, agentType: string, error: string) => Promise<void>;
  onExecutionComplete: (totalTokens: number) => Promise<void>;
  onExecutionError: (error: string) => Promise<void>;
}

// ── Publish SSE event ──────────────────────────────────────────────────────

async function publishEvent(executionId: string, event: string, data: any) {
  try {
    await redis.publish(
      `workflow:${executionId}:events`,
      JSON.stringify({ event, data })
    );
  } catch {
    // Redis unavailable — silently skip
  }
}

// ── Kahn's Algorithm — topological sort ────────────────────────────────────

function topologicalSort(nodes: CanvasNode[], edges: CanvasEdge[]): string[][] {
  const nodeIds = new Set(nodes.map(n => n.id));
  const inDegree: Record<string, number> = {};
  const adjacency: Record<string, string[]> = {};

  for (const id of nodeIds) {
    inDegree[id] = 0;
    adjacency[id] = [];
  }

  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      adjacency[edge.source].push(edge.target);
      inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
    }
  }

  const levels: string[][] = [];
  const visited = new Set<string>();

  let maxIter = nodes.length * 2;
  while (visited.size < nodeIds.size && maxIter > 0) {
    maxIter--;
    const ready: string[] = [];
    for (const id of nodeIds) {
      if (visited.has(id)) continue;
      if (inDegree[id] === 0) {
        ready.push(id);
      }
    }
    if (ready.length === 0) break; // cycle detected or done

    levels.push(ready);
    for (const id of ready) {
      visited.add(id);
      for (const target of adjacency[id]) {
        inDegree[target]--;
      }
    }
  }

  return levels;
}

// ── Get predecessors' outputs ──────────────────────────────────────────────

function getPredecessorOutputs(
  nodeId: string,
  edges: CanvasEdge[],
  outputs: Record<string, string>
): string {
  const predecessors = edges
    .filter(e => e.target === nodeId)
    .map(e => e.source);

  if (predecessors.length === 0) return "";

  return predecessors
    .filter(pid => outputs[pid])
    .map(pid => outputs[pid])
    .join("\n\n---\n\n");
}

// ── Map node to worker type ────────────────────────────────────────────────

function nodeToWorkerType(node: CanvasNode): WorkerType | null {
  if (node.type === "agent") {
    const subtype = node.data.subtype || "researcher";
    const validTypes: WorkerType[] = ["researcher", "coder", "writer", "analyst", "reviewer", "artgen", "browser"];
    return validTypes.includes(subtype as WorkerType) ? (subtype as WorkerType) : "researcher";
  }
  return null;
}

// ── Execute a single agent node ────────────────────────────────────────────

async function executeAgentNode(
  node: CanvasNode,
  context: string,
  userId: number,
  signal?: AbortSignal
): Promise<{ output: string; tokens: number; durationMs: number }> {
  const workerType = nodeToWorkerType(node) || "researcher";
  const model = node.data.model || getDefaultModel(workerType);
  const systemPrompt = node.data.systemPrompt || WORKER_PROMPTS[workerType];
  const task = node.data.label || `Execute ${workerType} task`;

  const fullPrompt = context
    ? `${task}\n\nContext from previous steps:\n${context}`
    : task;

  const startTime = Date.now();

  const result = await modelRouter.chat({
    model,
    messages: [{ role: "user", content: fullPrompt }],
    systemPrompt,
    signal,
  });

  return {
    output: result.content,
    tokens: result.usage.totalTokens,
    durationMs: Date.now() - startTime,
  };
}

// ── Handle logic nodes (if/else, delay) ────────────────────────────────────

async function executeLogicNode(
  node: CanvasNode,
  context: string,
  edges: CanvasEdge[]
): Promise<{ output: string; tokens: number; durationMs: number; skipTargets?: string[] }> {
  const subtype = node.data.subtype || "if_else";

  if (subtype === "delay") {
    const durationStr = (node.data.duration as string) || "1s";
    const ms = parseDuration(durationStr);
    await new Promise(resolve => setTimeout(resolve, Math.min(ms, 30000))); // cap at 30s
    return { output: context || "delay complete", tokens: 0, durationMs: ms };
  }

  if (subtype === "if_else") {
    // Simple: if context contains "yes"/"true"/"pass" → true branch, else false
    const conditionMet = context && /\b(yes|true|pass|success|approve)\b/i.test(context);
    const trueTargets = edges.filter(e => e.source === node.id && e.sourceHandle === "true").map(e => e.target);
    const falseTargets = edges.filter(e => e.source === node.id && e.sourceHandle === "false").map(e => e.target);
    const skipTargets = conditionMet ? falseTargets : trueTargets;
    return {
      output: conditionMet ? "Condition: TRUE" : "Condition: FALSE",
      tokens: 0,
      durationMs: 0,
      skipTargets,
    };
  }

  // Default passthrough for merge, loop, etc.
  return { output: context || "", tokens: 0, durationMs: 0 };
}

function parseDuration(s: string): number {
  const match = s.match(/^(\d+)(s|m|h)?$/);
  if (!match) return 1000;
  const val = parseInt(match[1]);
  const unit = match[2] || "s";
  return val * (unit === "h" ? 3600000 : unit === "m" ? 60000 : 1000);
}

// ── Main execution function ────────────────────────────────────────────────

export async function executeWorkflow(
  executionId: string,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  userId: number,
  inputPrompt?: string,
  signal?: AbortSignal
): Promise<{ totalTokens: number; finalOutput: string }> {
  const levels = topologicalSort(nodes, edges);
  const outputs: Record<string, string> = {};
  let totalTokens = 0;
  const skipNodes = new Set<string>();

  // Inject input prompt into trigger nodes
  for (const node of nodes) {
    if (node.type === "trigger") {
      outputs[node.id] = inputPrompt || "Manual trigger";
    }
  }

  for (const level of levels) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const results = await Promise.all(
      level.map(async (nodeId) => {
        if (skipNodes.has(nodeId)) {
          await publishEvent(executionId, "node_update", {
            nodeId,
            status: "skipped",
          });
          return { nodeId, output: "", tokens: 0 };
        }

        const node = nodes.find(n => n.id === nodeId);
        if (!node) return { nodeId, output: "", tokens: 0 };

        // Skip trigger nodes (already processed)
        if (node.type === "trigger") {
          await publishEvent(executionId, "node_update", {
            nodeId,
            status: "done",
            tokenCount: 0,
          });
          return { nodeId, output: outputs[nodeId] || "", tokens: 0 };
        }

        // Get context from predecessors
        const context = getPredecessorOutputs(nodeId, edges, outputs);

        await publishEvent(executionId, "node_update", {
          nodeId,
          status: "running",
          agentType: node.data.subtype || node.type,
        });

        try {
          let result: { output: string; tokens: number; durationMs: number; skipTargets?: string[] };

          if (node.type === "agent") {
            result = await executeAgentNode(node, context, userId, signal);
          } else if (node.type === "logic") {
            result = await executeLogicNode(node, context, edges);
            if (result.skipTargets) {
              for (const t of result.skipTargets) skipNodes.add(t);
            }
          } else if (node.type === "output") {
            // Output nodes just pass through
            result = { output: context || "No output", tokens: 0, durationMs: 0 };
          } else {
            result = { output: context || "", tokens: 0, durationMs: 0 };
          }

          await publishEvent(executionId, "node_update", {
            nodeId,
            status: "done",
            tokenCount: result.tokens,
            durationMs: result.durationMs,
            output: result.output.slice(0, 500),
          });

          return { nodeId, output: result.output, tokens: result.tokens };
        } catch (err: any) {
          await publishEvent(executionId, "node_update", {
            nodeId,
            status: "failed",
            error: err.message,
          });
          return { nodeId, output: `Error: ${err.message}`, tokens: 0 };
        }
      })
    );

    for (const r of results) {
      outputs[r.nodeId] = r.output;
      totalTokens += r.tokens;
    }
  }

  // Find output nodes or last nodes for final output
  const outputNodes = nodes.filter(n => n.type === "output");
  let finalOutput: string;
  if (outputNodes.length > 0) {
    finalOutput = outputNodes.map(n => outputs[n.id] || "").filter(Boolean).join("\n\n");
  } else {
    // Use the last level's outputs
    const lastLevel = levels[levels.length - 1] || [];
    finalOutput = lastLevel.map(id => outputs[id] || "").filter(Boolean).join("\n\n");
  }

  return { totalTokens, finalOutput };
}
