import { useState } from "react";
import { Zap, Brain, Sparkles } from "lucide-react";

export type IntelligenceLevel = "entry" | "medium" | "max";

interface IntelligencePickerProps {
  value: IntelligenceLevel;
  onChange: (level: IntelligenceLevel) => void;
  compact?: boolean;
}

const LEVELS: Array<{
  id: IntelligenceLevel;
  label: string;
  icon: React.ElementType;
  description: string;
  color: string;
  activeColor: string;
}> = [
  {
    id: "entry",
    label: "Entry",
    icon: Zap,
    description: "Fast & cheap",
    color: "text-muted-foreground border-border hover:border-green-500/40 hover:text-green-400",
    activeColor: "text-green-400 border-green-500/50 bg-green-500/10",
  },
  {
    id: "medium",
    label: "Medium",
    icon: Brain,
    description: "Balanced",
    color: "text-muted-foreground border-border hover:border-blue-500/40 hover:text-blue-400",
    activeColor: "text-blue-400 border-blue-500/50 bg-blue-500/10",
  },
  {
    id: "max",
    label: "Max",
    icon: Sparkles,
    description: "Best quality",
    color: "text-muted-foreground border-border hover:border-purple-500/40 hover:text-purple-400",
    activeColor: "text-purple-400 border-purple-500/50 bg-purple-500/10",
  },
];

export default function IntelligencePicker({ value, onChange, compact }: IntelligencePickerProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {LEVELS.map((level) => {
          const Icon = level.icon;
          const isActive = value === level.id;
          return (
            <button
              key={level.id}
              onClick={() => onChange(level.id)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-medium transition-all ${
                isActive ? level.activeColor : level.color
              }`}
              title={`${level.label} — ${level.description}`}
            >
              <Icon className="w-3 h-3" />
              {level.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {LEVELS.map((level) => {
        const Icon = level.icon;
        const isActive = value === level.id;
        return (
          <button
            key={level.id}
            onClick={() => onChange(level.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
              isActive ? level.activeColor : level.color
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <div className="text-left">
              <div>{level.label}</div>
              <div className="text-[9px] opacity-60">{level.description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
