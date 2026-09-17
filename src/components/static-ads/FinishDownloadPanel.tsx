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
  const imageUrl = `/api/static-ads/${projectId}/image/${finalImage}`;

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/static-ads/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not finish this ad");
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
          onClick={finish}
          disabled={busy}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Finishing…" : "Finished — mark ready to download ▸"}
        </button>
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
