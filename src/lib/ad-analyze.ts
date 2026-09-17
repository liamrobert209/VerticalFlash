import {
  createPartFromBase64,
  createUserContent,
  Type,
  type GoogleGenAI,
} from "@google/genai";
import { getGeminiModel } from "./gemini";
import { AdAnalysisZ, AD_INTENTS, type AdAnalysis } from "./ad-analysis-schema";
import { fetchImageAsBase64 } from "./fetch-image";

// Gemini structured-output schema — keep in sync with AdAnalysisZ. Lives
// here (not ad-analysis-schema.ts) so that client-safe file never imports
// @google/genai — see its header comment.
const adAnalysisResponseSchema = {
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

interface AdContext {
  headline: string | null;
  bodyText: string | null;
}

function buildPrompt(context: AdContext): string {
  return `You are analyzing a competitor's static (still image) ad creative for a
marketing team that wants to understand its strategy well enough to make
their own version with a different product.

Ad headline: ${context.headline ?? "(none)"}
Ad body text: ${context.bodyText ?? "(none)"}

Look at the attached image and the text above together, then report:
- intent: the ad's primary goal
- usp: the single unique selling proposition the ad leads with, in plain language
- persona: who this ad is targeting, in plain language
- productShown: what product or product category is visually shown
- tags: a handful of short lowercase keyword tags for its angle/style/format
- summary: one or two sentences describing the ad overall

Return ONLY valid JSON matching the provided schema.`;
}

// Analyze one static ad's creative image + copy. Follows the same
// 2-attempt retry + Zod-validate + scolding-amendment pattern as the
// per-video Gemini analysis in api/analyze/[videoId]/route.ts.
export async function analyzeStaticAd(
  ai: GoogleGenAI,
  imageUrl: string,
  context: AdContext
): Promise<AdAnalysis> {
  const { base64, mimeType } = await fetchImageAsBase64(imageUrl);
  const basePrompt = buildPrompt(context);
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
      contents: createUserContent([
        createPartFromBase64(base64, mimeType),
        prompt,
      ]),
      config: {
        responseMimeType: "application/json",
        responseSchema: adAnalysisResponseSchema,
      },
    });

    const rawText = response.text ?? "";
    try {
      return AdAnalysisZ.parse(JSON.parse(rawText));
    } catch (error) {
      lastError = error;
      console.error(
        `Gemini ad-analysis response failed validation (attempt ${attempt + 1}):`,
        error,
        "\nraw:",
        rawText.slice(0, 2000)
      );
    }
  }

  throw new Error(
    `Gemini returned an invalid ad analysis after retry: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}
