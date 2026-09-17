"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { AdWithAccount } from "@/lib/ads-schema";
import { AD_INTENT_LABELS } from "@/lib/ad-analysis-schema";
import { MediaThumb, adCreativeSrc } from "@/components/weekly-digest/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Ad = AdWithAccount;

interface CompetitorGroup {
  accountId: string | null;
  accountName: string | null;
  total: number;
  ads: Ad[];
}

interface ProductLineSection {
  productLineId: string;
  label: string;
  competitors: CompetitorGroup[];
}

interface DigestResponse {
  productLines: ProductLineSection[];
  ourAds: { accepted: unknown[]; discarded: unknown[]; drafts: unknown[] };
}

const PAGE_SIZE = 5;

function StaticAdCard({ ad }: { ad: Ad }) {
  return (
    <div className="w-56 shrink-0 rounded-lg border border-border overflow-hidden">
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
// (bounded by the API's PER_COMPETITOR_LIMIT), so paging is purely
// client-side — no extra network calls.
function CompetitorAdRow({ group }: { group: CompetitorGroup }) {
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

export default function WeeklyStaticAdsPage() {
  const [sections, setSections] = useState<ProductLineSection[]>([]);
  const [ourAds, setOurAds] = useState<DigestResponse["ourAds"] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/weekly-static-ads", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: DigestResponse) => {
        setSections(data.productLines ?? []);
        setOurAds(data.ourAds ?? null);
      })
      .catch(() => {
        setSections([]);
        setOurAds(null);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Weekly static ads</h1>
        <p className="max-w-2xl text-muted-foreground">
          Competitor static-image ad creative, one row per competitor, plus the static ads you&apos;ve generated in
          response. Only genuine static-image ads show here — video ads (even with a poster-frame thumbnail) live on{" "}
          <Link href="/weekly-ads" className="text-primary underline-offset-4 hover:underline">
            Weekly ads
          </Link>{" "}
          instead. Sync new ads from there.
        </p>
      </header>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {!loading && sections.every((s) => s.competitors.length === 0) && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No static competitor ads yet — sync some from{" "}
          <Link href="/weekly-ads" className="text-primary underline-offset-4 hover:underline">
            Weekly ads
          </Link>
          . Only ads with a genuine static image (not a video) will show up here.
        </p>
      )}

      {!loading &&
        sections
          .filter((s) => s.competitors.length > 0)
          .map((section) => (
            <section key={section.productLineId} className="space-y-4 rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {section.label}
              </h2>
              {section.competitors.map((group) => (
                <CompetitorAdRow key={group.accountId ?? "unknown"} group={group} />
              ))}
            </section>
          ))}

      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Our static ads this week
        </h2>
        {ourAds && ourAds.accepted.length + ourAds.discarded.length + ourAds.drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Coming soon — generate a static ad from a competitor reference above and it&apos;ll show up here.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Coming soon.</p>
        )}
      </section>
    </div>
  );
}
