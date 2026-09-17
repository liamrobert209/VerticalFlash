import { z } from "zod";

// The static ad's text/CTA overlay — deterministic (real rasterized pixels,
// not AI-generated text) so nothing ever comes out garbled or misspelled.
// Richer than the video editor's single-text-per-shot shape
// (text-overlays-schema.ts) since a static ad needs several simultaneous
// elements (headline + subhead + CTA + trust badge), not one caption.

export const OVERLAY_ROLES = ["headline", "subhead", "cta", "badge"] as const;
export type OverlayRole = (typeof OVERLAY_ROLES)[number];

// Reuses TEXT_POSITIONS' vocabulary from text-overlays-schema.ts (top/
// center/bottom) — same mental model as the video editor's text placement.
export const OVERLAY_POSITIONS = ["top", "center", "bottom"] as const;
export type OverlayPosition = (typeof OVERLAY_POSITIONS)[number];

// "stacked" is today's behavior (each element's own pill, centered,
// stacked by position). "split_band" adds a solid color band across the
// bottom third of the image first, so bottom-anchored elements (typically
// subhead/CTA/badge) sit on a clean, organized surface instead of directly
// over busy product photography.
export const OVERLAY_LAYOUTS = ["stacked", "split_band"] as const;
export type OverlayLayout = (typeof OVERLAY_LAYOUTS)[number];

export const StaticAdOverlayElementZ = z.object({
  role: z.enum(OVERLAY_ROLES),
  text: z.string(),
  include: z.boolean(),
  position: z.enum(OVERLAY_POSITIONS),
});

export type StaticAdOverlayElement = z.infer<typeof StaticAdOverlayElementZ>;

export const StaticAdTextOverlayZ = z.object({
  elements: z.array(StaticAdOverlayElementZ),
  layout: z.enum(OVERLAY_LAYOUTS).default("stacked"),
});

export type StaticAdTextOverlay = z.infer<typeof StaticAdTextOverlayZ>;

export function defaultTextOverlay(): StaticAdTextOverlay {
  return {
    elements: [
      { role: "headline", text: "", include: false, position: "top" },
      { role: "subhead", text: "", include: false, position: "top" },
      { role: "cta", text: "Shop now", include: false, position: "bottom" },
      { role: "badge", text: "Rated 4.8 · 10,000+ reviews", include: false, position: "bottom" },
    ],
    layout: "stacked",
  };
}
