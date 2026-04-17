/**
 * Bun Bun — AI screen viewer with floating, resizable, draggable overlay chat.
 *
 * Activated via Alt+J, or clicking the floating trigger button.
 * Uses Screen Capture API to let user pick which monitor/window to share.
 * Captures frames on demand and sends to Boss AI as vision attachments.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Eye, Send, X, Monitor, Minimize2,
  Loader2, Camera, MonitorPlay, GripHorizontal,
} from "lucide-react";

interface BunBunMessage {
  role: "user" | "assistant";
  content: string;
  screenshot?: string;
}

const MIN_W = 340;
const MIN_H = 220;
const DEFAULT_W = 560;
const DEFAULT_H = 400;

export default function JarvisMode() {
  const [active, setActive] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<BunBunMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [screenName, setScreenName] = useState("");
  const [capturing, setCapturing] = useState(false);

  // Position & size state (persisted to localStorage)
  const [pos, setPos] = useState(() => {
    try {
      const saved = localStorage.getItem("bunbun-pos");
      if (saved) return JSON.parse(saved);
    } catch {}
    return { x: -1, y: 12 }; // -1 = centered
  });
  const [size, setSize] = useState(() => {
    try {
      const saved = localStorage.getItem("bunbun-size");
      if (saved) return JSON.parse(saved);
    } catch {}
    return { w: DEFAULT_W, h: DEFAULT_H };
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number; edge: string } | null>(null);

  // Save position/size to localStorage
  useEffect(() => {
    try { localStorage.setItem("bunbun-pos", JSON.stringify(pos)); } catch {}
  }, [pos]);
  useEffect(() => {
    try { localStorage.setItem("bunbun-size", JSON.stringify(size)); } catch {}
  }, [size]);

  // Global keyboard shortcut: Alt+J to toggle
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.altKey && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        e.stopPropagation();
        setActive(function (prev) { return !prev; });
      }
    }
    document.addEventListener("keydown", handler, true);
    return function () { document.removeEventListener("keydown", handler, true); };
  }, []);

  useEffect(() => {
    if (active && !minimized) {
      setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 200);
    }
  }, [active, minimized]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  // ── Drag to move ────────────────────────────────────────────────────
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: rect.left, startPosY: rect.top };

    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      const newX = Math.max(0, Math.min(window.innerWidth - 100, dragRef.current.startPosX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - 50, dragRef.current.startPosY + dy));
      setPos({ x: newX, y: newY });
    }
    function onUp() {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // ── Resize from edges/corners ───────────────────────────────────────
  const onResizeStart = useCallback((edge: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h, edge };

    function onMove(ev: MouseEvent) {
      if (!resizeRef.current) return;
      const dx = ev.clientX - resizeRef.current.startX;
      const dy = ev.clientY - resizeRef.current.startY;
      const ed = resizeRef.current.edge;

      let newW = resizeRef.current.startW;
      let newH = resizeRef.current.startH;

      if (ed.includes("e")) newW = Math.max(MIN_W, resizeRef.current.startW + dx);
      if (ed.includes("w")) newW = Math.max(MIN_W, resizeRef.current.startW - dx);
      if (ed.includes("s")) newH = Math.max(MIN_H, resizeRef.current.startH + dy);
      if (ed.includes("n")) newH = Math.max(MIN_H, resizeRef.current.startH - dy);

      // Cap to viewport
      newW = Math.min(newW, window.innerWidth - 20);
      newH = Math.min(newH, window.innerHeight - 20);

      setSize({ w: newW, h: newH });

      // If dragging west or north edges, shift position too
      if (ed.includes("w")) {
        const actualDx = resizeRef.current.startW - newW;
        setPos((p: any) => ({ ...p, x: Math.max(0, (p.x === -1 ? (window.innerWidth - resizeRef.current!.startW) / 2 : p.x) + (dx > 0 ? dx : actualDx < 0 ? -actualDx : 0)) }));
      }
    }
    function onUp() {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [size]);

  // ── Screen capture ──────────────────────────────────────────────────
  const startScreenCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 1 } as any,
        audio: false,
      });
      setScreenStream(stream);
      const track = stream.getVideoTracks()[0];
      setScreenName(track.label || "Screen");
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      track.onended = () => { setScreenStream(null); setScreenName(""); };
    } catch (err: any) {
      console.log("[BunBun] Screen capture cancelled:", err.message);
    }
  };

  const stopScreenCapture = () => {
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      setScreenStream(null);
      setScreenName("");
    }
  };

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !screenStream) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.8);
  }, [screenStream]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userText = input.trim();
    setInput("");
    setLoading(true);

    let screenshot: string | null = null;
    if (screenStream) {
      setCapturing(true);
      screenshot = captureFrame();
      setCapturing(false);
    }

    setMessages(prev => [...prev, { role: "user", content: userText, screenshot: screenshot || undefined }]);

    try {
      const body: Record<string, any> = {
        message: screenshot
          ? "[User is sharing their screen. Screenshot attached.]\n\n" + userText
          : userText,
        level: "medium",
        source: "boss",
      };
      if (screenshot) body.imageBase64 = screenshot;

      const res = await fetch("/api/boss/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.reply || data.error || "No response" }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: "assistant", content: "Error: " + (err.message || "Unknown error") }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (screenStream) screenStream.getTracks().forEach(t => t.stop());
    };
  }, [screenStream]);

  const deactivate = () => {
    stopScreenCapture();
    setActive(false);
    setMessages([]);
    setInput("");
  };

  // Compute left position (centered if x === -1)
  const leftPx = pos.x === -1 ? Math.max(0, (window.innerWidth - size.w) / 2) : pos.x;

  // Resize handle style helper
  const handle = (cursor: string, edge: string, styles: React.CSSProperties): React.ReactElement => (
    <div
      onMouseDown={onResizeStart(edge)}
      style={{ position: "absolute", zIndex: 10, cursor, ...styles }}
    />
  );

  return (
    <>
      <video ref={videoRef} style={{ display: "none" }} muted playsInline />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Floating trigger button */}
      {!active && (
        <button
          onClick={() => setActive(true)}
          className="fixed bottom-20 right-4 z-[9998] w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-110 transition-all border border-white/20"
          title="Bun Bun — AI Screen Viewer (Alt+J)"
        >
          <Eye className="w-4 h-4" />
        </button>
      )}

      {/* Minimized badge */}
      {active && minimized && (
        <div className="fixed top-3 right-3 z-[9999]">
          <button
            onClick={() => setMinimized(false)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-white text-xs font-medium shadow-2xl transition-all border border-white/10"
            style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.9), rgba(124,58,237,0.9))", backdropFilter: "blur(12px)" }}
          >
            <Eye className="w-3.5 h-3.5" />
            Bun Bun
            {screenStream && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
            {loading && <Loader2 className="w-3 h-3 animate-spin" />}
          </button>
        </div>
      )}

      {/* Full overlay — resizable + draggable */}
      {active && !minimized && (
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            top: pos.y,
            left: leftPx,
            width: size.w,
            height: size.h,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Resize handles — edges */}
          {handle("ew-resize", "e", { top: 0, right: -3, width: 6, bottom: 0 })}
          {handle("ew-resize", "w", { top: 0, left: -3, width: 6, bottom: 0 })}
          {handle("ns-resize", "s", { bottom: -3, left: 0, right: 0, height: 6 })}
          {handle("ns-resize", "n", { top: -3, left: 0, right: 0, height: 6 })}
          {/* Corners */}
          {handle("nwse-resize", "se", { bottom: -4, right: -4, width: 12, height: 12, borderRadius: "50%" })}
          {handle("nesw-resize", "sw", { bottom: -4, left: -4, width: 12, height: 12, borderRadius: "50%" })}
          {handle("nesw-resize", "ne", { top: -4, right: -4, width: 12, height: 12, borderRadius: "50%" })}
          {handle("nwse-resize", "nw", { top: -4, left: -4, width: 12, height: 12, borderRadius: "50%" })}

          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              borderRadius: 16,
              background: "rgba(22,22,42,0.95)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 25px 50px rgba(0,0,0,0.4)",
              overflow: "hidden",
            }}
          >
            {/* Header — drag handle */}
            <div
              onMouseDown={onDragStart}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 16px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                cursor: "grab",
                userSelect: "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Eye className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "white" }}>Bun Bun</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginLeft: 8 }}>Alt+J</span>
                </div>
                <GripHorizontal className="w-4 h-4" style={{ color: "rgba(255,255,255,0.15)", marginLeft: 4 }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {screenStream ? (
                  <button
                    onClick={stopScreenCapture}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 8, background: "rgba(16,185,129,0.15)", color: "#34d399", fontSize: 10, fontWeight: 500, border: "none", cursor: "pointer" }}
                  >
                    <MonitorPlay className="w-3 h-3" />
                    {screenName.length > 15 ? screenName.slice(0, 15) + "..." : screenName}
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", animation: "pulse 2s infinite" }} />
                  </button>
                ) : (
                  <button
                    onClick={startScreenCapture}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 8, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: 500, border: "none", cursor: "pointer" }}
                  >
                    <Monitor className="w-3 h-3" />
                    Share Screen
                  </button>
                )}
                <button onClick={() => setMinimized(true)} style={{ padding: 6, borderRadius: 8, background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={deactivate} style={{ padding: 6, borderRadius: 8, background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Messages — fills remaining space */}
            <div ref={chatRef} style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
              {messages.length === 0 && (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                    {screenStream
                      ? "Screen connected. Ask me what you see."
                      : "Click \"Share Screen\" to let me see your monitor, then ask a question."}
                  </p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  <div
                    style={{
                      maxWidth: "85%",
                      borderRadius: 12,
                      padding: "8px 12px",
                      fontSize: 12,
                      lineHeight: 1.6,
                      background: msg.role === "user" ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)",
                      color: msg.role === "user" ? "#bfdbfe" : "rgba(255,255,255,0.8)",
                      border: msg.role === "user" ? "1px solid rgba(59,130,246,0.2)" : "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {msg.screenshot && (
                      <img src={msg.screenshot} alt="Screenshot" style={{ width: "100%", maxHeight: 150, borderRadius: 8, objectFit: "contain", marginBottom: 8, border: "1px solid rgba(255,255,255,0.08)" }} />
                    )}
                    <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{msg.content}</p>
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <Loader2 className="w-3 h-3 animate-spin" style={{ color: "#60a5fa" }} />
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{capturing ? "Capturing screen..." : "Thinking..."}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {screenStream && (
                <button
                  onClick={() => {
                    const frame = captureFrame();
                    if (frame) setMessages(prev => [...prev, { role: "user", content: "[Screenshot captured]", screenshot: frame }]);
                  }}
                  style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)", background: "none", border: "none", cursor: "pointer" }}
                  title="Take screenshot"
                >
                  <Camera className="w-4 h-4" />
                </button>
              )}
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={screenStream ? "What do you see on my screen?" : "Ask Bun Bun anything..."}
                style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "white", outline: "none" }}
                disabled={loading}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "white", background: input.trim() && !loading ? "rgba(59,130,246,0.8)" : "rgba(59,130,246,0.3)", border: "none", cursor: input.trim() && !loading ? "pointer" : "default", opacity: !input.trim() || loading ? 0.3 : 1 }}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
