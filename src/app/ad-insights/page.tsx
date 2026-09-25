import { redirect } from "next/navigation";

// Merged into /insights (Ads tab) — kept as a redirect so old links and
// bookmarks still land somewhere sensible.
export default function AdInsightsSummaryPage() {
  redirect("/insights?tab=ads");
}
