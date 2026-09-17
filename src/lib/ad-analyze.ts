import {
  createPartFromBase64,
  createUserContent,
  type GoogleGenAI,
} from "@google/genai";
import { getGeminiModel } from "./gemini";
import { AdAnalysisZ, adAnalysisResponseSchema, type AdAnalysis } from "./ad-analysis-schema";

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
- product_shown: what product or product category is visually shown
- tags: a handful of short lowercase keyword tags for its angle/style/format
- summary: one or two sentences describing the ad overall

Return ONLY valid JSON matching the provided schema.`;
}

async function fetchImageAsBase64(
  url: string
): Promise<{ base64: string; mimeType: string }> {
  // Some CDNs (confirmed: Wikimedia; ad-network CDNs like Facebook's are a
  // real risk too) reject requests with no browser-like User-Agent.
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) {
    throw new Error(`Fetching ad creative image failed: HTTP ${res.status}`);
  }
  const mimeType = res.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { base64: buffer.toString("base64"), mimeType };
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
