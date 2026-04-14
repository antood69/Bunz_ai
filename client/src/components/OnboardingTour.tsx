import { useState, useEffect, useCallback } from "react";
import { MessageSquare, GitBranch, Package, Settings, X, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TourStep {
  title: string;
  description: string;
  targetSelector: string;
  icon: React.ElementType;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to Bunz!",
    description: "Your AI agent orchestration platform. Let's take a quick tour of the key features.",
    targetSelector: "[data-testid='nav-dashboard']",
    icon: Sparkles,
  },
  {
    title: "Chat with Boss",
    description: "Your AI command center. Ask Boss to create workflows, manage agents, or get help with anything.",
    targetSelector: "[data-testid='nav-chat']",
    icon: MessageSquare,
  },
  {
    title: "Build Workflows",
    description: "Chain AI agents together into powerful workflows. Use the visual editor or card view to design your pipelines.",
    targetSelector: "[data-testid='nav-workflows']",
    icon: GitBranch,
  },
  {
    title: "Browse the Workshop",
    description: "Discover and install add-ons, templates, and mods to extend your workspace.",
    targetSelector: "[data-testid='nav-workshop']",
    icon: Package,
  },
  {
    title: "Customize in Settings",
    description: "Personalize your experience — themes, wallpapers, AI preferences, connectors, and more.",
    targetSelector: "[data-testid='nav-settings']",
    icon: Settings,
  },
];

const PREFS_KEY = "bunz-onboarding-seen";

export default function OnboardingTour() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    // Check if user has already seen onboarding
    try {
      const seen = localStorage.getItem(PREFS_KEY);
      if (seen === "true") return;
    } catch {
      // localStorage unavailable, show tour anyway
    }

    // Also check server-side preferences
    (async () => {
      try {
        const res = await fetch("/api/preferences", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.hasSeenOnboarding) {
            localStorage.setItem(PREFS_KEY, "true");
            return;
          }
        }
      } catch {
        // ignore
      }
      // Small delay so the sidebar has rendered
      setTimeout(() => setIsVisible(true), 800);
    })();
  }, []);

  // Update spotlight position when step changes
  useEffect(() => {
    if (!isVisible) return;
    const step = TOUR_STEPS[currentStep];
    const el = document.querySelector(step.targetSelector);
    if (el) {
      const rect = el.getBoundingClientRect();
      setSpotlightRect(rect);
    } else {
      setSpotlightRect(null);
    }
  }, [currentStep, isVisible]);

  const completeTour = useCallback(async () => {
    setIsVisible(false);
    localStorage.setItem(PREFS_KEY, "true");
    // Save to server preferences
    try {
      const res = await fetch("/api/preferences", { credentials: "include" });
      if (res.ok) {
        const existing = await res.json();
        await fetch("/api/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ...existing, hasSeenOnboarding: true }),
        });
      }
    } catch {
      // ignore
    }
  }, []);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeTour();
    }
  };

  const handleSkip = () => {
    if (dontShowAgain) {
      completeTour();
    } else {
      setIsVisible(false);
      localStorage.setItem(PREFS_KEY, "true");
    }
  };

  if (!isVisible) return null;

  const step = TOUR_STEPS[currentStep];
  const StepIcon = step.icon;
  const isLastStep = currentStep === TOUR_STEPS.length - 1;

  // Calculate tooltip position relative to the spotlight
  const tooltipStyle: React.CSSProperties = {};
  if (spotlightRect) {
    tooltipStyle.position = "fixed";
    tooltipStyle.left = spotlightRect.right + 16;
    tooltipStyle.top = spotlightRect.top - 8;
    tooltipStyle.zIndex = 10002;

    // If tooltip would go off-screen right, position below instead
    if (spotlightRect.right + 16 + 320 > window.innerWidth) {
      tooltipStyle.left = Math.max(16, spotlightRect.left);
      tooltipStyle.top = spotlightRect.bottom + 12;
    }
  } else {
    // Fallback: center
    tooltipStyle.position = "fixed";
    tooltipStyle.left = "50%";
    tooltipStyle.top = "50%";
    tooltipStyle.transform = "translate(-50%, -50%)";
    tooltipStyle.zIndex = 10002;
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[10000] transition-opacity"
        style={{ background: "rgba(0,0,0,0.6)" }}
        onClick={handleSkip}
      />

      {/* Spotlight cutout */}
      {spotlightRect && (
        <div
          className="fixed z-[10001] rounded-lg transition-all duration-300 pointer-events-none"
          style={{
            left: spotlightRect.left - 4,
            top: spotlightRect.top - 4,
            width: spotlightRect.width + 8,
            height: spotlightRect.height + 8,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6), 0 0 16px 4px hsl(var(--primary) / 0.4)",
            background: "transparent",
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className="w-[300px] rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in-0 slide-in-from-left-2"
        style={tooltipStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Step indicator */}
        <div className="flex items-center gap-1.5 px-4 pt-3">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full flex-1 transition-colors ${
                i <= currentStep ? "bg-primary" : "bg-border"
              }`}
            />
          ))}
        </div>

        <div className="p-4">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <StepIcon className="w-4 h-4 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mb-4">{step.description}</p>

          {/* Don't show again checkbox */}
          <label className="flex items-center gap-2 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-border accent-primary"
            />
            <span className="text-[11px] text-muted-foreground">Don't show again</span>
          </label>

          <div className="flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip tour
            </button>
            <Button size="sm" className="gap-1.5 text-xs" onClick={handleNext}>
              {isLastStep ? "Get Started" : "Next"}
              {!isLastStep && <ChevronRight className="w-3 h-3" />}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
