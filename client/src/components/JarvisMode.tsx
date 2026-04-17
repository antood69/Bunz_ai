/**
 * Bun Bun — AI screen viewer with floating overlay chat.
 *
 * Activated via Alt+J or the trigger button.
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
  const [screenName, setScreenName] = useState<string>("");
  const [capturing, setCapturing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  // Global keyboard shortcut: Alt+J to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setActive(prev => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (active && !minimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [active, minimized]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  // Start screen sharing — browser shows monitor/window picker
  const startScreenCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 1 },
        audio: false,
      });
      setScreenStream(stream);
      const track = stream.getVideoTracks()[0];
      setScreenName(track.label || "Screen");
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
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

    const userMsg: BunBunMessage = { role: "user", content: userText, screenshot: screenshot || undefined };
    setMessages(prev => [...prev, userMsg]);

    try {
      const body: any = {
        message: screenshot
          ? `[User is sharing their screen. Screenshot attached.]\n\n${userText}`
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
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => { screenStream?.getTracks().forEach(t => t.stop()); };
  }, [screenStream]);

  const deactivate = () => {
    stopScreenCapture();
    setActive(false);
    setMessages([]);
    setInput("");
  };

  if (!active) return null;

  if (minimized) {
    return (
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
    );
  }

  return (
    <>
      <video ref={videoRef} className="hidden" muted playsInline />
      <canvas ref={canvasRef} className="hidden" />

      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] w-[560px] max-w-[95vw]">
        <div className="rounded-2xl bg-gradient-to-b from-[#1a1a2e]/95 to-[#16162a]/95 backdrop-blur-2xl border border-white/[0.08] shadow-2xl shadow-black/40">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
                <Eye className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <span className="text-xs font-semibold text-white">Bun Bun</span>
                <span className="text-[10px] text-white/40 ml-2">Alt+J</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {screenStream ? (
                <button
                  onClick={stopScreenCapture}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-[10px] font-medium hover:bg-emerald-500/25 transition-colors"
                >
                  <MonitorPlay className="w-3 h-3" />
                  {screenName.slice(0, 20)}
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </button>
              ) : (
                <button
                  onClick={startScreenCapture}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.06] text-white/60 text-[10px] font-medium hover:bg-white/[0.1] hover:text-white/80 transition-colors"
                >
                  <Monitor className="w-3 h-3" />
                  Share Screen
                </button>
              )}
              <button onClick={() => setMinimized(true)} className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors">
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={deactivate} className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={chatRef} className="max-h-[300px] overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-4">
                <p className="text-xs text-white/30">
                  {screenStream
                    ? "Screen connected. Ask me what you see."
                    : "Click \"Share Screen\" to let me see your monitor, then ask a question."}
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-500/20 text-blue-100 border border-blue-500/20"
                    : "bg-white/[0.05] text-white/80 border border-white/[0.06]"
                }`}>
                  {msg.screenshot && (
                    <img src={msg.screenshot} alt="Screenshot" className="w-full max-h-32 rounded-lg object-contain mb-2 border border-white/[0.08]" />
                  )}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.06]">
                  <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                  <span className="text-[10px] text-white/50">{capturing ? "Capturing screen..." : "Thinking..."}</span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-t border-white/[0.06]">
            {screenStream && (
              <button
                onClick={() => {
                  const frame = captureFrame();
                  if (frame) setMessages(prev => [...prev, { role: "user", content: "[Screenshot captured]", screenshot: frame }]);
                }}
                className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
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
              className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/25 outline-none focus:border-blue-500/40 transition-colors"
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-500/80 flex items-center justify-center text-white disabled:opacity-30 hover:bg-blue-500 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
