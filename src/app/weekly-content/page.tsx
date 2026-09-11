import { WeeklyContentBoard } from "@/components/weekly-digest/WeeklyContentBoard";

export default function WeeklyContentPage() {
  return (
    <WeeklyContentBoard
      title="Weekly content"
      description="Organic posts from your saved competitor brand accounts. One section per product, newest and top-performing."
      apiPath="/api/weekly-content"
      origin="ad"
      emptyStateHint="No content synced yet. Syncing organic content isn't wired up yet — check back once that's ready."
    />
  );
}
