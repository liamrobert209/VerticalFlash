import { redirect } from "next/navigation";

// Merged into /insights (Creators tab) — kept as a redirect so old links
// and bookmarks still land somewhere sensible.
export default function CreatorInsightsSummaryPage() {
  redirect("/insights?tab=creators");
}
