import { z } from "zod";

// The static ad's text/CTA overlay — deterministic (real rasterized pixels,
// not AI-generated text) so nothing ever comes out garbled or misspelled.
// Richer than the video editor's single-text-per-shot shape
// (text-overlays-schema.ts) since a static ad needs several simultaneous
// elements (headline + subhead + CTA), not one caption.

export const OVERLAY_ROLES = ["headline", "subhead", "cta"] as const;
export type OverlayRole = (typeof OVERLAY_ROLES)[number];

// Reuses TEXT_POSITIONS' vocabulary from text-overlays-schema.ts (top/
// center/bottom) — same mental model as the video editor's text placement.
export const OVERLAY_POSITIONS = ["top", "center", "bottom"] as const;
export type OverlayPosition = (typeof OVERLAY_POSITIONS)[number];

export const StaticAdOverlayElementZ = z.object({
  role: z.enum(OVERLAY_ROLES),
  text: z.string(),
  include: z.boolean(),
  position: z.enum(OVERLAY_POSITIONS),
});

export type StaticAdOverlayElement = z.infer<typeof StaticAdOverlayElementZ>;

export const StaticAdTextOverlayZ = z.object({
  elements: z.array(StaticAdOverlayElementZ),
});

export type StaticAdTextOverlay = z.infer<typeof StaticAdTextOverlayZ>;

export function defaultTextOverlay(): StaticAdTextOverlay {
  return {
    elements: [
      { role: "headline", text: "", include: false, position: "top" },
      { role: "subhead", text: "", include: false, position: "top" },
      { role: "cta", text: "Shop now", include: false, position: "bottom" },
    ],
  };
}
