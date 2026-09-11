import { z } from "zod";

// Organic posts pulled from saved accounts — a brand account's posts feed
// Weekly Content, a creator/affiliate account's posts feed Weekly Creators
// (phase 4), disambiguated by the source account's accountType
// (competitor-schema.ts). Named "scraped_content" (not "content") to keep
// this clearly distinct from content-record-schema.ts's content_records,
// which tracks OUR OWN generated renders, not competitor/creator posts.

export const ScrapedContentZ = z.object({
  id: z.string(),
  accountId: z.string().nullable(),
  platformId: z.string(),
  productLineId: z.string().nullable(),
  externalContentId: z.string(),
  postedAt: z.union([z.string(), z.date()]).nullable(),
  caption: z.string().nullable(),
  mediaUrl: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  viewCount: z.number().int().nullable(),
  likeCount: z.number().int().nullable(),
  commentCount: z.number().int().nullable(),
  shareCount: z.number().int().nullable(),
  tags: z.array(z.string()).default([]),
  raw: z.record(z.unknown()).nullable().optional(),
  firstSeenAt: z.union([z.string(), z.date()]),
  lastSeenAt: z.union([z.string(), z.date()]),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});

export type ScrapedContent = z.infer<typeof ScrapedContentZ>;

// Fields a sync job supplies for one observed post — engagement counts are
// a snapshot as of this sync, refreshed on every later sighting
export const ScrapedContentSightingZ = z.object({
  accountId: z.string().nullable().optional(),
  platformId: z.string(),
  productLineId: z.string().nullable().optional(),
  externalContentId: z.string().min(1),
  postedAt: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  mediaUrl: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  viewCount: z.number().int().nullable().optional(),
  likeCount: z.number().int().nullable().optional(),
  commentCount: z.number().int().nullable().optional(),
  shareCount: z.number().int().nullable().optional(),
  tags: z.array(z.string()).default([]),
  raw: z.record(z.unknown()).nullable().optional(),
});

export type ScrapedContentSighting = z.infer<typeof ScrapedContentSightingZ>;

// "creator" filter is applied via the joined account's accountType (see
// scraped-content-store.ts's listScrapedContent) rather than duplicated
// here, since that field lives on competitor_accounts, not this table.
export const ScrapedContentQueryZ = z.object({
  platformId: z.string().optional(),
  productLineId: z.string().optional(),
  accountType: z.enum(["brand", "creator"]).optional(),
  sort: z.enum(["newest", "top_performing"]).default("newest"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ScrapedContentQuery = z.infer<typeof ScrapedContentQueryZ>;
