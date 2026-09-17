import { z } from "zod";

// Ocushield's own account performance data, read from a separate Postgres
// database (social-metrics-db.ts) with no id column on either post table —
// confirmed via direct introspection. Facebook and Instagram have
// genuinely different real columns (not a shared shape forced together),
// so each gets its own schema rather than one lowest-common-denominator
// interface.

export const FacebookPostZ = z.object({
  createdTime: z.union([z.string(), z.date()]),
  createdTimeFull: z.union([z.string(), z.date()]).nullable(),
  content: z.string().nullable(),
  postMediaViews: z.number().int().nullable(),
  postTotalMediaViewsUnique: z.number().int().nullable(),
  totalReactions: z.number().int().nullable(),
  postClicks: z.number().int().nullable(),
  linkClicks: z.number().int().nullable(),
  otherClicks: z.number().int().nullable(),
  photoViews: z.number().int().nullable(),
  videoPlays: z.number().int().nullable(),
});
export type FacebookPost = z.infer<typeof FacebookPostZ>;

export const InstagramPostZ = z.object({
  creationDate: z.union([z.string(), z.date()]),
  caption: z.string().nullable(),
  mediaProductType: z.string().nullable(),
  mediaType: z.string().nullable(),
  permanentLink: z.string().nullable(),
  likes: z.number().int().nullable(),
  comments: z.number().int().nullable(),
  saved: z.number().int().nullable(),
  reach: z.number().int().nullable(),
  totalInteractions: z.number().int().nullable(),
  shares: z.number().int().nullable(),
});
export type InstagramPost = z.infer<typeof InstagramPostZ>;

export const FacebookDailyMetricZ = z.object({
  date: z.union([z.string(), z.date()]),
  pagePostEngagements: z.number().int().nullable(),
  pageMediaViews: z.number().int().nullable(),
  pageTotalMediaViewsUnique: z.number().int().nullable(),
  pageFollows: z.number().int().nullable(),
});
export type FacebookDailyMetric = z.infer<typeof FacebookDailyMetricZ>;

export const InstagramDailyMetricZ = z.object({
  date: z.union([z.string(), z.date()]),
  reach: z.number().int().nullable(),
  followerCount: z.number().int().nullable(),
});
export type InstagramDailyMetric = z.infer<typeof InstagramDailyMetricZ>;
