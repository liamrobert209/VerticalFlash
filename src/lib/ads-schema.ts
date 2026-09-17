import { z } from "zod";
import { AdAnalysisZ } from "./ad-analysis-schema";

// One row per ad per platform, sourced from ad-transparency APIs (Meta Ad
// Library, TikTok Commercial Content Library, ...) — populated by the
// Weekly Ads sync (phase 3), read by the Weekly Ads UI and Ad Insights
// (phase 6).

export const AdZ = z.object({
  id: z.string(),
  accountId: z.string().nullable(),
  platformId: z.string(),
  productLineId: z.string().nullable(),
  externalAdId: z.string(),
  headline: z.string().nullable(),
  bodyText: z.string().nullable(),
  creativeUrl: z.string().nullable(),
  // Basename within ads-media/ — a locally-cached copy of the creative
  // image, downloaded once at sync time for static-eligible ads so
  // generation/display never depends on the remote CDN URL staying alive.
  // Null for video ads, TikTok ads (never eligible), and any ad synced
  // before this existed — those fall back to creativeUrl.
  creativeLocalFile: z.string().nullable().default(null),
  landingUrl: z.string().nullable(),
  launchDate: z.union([z.string(), z.date()]).nullable(),
  firstSeenAt: z.union([z.string(), z.date()]),
  lastSeenAt: z.union([z.string(), z.date()]),
  isActive: z.boolean(),
  tags: z.array(z.string()).default([]),
  raw: z.record(z.unknown()).nullable().optional(),
  // true only for a Facebook/Instagram ad whose raw payload has a genuine
  // static-image creative (populated `images[]`, empty `videos[]`) — the
  // Static Ad Generator's eligibility gate for using an ad as a visual
  // reference. TikTok ads are never eligible: their `coverImageUrl` is a
  // video poster frame, not an independent static creative.
  isStaticEligible: z.boolean().default(false),
  // Automatic Gemini analysis (intent/USP/persona/product), run once per
  // eligible ad at ingest time — see ad-analyze.ts.
  analysis: AdAnalysisZ.nullable().optional(),
  analyzedAt: z.union([z.string(), z.date()]).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});

export type Ad = z.infer<typeof AdZ>;

// Extends AdZ with the competitor account's display name, resolved via a
// join in ads-store.ts's grouped queries — kept separate from AdZ itself
// so consumers that don't need it (Static Ad Generator, Ad Insights, ...)
// aren't forced through an extra join they don't use.
export const AdWithAccountZ = AdZ.extend({
  accountName: z.string().nullable(),
});

export type AdWithAccount = z.infer<typeof AdWithAccountZ>;

// Fields a sync job supplies for one observed ad — id/timestamps/is_active
// are derived server-side by the upsert (see recordAdSighting in ads-store.ts)
export const AdSightingZ = z.object({
  accountId: z.string().nullable().optional(),
  platformId: z.string(),
  productLineId: z.string().nullable().optional(),
  externalAdId: z.string().min(1),
  headline: z.string().nullable().optional(),
  bodyText: z.string().nullable().optional(),
  creativeUrl: z.string().nullable().optional(),
  creativeLocalFile: z.string().nullable().optional(),
  landingUrl: z.string().nullable().optional(),
  launchDate: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  raw: z.record(z.unknown()).nullable().optional(),
  // Computed by the sync job from the raw payload (see
  // isFacebookStaticEligible in weekly-ads-sync.ts) — recomputed on every
  // sighting since it's a pure function of `raw`, never sticky state.
  isStaticEligible: z.boolean().default(false),
});

export type AdSighting = z.infer<typeof AdSightingZ>;

export const AdQueryZ = z.object({
  platformId: z.string().optional(),
  productLineId: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  isStaticEligible: z.coerce.boolean().optional(),
  // "newest" orders by launch_date desc; "longest_running" orders by
  // (last_seen_at - coalesce(launch_date, first_seen_at)) desc
  sort: z.enum(["newest", "longest_running"]).default("newest"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AdQuery = z.infer<typeof AdQueryZ>;
