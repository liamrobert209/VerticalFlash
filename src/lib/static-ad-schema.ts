import { z } from "zod";
import { StaticAdTextOverlayZ } from "./static-ad-overlays-schema";
import { AD_INTENTS } from "./ad-analysis-schema";

// A Static Ad Generator project: one competitor reference ad, swapped in
// with our own product/USP, worked through generation + refinement + a
// text/CTA overlay. Lives at STATIC_ADS_DIR/<id>/project.json — a fresh
// root, not the video-keyed ANALYSIS_DIR convention, since a static ad
// isn't tied to a downloaded video at all.

export const STATIC_AD_STATUSES = ["draft", "accepted", "discarded"] as const;
export type StaticAdStatus = (typeof STATIC_AD_STATUSES)[number];

// One generate/refine call against the project's base image. Mirrors
// GenerationAttemptZ's shape (video) but keyed by a project-wide attempt
// number rather than per-shot, and with parent_attempt recording which
// prior attempt a "refine" edited (refines chain off the *accepted*
// attempt by default, not necessarily the immediately-prior one).
export const StaticAdAttemptZ = z.object({
  attempt: z.number(),
  kind: z.enum(["generate", "refine"]),
  prompt: z.string(),
  parentAttempt: z.number().nullable(),
  // Basename within static-ads/<projectId>/, e.g. attempt-2.png
  file: z.string().nullable(),
  status: z.enum(["ready", "failed"]),
  error: z.string().nullable(),
  usage: z.record(z.unknown()).optional(),
  model: z.string(),
  createdAt: z.string(),
});

export type StaticAdAttempt = z.infer<typeof StaticAdAttemptZ>;

export const StaticAdBaseImageZ = z.object({
  status: z.enum(["idle", "generating", "ready", "failed"]),
  startedAt: z.string().nullable(),
  acceptedAttempt: z.number().nullable(),
  attempts: z.array(StaticAdAttemptZ),
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
  // Pre-filled from the reference ad's analysis.intent/persona but
  // user-editable — drives the generation brief alongside ourUsp.
  angle: z.enum(AD_INTENTS).default("other"),
  persona: z.string().default(""),
  // Pre-filled from the reference ad's own headline; feeds the text
  // overlay step's default headline once a base image is accepted.
  headline: z.string().default(""),
  // Free-text brief for the generated backdrop/scene — pre-filled with a
  // default suggestion, editable, clearable back to null ("delete the
  // current suggestion").
  backgroundInstruction: z.string().nullable().default(null),
  baseImage: StaticAdBaseImageZ,
  textOverlay: StaticAdTextOverlayZ.nullable(),
  // Basename within static-ads/<projectId>/ of the base image + overlay
  // composited together — the project's actual deliverable. Null until
  // the overlay is applied at least once; re-applying overwrites it.
  finalImage: z.string().nullable(),
});

export type StaticAdProject = z.infer<typeof StaticAdProjectZ>;

// Attempt files are named per attempt number so a generated image can
// never be claimed by another attempt — mirrors generatedClipName's
// gen_s{shot}_a{attempt}.mp4 convention.
export function staticAdAttemptName(attempt: number, ext: string): string {
  return `attempt-${attempt}${ext}`;
}
