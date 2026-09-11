import { z } from "zod";

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
  landingUrl: z.string().nullable(),
  launchDate: z.union([z.string(), z.date()]).nullable(),
  firstSeenAt: z.union([z.string(), z.date()]),
  lastSeenAt: z.union([z.string(), z.date()]),
  isActive: z.boolean(),
  tags: z.array(z.string()).default([]),
  raw: z.record(z.unknown()).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});

export type Ad = z.infer<typeof AdZ>;

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
  landingUrl: z.string().nullable().optional(),
  launchDate: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  raw: z.record(z.unknown()).nullable().optional(),
});

export type AdSighting = z.infer<typeof AdSightingZ>;

export const AdQueryZ = z.object({
  platformId: z.string().optional(),
  productLineId: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  // "newest" orders by launch_date desc; "longest_running" orders by
  // (last_seen_at - coalesce(launch_date, first_seen_at)) desc
  sort: z.enum(["newest", "longest_running"]).default("newest"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AdQuery = z.infer<typeof AdQueryZ>;
