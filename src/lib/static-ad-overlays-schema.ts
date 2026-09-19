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

// A free-position placement, set by the smart-placement suggestion
// (static-ad-placement.ts) or a manual override — takes over from the
// role's position-based stacking entirely when present. xPct/yPct are
// normalized (0-1) coordinates of the text block's anchor point; align
// says which edge of the block sits at that point. Optional/nullable so
// every existing overlay (position-only) keeps working exactly as before —
// this is additive, not a replacement for the position enum.
export const StaticAdAnchorZ = z.object({
  xPct: z.number().min(0).max(1),
  yPct: z.number().min(0).max(1),
  align: z.enum(["left", "center", "right"]),
});

export type StaticAdAnchor = z.infer<typeof StaticAdAnchorZ>;

export const StaticAdOverlayElementZ = z.object({
  role: z.enum(OVERLAY_ROLES),
  text: z.string(),
  include: z.boolean(),
  position: z.enum(OVERLAY_POSITIONS),
  // When set, this element renders at the free anchor point instead of
  // being stacked with other elements sharing `position`. Cleared by
  // manually changing `position` in the editor, so the two never silently
  // fight each other.
  anchor: StaticAdAnchorZ.nullable().default(null),
  // Overrides the role's default text color (e.g. a palette color picked
  // for contrast against a specific patch of the photo). Null uses the
  // role's normal default.
  textColorOverride: z.string().nullable().default(null),
});

export type StaticAdOverlayElement = z.infer<typeof StaticAdOverlayElementZ>;

// The logo watermark — a real image, not text, so it doesn't fit the
// role/position/text shape above: it needs a 2D corner anchor instead of a
// vertical band, and no text content at all. Which actual logo file to use
// isn't stored here — compositeStaticAd resolves the latest "logo"-kind
// brand asset at render time (same "latest wins" pattern as the color
// palette), so re-uploading a better logo later updates every ad without
// needing to touch this field.
export const LOGO_CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
export type LogoCorner = (typeof LOGO_CORNERS)[number];

export const StaticAdLogoMarkZ = z.object({
  include: z.boolean(),
  corner: z.enum(LOGO_CORNERS),
});

export type StaticAdLogoMark = z.infer<typeof StaticAdLogoMarkZ>;

export function defaultLogoMark(): StaticAdLogoMark {
  return { include: false, corner: "bottom-right" };
}

export const StaticAdTextOverlayZ = z.object({
  elements: z.array(StaticAdOverlayElementZ),
  layout: z.enum(OVERLAY_LAYOUTS).default("stacked"),
  // Optional/defaulted so existing project.json overlays without this
  // field (every one applied before this existed) keep parsing.
  logoMark: StaticAdLogoMarkZ.default(defaultLogoMark),
});

export type StaticAdTextOverlay = z.infer<typeof StaticAdTextOverlayZ>;

export function defaultTextOverlay(): StaticAdTextOverlay {
  return {
    elements: [
      { role: "headline", text: "", include: false, position: "top", anchor: null, textColorOverride: null },
      { role: "subhead", text: "", include: false, position: "top", anchor: null, textColorOverride: null },
      { role: "cta", text: "Shop now", include: false, position: "bottom", anchor: null, textColorOverride: null },
      {
        role: "badge",
        text: "Rated 4.8 · 10,000+ reviews",
        include: false,
        position: "bottom",
        anchor: null,
        textColorOverride: null,
      },
    ],
    layout: "stacked",
    logoMark: defaultLogoMark(),
  };
}
