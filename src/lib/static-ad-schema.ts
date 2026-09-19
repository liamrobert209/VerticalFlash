import { z } from "zod";
import { StaticAdTextOverlayZ } from "./static-ad-overlays-schema";
import { AD_INTENTS } from "./ad-analysis-schema";
import { ANGLE_SOURCE_LISTS } from "./icp-angles";

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
  // Automated product-placement compositing check (shadow/color/edges/
  // scale) — see static-ad-qa.ts. Absent for "refine" attempts (the manual
  // instruction-driven edit path isn't QA'd) and for any "generate" attempt
  // made before this existed.
  qa: z.object({ passed: z.boolean(), issues: z.array(z.string()) }).optional(),
  // Same shape, for a swapped-in person — only present when the reference
  // ad showed a person AND actor reference photos existed for the product
  // line, so an actor swap was actually attempted.
  personQa: z.object({ passed: z.boolean(), issues: z.array(z.string()) }).optional(),
  model: z.string(),
  createdAt: z.string(),
});

export type StaticAdAttempt = z.infer<typeof StaticAdAttemptZ>;

// Human feedback on the finished ad — thumbs up/down plus an optional
// free-text note, captured once the ad is done (see FinishDownloadPanel)
// so real outcomes accumulate over time instead of only living in
// whoever's memory reviewed the ad. Rating and note can each be cleared
// independently, so this stays an object (not folded into `status`) even
// though today it's only shown once a project is "accepted".
export const StaticAdFeedbackZ = z.object({
  rating: z.enum(["up", "down"]).nullable(),
  note: z.string().nullable(),
  ratedAt: z.string().nullable(),
});

export type StaticAdFeedback = z.infer<typeof StaticAdFeedbackZ>;

export function emptyFeedback(): StaticAdFeedback {
  return { rating: null, note: null, ratedAt: null };
}

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
  // Deprecated — was "our" marketing angle, reusing the competitor-ad
  // intent enum. Kept only so the ~16 pre-existing project.json files on
  // disk (all still "draft") continue to parse; no longer read or written
  // by anything. Superseded by angleCategory/angleLabel below.
  angle: z.enum(AD_INTENTS).default("other"),
  // The ICP category this ad's angle is drawn from (one of
  // ANGLE_SOURCE_LISTS), or null for a fully custom angle not tied to any
  // ICP list. Paired with angleLabel to drive both the generation brief and
  // (once built) the copy-generation step.
  angleCategory: z.enum(ANGLE_SOURCE_LISTS).nullable().default(null),
  // The specific angle text — either one of the ICP's ranked items under
  // angleCategory, or freely typed when angleCategory is null/custom.
  angleLabel: z.string().default(""),
  persona: z.string().default(""),
  // AI-written copy (see static-ad-copy.ts's generateAdCopy) — real text,
  // authored once at project-creation time from angleCategory/angleLabel/
  // ourUsp/persona and the reference ad's structure, never the
  // competitor's literal words. Seeds the text overlay step's default
  // elements once a base image is accepted; user-editable there.
  // Best-effort: stays "" if copy generation failed, same as before this
  // existed (an empty overlay element the user fills in manually).
  headline: z.string().default(""),
  subhead: z.string().default(""),
  cta: z.string().default(""),
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
  // Set only once a real thumbs up/down has been given — see
  // StaticAdFeedbackZ. Pre-existing project.json files on disk simply
  // lack this key, which `.nullable().default(null)` parses as null.
  feedback: StaticAdFeedbackZ.nullable().default(null),
});

export type StaticAdProject = z.infer<typeof StaticAdProjectZ>;

// Attempt files are named per attempt number so a generated image can
// never be claimed by another attempt — mirrors generatedClipName's
// gen_s{shot}_a{attempt}.mp4 convention.
export function staticAdAttemptName(attempt: number, ext: string): string {
  return `attempt-${attempt}${ext}`;
}
