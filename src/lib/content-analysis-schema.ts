import { z } from "zod";

// Client-safe: no @google/genai import here — same split as
// ad-analysis-schema.ts (see its header comment for the ~37KB bundle-bloat
// story that motivated it). The Gemini structured-output schema
// (buildContentAnalysisResponseSchema) lives in content-analyze.ts instead,
// since its only consumer is server-only.

// Automatic Gemini analysis run once per scraped organic post (image or
// video, via its thumbnail — see content-analyze.ts / content-sync.ts) —
// feeds the Weekly Content / Weekly Creators digests.

export const CONTENT_TOPICS = [
  "product_demo",
  "educational",
  "testimonial_ugc",
  "lifestyle",
  "humor_meme",
  "behind_the_scenes",
  "influencer_collab",
  "promotional",
  "other",
] as const;

export type ContentTopic = (typeof CONTENT_TOPICS)[number];

export const CONTENT_TOPIC_LABELS: Record<ContentTopic, string> = {
  product_demo: "Product demo",
  educational: "Educational",
  testimonial_ugc: "Testimonial / UGC",
  lifestyle: "Lifestyle",
  humor_meme: "Humor / meme",
  behind_the_scenes: "Behind the scenes",
  influencer_collab: "Influencer collab",
  promotional: "Promotional",
  other: "Other",
};

// Field names are deliberately camelCase — same jsonb round-trip reasoning
// as AdAnalysisZ (see its header comment): postgres.camel recursively
// camelCases jsonb object keys on the way out of a `postgres.camel`-
// transformed client, so writing camelCase from Gemini directly avoids a
// snake_case-in/camelCase-out mismatch that would otherwise fail Zod
// validation on every read.
export const ContentAnalysisZ = z.object({
  summary: z.string(),
  topic: z.enum(CONTENT_TOPICS),
  // The pain point this post leads with, in plain language — "" when the
  // post doesn't lead with one (e.g. pure lifestyle/humor content).
  painPoint: z.string(),
  solutionAddressed: z.string(),
  // What product/category is visually shown in the post
  productShown: z.string(),
  tags: z.array(z.string()).min(1),
  // Only present when the source account is linked to 2+ product lines and
  // the analysis prompt asked Gemini to pick one (see content-analyze.ts's
  // `candidates` param) — null/absent otherwise. Not itself written to
  // scraped_content.product_line_id directly; content-sync.ts's
  // resolveProductLineId (imported from weekly-ads-sync.ts) validates it
  // against the candidate list before trusting it.
  productLineId: z.string().nullable().optional(),
});

export type ContentAnalysis = z.infer<typeof ContentAnalysisZ>;

// Deterministic, NOT part of the Gemini schema above — derived directly
// from each platform's own media-type field at sync time (see
// deriveInstagramFormat/deriveTikTokFormat in content-sync.ts), since the
// source data already has the answer.
export const CONTENT_FORMATS = ["image", "video", "carousel"] as const;

export type ContentFormat = (typeof CONTENT_FORMATS)[number];
