"use client";

import { useState } from "react";

// Mirrors static-ad-overlays-schema.ts (kept local, matching this
// component tree's convention of not importing the schema module directly
// into the client bundle).
export type OverlayRole = "headline" | "subhead" | "cta" | "badge";
export type OverlayPosition = "top" | "center" | "bottom";
export type OverlayLayout = "stacked" | "split_band";
export type LogoCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface StaticAdAnchor {
  xPct: number;
  yPct: number;
  align: "left" | "center" | "right";
}

export interface StaticAdOverlayElement {
  role: OverlayRole;
  text: string;
  include: boolean;
  position: OverlayPosition;
  anchor: StaticAdAnchor | null;
  textColorOverride: string | null;
}

export interface StaticAdLogoMark {
  include: boolean;
  corner: LogoCorner;
}

export interface StaticAdTextOverlay {
  elements: StaticAdOverlayElement[];
  layout: OverlayLayout;
  logoMark: StaticAdLogoMark;
}

const ROLE_LABELS: Record<OverlayRole, string> = {
  headline: "Headline",
  subhead: "Subhead",
  cta: "Call to action",
  badge: "Trust badge",
};

const LAYOUT_LABELS: Record<OverlayLayout, string> = {
  stacked: "Stacked (default)",
  split_band: "Bottom band",
};

const CORNER_LABELS: Record<LogoCorner, string> = {
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
};

const POSITIONS: OverlayPosition[] = ["top", "center", "bottom"];
const CORNERS: LogoCorner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

// Seeds from the AI-written copy (static-ad-copy.ts) when present, so the
// overlay's defaults are our own on-angle copy instead of blank text — the
// user can still edit or clear any element. Never fabricates a trust badge
// (no default "Rated 4.8..." text) — a real stat has to come from
// somewhere, so it starts blank/excluded like everything else without one.
function defaultOverlay(copy: { headline: string; subhead: string; cta: string }): StaticAdTextOverlay {
  return {
    elements: [
      { role: "headline", text: copy.headline, include: !!copy.headline, position: "top", anchor: null, textColorOverride: null },
      { role: "subhead", text: copy.subhead, include: !!copy.subhead, position: "top", anchor: null, textColorOverride: null },
      { role: "cta", text: copy.cta || "Shop now", include: !!copy.cta, position: "bottom", anchor: null, textColorOverride: null },
      { role: "badge", text: "", include: false, position: "bottom", anchor: null, textColorOverride: null },
    ],
    layout: "stacked",
    logoMark: { include: false, corner: "bottom-right" },
  };
}

export interface OverlayEditorProps {
  projectId: string;
  initialOverlay: StaticAdTextOverlay | null;
  initialCopy: { headline: string; subhead: string; cta: string };
  finalImage: string | null;
  onApplied: (project: { textOverlay: StaticAdTextOverlay; finalImage: string }) => void;
}

export function OverlayEditor({ projectId, initialOverlay, initialCopy, finalImage, onApplied }: OverlayEditorProps) {
  const [overlay, setOverlay] = useState<StaticAdTextOverlay>(initialOverlay ?? defaultOverlay(initialCopy));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [reasons, setReasons] = useState<Partial<Record<OverlayRole, string>>>({});

  const updateElement = (role: OverlayRole, patch: Partial<StaticAdOverlayElement>) => {
    setOverlay((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => (el.role === role ? { ...el, ...patch } : el)),
    }));
  };

  // Manually changing position clears any anchor for that element — the
  // two placement mechanisms shouldn't silently fight each other.
  const setPosition = (role: OverlayRole, position: OverlayPosition) => {
    updateElement(role, { position, anchor: null, textColorOverride: null });
    setReasons((prev) => ({ ...prev, [role]: undefined }));
  };

  const clearAnchor = (role: OverlayRole) => {
    updateElement(role, { anchor: null, textColorOverride: null });
    setReasons((prev) => ({ ...prev, [role]: undefined }));
  };

  const suggestPlacement = async () => {
    const roles = overlay.elements
      .filter((el) => el.include && el.text.trim() && (el.role === "headline" || el.role === "subhead" || el.role === "cta"))
      .map((el) => el.role);
    if (roles.length === 0) return;
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetch(`/api/static-ads/${projectId}/suggest-placement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not suggest placement");
      setOverlay((prev) => ({
        ...prev,
        elements: prev.elements.map((el) => {
          const suggestion = (data.suggestions as { role: OverlayRole; anchor: StaticAdAnchor; textColorOverride: string; reason: string }[]).find(
            (s) => s.role === el.role
          );
          return suggestion ? { ...el, anchor: suggestion.anchor, textColorOverride: suggestion.textColorOverride } : el;
        }),
      }));
      const nextReasons: Partial<Record<OverlayRole, string>> = {};
      for (const s of data.suggestions as { role: OverlayRole; reason: string }[]) nextReasons[s.role] = s.reason;
      setReasons(nextReasons);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not suggest placement");
    } finally {
      setSuggesting(false);
    }
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

      <label className="flex items-center gap-2 text-xs">
        <span className="font-semibold text-muted-foreground">Layout</span>
        <select
          value={overlay.layout}
          onChange={(e) => setOverlay((prev) => ({ ...prev, layout: e.target.value as OverlayLayout }))}
          className="h-8 rounded-md border border-input bg-background px-1.5 text-xs"
        >
          {(Object.keys(LAYOUT_LABELS) as OverlayLayout[]).map((l) => (
            <option key={l} value={l}>
              {LAYOUT_LABELS[l]}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-2">
        <button
          onClick={suggestPlacement}
          disabled={suggesting}
          className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
        >
          {suggesting ? "Analyzing photo…" : "Suggest placement ✨"}
        </button>
        <span className="text-[11px] text-muted-foreground">
          Finds open space in the photo and picks a readable color from the brand palette — overrides below still work.
        </span>
      </div>

      {overlay.elements.map((el) => (
        <div key={el.role} className="space-y-1">
          <div className="flex items-center gap-2">
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
              onChange={(e) => setPosition(el.role, e.target.value as OverlayPosition)}
              disabled={!el.include || !!el.anchor}
              className="h-8 rounded-md border border-input bg-background px-1.5 text-xs disabled:opacity-50"
            >
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          {el.anchor && (
            <div className="ml-10 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span
                className="inline-block size-3 rounded-full border border-border"
                style={{ backgroundColor: el.textColorOverride ?? undefined }}
                title={el.textColorOverride ?? undefined}
              />
              <span>
                Auto-placed ({el.anchor.align}){reasons[el.role] ? ` — ${reasons[el.role]}` : ""}
              </span>
              <button onClick={() => clearAnchor(el.role)} className="text-primary underline-offset-4 hover:underline">
                Clear
              </button>
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 w-8 shrink-0">
          <input
            type="checkbox"
            checked={overlay.logoMark.include}
            onChange={(e) =>
              setOverlay((prev) => ({ ...prev, logoMark: { ...prev.logoMark, include: e.target.checked } }))
            }
            className="size-3.5 rounded border-input accent-primary"
          />
        </label>
        <span className="w-28 shrink-0 text-xs font-semibold text-muted-foreground">Logo watermark</span>
        <select
          value={overlay.logoMark.corner}
          onChange={(e) =>
            setOverlay((prev) => ({ ...prev, logoMark: { ...prev.logoMark, corner: e.target.value as LogoCorner } }))
          }
          disabled={!overlay.logoMark.include}
          className="h-8 rounded-md border border-input bg-background px-1.5 text-xs disabled:opacity-50"
        >
          {CORNERS.map((c) => (
            <option key={c} value={c}>
              {CORNER_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

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
