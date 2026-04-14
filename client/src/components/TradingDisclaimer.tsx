import { useState, useEffect } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

export function TradingDisclaimerBanner() {
  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4 flex items-start gap-2">
      <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
      <div className="text-sm">
        <p className="font-medium text-yellow-500">Risk Disclaimer</p>
        <p className="text-muted-foreground text-xs mt-1">
          Trading involves substantial risk of loss. Past performance does not guarantee future results.
          Only trade with funds you can afford to lose. Bunz provides tools, not financial advice.
          You are solely responsible for your trading decisions.
        </p>
      </div>
    </div>
  );
}

export function TradingDisclaimerModal() {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest("GET", "/api/preferences");
        const prefs = await res.json();
        if (!prefs.tradingDisclaimerAck) {
          setShow(true);
        }
      } catch {
        // If preferences fail, show modal to be safe
        setShow(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const acknowledge = async () => {
    try {
      await apiRequest("PUT", "/api/preferences", { tradingDisclaimerAck: 1 });
    } catch {
      // Proceed even if save fails
    }
    setShow(false);
  };

  if (loading || !show) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-6 max-w-md mx-4 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-yellow-500/15">
            <ShieldAlert className="w-6 h-6 text-yellow-500" />
          </div>
          <h2 className="text-lg font-bold">Trading Risk Acknowledgment</h2>
        </div>
        <div className="text-sm text-muted-foreground space-y-3 mb-6">
          <p>
            Before accessing trading features, please acknowledge the following:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Trading involves substantial risk of loss and is not suitable for every investor.</li>
            <li>Past performance does not guarantee future results.</li>
            <li>You should only trade with funds you can afford to lose.</li>
            <li>Bunz provides tools and automation, <strong>not financial advice</strong>.</li>
            <li>You are solely responsible for all trading decisions.</li>
          </ul>
        </div>
        <Button onClick={acknowledge} className="w-full">
          I Understand and Accept the Risks
        </Button>
      </div>
    </div>
  );
}
