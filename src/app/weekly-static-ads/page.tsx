"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Ad } from "@/lib/ads-schema";
import type { AdIntent } from "@/lib/ad-analysis-schema";

interface IntentCount {
  intent: AdIntent;
  count: number;
}

interface ProductLineSection {
  productLineId: string;
  label: string;
  ads: Ad[];
  commonIntents: IntentCount[];
}

interface DigestResponse {
  productLines: ProductLineSection[];
  // Populated once Phase 4/5 land generated projects.
  ourAds: { accepted: unknown[]; discarded: unknown[]; drafts: unknown[] };
}

const INTENT_LABELS: Record<AdIntent, string> = {
  direct_response: "Direct response",
  brand_awareness: "Brand awareness",
  retargeting: "Retargeting",
  seasonal_promo: "Seasonal promo",
  product_launch: "Product launch",
  other: "Other",
};

function StaticAdCard({ ad }: { ad: Ad }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {ad.creativeUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ad.creativeUrl}
          alt={ad.headline ?? "Competitor static ad"}
          className="w-full aspect-square object-cover bg-muted"
          loading="lazy"
        />
      ) : (
        <div className="w-full aspect-square bg-muted" />
      )}
      <div className="p-3 space-y-1.5">
        <p className="text-sm font-medium text-foreground line-clamp-2">
          {ad.headline || ad.bodyText || "(no headline)"}
        </p>
        {ad.analysis ? (
          <div className="space-y-1">
            <span className="inline-block rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
              {INTENT_LABELS[ad.analysis.intent]}
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
          Competitor static-image ad creative, plus the static ads you&apos;ve generated in response. Only
          genuine static-image ads show here — video ads (even with a poster-frame thumbnail) live on{" "}
          <Link href="/weekly-ads" className="text-primary underline-offset-4 hover:underline">
            Weekly ads
          </Link>{" "}
          instead. Sync new ads from there.
        </p>
      </header>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {!loading && sections.every((s) => s.ads.length === 0) && (
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
          .filter((s) => s.ads.length > 0)
          .map((section) => (
            <section key={section.productLineId} className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.label}
                </h2>
                {section.commonIntents.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {section.commonIntents.map((c) => (
                      <span
                        key={c.intent}
                        className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {INTENT_LABELS[c.intent]} × {c.count}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {section.ads.map((ad) => (
                  <StaticAdCard key={ad.id} ad={ad} />
                ))}
              </div>
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
