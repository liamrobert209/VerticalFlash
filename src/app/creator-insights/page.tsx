import { AccountInsightsBoard } from "@/components/insights/AccountInsightsBoard";

export default function CreatorInsightsSummaryPage() {
  return (
    <AccountInsightsBoard
      title="Creator insights"
      description="Per-account performance for your saved creator/affiliate accounts' organic content. Click a channel for the full breakdown."
      backHref="/creator-insights"
      emptyStateHint="No content synced yet"
    />
  );
}
