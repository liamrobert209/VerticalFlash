"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { StaticAdProject } from "@/lib/static-ad-schema";
import type { Ad } from "@/lib/ads-schema";
import { BaseImagePanel, type StaticAdBaseImage } from "@/components/static-ads/BaseImagePanel";
import { OverlayEditor, type StaticAdTextOverlay } from "@/components/static-ads/OverlayEditor";
import { FinishDownloadPanel } from "@/components/static-ads/FinishDownloadPanel";
import { CopyStep } from "@/components/static-ads/CopyStep";
import { WizardStepper, type WizardStep } from "@/components/static-ads/WizardStepper";

export default function StaticAdProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<StaticAdProject | null>(null);
  const [referenceAd, setReferenceAd] = useState<Ad | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Whether the Copy step has been explicitly moved past — starts true if
  // photo generation was already triggered before (attempts exist), so
  // reopening an in-progress project doesn't re-block it behind a step
  // that's already done.
  const [copyAcknowledged, setCopyAcknowledged] = useState(false);

  useEffect(() => {
    fetch(`/api/static-ads/${projectId}`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((data: StaticAdProject) => {
        setProject(data);
        setCopyAcknowledged(data.baseImage.attempts.length > 0);
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

  const hasPerson = !!referenceAd?.analysis?.hasPerson;
  const steps: WizardStep[] = [
    { label: "Brief", status: "done" },
    {
      label: "Copy",
      status: copyAcknowledged ? "done" : "current",
    },
    {
      label: hasPerson ? "Product + person placement" : "Product placement",
      status: !copyAcknowledged ? "upcoming" : project.baseImage.acceptedAttempt != null ? "done" : "current",
    },
    {
      label: "Brand skin & marks",
      status: project.baseImage.acceptedAttempt == null ? "upcoming" : project.finalImage ? "done" : "current",
    },
    {
      label: "Finish",
      status: !project.finalImage ? "upcoming" : project.status === "accepted" ? "done" : "current",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Static ad project</h1>
        <WizardStepper steps={steps} />
      </header>

      <section className="rounded-lg border border-border p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Reference ad</h2>
        {referenceAd ? (
          <div className="flex items-center gap-3">
            {referenceAd.creativeUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/ads/${referenceAd.id}/creative`} alt="" className="size-16 rounded object-cover bg-muted" />
            )}
            <div>
              <p className="text-sm text-foreground">{referenceAd.headline || referenceAd.bodyText || "(no headline)"}</p>
              {hasPerson && (
                <p className="text-xs text-muted-foreground">
                  Shows a person — {referenceAd.analysis?.personDescription}. An actor swap will be attempted if
                  reference photos exist in Settings → Actor images for this product line.
                </p>
              )}
            </div>
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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Copy</h2>
        <CopyStep
          projectId={project.id}
          headline={project.headline}
          subhead={project.subhead}
          cta={project.cta}
          acknowledged={copyAcknowledged}
          onRegenerated={(copy) => setProject((p) => (p ? { ...p, ...copy } : p))}
          onContinue={() => setCopyAcknowledged(true)}
        />
      </section>

      {copyAcknowledged && (
        <section className="rounded-lg border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {hasPerson ? "Product + person placement" : "Base image"}
          </h2>
          <BaseImagePanel
            projectId={project.id}
            baseImage={project.baseImage as StaticAdBaseImage}
            onUpdated={(update) =>
              setProject((p) =>
                p
                  ? {
                      ...p,
                      baseImage: update.baseImage as StaticAdProject["baseImage"],
                      // Present whenever the server invalidated a stale final
                      // image (switched/deleted the accepted photo) — absent
                      // (undefined) otherwise, in which case the existing
                      // value is left untouched via the ?? fallback.
                      finalImage: update.finalImage !== undefined ? update.finalImage : p.finalImage,
                      status: (update.status as StaticAdProject["status"]) ?? p.status,
                    }
                  : p
              )
            }
          />
        </section>
      )}

      {project.baseImage.acceptedAttempt != null && (
        <section className="rounded-lg border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Brand skin &amp; marks
          </h2>
          <OverlayEditor
            projectId={project.id}
            initialOverlay={project.textOverlay as StaticAdTextOverlay | null}
            initialCopy={{ headline: project.headline, subhead: project.subhead, cta: project.cta }}
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

      {project.finalImage && (
        <section className="rounded-lg border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Finish</h2>
          <FinishDownloadPanel
            projectId={project.id}
            finalImage={project.finalImage}
            status={project.status}
            onStatusChange={(status) => setProject((p) => (p ? { ...p, status } : p))}
          />
        </section>
      )}
    </div>
  );
}
