import { z } from "zod";

// TikTok videos searched by hashtag via the clockworks/tiktok-hashtag-
// scraper Apify actor — free-text hashtag search, not tied to any saved
// account or fixed industry/country combo (unlike tiktok-trends-schema.ts).
// See tiktok-hashtag-sync.ts for the actor's real (verified via a live test
// call) input/output field names.

export const TikTokHashtagVideoZ = z.object({
  id: z.string(),
  hashtag: z.string(),
  externalVideoId: z.string(),
  tiktokUrl: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  creatorName: z.string().nullable(),
  creatorHandle: z.string().nullable(),
  creatorAvatarUrl: z.string().nullable(),
  creatorFollowerCount: z.number().int().nullable(),
  caption: z.string().nullable(),
  // bigint columns — postgres.js returns bigint as a string to avoid
  // precision loss (same as tiktok-trends-schema.ts's viewCount).
  viewCount: z.coerce.number().nullable(),
  likeCount: z.coerce.number().nullable(),
  commentCount: z.coerce.number().nullable(),
  shareCount: z.coerce.number().nullable(),
  collectCount: z.coerce.number().nullable(),
  isAd: z.boolean(),
  contentHashtags: z.array(z.string()).default([]),
  publishedAt: z.union([z.string(), z.date()]).nullable(),
  raw: z.record(z.unknown()).nullable().optional(),
  firstSeenAt: z.union([z.string(), z.date()]),
  lastSeenAt: z.union([z.string(), z.date()]),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});

export type TikTokHashtagVideo = z.infer<typeof TikTokHashtagVideoZ>;

// Fields a sync job supplies for one observed video — id/timestamps are
// derived server-side by the upsert (see recordHashtagVideoSighting).
export const TikTokHashtagVideoSightingZ = z.object({
  hashtag: z.string().min(1),
  externalVideoId: z.string().min(1),
  tiktokUrl: z.string().nullable().optional(),
  coverImageUrl: z.string().nullable().optional(),
  creatorName: z.string().nullable().optional(),
  creatorHandle: z.string().nullable().optional(),
  creatorAvatarUrl: z.string().nullable().optional(),
  creatorFollowerCount: z.number().int().nullable().optional(),
  caption: z.string().nullable().optional(),
  viewCount: z.number().nullable().optional(),
  likeCount: z.number().nullable().optional(),
  commentCount: z.number().nullable().optional(),
  shareCount: z.number().nullable().optional(),
  collectCount: z.number().nullable().optional(),
  isAd: z.boolean().optional(),
  contentHashtags: z.array(z.string()).default([]),
  publishedAt: z.string().nullable().optional(),
  raw: z.record(z.unknown()).nullable().optional(),
});

export type TikTokHashtagVideoSighting = z.infer<typeof TikTokHashtagVideoSightingZ>;
