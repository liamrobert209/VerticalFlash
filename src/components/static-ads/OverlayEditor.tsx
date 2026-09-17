"use client";

import { useState } from "react";

// Mirrors static-ad-overlays-schema.ts (kept local, matching this
// component tree's convention of not importing the schema module directly
// into the client bundle).
export type OverlayRole = "headline" | "subhead" | "cta";
export type OverlayPosition = "top" | "center" | "bottom";

export interface StaticAdOverlayElement {
  role: OverlayRole;
  text: string;
  include: boolean;
  position: OverlayPosition;
}

export interface StaticAdTextOverlay {
  elements: StaticAdOverlayElement[];
}

const ROLE_LABELS: Record<OverlayRole, string> = {
  headline: "Headline",
  subhead: "Subhead",
  cta: "Call to action",
};

const POSITIONS: OverlayPosition[] = ["top", "center", "bottom"];

function defaultOverlay(): StaticAdTextOverlay {
  return {
    elements: [
      { role: "headline", text: "", include: false, position: "top" },
      { role: "subhead", text: "", include: false, position: "top" },
      { role: "cta", text: "Shop now", include: false, position: "bottom" },
    ],
  };
}

export interface OverlayEditorProps {
  projectId: string;
  initialOverlay: StaticAdTextOverlay | null;
  finalImage: string | null;
  onApplied: (project: { textOverlay: StaticAdTextOverlay; finalImage: string }) => void;
}

export function OverlayEditor({ projectId, initialOverlay, finalImage, onApplied }: OverlayEditorProps) {
  const [overlay, setOverlay] = useState<StaticAdTextOverlay>(initialOverlay ?? defaultOverlay());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateElement = (role: OverlayRole, patch: Partial<StaticAdOverlayElement>) => {
    setOverlay((prev) => ({
      elements: prev.elements.map((el) => (el.role === role ? { ...el, ...patch } : el)),
    }));
  };

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/static-ads/${projectId}/overlay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overlay),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Applying the overlay failed");
      onApplied({ textOverlay: data.textOverlay, finalImage: data.finalImage });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Applying the overlay failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {finalImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/static-ads/${projectId}/image/${finalImage}?t=${Date.now()}`}
          alt="Final ad with overlay"
          className="w-full max-w-sm rounded-lg border border-border"
        />
      )}

      {overlay.elements.map((el) => (
        <div key={el.role} className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 w-8 shrink-0">
            <input
              type="checkbox"
              checked={el.include}
              onChange={(e) => updateElement(el.role, { include: e.target.checked })}
              className="size-3.5 rounded border-input accent-primary"
            />
          </label>
          <span className="w-28 shrink-0 text-xs font-semibold text-muted-foreground">
            {ROLE_LABELS[el.role]}
          </span>
          <input
            value={el.text}
            onChange={(e) => updateElement(el.role, { text: e.target.value })}
            disabled={!el.include}
            className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
          />
          <select
            value={el.position}
            onChange={(e) => updateElement(el.role, { position: e.target.value as OverlayPosition })}
            disabled={!el.include}
            className="h-8 rounded-md border border-input bg-background px-1.5 text-xs disabled:opacity-50"
          >
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      ))}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <button
        onClick={apply}
        disabled={busy}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {busy ? "Applying…" : "Apply overlay"}
      </button>
    </div>
  );
}
