import { useState, useEffect, useRef, useCallback } from "react";

export interface WorkerStatus {
  type: string;
  index: number;
  status: "pending" | "running" | "complete" | "error";
  output?: string;
  streamedText?: string;
  tokens?: number;
  durationMs?: number;
  error?: string;
  imageUrl?: string;
  outputType?: string;
}

export interface StreamState {
  /** Accumulated text from all token events (raw, not yet rendered as markdown) */
  text: string;
  /** True while the EventSource is connected and receiving */
  isStreaming: boolean;
  /** Error message if connection failed */
  error: string | null;
  /** Current workflow step description */
  currentStep: string;
  /** Status of each worker in the flow */
  workers: WorkerStatus[];
  /** True when Boss is synthesizing final output */
  isSynthesizing: boolean;
  /** Synthesis text accumulated separately */
  synthesisText: string;
  /** Final complete flag */
  isComplete: boolean;
  /** Total tokens used */
  totalTokens: number;
  /** Agent-generated images */
  agentImages: Array<{ agent: string; imageUrl: string; prompt?: string }>;
  /** Agent outputs with attribution */
  agentOutputs: Array<{ agent: string; imageUrl?: string; type?: string }>;
}

const RENDER_DEBOUNCE_MS = 200;

/**
 * React hook that connects to the SSE stream for a given jobId.
 * Accumulates tokens, tracks worker progress, handles reconnection.
 */
export function useAgentStream(jobId: string | null): StreamState {
  const [state, setState] = useState<StreamState>({
    text: "",
    isStreaming: false,
    error: null,
    currentStep: "",
    workers: [],
    isSynthesizing: false,
    synthesisText: "",
    isComplete: false,
    totalTokens: 0,
    agentImages: [],
    agentOutputs: [],
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const tokenBufferRef = useRef<string>("");
  const synthesisBufferRef = useRef<string>("");
  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced render: accumulate tokens and render on pause
  const flushTokenBuffer = useCallback(() => {
    const tokens = tokenBufferRef.current;
    const synthesis = synthesisBufferRef.current;
    if (tokens || synthesis) {
      setState((prev) => ({
        ...prev,
        text: prev.text + tokens,
        synthesisText: prev.synthesisText + synthesis,
      }));
      tokenBufferRef.current = "";
      synthesisBufferRef.current = "";
    }
  }, []);

  const scheduleRender = useCallback(() => {
    if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
    renderTimerRef.current = setTimeout(flushTokenBuffer, RENDER_DEBOUNCE_MS);
  }, [flushTokenBuffer]);

  useEffect(() => {
    if (!jobId) return;

    // Reset state
    setState({
      text: "",
      isStreaming: true,
      error: null,
      currentStep: "Connecting...",
      workers: [],
      isSynthesizing: false,
      synthesisText: "",
      isComplete: false,
      totalTokens: 0,
      agentImages: [],
      agentOutputs: [],
    });
    tokenBufferRef.current = "";
    synthesisBufferRef.current = "";

    const es = new EventSource(`/api/agent/stream/${jobId}`);
    eventSourceRef.current = es;

    es.addEventListener("connected", () => {
      setState((prev) => ({ ...prev, isStreaming: true, currentStep: "Connected" }));
    });

    es.addEventListener("token", (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.isSynthesis) {
          synthesisBufferRef.current += data.text;
        } else {
          tokenBufferRef.current += data.text;
        }
        scheduleRender();
      } catch {}
    });

    es.addEventListener("progress", (e) => {
      try {
        const data = JSON.parse(e.data);
        setState((prev) => {
          const workers = [...prev.workers];
          const idx = data.workerIndex ?? workers.findIndex((w) => w.type === data.workerType);
          if (idx >= 0 && idx < workers.length) {
            workers[idx] = { ...workers[idx], status: data.status === "synthesizing" ? "running" : data.status };
          } else if (data.workerType && data.workerType !== "boss") {
            workers.push({
              type: data.workerType,
              index: data.workerIndex ?? workers.length,
              status: "running",
              streamedText: "",
            });
          }
          return {
            ...prev,
            currentStep: data.message || prev.currentStep,
            workers,
            isSynthesizing: data.status === "synthesizing",
          };
        });
      } catch {}
    });

    es.addEventListener("step_complete", (e) => {
      try {
        const data = JSON.parse(e.data);
        setState((prev) => {
          const workers = [...prev.workers];
          const idx = data.workerIndex ?? workers.findIndex((w) => w.type === data.workerType);
          if (idx >= 0 && idx < workers.length) {
            workers[idx] = {
              ...workers[idx],
              status: data.status === "error" ? "error" : "complete",
              output: data.output,
              tokens: data.tokens,
              durationMs: data.durationMs,
              imageUrl: data.imageUrl,
              outputType: data.type,
              error: data.error,
            };
          }
          return {
            ...prev,
            workers,
            totalTokens: prev.totalTokens + (data.tokens || 0),
          };
        });
      } catch {}
    });

    es.addEventListener("agent_image", (e) => {
      try {
        const data = JSON.parse(e.data);
        setState((prev) => ({
          ...prev,
          agentImages: [...prev.agentImages, {
            agent: data.workerType,
            imageUrl: data.imageUrl,
            prompt: data.prompt,
          }],
        }));
      } catch {}
    });

    es.addEventListener("complete", (e) => {
      try {
        const data = JSON.parse(e.data);
        // Flush any remaining tokens
        flushTokenBuffer();
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          isComplete: true,
          isSynthesizing: false,
          synthesisText: prev.synthesisText + (synthesisBufferRef.current || ""),
          currentStep: "Complete",
          totalTokens: data.totalTokens || prev.totalTokens,
          agentOutputs: data.agentOutputs || prev.agentOutputs,
        }));
        synthesisBufferRef.current = "";
      } catch {}
      es.close();
    });

    es.addEventListener("error", (e) => {
      try {
        // Check if this is a custom error event with data
        const evt = e as MessageEvent;
        if (evt.data) {
          const data = JSON.parse(evt.data);
          setState((prev) => ({
            ...prev,
            error: data.error || "Stream error",
            isStreaming: false,
          }));
          es.close();
          return;
        }
      } catch {}

      // EventSource built-in reconnect handles transient errors
      if (es.readyState === EventSource.CLOSED) {
        setState((prev) => ({
          ...prev,
          error: "Connection lost",
          isStreaming: false,
        }));
      }
    });

    return () => {
      es.close();
      if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
    };
  }, [jobId, scheduleRender, flushTokenBuffer]);

  return state;
}
