import Link from "next/link";
import { ANALYTICS_CHANNELS } from "@/lib/analytics-channels";
import { BudgetSpendPanel } from "@/components/insights/BudgetSpendPanel";

const ADNOVA_PLATFORMS = new Set(["facebook", "instagram"]);

export default function AdInsightsSummaryPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Ad insights</h1>
        <p className="max-w-2xl text-muted-foreground">
          Best-performing hooks, USPs, and formats from our own ad campaigns, plus what competitors are currently running. Click a channel for its full breakdown.
        </p>
      </header>

      <BudgetSpendPanel />

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {ANALYTICS_CHANNELS.map((channel) => (
          <Link
            key={channel.id}
            href={`/ad-insights/${channel.id}`}
            className="rounded-lg border border-border p-4 transition-colors hover:border-primary/60 hover:bg-muted/40"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-foreground">{channel.label}</p>
              {!ADNOVA_PLATFORMS.has(channel.id) && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                  Competitor ads only
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {ADNOVA_PLATFORMS.has(channel.id)
                ? "Our own tagged ad performance + competitor activity"
                : "No tagged performance data — competitor activity only"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
