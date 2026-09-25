import { redirect } from "next/navigation";

// Merged into /weekly-ads (Static ads tab) — kept as a redirect so old
// links and bookmarks still land somewhere sensible.
export default function WeeklyStaticAdsPage() {
  redirect("/weekly-ads?tab=static");
}
