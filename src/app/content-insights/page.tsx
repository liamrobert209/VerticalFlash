import { AccountInsightsBoard } from "@/components/insights/AccountInsightsBoard";

export default function ContentInsightsSummaryPage() {
  return (
    <AccountInsightsBoard
      title="Content insights"
      description="Per-account performance for your saved competitor brand accounts' organic content. Click a channel for the full breakdown."
      backHref="/content-insights"
      emptyStateHint="No content synced yet"
      channelHints={{
        facebook: "Real post + daily performance data",
        instagram: "Real post + daily performance data",
      }}
    />
  );
}
