"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CompetitorAdRow, type CompetitorAdGroup } from "@/components/weekly-digest/CompetitorAdRow";

interface ProductLineSection {
  productLineId: string;
  label: string;
  competitors: CompetitorAdGroup[];
}

interface DigestResponse {
  productLines: ProductLineSection[];
  ourAds: { accepted: unknown[]; discarded: unknown[]; drafts: unknown[] };
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
