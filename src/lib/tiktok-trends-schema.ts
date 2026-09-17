import { z } from "zod";

// TikTok-wide trending videos, pulled via the data_xplorer/tiktok-trends
// Apify actor ("Top Videos" mode) — not tied to any saved competitor/
// creator account, unlike scraped-content-schema.ts. See tiktok-trends-
// sync.ts for the actor's real (verified via a live test call, not just
// its docs) input/output field names.

// TikTok only exposes "Top Videos" for these 5 regions.
export const TIKTOK_TREND_VIDEO_COUNTRIES = ["US", "JP", "VN", "TH", "ID"] as const;
export type TikTokTrendVideoCountry = (typeof TIKTOK_TREND_VIDEO_COUNTRIES)[number];

// The actor's `videoContentTag` enum — "" means no filter ("All").
export const TIKTOK_TREND_INDUSTRIES = [
  { id: "", label: "All content tags" },
  { id: "11002", label: "Beauty & Care" },
  { id: "11003", label: "Fashion" },
  { id: "11010", label: "Food & Beverage" },
  { id: "11013", label: "Lifestyle & Leisure" },
  { id: "11015", label: "Technology & Finance" },
] as const;

export const TikTokTrendingVideoZ = z.object({
  id: z.string(),
  industry: z.string(),
  country: z.string(),
  externalVideoId: z.string(),
  rank: z.number().int().nullable(),
  tiktokUrl: z.string().nullable(),
  videoFileUrl: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  creatorName: z.string().nullable(),
  creatorHandle: z.string().nullable(),
  creatorAvatarUrl: z.string().nullable(),
  creatorFollowerCount: z.number().int().nullable(),
  caption: z.string().nullable(),
  // bigint column — postgres.js returns bigint as a string to avoid
  // precision loss, so this needs coercion (view counts are nowhere near
  // Number.MAX_SAFE_INTEGER, so no precision is actually lost here).
  viewCount: z.coerce.number().nullable(),
  engagementRate: z.number().nullable(),
  viewThroughRate: z.number().nullable(),
  contentTags: z.array(z.string()).default([]),
  publishedAt: z.union([z.string(), z.date()]).nullable(),
  raw: z.record(z.unknown()).nullable().optional(),
  firstSeenAt: z.union([z.string(), z.date()]),
  lastSeenAt: z.union([z.string(), z.date()]),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});

export type TikTokTrendingVideo = z.infer<typeof TikTokTrendingVideoZ>;

// Fields a sync job supplies for one observed video — id/timestamps are
// derived server-side by the upsert (see recordTrendingVideoSighting).
export const TikTokTrendingVideoSightingZ = z.object({
  industry: z.string(),
  country: z.string(),
  externalVideoId: z.string().min(1),
  rank: z.number().int().nullable().optional(),
  tiktokUrl: z.string().nullable().optional(),
  videoFileUrl: z.string().nullable().optional(),
  coverImageUrl: z.string().nullable().optional(),
  creatorName: z.string().nullable().optional(),
  creatorHandle: z.string().nullable().optional(),
  creatorAvatarUrl: z.string().nullable().optional(),
  creatorFollowerCount: z.number().int().nullable().optional(),
  caption: z.string().nullable().optional(),
  viewCount: z.number().nullable().optional(),
  engagementRate: z.number().nullable().optional(),
  viewThroughRate: z.number().nullable().optional(),
  contentTags: z.array(z.string()).default([]),
  publishedAt: z.string().nullable().optional(),
  raw: z.record(z.unknown()).nullable().optional(),
});

export type TikTokTrendingVideoSighting = z.infer<typeof TikTokTrendingVideoSightingZ>;
