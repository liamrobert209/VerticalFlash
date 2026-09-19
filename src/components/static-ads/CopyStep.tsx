"use client";

import { useState } from "react";

// The wizard's "Copy" review step — a real pause point before any photo
// generation (its own AI cost) starts. The copy itself was already
// written automatically at project creation (static-ad-copy.ts); this is
// where the user actually sees it, can regenerate it, and explicitly
// continues rather than generation firing silently right after creation.

export interface CopyStepProps {
  projectId: string;
  headline: string;
  subhead: string;
  cta: string;
  // true once the user has moved past this step (or it was already past
  // when the project loaded, e.g. attempts already exist) — controls
  // whether "Continue" is shown vs. a plain "done" summary.
  acknowledged: boolean;
  onRegenerated: (copy: { headline: string; subhead: string; cta: string }) => void;
  onContinue: () => void;
}

export function CopyStep({ projectId, headline, subhead, cta, acknowledged, onRegenerated, onContinue }: CopyStepProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/static-ads/${projectId}/copy`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not write copy");
      onRegenerated({ headline: data.headline, subhead: data.subhead, cta: data.cta });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not write copy");
    } finally {
      setBusy(false);
    }
  };

  const hasCopy = !!(headline || subhead || cta);

  return (
    <div className="space-y-3">
      {hasCopy ? (
        <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-base font-semibold text-foreground">{headline || "(no headline)"}</p>
          <p className="text-sm text-muted-foreground">{subhead || "(no subhead)"}</p>
          <p className="text-sm font-semibold text-primary">{cta || "(no CTA)"}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No copy yet — this can happen if the automatic write-up failed. Generate it below.
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          onClick={regenerate}
          disabled={busy}
          className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
        >
          {busy ? "Writing…" : hasCopy ? "Regenerate" : "Generate copy"}
        </button>
        {!acknowledged && (
          <button
            onClick={onContinue}
            disabled={busy || !hasCopy}
            className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Continue — generate photos ▸
          </button>
        )}
        {acknowledged && <span className="text-xs text-muted-foreground">✓ Approved</span>}
      </div>
    </div>
  );
}
