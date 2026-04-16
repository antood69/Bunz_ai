/**
 * Artifact — renders AI-generated interactive content inline.
 * Supports: HTML, SVG, Markdown documents, code with preview.
 */
import { useState, useRef } from "react";
import { Code, Eye, Copy, Download, ExternalLink, FileText, X, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ArtifactProps {
  type: string; // "html" | "svg" | "document" | "code"
  title?: string;
  content: string;
  language?: string;
}

export default function Artifact({ type, title, content, language }: ArtifactProps) {
  const [view, setView] = useState<"preview" | "code">(type === "code" ? "code" : "preview");
  const [fullscreen, setFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const copyContent = () => {
    navigator.clipboard.writeText(content);
  };

  const downloadContent = () => {
    const ext = type === "html" ? "html" : type === "svg" ? "svg" : type === "document" ? "md" : language || "txt";
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `artifact.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openInNewTab = () => {
    const win = window.open("", "_blank");
    if (win) {
      if (type === "html" || type === "svg") {
        win.document.write(iframeHtml || content);
        win.document.close();
      } else {
        win.document.write(`<pre style="font-family:monospace;white-space:pre-wrap;padding:20px;background:#0a0a12;color:#e5e7eb;margin:0;min-height:100vh">${content.replace(/</g, "&lt;")}</pre>`);
        win.document.close();
      }
    }
  };

  // Build HTML for iframe — detect if content is already a full page
  const isFullPage = content.trim().toLowerCase().startsWith("<!doctype") || content.trim().toLowerCase().startsWith("<html");
  const iframeHtml = type === "html" || type === "svg"
    ? isFullPage
      ? content // Already a complete HTML page
      : `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0a0a12;color:#e5e7eb;padding:16px;min-height:100vh}a{color:#6382ff}button{cursor:pointer}</style></head><body>${content}</body></html>`
    : undefined;
  const iframeSrc = iframeHtml ? `data:text/html;charset=utf-8,${encodeURIComponent(iframeHtml)}` : undefined;

  const containerClass = fullscreen
    ? "fixed inset-0 z-[100] bg-background flex flex-col"
    : "rounded-2xl border border-white/[0.08] overflow-hidden my-3";

  return (
    <div className={containerClass}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
            {type === "html" || type === "svg" ? <Eye className="w-3 h-3 text-primary" /> :
             type === "document" ? <FileText className="w-3 h-3 text-primary" /> :
             <Code className="w-3 h-3 text-primary" />}
          </div>
          <span className="text-xs font-semibold text-foreground">{title || `Artifact`}</span>
          <Badge type={type} />
        </div>
        <div className="flex items-center gap-1">
          {(type === "html" || type === "svg") && (
            <div className="flex items-center border border-white/[0.06] rounded-lg overflow-hidden mr-1">
              <button onClick={() => setView("preview")} className={`px-2 py-1 text-[9px] font-medium ${view === "preview" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                <Eye className="w-3 h-3" />
              </button>
              <button onClick={() => setView("code")} className={`px-2 py-1 text-[9px] font-medium ${view === "code" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                <Code className="w-3 h-3" />
              </button>
            </div>
          )}
          <button onClick={copyContent} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04]" title="Copy">
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button onClick={downloadContent} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04]" title="Download">
            <Download className="w-3.5 h-3.5" />
          </button>
          <button onClick={openInNewTab} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04]" title="Open in new tab">
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setFullscreen(!fullscreen)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04]" title={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {fullscreen ? <X className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={fullscreen ? "flex-1 overflow-auto" : "max-h-[500px] overflow-auto"}>
        {view === "preview" && iframeSrc ? (
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            className="w-full border-0 bg-[#0a0a12]"
            style={{ minHeight: fullscreen ? "100%" : "500px", height: fullscreen ? "100%" : "500px" }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            title={title || "Artifact preview"}
          />
        ) : (
          <pre className="text-[11px] text-foreground/80 font-mono whitespace-pre-wrap break-words p-4 leading-relaxed bg-white/[0.01]">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}

function Badge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    html: "bg-orange-500/10 text-orange-400",
    svg: "bg-violet-500/10 text-violet-400",
    document: "bg-blue-500/10 text-blue-400",
    code: "bg-emerald-500/10 text-emerald-400",
  };
  return (
    <span className={`text-[8px] font-medium px-1.5 py-0.5 rounded ${colors[type] || colors.code}`}>
      {type.toUpperCase()}
    </span>
  );
}
