"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { StaticAdProject } from "@/lib/static-ad-schema";
import type { Ad } from "@/lib/ads-schema";

export default function StaticAdProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<StaticAdProject | null>(null);
  const [referenceAd, setReferenceAd] = useState<Ad | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    // Loaded via the list endpoint filtered client-side rather than a
    // dedicated GET /api/static-ads/[id] — that route lands in Phase 5
    // alongside generate/refine/accept, which all need to look the
    // project up anyway.
    fetch(`/api/static-ads`)
      .then((res) => res.json())
      .then((data) => {
        const found = (data.projects ?? []).find((p: StaticAdProject) => p.id === projectId);
        if (!found) {
          setNotFound(true);
          return;
        }
        setProject(found);
        return fetch(`/api/ads/${found.referenceAdId}`)
          .then((res) => res.json())
          .then((ad) => setReferenceAd(ad?.id ? ad : null));
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;
  if (notFound || !project) {
    return (
      <div className="p-10 text-sm text-muted-foreground">
        Project not found. <Link href="/create-static-ad" className="text-primary underline-offset-4 hover:underline">Start a new one</Link>.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Static ad project</h1>
        <p className="text-sm text-muted-foreground">
          Status: <span className="font-semibold text-foreground">{project.status}</span>
        </p>
      </header>

      <section className="rounded-lg border border-border p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Reference ad</h2>
        {referenceAd ? (
          <div className="flex items-center gap-3">
            {referenceAd.creativeUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={referenceAd.creativeUrl} alt="" className="size-16 rounded object-cover bg-muted" />
            )}
            <p className="text-sm text-foreground">{referenceAd.headline || referenceAd.bodyText || "(no headline)"}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Reference ad unavailable.</p>
        )}
      </section>

      <section className="rounded-lg border border-border p-4 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Our USP</h2>
        <p className="text-sm text-foreground">{project.ourUsp}</p>
      </section>

      <section className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Generation coming soon — this is where you&apos;ll generate the photographic base image and refine it.
      </section>
    </div>
  );
}
