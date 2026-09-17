import { z } from "zod";

// A Static Ad Generator project: one competitor reference ad, swapped in
// with our own product/USP, worked through generation + refinement + a
// text/CTA overlay. Lives at STATIC_ADS_DIR/<id>/project.json — a fresh
// root, not the video-keyed ANALYSIS_DIR convention, since a static ad
// isn't tied to a downloaded video at all.

export const STATIC_AD_STATUSES = ["draft", "accepted", "discarded"] as const;
export type StaticAdStatus = (typeof STATIC_AD_STATUSES)[number];

// Minimal for now — Phase 5 replaces `attempts`'s item type with the full
// StaticAdAttemptZ shape once generation exists.
export const StaticAdBaseImageZ = z.object({
  status: z.enum(["idle", "generating", "ready", "failed"]),
  startedAt: z.string().nullable(),
  acceptedAttempt: z.number().nullable(),
  attempts: z.array(z.unknown()),
});

export function emptyBaseImage(): z.infer<typeof StaticAdBaseImageZ> {
  return { status: "idle", startedAt: null, acceptedAttempt: null, attempts: [] };
}

export const StaticAdProjectZ = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: z.enum(STATIC_AD_STATUSES),
  // The competitor ad (ads.id) this project was seeded from — must be
  // is_static_eligible at creation time.
  referenceAdId: z.string(),
  productLineId: z.string(),
  // The USP we're leading with, pre-filled from the reference ad's
  // analysis but user-editable — the "swap" the whole project is about.
  ourUsp: z.string(),
  // Filename within product-images/<productLineId>/ (see
  // product-images-store.ts, reused as-is — no new upload mechanism).
  ourProductImage: z.string(),
  baseImage: StaticAdBaseImageZ,
  // Populated in Phase 6.
  textOverlay: z.unknown().nullable(),
});

export type StaticAdProject = z.infer<typeof StaticAdProjectZ>;
