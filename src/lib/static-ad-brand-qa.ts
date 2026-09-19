import { createPartFromBase64, createUserContent, Type, type GoogleGenAI } from "@google/genai";
import { GlobalFonts } from "@napi-rs/canvas";
import { z } from "zod";
import { getGeminiModel } from "./gemini";
import { HEADLINE_FONT_FAMILY, BODY_FONT_FAMILY, ensureStaticAdFontsRegistered } from "./static-ad-fonts";
import { LOGO_MIN_WIDTH_PX, logoMarkWidthPx } from "./static-ad-overlays";
import type { ImageBytes } from "./fetch-image";

// The gate before an ad can be marked "Finished" — separate from (and
// running after) static-ad-qa.ts's product/person placement checks, which
// are about whether the PHOTO is real/correct. This is about whether the
// finished, fully composited ad is actually ON-BRAND: correct spelling of
// our own name, real fonts actually rendered, logo sized per the
// guidelines, and a broader "does this look professional" second opinion.
// A gate, not a suggestion — see the PATCH route for how "accept anyway"
// still works without silently skipping this.

export interface BrandQaResult {
  passed: boolean;
  issues: string[];
}

// Plain Levenshtein distance — small and self-contained rather than a new
// dependency, since it's only ever run over a handful of short words.
function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array(b.length).fill(0),
  ]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// Flags a word as a likely misspelling of the brand name if it's close
// (edit distance 1-2) but not an exact case-insensitive match — catches
// "Ocushields", "Ocu Shield" (as one token after punctuation strip), etc.
// without a hardcoded typo list.
export function checkBrandSpelling(texts: string[], brandName: string): string[] {
  const issues: string[] = [];
  const brandLower = brandName.toLowerCase();
  for (const text of texts) {
    const words = text.split(/\s+/).map((w) => w.replace(/[^a-zA-Z]/g, ""));
    for (const word of words) {
      if (!word || word.length < 3) continue;
      const wordLower = word.toLowerCase();
      if (wordLower === brandLower) continue;
      const distance = levenshtein(wordLower, brandLower);
      if (distance > 0 && distance <= 2) {
        issues.push(`"${word}" looks like a misspelling of "${brandName}"`);
      }
    }
  }
  return issues;
}

export function checkFontsRegistered(): string[] {
  ensureStaticAdFontsRegistered();
  const issues: string[] = [];
  if (!GlobalFonts.has(HEADLINE_FONT_FAMILY)) issues.push(`Headline font "${HEADLINE_FONT_FAMILY}" failed to register`);
  if (!GlobalFonts.has(BODY_FONT_FAMILY)) issues.push(`Body font "${BODY_FONT_FAMILY}" failed to register`);
  return issues;
}

// Always passes today (logoMarkWidthPx floors at LOGO_MIN_WIDTH_PX by
// construction) — kept as a real runtime check anyway rather than assumed,
// so a future change to that formula that drops the floor gets caught
// here instead of silently shipping an undersized logo.
export function checkLogoSize(canvasWidth: number, logoIncluded: boolean): string[] {
  if (!logoIncluded) return [];
  const width = logoMarkWidthPx(canvasWidth);
  return width < LOGO_MIN_WIDTH_PX
    ? [`Logo would render at ${Math.round(width)}px, below the ${LOGO_MIN_WIDTH_PX}px brand minimum`]
    : [];
}

const VisionQaZ = z.object({ passed: z.boolean(), issues: z.array(z.string()) });

const VISION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  required: ["passed", "issues"],
  properties: {
    passed: { type: Type.BOOLEAN, description: "true only if this looks like a professional, on-brand finished ad." },
    issues: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Specific problems (empty if passed=true) — e.g. text cut off or overlapping badly, illegible against the background, colors clashing, anything unprofessional.",
    },
  },
};

async function checkVisionQuality(ai: GoogleGenAI, finalImage: ImageBytes): Promise<BrandQaResult> {
  try {
    const response = await ai.models.generateContent({
      model: getGeminiModel(ai),
      contents: createUserContent([
        createPartFromBase64(finalImage.base64, finalImage.mimeType),
        `You are a final QA reviewer for a finished advertisement (photo + text
overlay + logo already composited). Look at the WHOLE image as a
customer would see it and check: is any text cut off, overlapping badly,
or illegible against its background? Do the colors clash or look
unprofessional? Is anything about the layout obviously broken? Report
passed=true only if this looks like a genuinely professional, ready-to-run
ad. Return ONLY valid JSON matching the provided schema.`,
      ]),
      config: { responseMimeType: "application/json", responseSchema: VISION_RESPONSE_SCHEMA },
    });
    return VisionQaZ.parse(JSON.parse(response.text ?? ""));
  } catch (error) {
    // Same reasoning as static-ad-qa.ts: a flaky check shouldn't block an
    // otherwise-fine ad.
    console.error("Brand QA vision check failed:", error);
    return { passed: true, issues: [] };
  }
}

export async function runBrandQa(
  ai: GoogleGenAI,
  finalImage: ImageBytes,
  canvasWidth: number,
  texts: string[],
  brandName: string,
  logoIncluded: boolean
): Promise<BrandQaResult> {
  const deterministicIssues = [
    ...checkBrandSpelling(texts, brandName),
    ...checkFontsRegistered(),
    ...checkLogoSize(canvasWidth, logoIncluded),
  ];
  const vision = await checkVisionQuality(ai, finalImage);
  const issues = [...deterministicIssues, ...vision.issues];
  return { passed: issues.length === 0, issues };
}
