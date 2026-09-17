"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { StaticAdProject } from "@/lib/static-ad-schema";
import type { Ad } from "@/lib/ads-schema";
import { BaseImagePanel, type StaticAdBaseImage } from "@/components/static-ads/BaseImagePanel";
import { OverlayEditor, type StaticAdTextOverlay } from "@/components/static-ads/OverlayEditor";

export default function StaticAdProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<StaticAdProject | null>(null);
  const [referenceAd, setReferenceAd] = useState<Ad | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/static-ads/${projectId}`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((data: StaticAdProject) => {
        setProject(data);
        return fetch(`/api/ads/${data.referenceAdId}`)
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
              <img src={`/api/ads/${referenceAd.id}/creative`} alt="" className="size-16 rounded object-cover bg-muted" />
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

      <section className="rounded-lg border border-border p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Base image</h2>
        <BaseImagePanel
          projectId={project.id}
          baseImage={project.baseImage as StaticAdBaseImage}
          onUpdated={(baseImage) => setProject((p) => (p ? { ...p, baseImage: baseImage as StaticAdProject["baseImage"] } : p))}
        />
      </section>

      {project.baseImage.acceptedAttempt != null && (
        <section className="rounded-lg border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Text &amp; call to action
          </h2>
          <OverlayEditor
            projectId={project.id}
            initialOverlay={project.textOverlay as StaticAdTextOverlay | null}
            finalImage={project.finalImage}
            onApplied={({ textOverlay, finalImage }) =>
              setProject((p) =>
                p
                  ? { ...p, textOverlay: textOverlay as StaticAdProject["textOverlay"], finalImage }
                  : p
              )
            }
          />
        </section>
      )}
    </div>
  );
}
