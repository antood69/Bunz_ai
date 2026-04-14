import { BarChart2 } from "lucide-react";

export default function AnalyticsStubPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
      <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center">
        <BarChart2 className="w-8 h-8 text-primary" />
      </div>
      <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
      <p className="text-muted-foreground text-sm">Coming soon</p>
    </div>
  );
}
