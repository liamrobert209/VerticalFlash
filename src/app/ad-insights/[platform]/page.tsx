"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { findAnalyticsChannel } from "@/lib/analytics-channels";
import type { TagPerformance } from "@/lib/adnova-schema";
import type { Ad } from "@/lib/ads-schema";
import { SkeletonCardGrid } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

const ATTR_LABELS: Record<string, string> = {
  ad_angle: "Ad angle",
  asset_type: "Asset type",
  desire: "Desire",
  emotion: "Emotion",
  headline_tactic: "Headline tactic",
  hook_tactic: "Hook tactic",
  offer: "Offer",
  theme: "Theme",
  usp: "USP",
  visual_hook: "Visual hook",
};

interface AdInsightsResponse {
  adnovaAvailable: boolean;
  adnovaError?: string;
  tagPerformance: Record<string, TagPerformance[]>;
  categories: string[];
  competitorAds: Ad[];
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function AdInsightsChannelPage({
  params,
}: {
  params: Promise<{ platform: string }>;
}) {
  const { platform } = use(params);
  const channel = findAnalyticsChannel(platform);

  const [data, setData] = useState<AdInsightsResponse | null>(null);
  const [category, setCategory] = useState("");
  const [categoryResolved, setCategoryResolved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = category ? `?category=${encodeURIComponent(category)}` : "";
    fetch(`/api/ad-insights/${platform}${qs}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((result: AdInsightsResponse) => {
        // Default to the pipeline's own "All Categories" aggregate rather
        // than leaving the filter empty — an empty filter mixes each
        // category's independent #1-ranked tag together (every category
        // has its own rank 1, 2, 3...), which reads as a single coherent
        // top-5 list but isn't one. Don't render the unfiltered response
        // at all while that default is still being resolved, so there's
        // no flash of the mixed-up version first.
        if (!categoryResolved && !category && result.categories.includes("All Categories")) {
          setCategoryResolved(true);
          setCategory("All Categories");
          return;
        }
        setCategoryResolved(true);
        setData(result);
      })
      .catch(() => {
        setCategoryResolved(true);
        setData({ adnovaAvailable: false, tagPerformance: {}, categories: [], competitorAds: [] });
      })
      .finally(() => setLoading(false));
  }, [platform, category, categoryResolved]);

  if (!channel) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:p-10">
        <p className="text-sm text-muted-foreground">Unknown channel.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <Link href="/ad-insights" className="text-sm text-muted-foreground hover:text-foreground">
          ← Ad insights
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{channel.label} ad insights</h1>
      </header>

      {loading && <SkeletonCardGrid />}

      {!loading && data && (
        <>
          {data.adnovaAvailable ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground">Product category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {data.categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {Object.entries(data.tagPerformance).map(([attr, tags]) => (
                  <div key={attr} className="rounded-lg border border-border p-3 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {ATTR_LABELS[attr] ?? attr}
                    </p>
                    <div className="space-y-1.5">
                      {tags.map((t) => (
                        <div key={`${attr}-${t.productCategory}-${t.rank}`} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate text-foreground" title={t.tagValue}>
                            {t.tagValue}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {t.roas != null ? `${t.roas.toFixed(2)}x ROAS` : "—"} · {formatMoney(t.spend)} spend
                          </span>
                        </div>
                      ))}
                      {tags.length === 0 && <p className="text-xs text-muted-foreground">No data.</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState icon={Megaphone} title={data.adnovaError ?? "No tagged ad performance data for this channel."} />
          )}

          <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Recent competitor activity
            </h2>
            {data.competitorAds.length === 0 ? (
              <EmptyState icon={Megaphone} title="No competitor ads synced for this channel yet" />
            ) : (
              <div className="space-y-2">
                {data.competitorAds.map((ad) => (
                  <div key={ad.id} className="rounded-lg border border-border p-3">
                    <p className="text-sm font-medium text-foreground line-clamp-1">
                      {ad.headline || ad.bodyText || "(no headline)"}
                    </p>
                    {ad.launchDate && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        launched {new Date(ad.launchDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
