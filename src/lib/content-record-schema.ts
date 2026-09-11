import { z } from "zod";

export const CONTENT_TYPES = ["remake", "adhoc", "prompt", "music", "master_cutdown"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_SOURCES = ["tiktok_scan", "tiktok_url", "uploaded_footage", "brief"] as const;
export type ContentSource = (typeof CONTENT_SOURCES)[number];

export const REFERENCE_ORIGINS = ["creator", "ad"] as const;
export type ReferenceOrigin = (typeof REFERENCE_ORIGINS)[number];

export const ContentRecordZ = z.object({
  videoId: z.string(),
  productLineId: z.string().nullable(),
  platformId: z.string().nullable(),
  contentType: z.enum(CONTENT_TYPES),
  source: z.enum(CONTENT_SOURCES),
  referenceOrigin: z.enum(REFERENCE_ORIGINS).nullable(),
  format: z.string().nullable(),
  hook: z.string().nullable(),
  originalAngle: z.string().nullable(),
  newAngle: z.string().nullable(),
  angleSource: z.string().nullable(),
  referenceVideoId: z.string().nullable(),
  referenceAccountHandle: z.string().nullable(),
  referenceAccountFollowerCount: z.number().int().nullable(),
  referenceContentLikeCount: z.number().int().nullable(),
  referenceContentCommentCount: z.number().int().nullable(),
  referenceAccountPositioning: z.string().nullable(),
  firstRenderedAt: z.union([z.string(), z.date()]),
  lastRenderedAt: z.union([z.string(), z.date()]),
  renderCount: z.number().int(),
});

export type ContentRecord = z.infer<typeof ContentRecordZ>;

export const ContentHistoryQueryZ = z.object({
  productLineId: z.string().optional(),
  platformId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  hook: z.string().optional(),
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ContentHistoryQuery = z.infer<typeof ContentHistoryQueryZ>;
