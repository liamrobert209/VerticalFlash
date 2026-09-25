import { redirect } from "next/navigation";

// Merged into /insights (Content tab) — kept as a redirect so old links
// and bookmarks still land somewhere sensible.
export default function ContentInsightsSummaryPage() {
  redirect("/insights?tab=content");
}
