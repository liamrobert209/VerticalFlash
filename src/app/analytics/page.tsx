import { redirect } from "next/navigation";

// Merged into /insights (Overview tab) — kept as a redirect so old links
// and bookmarks still land somewhere sensible.
export default function AnalyticsSummaryPage() {
  redirect("/insights");
}
