import { useState } from "react";
import { Check, Zap, Building2, Sparkles, ArrowRight, ChevronDown, ChevronUp, Loader2, Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

const tiers = [
  {
    id: "free",
    name: "Free",
    price: { monthly: 0, annual: 0 },
    description: "Try AI orchestration for free",
    icon: Sparkles,
    color: "text-muted-foreground",
    accent: "border-border",
    iconBg: "bg-secondary",
    buttonClass: "",
    popular: false,
    features: [
      "3K tokens / month",
      "Entry-level models only",
      "Boss Chat",
      "1 workflow",
      "Dashboard",
      "Community support",
    ],
    cta: "Current Plan",
    current: true,
  },
  {
    id: "starter",
    name: "Starter",
    price: { monthly: 12, annual: 9 },
    description: "For individuals building AI workflows",
    icon: Zap,
    color: "text-emerald-500",
    accent: "border-emerald-500/40",
    iconBg: "bg-emerald-500/15",
    buttonClass: "bg-emerald-600 hover:bg-emerald-700 text-white border-0",
    popular: false,
    features: [
      "40K tokens / month",
      "Entry + Medium models",
      "Boss Chat + all departments",
      "5 workflows",
      "Code Editor",
      "Obsidian auto-save",
      "$5 / 5K overage packs",
      "Email support",
    ],
    cta: "Upgrade to Starter",
    current: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: { monthly: 39, annual: 29 },
    description: "Full power for serious builders",
    icon: Zap,
    color: "text-primary",
    accent: "border-primary",
    iconBg: "bg-primary/15",
    buttonClass: "",
    popular: true,
    features: [
      "200K tokens / month",
      "All models (Entry/Medium/Max)",
      "Unlimited workflows",
      "Unlimited bots",
      "GitHub integration",
      "RAG knowledge base",
      "$5 / 10K overage packs",
      "Priority support",
    ],
    cta: "Upgrade to Pro",
    current: false,
  },
  {
    id: "agency",
    name: "Agency",
    price: { monthly: 99, annual: 79 },
    description: "For teams and client work",
    icon: Building2,
    color: "text-violet-500",
    accent: "border-violet-500",
    iconBg: "bg-violet-500/15",
    buttonClass: "bg-violet-600 hover:bg-violet-700 text-white border-0",
    popular: false,
    features: [
      "800K tokens / month",
      "All models + priority queue",
      "Unlimited everything",
      "Team seats (up to 10)",
      "White-label branding",
      "All connectors",
      "$5 / 20K overage packs",
      "Dedicated support",
    ],
    cta: "Go Agency",
    current: false,
  },
];

const faqs = [
  {
    q: "What are tokens?",
    a: "Tokens are the units that power AI calls in Cortal. Each message sent to an AI model consumes tokens based on the length of input and output. Your plan includes a monthly token allowance, and you can buy additional token packs anytime.",
  },
  {
    q: "Can I switch plans at any time?",
    a: "Yes — upgrades take effect immediately and you're billed the prorated difference. Downgrades apply at the end of your billing cycle.",
  },
  {
    q: "What happens when I hit my token limit?",
    a: "You'll see a clear in-app warning before you hit limits. You can buy additional token packs from the Usage page to continue without interruption.",
  },
  {
    q: "Do unused tokens carry over?",
    a: "Monthly token allocations reset each billing cycle. Token packs you purchase do not expire — they carry forward until depleted.",
  },
  {
    q: "What's white-label?",
    a: "Agency plan lets you remove Cortal branding and replace it with your own logo and colors — great for client deployments.",
  },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="mt-16 max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold text-foreground text-center mb-6">Frequently asked questions</h2>
      <div className="space-y-2">
        {faqs.map((faq, i) => (
          <div key={i} className="border border-border rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-secondary/50 transition-colors text-left"
              onClick={() => setOpen(open === i ? null : i)}
            >
              {faq.q}
              {open === i ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-3" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-3" />
              )}
            </button>
            {open === i && (
              <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
                {faq.a}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: tokenStatus } = useQuery<any>({ queryKey: ["/api/tokens/status"] });
  const plan = tokenStatus?.plan;

  const params = new URLSearchParams(window.location.search);
  const checkoutSuccess = params.get("success") === "1";
  const checkoutCanceled = params.get("canceled") === "1";

  async function handleUpgrade(tierId: string) {
    if (tierId === "free") return;
    const billing = annual ? "annual" : "monthly";
    setLoadingTier(tierId);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tierId, billing }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      window.location.href = data.url;
    } catch (err: any) {
      toast({ title: "Checkout error", description: err.message || "Something went wrong.", variant: "destructive" });
      setLoadingTier(null);
    }
  }

  const currentTier = plan?.tier || "free";
  const tokensUsed = plan?.tokensUsed || 0;
  const tokensLimit = plan?.monthlyTokens || 3000;

  return (
    <div className="min-h-full p-3 sm:p-4 pb-20 page-enter">

      {checkoutSuccess && (
        <div className="mb-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-500 text-center">
          Subscription activated! Welcome to Cortal — let's get it.
        </div>
      )}
      {checkoutCanceled && (
        <div className="mb-6 rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm text-orange-400 text-center">
          Checkout was canceled — no charge was made. Upgrade whenever you're ready.
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-xl font-bold text-foreground mb-2">Simple, transparent pricing</h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Start free. Scale as your AI workforce grows. No hidden fees.
        </p>

        {/* Billing toggle */}
        <div className="inline-flex items-center gap-3 mt-5 bg-secondary/60 rounded-full px-4 py-2 border border-border">
          <button
            className={`text-sm font-medium transition-colors ${!annual ? "text-foreground" : "text-muted-foreground"}`}
            onClick={() => setAnnual(false)}
          >
            Monthly
          </button>
          <button
            role="switch"
            aria-checked={annual}
            onClick={() => setAnnual(!annual)}
            className={`relative w-10 h-5 rounded-full transition-colors ${annual ? "bg-primary" : "bg-border"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${annual ? "translate-x-5" : "translate-x-0"}`} />
          </button>
          <button
            className={`text-sm font-medium transition-colors flex items-center gap-1.5 ${annual ? "text-foreground" : "text-muted-foreground"}`}
            onClick={() => setAnnual(true)}
          >
            Annual
            <span className="text-[11px] font-semibold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
              Save 20%
            </span>
          </button>
        </div>
      </div>

      {/* Tier cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {tiers.map((tier) => {
          const Icon = tier.icon;
          const price = annual ? tier.price.annual : tier.price.monthly;
          const isLoading = loadingTier === tier.id;
          const isCurrent = tier.id === currentTier;

          return (
            <div
              key={tier.id}
              className={`relative rounded-2xl border-2 ${tier.accent} bg-card p-6 flex flex-col transition-all hover:shadow-lg hover:shadow-primary/5 ${
                tier.popular ? "ring-1 ring-primary/20" : ""
              }`}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground text-[11px] px-2.5 py-0.5 shadow-md">
                    Most Popular
                  </Badge>
                </div>
              )}

              {/* Tier header */}
              <div className="flex items-center gap-2 mb-3">
                <div className={`p-1.5 rounded-xl ${tier.iconBg}`}>
                  <Icon className={`w-4 h-4 ${tier.color}`} />
                </div>
                <span className="font-semibold text-sm text-foreground">{tier.name}</span>
              </div>

              {/* Price */}
              <div className="mb-1">
                <span className="text-3xl font-bold text-foreground tabular-nums">${price}</span>
                {price > 0 && <span className="text-muted-foreground text-sm ml-1">/mo</span>}
              </div>
              {price > 0 && annual && (
                <p className="text-[11px] text-muted-foreground mb-3">
                  Billed ${price * 12}/yr · saves ${(tier.price.monthly - price) * 12}/yr
                </p>
              )}
              <p className="text-xs text-muted-foreground mb-4 mt-1">{tier.description}</p>

              {/* CTA */}
              <Button
                variant={isCurrent ? "outline" : tier.popular ? "default" : "secondary"}
                className={`w-full mb-5 text-sm ${!isCurrent ? tier.buttonClass : ""}`}
                disabled={isCurrent || isLoading}
                onClick={() => handleUpgrade(tier.id)}
              >
                {isCurrent ? (
                  "Current Plan"
                ) : isLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  <>
                    {tier.cta}
                    <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </>
                )}
              </Button>

              {/* Divider */}
              <div className="border-t border-border mb-4" />

              {/* Feature list */}
              <ul className="space-y-2 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Check className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${tier.color}`} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Usage summary */}
      <div className="mt-8 rounded-2xl border border-border bg-card px-6 py-5 flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-8">
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground mb-0.5">Your current usage</p>
          <p className="text-xs text-muted-foreground capitalize">{currentTier} tier — tracked against your plan limits</p>
        </div>
        <div className="flex flex-wrap gap-6">
          {(() => {
            const pct = Math.min((tokensUsed / tokensLimit) * 100, 100);
            const danger = pct >= 80;
            const usedStr = tokensUsed >= 1000 ? `${(tokensUsed / 1000).toFixed(1)}K` : String(tokensUsed);
            const limitStr = tokensLimit >= 1000 ? `${(tokensLimit / 1000).toFixed(0)}K` : String(tokensLimit);
            return (
              <div className="min-w-[160px]">
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-muted-foreground">Tokens</span>
                  <span className={`font-medium tabular-nums ${danger ? "text-orange-500" : "text-foreground"}`}>
                    {usedStr} / {limitStr}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${danger ? "bg-orange-500" : "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })()}
        </div>
        <div className="flex gap-2">
          <Link href="/usage">
            <Button variant="outline" size="sm" className="text-xs flex-shrink-0">
              <Coins className="w-3 h-3 mr-1" />
              Buy Tokens
            </Button>
          </Link>
          {currentTier === "free" && (
            <Button variant="default" size="sm" className="text-xs flex-shrink-0" onClick={() => handleUpgrade("pro")}>
              Upgrade <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          )}
        </div>
      </div>

      <FAQ />
    </div>
  );
}
