import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import type { AuditReview } from "@shared/schema";

const verdictConfig: Record<string, { icon: any; color: string; bg: string }> = {
  pass: { icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/15" },
  fail: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/15" },
  warning: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/15" },
};

export default function AuditPage() {
  const { data: reviews, isLoading } = useQuery<AuditReview[]>({
    queryKey: ["/api/audit-reviews"],
  });

  return (
    <div className="p-6 space-y-5 max-w-[1000px]">
      <div>
        <h1 className="text-xl font-semibold" data-testid="text-page-title">Auditor Panel</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Review AI-generated code and content before it ships</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-lg bg-card animate-pulse border border-border" />
          ))}
        </div>
      ) : !reviews?.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ShieldCheck className="w-12 h-12 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-1">No audit reviews yet</p>
          <p className="text-xs text-muted-foreground">When agents complete jobs, auditor agents will review them here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => {
            const cfg = verdictConfig[r.verdict] || verdictConfig.warning;
            const VerdictIcon = cfg.icon;
            return (
              <div
                key={r.id}
                data-testid={`audit-review-${r.id}`}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center ${cfg.bg}`}>
                    <VerdictIcon className={`w-4 h-4 ${cfg.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-sm font-medium capitalize ${cfg.color}`}>{r.verdict}</span>
                      <span className="text-[11px] text-muted-foreground">
                        Job #{r.jobId} · Agent #{r.agentId}
                      </span>
                    </div>
                    {r.notes && <p className="text-sm text-muted-foreground">{r.notes}</p>}
                    <p className="text-[11px] text-muted-foreground mt-2">
                      {r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
