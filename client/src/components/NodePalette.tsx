import React, { useState } from "react";
import {
  Play, Zap, Clock, Bell, Brain, Code, Pen, Shield, BarChart3,
  GitBranch, Merge, Timer, Repeat, ArrowRight, File, Send, Workflow,
  ChevronDown, ChevronRight, GripVertical, PanelLeftClose, PanelLeft,
  Palette, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Palette item data ────────────────────────────────────────────────────────

interface PaletteItem {
  type: string;
  subtype: string;
  label: string;
  icon: React.ElementType;
}

interface PaletteSection {
  title: string;
  color: string;
  items: PaletteItem[];
}

const SECTIONS: PaletteSection[] = [
  {
    title: "Triggers",
    color: "text-emerald-400",
    items: [
      { type: "trigger", subtype: "manual", label: "Manual", icon: Play },
      { type: "trigger", subtype: "webhook", label: "Webhook", icon: Zap },
      { type: "trigger", subtype: "schedule", label: "Schedule", icon: Clock },
      { type: "trigger", subtype: "event", label: "Event", icon: Bell },
    ],
  },
  {
    title: "Agents",
    color: "text-blue-400",
    items: [
      { type: "agent", subtype: "researcher", label: "Researcher", icon: Brain },
      { type: "agent", subtype: "coder", label: "Coder", icon: Code },
      { type: "agent", subtype: "writer", label: "Writer", icon: Pen },
      { type: "agent", subtype: "reviewer", label: "Reviewer", icon: Shield },
      { type: "agent", subtype: "analyst", label: "Analyst", icon: BarChart3 },
      { type: "agent", subtype: "artgen", label: "Art Gen", icon: Palette },
      { type: "agent", subtype: "browser", label: "Browser", icon: Globe },
    ],
  },
  {
    title: "Logic",
    color: "text-purple-400",
    items: [
      { type: "logic", subtype: "if_else", label: "If / Else", icon: GitBranch },
      { type: "logic", subtype: "switch", label: "Switch", icon: GitBranch },
      { type: "logic", subtype: "merge", label: "Merge", icon: Merge },
      { type: "logic", subtype: "delay", label: "Delay", icon: Timer },
      { type: "logic", subtype: "loop", label: "Loop", icon: Repeat },
    ],
  },
  {
    title: "Output",
    color: "text-teal-400",
    items: [
      { type: "output", subtype: "return", label: "Return", icon: ArrowRight },
      { type: "output", subtype: "save_file", label: "Save File", icon: File },
      { type: "output", subtype: "post", label: "Post", icon: Send },
      { type: "output", subtype: "trigger_workflow", label: "Trigger Workflow", icon: Workflow },
    ],
  },
];

// ── Palette Section Component ────────────────────────────────────────────────

function PaletteSectionGroup({
  section,
  defaultOpen = true,
}: {
  section: PaletteSection;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const onDragStart = (e: React.DragEvent, item: PaletteItem) => {
    e.dataTransfer.setData(
      "application/reactflow",
      JSON.stringify({ type: item.type, subtype: item.subtype })
    );
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div>
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-secondary/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
        <span className={section.color}>{section.title}</span>
      </button>
      {open && (
        <div className="pb-1">
          {section.items.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={`${item.type}-${item.subtype}`}
                draggable
                onDragStart={(e) => onDragStart(e, item)}
                className="flex items-center gap-2.5 px-3 py-1.5 mx-1.5 rounded-md cursor-grab active:cursor-grabbing hover:bg-secondary/70 transition-colors group"
              >
                <GripVertical className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors flex-shrink-0" />
                <div className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                  <Icon className={`w-3 h-3 ${section.color}`} />
                </div>
                <span className="text-xs text-foreground">{item.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Palette Component ───────────────────────────────────────────────────

interface NodePaletteProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export default function NodePalette({ collapsed = false, onToggle }: NodePaletteProps) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={onToggle}
        >
          <PanelLeft className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-[240px] flex flex-col h-full border-r border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-xs font-medium text-foreground">Node Palette</span>
        {onToggle && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onToggle}
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto py-1">
        {SECTIONS.map((section) => (
          <PaletteSectionGroup key={section.title} section={section} />
        ))}
      </div>

      {/* Hint */}
      <div className="px-3 py-2 border-t border-border">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Drag nodes onto the canvas to build your workflow.
        </p>
      </div>
    </div>
  );
}
