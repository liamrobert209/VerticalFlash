import { WeeklyContentBoard } from "@/components/weekly-digest/WeeklyContentBoard";

export default function WeeklyCreatorsPage() {
  return (
    <WeeklyContentBoard
      title="Weekly creators"
      description="Organic posts from your saved creator/affiliate accounts. One section per product, newest and top-performing."
      apiPath="/api/weekly-creators"
      origin="creator"
      emptyStateHint="No creator content synced yet. Syncing organic content isn't wired up yet — check back once that's ready."
    />
  );
}
