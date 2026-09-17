import { z } from "zod";
import { Type } from "@google/genai";

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
  tags: z.array(z.string()).min(1),
});

export type AdAnalysis = z.infer<typeof AdAnalysisZ>;

// Gemini structured-output schema — keep in sync with AdAnalysisZ
export const adAnalysisResponseSchema = {
  type: Type.OBJECT,
  required: ["summary", "intent", "usp", "persona", "productShown", "tags"],
  properties: {
    summary: {
      type: Type.STRING,
      description: "One or two plain-language sentences describing the ad.",
    },
    intent: { type: Type.STRING, enum: [...AD_INTENTS] },
    usp: {
      type: Type.STRING,
      description:
        "The single unique selling proposition the ad leads with (e.g. 'blocks 99% of blue light while you sleep').",
    },
    persona: {
      type: Type.STRING,
      description:
        "Who this ad is targeting, in plain language (e.g. 'night-shift workers struggling to fall asleep').",
    },
    productShown: {
      type: Type.STRING,
      description: "What product or product category is visually shown in the creative.",
    },
    tags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Short lowercase keyword tags for this ad's angle/style/format.",
    },
  },
};
