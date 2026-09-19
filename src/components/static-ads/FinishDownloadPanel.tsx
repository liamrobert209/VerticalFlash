"use client";

import { useState } from "react";
import type { StaticAdStatus } from "@/lib/static-ad-schema";

// Once a text overlay has been applied at least once (finalImage exists),
// this lets the graphics team mark the project done and grab the finished
// PNG. The image-serving route already works as a direct download source —
// no new route needed, just the `download` attribute.

export function FinishDownloadPanel({
  projectId,
  finalImage,
  status,
  onStatusChange,
}: {
  projectId: string;
  finalImage: string;
  status: StaticAdStatus;
  onStatusChange: (status: StaticAdStatus) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedIssues, setBlockedIssues] = useState<string[] | null>(null);
  const imageUrl = `/api/static-ads/${projectId}/image/${finalImage}`;

  const finish = async (force = false) => {
    setBusy(true);
    setError(null);
    if (!force) setBlockedIssues(null);
    try {
      const res = await fetch(`/api/static-ads/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "accepted", force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not finish this ad");
      if (data.blocked) {
        setBlockedIssues(data.issues ?? []);
        return;
      }
      onStatusChange(data.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish this ad");
    } finally {
      setBusy(false);
    }
  };

  if (status !== "accepted") {
    return (
      <div className="space-y-2">
        <button
          onClick={() => finish(false)}
          disabled={busy}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Checking…" : "Finished — mark ready to download ▸"}
        </button>
        {blockedIssues && (
          <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-500">Brand QA flagged this ad:</p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              {blockedIssues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
            <button
              onClick={() => finish(true)}
              disabled={busy}
              className="text-xs font-semibold text-amber-600 underline-offset-4 hover:underline disabled:opacity-50 dark:text-amber-500"
            >
              Accept anyway ▸
            </button>
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- served from this app's own static-ads directory, not an optimizable remote/static asset */}
      <img src={`${imageUrl}?t=${Date.now()}`} alt="Finished ad" className="w-full max-w-sm rounded-lg border border-border" />
      <a
        href={imageUrl}
        download={`${projectId}.png`}
        className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        Download PNG ▸
      </a>
    </div>
  );
}
