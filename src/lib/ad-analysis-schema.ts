import { z } from "zod";
import { ANGLE_SOURCE_LISTS } from "./icp-angles";

// Client-safe: no @google/genai import here. The Gemini structured-output
// schema (adAnalysisResponseSchema) lives in ad-analyze.ts instead, since
// its only consumer is server-only — importing it here would drag the
// Gemini SDK into any client bundle that just wants AD_INTENTS/AdAnalysisZ
// (e.g. the static ad editor's angle picker). Confirmed the hard way: this
// split exists because importing AD_INTENT_LABELS from here once bloated
// weekly-ads' client bundle by ~37KB before the split.

// Automatic Gemini analysis run once per eligible static competitor ad, at
// ingest time (see ad-analyze.ts / weekly-ads-sync.ts) — feeds the Weekly
// Static Ads digest and pre-fills the "swap in our product" step of the
// Static Ad Generator.

export const AD_INTENTS = [
  "direct_response",
  "brand_awareness",
  "retargeting",
  "seasonal_promo",
  "product_launch",
  "other",
] as const;

export type AdIntent = (typeof AD_INTENTS)[number];

// Shared display labels for AD_INTENTS — was independently hand-duplicated
// in weekly-ads/page.tsx and weekly-static-ads/page.tsx; a third caller
// (the static ad editor's angle picker) made a shared copy worth it.
export const AD_INTENT_LABELS: Record<AdIntent, string> = {
  direct_response: "Direct response",
  brand_awareness: "Brand awareness",
  retargeting: "Retargeting",
  seasonal_promo: "Seasonal promo",
  product_launch: "Product launch",
  other: "Other",
};

// Field names are deliberately camelCase, unlike the snake_case convention
// used by the per-video Gemini analysis schema — this one round-trips
// through a jsonb column read via a `postgres.camel`-transformed client,
// which recursively camelCases jsonb object keys on the way out (confirmed:
// not just column names). Writing camelCase from Gemini directly avoids a
// snake_case-in/camelCase-out mismatch that would otherwise fail Zod
// validation on every read.
export const AdAnalysisZ = z.object({
  summary: z.string(),
  intent: z.enum(AD_INTENTS),
  // The single USP the ad leads with, in plain language
  usp: z.string(),
  // Who the ad is targeting, in plain language (not a rigid enum — personas
  // vary too much across categories/advertisers to usefully constrain)
  persona: z.string(),
  // What product/category is visually shown in the creative
  productShown: z.string(),
  // Whether the creative depicts a real human person (not just the
  // product) — drives whether the Static Ad Generator attempts an actor
  // swap alongside the product swap. Optional (not defaulted) so existing
  // code/fixtures constructing an AdAnalysis literal from before this
  // field existed don't need updating — every consumer already treats a
  // missing value as "no person"/null rather than relying on a Zod-level
  // default to fill it in.
  hasPerson: z.boolean().optional(),
  // Brief description of how the person appears (e.g. "one person, upper
  // body, holding the phone up to their face") when hasPerson is true;
  // null/absent otherwise. Feeds the actor-swap generation prompt.
  personDescription: z.string().nullable().optional(),
  tags: z.array(z.string()).min(1),
  // Only present when the competitor is linked to 2+ product lines and the
  // ad-analysis prompt asked Gemini to pick one (see ad-analyze.ts's
  // `candidates` param) — null/absent otherwise. Not itself written to
  // ads.product_line_id directly; weekly-ads-sync.ts's resolveProductLineId
  // validates it against the candidate list before trusting it.
  productLineId: z.string().nullable().optional(),
  // Which of OUR OWN ICP pain-point/solution items (see icp-angles.ts) this
  // ad's message is closest to — a separate classification pass, run once
  // `productLineId` is resolved (see classifyIcpAngle in ad-analyze.ts and
  // its call site in weekly-ads-sync.ts's analyzeIfNeeded), since which
  // ICP list applies depends on which product line this ad ended up
  // assigned to. Null when nothing in the list is a genuine match, or when
  // the classification hasn't run yet (e.g. ads analyzed before this field
  // existed, until the backfill reaches them) — optional/nullable so older
  // stored analysis objects keep parsing.
  icpAngle: z
    .object({
      category: z.enum(ANGLE_SOURCE_LISTS),
      label: z.string(),
    })
    .nullable()
    .optional(),
});

export type AdAnalysis = z.infer<typeof AdAnalysisZ>;
