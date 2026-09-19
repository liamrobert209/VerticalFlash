import { createUserContent, Type, type GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { getGeminiModel } from "./gemini";

// Real ad copy (headline/subhead/CTA), written by Gemini as text — not
// image pixels. Distinct from static-ad-generate.ts's base-image
// generation, which explicitly excludes text ("that gets added
// separately"): this is the "separately". The result is rendered onto the
// image later by the deterministic canvas compositor (static-ad-overlays.ts),
// so it's always crisp, on-brand, and typo-free — Gemini only ever
// authors the words, never draws them.

const AdCopyZ = z.object({
  headline: z.string().min(1),
  subhead: z.string().min(1),
  cta: z.string().min(1),
});

export type AdCopy = z.infer<typeof AdCopyZ>;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  required: ["headline", "subhead", "cta"],
  properties: {
    headline: {
      type: Type.STRING,
      description: "A short, punchy headline (roughly 3-8 words) leading with the given angle.",
    },
    subhead: {
      type: Type.STRING,
      description: "One short supporting sentence expanding on the headline — plain, specific, no fluff.",
    },
    cta: {
      type: Type.STRING,
      description: "A 2-4 word call-to-action button label, e.g. \"Shop now\", \"Get yours\".",
    },
  },
};

export interface AdCopyContext {
  // The competitor reference ad's own copy — used purely as a structural/
  // tonal reference (length, hook style), never copied verbatim.
  referenceHeadline: string | null;
  referenceBodyText: string | null;
}

export interface AdCopyBrief {
  brandName: string;
  productName: string;
  usp: string;
  angle: string;
  persona: string;
}

function buildPrompt(context: AdCopyContext, brief: AdCopyBrief): string {
  return `You are writing headline/subhead/CTA copy for a static ad, replacing a
competitor's ad with our own — same general structure and tone, but about
our own product and our own angle, not theirs.

Competitor's ad copy (reference for STRUCTURE/TONE ONLY — do not reuse
their wording, claims, or product):
Headline: ${context.referenceHeadline ?? "(none)"}
Body: ${context.referenceBodyText ?? "(none)"}

Our ad:
Brand: ${brief.brandName}
Product: ${brief.productName}
What we're leading with (USP): ${brief.usp}
Angle: ${brief.angle}
Target persona: ${brief.persona || "same as the reference ad's apparent audience"}

Write:
- headline: short and punchy, leading with the angle above
- subhead: one short supporting sentence, specific and plain, no fluff
- cta: a 2-4 word button label

Rules:
- Never invent statistics, review counts, ratings, awards, or claims not
  given above (e.g. do not write "rated 4.8 stars" or "10,000+ customers"
  unless that exact fact was given to you).
- Use the brand/product name exactly as spelled above — do not pluralize,
  abbreviate, or alter it.
- Match the competitor ad's general length/hook style, but the message
  must be entirely about our own product and angle.

Return ONLY valid JSON matching the provided schema.`;
}

// Follows the same 2-attempt retry + Zod-validate + scolding-amendment
// pattern as analyzeStaticAd (ad-analyze.ts).
export async function generateAdCopy(
  ai: GoogleGenAI,
  context: AdCopyContext,
  brief: AdCopyBrief
): Promise<AdCopy> {
  const basePrompt = buildPrompt(context, brief);
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? basePrompt
        : `${basePrompt}\n\nIMPORTANT: Your previous response was rejected (${
            lastError instanceof Error ? lastError.message : "invalid JSON"
          }). Return ONLY valid JSON matching the provided schema.`;

    const response = await ai.models.generateContent({
      model: getGeminiModel(ai),
      contents: createUserContent([prompt]),
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const rawText = response.text ?? "";
    try {
      return AdCopyZ.parse(JSON.parse(rawText));
    } catch (error) {
      lastError = error;
      console.error(
        `Gemini ad-copy response failed validation (attempt ${attempt + 1}):`,
        error,
        "\nraw:",
        rawText.slice(0, 2000)
      );
    }
  }

  throw new Error(
    `Gemini returned invalid ad copy after retry: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}
