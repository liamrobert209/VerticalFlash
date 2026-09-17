"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

const PAGE_SIZE = 5;

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

// One horizontal row per competitor, paged in fixed PAGE_SIZE increments
// (not smooth-scroll) so the "showing X-Y of Z" label always matches
// exactly what's in view. Every ad for this competitor is already fetched
// (bounded by the API's per-competitor limit), so paging is purely
// client-side — no extra network calls.
export function CompetitorAdRow({ group }: { group: CompetitorAdGroup }) {
  const [page, setPage] = useState(0);
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, group.ads.length);
  const canPrev = page > 0;
  const canNext = end < group.ads.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{group.accountName ?? "Unknown brand"}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {start + 1}–{end} of {group.total}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p - 1)}
            disabled={!canPrev}
            aria-label="Previous"
            className="flex size-6 items-center justify-center rounded-full border border-border hover:bg-muted disabled:opacity-30"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={!canNext}
            aria-label="Next"
            className="flex size-6 items-center justify-center rounded-full border border-border hover:bg-muted disabled:opacity-30"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {group.ads.slice(start, end).map((ad) => (
          <StaticAdCard key={ad.id} ad={ad} />
        ))}
      </div>
    </div>
  );
}
