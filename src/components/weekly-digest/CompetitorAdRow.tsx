"use client";

import { useState } from "react";
import Link from "next/link";
import type { AdWithAccount } from "@/lib/ads-schema";
import { AD_INTENT_LABELS } from "@/lib/ad-analysis-schema";
import { MediaThumb, adCreativeSrc } from "./shared";

// Extracted out of weekly-static-ads/page.tsx so Ad Insights' "suggested
// action" category pages can reuse the exact same per-competitor row/card
// shell instead of re-implementing it — no changes to the rendering logic
// itself, just made importable. MediaThumb/adCreativeSrc are already
// video-capable (image-then-video-fallback), so this works unmodified for
// the category pages' static+video mix, not just weekly-static-ads' static-
// only feed.

export interface CompetitorAdGroup {
  accountId: string | null;
  accountName: string | null;
  total: number;
  ads: AdWithAccount[];
}

// Ads within this window are prioritized for the initial view — everything
// older is real DB-stored data too (see the API route's PER_COMPETITOR_LIMIT
// comment), just tucked behind "Load More" so a long-running competitor
// doesn't turn every row into an endless scroll by default.
const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const LOAD_MORE_BATCH = 10;
// Hard ceiling on the initial render regardless of how many ads fall
// within the recent window — a prolific competitor can have 60+ ads in the
// last 30 days alone, and rendering all of them at once (real cards, real
// images) is exactly what was making Weekly Static Ads heavy to scroll.
// "Recent" now just decides PRIORITY within this cap, not an unbounded
// always-shown tier.
const INITIAL_VISIBLE = LOAD_MORE_BATCH;

// Same ordering signal the backend sorts by (coalesce(launch_date,
// first_seen_at)) — keeps "is this ad within the recent window" consistent
// with "which ad is newest" instead of using a different date per question.
function adTimestamp(ad: AdWithAccount): number {
  const raw = ad.launchDate ?? ad.firstSeenAt;
  return raw ? new Date(raw).getTime() : 0;
}

function StaticAdCard({ ad }: { ad: AdWithAccount }) {
  return (
    <div
      className="w-56 shrink-0 rounded-lg border border-border overflow-hidden"
      title={ad.analysis?.summary}
    >
      <MediaThumb url={adCreativeSrc(ad)} className="w-full aspect-square" showControls={false} />
      <div className="p-3 space-y-1.5">
        <p className="text-sm font-medium text-foreground line-clamp-2">
          {ad.headline || ad.bodyText || "(no headline)"}
        </p>
        {ad.analysis ? (
          <div className="space-y-1">
            <span className="inline-block rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
              {AD_INTENT_LABELS[ad.analysis.intent]}
            </span>
            <p className="text-xs text-muted-foreground line-clamp-2">
              <span className="font-semibold text-foreground">USP:</span> {ad.analysis.usp}
            </p>
            <p className="text-xs text-muted-foreground line-clamp-2">
              <span className="font-semibold text-foreground">Persona:</span> {ad.analysis.persona}
            </p>
            <p className="text-xs text-muted-foreground line-clamp-2">
              <span className="font-semibold text-foreground">Product:</span> {ad.analysis.productShown}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Analysis pending — will fill in on the next sync.</p>
        )}
        <Link
          href={`/create-static-ad?referenceAdId=${ad.id}${ad.productLineId ? `&productLineId=${ad.productLineId}` : ""}`}
          className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Create static ad from this ▸
        </Link>
      </div>
    </div>
  );
}

// One horizontal, scrollable row per competitor. Shows up to INITIAL_VISIBLE
// ads initially (favoring ones within the last 30 days when there are more
// than that many), then reveals the rest — recent or older, all real
// DB-stored history — in LOAD_MORE_BATCH-sized chunks via "Load More".
// Every ad for this competitor is already fetched (bounded by the API's
// per-competitor limit), so paging is purely client-side — no extra
// network calls, just fewer cards mounted in the DOM at once.
export function CompetitorAdRow({ group }: { group: CompetitorAdGroup }) {
  const cutoff = Date.now() - RECENT_WINDOW_MS;
  const recentCount = group.ads.filter((ad) => adTimestamp(ad) >= cutoff).length;
  const [visibleCount, setVisibleCount] = useState(Math.min(Math.max(recentCount, 1), INITIAL_VISIBLE));

  const visible = group.ads.slice(0, visibleCount);
  const remaining = group.ads.length - visibleCount;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{group.accountName ?? "Unknown brand"}</p>
        <span className="text-xs text-muted-foreground tabular-nums">
          {visible.length} of {group.total}
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {visible.map((ad) => (
          <StaticAdCard key={ad.id} ad={ad} />
        ))}
      </div>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => c + LOAD_MORE_BATCH)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
        >
          Load more ({remaining} more)
        </button>
      )}
    </div>
  );
}
