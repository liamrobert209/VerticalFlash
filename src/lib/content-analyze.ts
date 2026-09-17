import {
  createPartFromBase64,
  createUserContent,
  Type,
  type GoogleGenAI,
} from "@google/genai";
import { getGeminiModel } from "./gemini";
import { ContentAnalysisZ, CONTENT_TOPICS, type ContentAnalysis } from "./content-analysis-schema";
import { fetchImageAsBase64 } from "./fetch-image";
// Type-only import: erased at compile time, no bundle bleed into this
// server-only file's callers. ProductLineCandidate is already fully
// generic (id/label, zero ad-specific fields) — reused as-is rather than
// duplicated, per ad-analyze.ts's own header comment on this type.
import type { ProductLineCandidate } from "./ad-analyze";

export type { ProductLineCandidate };

// Gemini structured-output schema — keep in sync with ContentAnalysisZ.
// Lives here (not content-analysis-schema.ts) so that client-safe file
// never imports @google/genai — see its header comment. A function (not a
// constant) so the `productLineId` field can be added, enum-constrained to
// the given candidate ids, only when candidates are actually supplied —
// keeping the schema/prompt/cost identical to before for every
// single-line account. Mirrors buildAdAnalysisResponseSchema exactly.
function buildContentAnalysisResponseSchema(candidates?: ProductLineCandidate[]) {
  const required = ["summary", "topic", "painPoint", "solutionAddressed", "productShown", "tags"];
  const properties: Record<string, unknown> = {
    summary: {
      type: Type.STRING,
      description: "One or two plain-language sentences describing the post.",
    },
    topic: { type: Type.STRING, enum: [...CONTENT_TOPICS] },
    painPoint: {
      type: Type.STRING,
      description:
        "The pain point this post leads with, in plain language. Empty string if the post doesn't lead with one (e.g. pure lifestyle/humor content).",
    },
    solutionAddressed: {
      type: Type.STRING,
      description: "The solution or benefit the post offers in response to that pain point.",
    },
    productShown: {
      type: Type.STRING,
      description: "What product or product category is visually shown in the post.",
    },
    tags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Short lowercase keyword tags for this post's angle/style/format.",
    },
  };
  if (candidates && candidates.length > 0) {
    required.push("productLineId");
    properties.productLineId = {
      type: Type.STRING,
      enum: candidates.map((c) => c.id),
      description: "Which of the given product lines this post's product most likely belongs to.",
    };
  }
  return { type: Type.OBJECT, required, properties };
}

interface ContentContext {
  caption: string | null;
  platformId: string;
}

function buildPrompt(context: ContentContext, candidates?: ProductLineCandidate[]): string {
  const candidateBlock =
    candidates && candidates.length > 0
      ? `\n\nThis account is linked to more than one product line. Based on what's visually shown in
the image, pick exactly one of the following as the productLineId field:
${candidates.map((c) => `- ${c.id}: ${c.label}`).join("\n")}\n`
      : "";

  return `You are analyzing a competitor or creator's organic social post (a still image, or a
video's poster frame) for a marketing team that wants to understand its content
strategy well enough to make their own version with a different product.

Platform: ${context.platformId}
Caption: ${context.caption ?? "(none)"}
${candidateBlock}
Look at the attached image and the caption above together, then report:
- topic: the post's primary content category
- painPoint: the pain point this post leads with, in plain language (empty string if none)
- solutionAddressed: the solution or benefit offered in response to that pain point
- productShown: what product or product category is visually shown
- tags: a handful of short lowercase keyword tags for its angle/style/format
- summary: one or two sentences describing the post overall${
    candidates && candidates.length > 0
      ? "\n- productLineId: exactly one of the candidate ids listed above"
      : ""
  }

Return ONLY valid JSON matching the provided schema.`;
}

// Analyze one scraped post's thumbnail image + caption. Follows the same
// 2-attempt retry + Zod-validate + scolding-amendment pattern as
// analyzeStaticAd (ad-analyze.ts). `imageUrl` should be a still image —
// for video posts, pass the thumbnail/poster-frame URL, never a raw video
// URL (same constraint the ads pipeline has; Gemini can't take a video
// file here).
export async function analyzeContent(
  ai: GoogleGenAI,
  imageUrl: string,
  context: ContentContext,
  candidates?: ProductLineCandidate[]
): Promise<ContentAnalysis> {
  const { base64, mimeType } = await fetchImageAsBase64(imageUrl);
  const basePrompt = buildPrompt(context, candidates);
  const responseSchema = buildContentAnalysisResponseSchema(candidates);
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
        responseSchema,
      },
    });

    const rawText = response.text ?? "";
    try {
      return ContentAnalysisZ.parse(JSON.parse(rawText));
    } catch (error) {
      lastError = error;
      console.error(
        `Gemini content-analysis response failed validation (attempt ${attempt + 1}):`,
        error,
        "\nraw:",
        rawText.slice(0, 2000)
      );
    }
  }

  throw new Error(
    `Gemini returned an invalid content analysis after retry: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}
