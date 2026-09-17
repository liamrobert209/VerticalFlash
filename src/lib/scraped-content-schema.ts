import { z } from "zod";
import { ContentAnalysisZ, CONTENT_FORMATS } from "./content-analysis-schema";

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
  // Basename within competitor-content-media/ — a locally-cached copy of
  // the post's thumbnail, downloaded once at sync time so display/analysis
  // never depends on the remote CDN URL staying alive (same reasoning as
  // ads.creative_local_file). Null for anything synced before this existed
  // or whose download failed — those fall back to thumbnailUrl.
  thumbnailLocalFile: z.string().nullable().default(null),
  viewCount: z.number().int().nullable(),
  likeCount: z.number().int().nullable(),
  commentCount: z.number().int().nullable(),
  shareCount: z.number().int().nullable(),
  tags: z.array(z.string()).default([]),
  raw: z.record(z.unknown()).nullable().optional(),
  // Automatic Gemini analysis (topic/pain point/solution/product/tags), run
  // once per post at ingest time — see content-analyze.ts.
  analysis: ContentAnalysisZ.nullable().optional(),
  analyzedAt: z.union([z.string(), z.date()]).nullable().optional(),
  // Deterministic, derived from each platform's own media-type field at
  // sync time (see content-sync.ts) — not Gemini-derived.
  format: z.enum(CONTENT_FORMATS).nullable().optional(),
  firstSeenAt: z.union([z.string(), z.date()]),
  lastSeenAt: z.union([z.string(), z.date()]),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});

export type ScrapedContent = z.infer<typeof ScrapedContentZ>;

// Extends ScrapedContentZ with the source account's display name, resolved
// via the join already present in scraped-content-store.ts's grouped query
// — same rationale as ads-schema.ts's AdWithAccountZ.
export const ScrapedContentWithAccountZ = ScrapedContentZ.extend({
  accountName: z.string().nullable(),
});

export type ScrapedContentWithAccount = z.infer<typeof ScrapedContentWithAccountZ>;

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
  thumbnailLocalFile: z.string().nullable().optional(),
  viewCount: z.number().int().nullable().optional(),
  likeCount: z.number().int().nullable().optional(),
  commentCount: z.number().int().nullable().optional(),
  shareCount: z.number().int().nullable().optional(),
  // Computed by the sync job from the raw payload's media-type field (see
  // deriveInstagramFormat/deriveTikTokFormat in content-sync.ts) —
  // recomputed on every sighting since it's a pure function of the raw
  // item, never sticky state (same reasoning as ads.is_static_eligible).
  format: z.enum(CONTENT_FORMATS).nullable().optional(),
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
