/**
 * Bun Bun — AI screen viewer with floating overlay chat.
 *
 * Activated via Alt+J, or clicking the floating trigger button.
 * Uses Screen Capture API to let user pick which monitor/window to share.
 * Captures frames on demand and sends to Boss AI as vision attachments.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Eye, Send, X, Monitor, Minimize2,
  Loader2, Camera, MonitorPlay,
} from "lucide-react";

interface BunBunMessage {
  role: "user" | "assistant";
  content: string;
  screenshot?: string;
}

export default function JarvisMode() {
  const [active, setActive] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<BunBunMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [screenName, setScreenName] = useState("");
  const [capturing, setCapturing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

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

  // Always render the hidden video/canvas + trigger button
  // Only conditionally render the overlay panel
  return (
    <>
      {/* Hidden elements for screen capture — always mounted */}
      <video ref={videoRef} style={{ display: "none" }} muted playsInline />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Floating trigger button — always visible in bottom-right */}
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
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-blue-600/90 to-violet-600/90 backdrop-blur-xl text-white text-xs font-medium shadow-2xl hover:shadow-blue-500/20 transition-all border border-white/10"
          >
            <Eye className="w-3.5 h-3.5" />
            Bun Bun
            {screenStream && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
            {loading && <Loader2 className="w-3 h-3 animate-spin" />}
          </button>
        </div>
      )}

      {/* Full overlay panel */}
      {active && !minimized && (
        <div className="fixed top-3 left-1/2 z-[9999] w-[560px] max-w-[95vw]" style={{ transform: "translateX(-50%)" }}>
          <div className="rounded-2xl border border-white/[0.08] shadow-2xl" style={{ background: "rgba(22,22,42,0.95)", backdropFilter: "blur(24px)" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}>
                  <Eye className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-white">Bun Bun</span>
                  <span className="text-[10px] ml-2" style={{ color: "rgba(255,255,255,0.4)" }}>Alt+J</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {screenStream ? (
                  <button
                    onClick={stopScreenCapture}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium"
                    style={{ background: "rgba(16,185,129,0.15)", color: "#34d399" }}
                  >
                    <MonitorPlay className="w-3 h-3" />
                    {screenName.length > 20 ? screenName.slice(0, 20) + "..." : screenName}
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#34d399" }} />
                  </button>
                ) : (
                  <button
                    onClick={startScreenCapture}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-colors"
                    style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
                  >
                    <Monitor className="w-3 h-3" />
                    Share Screen
                  </button>
                )}
                <button onClick={() => setMinimized(true)} className="p-1.5 rounded-lg transition-colors" style={{ color: "rgba(255,255,255,0.4)" }}>
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={deactivate} className="p-1.5 rounded-lg transition-colors" style={{ color: "rgba(255,255,255,0.4)" }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div ref={chatRef} className="overflow-y-auto px-4 py-3 space-y-3" style={{ maxHeight: "300px" }}>
              {messages.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {screenStream
                      ? "Screen connected. Ask me what you see."
                      : "Click \"Share Screen\" to let me see your monitor, then ask a question."}
                  </p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className="flex" style={{ justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  <div
                    className="rounded-xl px-3 py-2 text-xs leading-relaxed"
                    style={{
                      maxWidth: "85%",
                      background: msg.role === "user" ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)",
                      color: msg.role === "user" ? "#bfdbfe" : "rgba(255,255,255,0.8)",
                      border: msg.role === "user" ? "1px solid rgba(59,130,246,0.2)" : "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {msg.screenshot && (
                      <img src={msg.screenshot} alt="Screenshot" className="w-full rounded-lg object-contain mb-2" style={{ maxHeight: "128px", border: "1px solid rgba(255,255,255,0.08)" }} />
                    )}
                    <p style={{ whiteSpace: "pre-wrap" }}>{msg.content}</p>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex" style={{ justifyContent: "flex-start" }}>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <Loader2 className="w-3 h-3 animate-spin" style={{ color: "#60a5fa" }} />
                    <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>{capturing ? "Capturing screen..." : "Thinking..."}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {screenStream && (
                <button
                  onClick={() => {
                    const frame = captureFrame();
                    if (frame) setMessages(prev => [...prev, { role: "user", content: "[Screenshot captured]", screenshot: frame }]);
                  }}
                  className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                  style={{ color: "rgba(255,255,255,0.4)" }}
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
                className="flex-1 rounded-lg px-3 py-2 text-xs outline-none"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "white",
                }}
                disabled={loading}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white transition-colors"
                style={{ background: input.trim() && !loading ? "rgba(59,130,246,0.8)" : "rgba(59,130,246,0.3)", opacity: !input.trim() || loading ? 0.3 : 1 }}
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
