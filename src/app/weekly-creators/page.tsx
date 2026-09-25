import { redirect } from "next/navigation";

// Merged into /weekly-content (Creator accounts tab) — kept as a redirect
// so old links and bookmarks still land somewhere sensible.
export default function WeeklyCreatorsPage() {
  redirect("/weekly-content?tab=creators");
}
