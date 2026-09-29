import {
  createPartFromBase64,
  createPartFromUri,
  createUserContent,
  Type,
  type GoogleGenAI,
} from "@google/genai";
import { getGeminiModel } from "./gemini";
import { AdAnalysisZ, AD_INTENTS, type AdAnalysis } from "./ad-analysis-schema";
import { fetchImageAsBase64 } from "./fetch-image";
import { fetchVideoBuffer } from "./fetch-video";
import { ANGLE_SOURCE_LISTS, ANGLE_SOURCE_LABELS, type AngleSourceList } from "./icp-angles";
import type { IcpProfile } from "./product-lines";

// A product line this competitor is linked to — passed in only when there
// are 2+ (see weekly-ads-sync.ts's analyzeIfNeeded), so Gemini is asked to
// disambiguate using the same image it's already looking at instead of the
// sync defaulting to the competitor's first-linked line unconditionally.
export interface ProductLineCandidate {
  id: string;
  label: string;
}

// Gemini structured-output schema — keep in sync with AdAnalysisZ. Lives
// here (not ad-analysis-schema.ts) so that client-safe file never imports
// @google/genai — see its header comment. A function (not a constant) so
// the `productLineId` field can be added, enum-constrained to the given
// candidate ids, only when candidates are actually supplied — keeping the
// schema/prompt/cost identical to before for every single-line competitor.
function buildAdAnalysisResponseSchema(candidates?: ProductLineCandidate[]) {
  const required = ["summary", "intent", "usp", "persona", "productShown", "hasPerson", "personDescription", "tags"];
  const properties: Record<string, unknown> = {
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
    hasPerson: {
      type: Type.BOOLEAN,
      description: "true if the creative shows a real human person, not just the product on its own.",
    },
    personDescription: {
      type: Type.STRING,
      nullable: true,
      description:
        "Brief description of how the person appears (e.g. 'one person, upper body, holding the phone up to their face') when hasPerson is true; null/omitted otherwise.",
    },
    tags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Short lowercase keyword tags for this ad's angle/style/format.",
    },
  };
  if (candidates && candidates.length > 0) {
    required.push("productLineId");
    properties.productLineId = {
      type: Type.STRING,
      enum: candidates.map((c) => c.id),
      description: "Which of the given product lines this ad's product most likely belongs to.",
    };
  }
  return { type: Type.OBJECT, required, properties };
}

interface AdContext {
  headline: string | null;
  bodyText: string | null;
}

function buildPrompt(
  context: AdContext,
  candidates: ProductLineCandidate[] | undefined,
  media: { kind: "image" | "video"; verb: string; noun: string }
): string {
  const candidateBlock =
    candidates && candidates.length > 0
      ? `\n\nThis competitor sells more than one product line. Based on what's visually shown in
the ${media.noun}, pick exactly one of the following as the productLineId field:
${candidates.map((c) => `- ${c.id}: ${c.label}`).join("\n")}\n`
      : "";

  return `You are analyzing a competitor's ${media.kind === "video" ? "video" : "static (still image)"} ad creative for a
marketing team that wants to understand its strategy well enough to make
their own version with a different product.

Ad headline: ${context.headline ?? "(none)"}
Ad body text: ${context.bodyText ?? "(none)"}
${candidateBlock}
${media.verb} the attached ${media.noun}${media.kind === "video" ? " (including any audio)" : ""} and the text above together, then report:
- intent: the ad's primary goal
- usp: the single unique selling proposition the ad leads with, in plain language
- persona: who this ad is targeting, in plain language
- productShown: what product or product category is visually shown
- hasPerson: true if the creative shows a real human person, not just the product
- personDescription: brief description of how the person appears (e.g. "one
  person, upper body, holding the phone up to their face") when hasPerson is
  true; null otherwise
- tags: a handful of short lowercase keyword tags for its angle/style/format
- summary: one or two sentences describing the ad overall${
    candidates && candidates.length > 0
      ? "\n- productLineId: exactly one of the candidate ids listed above"
      : ""
  }

Return ONLY valid JSON matching the provided schema.`;
}

// Analyze one static ad's creative image + copy. Follows the same
// 2-attempt retry + Zod-validate + scolding-amendment pattern as the
// per-video Gemini analysis in api/analyze/[videoId]/route.ts.
export async function analyzeStaticAd(
  ai: GoogleGenAI,
  imageUrl: string,
  context: AdContext,
  candidates?: ProductLineCandidate[]
): Promise<AdAnalysis> {
  const { base64, mimeType } = await fetchImageAsBase64(imageUrl);
  const basePrompt = buildPrompt(context, candidates, { kind: "image", verb: "Look at", noun: "image" });
  const responseSchema = buildAdAnalysisResponseSchema(candidates);
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

// How long to wait for an uploaded video to leave Gemini's PROCESSING state
// before giving up — mirrors library-analyze.ts's analyzeLibraryClip, the
// only other place this app uploads video to Gemini.
const VIDEO_ACTIVE_DEADLINE_MS = 120_000;

// Analyze one video ad's creative + copy. Same output shape and candidate-
// disambiguation logic as analyzeStaticAd, but video can't go inline as
// base64 the way an image does — it goes through Gemini's Files API
// (upload, poll for ACTIVE, reference by URI, then delete), the same
// pattern already used for library clips and TikTok video analysis
// elsewhere in this app. Uses an in-memory Blob (no temp file/ffmpeg
// needed) since ai.files.upload accepts one directly.
export async function analyzeVideoAd(
  ai: GoogleGenAI,
  videoUrl: string,
  context: AdContext,
  candidates?: ProductLineCandidate[]
): Promise<AdAnalysis> {
  const { buffer, mimeType } = await fetchVideoBuffer(videoUrl);
  const blob = new Blob([Uint8Array.from(buffer)], { type: mimeType });

  let uploadedName: string | undefined;
  try {
    const uploaded = await ai.files.upload({ file: blob, config: { mimeType } });
    uploadedName = uploaded.name;

    let file = uploaded;
    const deadline = Date.now() + VIDEO_ACTIVE_DEADLINE_MS;
    while (file.state !== "ACTIVE") {
      if (file.state === "FAILED") {
        throw new Error("Gemini file processing failed");
      }
      if (Date.now() > deadline) {
        throw new Error("Timed out waiting for Gemini file to become ACTIVE");
      }
      await new Promise((r) => setTimeout(r, 2000));
      file = await ai.files.get({ name: uploadedName! });
    }

    const basePrompt = buildPrompt(context, candidates, { kind: "video", verb: "Watch", noun: "video" });
    const responseSchema = buildAdAnalysisResponseSchema(candidates);
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
          createPartFromUri(file.uri!, file.mimeType || mimeType),
          prompt,
        ]),
        config: {
          responseMimeType: "application/json",
          responseSchema,
        },
      });

      const rawText = response.text ?? "";
      try {
        return AdAnalysisZ.parse(JSON.parse(rawText));
      } catch (error) {
        lastError = error;
        console.error(
          `Gemini video ad-analysis response failed validation (attempt ${attempt + 1}):`,
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
  } finally {
    if (uploadedName) {
      try {
        await ai.files.delete({ name: uploadedName });
      } catch (cleanupError) {
        console.error("Failed to delete Gemini file:", cleanupError);
      }
    }
  }
}

export interface IcpAngleMatch {
  category: AngleSourceList;
  label: string;
}

interface IcpAngleOption {
  key: string;
  category: AngleSourceList;
  label: string;
}

function buildIcpAngleOptions(icp: IcpProfile): IcpAngleOption[] {
  const options: IcpAngleOption[] = [];
  for (const category of ANGLE_SOURCE_LISTS) {
    for (const item of icp[category]) {
      options.push({ key: `${category}::${item.label}`, category, label: item.label });
    }
  }
  return options;
}

// Classifies an already-analyzed competitor ad against OUR OWN ICP pain-
// point/solution list (icp-angles.ts) — a pure text classification
// (summary/usp/persona/productShown are already captured by
// analyzeStaticAd), run separately once the ad's product line is resolved,
// since which ICP list applies depends on that — see analyzeIfNeeded
// (weekly-ads-sync.ts) for the call site. Returns null when nothing on the
// list is a genuine match (never forces a weak fit) or when the call
// itself fails — a missing classification just means "not classified yet",
// retryable by a future backfill pass, not worth a hard failure over.
export async function classifyIcpAngle(
  ai: GoogleGenAI,
  analysis: Pick<AdAnalysis, "summary" | "usp" | "persona" | "productShown">,
  icp: IcpProfile
): Promise<IcpAngleMatch | null> {
  const options = buildIcpAngleOptions(icp);
  if (options.length === 0) return null;

  const prompt = `You are matching a competitor's ad to the closest item on OUR OWN customer
research list, for a marketing team building a content-coverage report.

The ad:
Summary: ${analysis.summary}
USP: ${analysis.usp}
Persona targeted: ${analysis.persona}
Product shown: ${analysis.productShown}

Our customer research list (grouped by category):
${ANGLE_SOURCE_LISTS.map(
    (category) =>
      `${ANGLE_SOURCE_LABELS[category]}:\n${icp[category].map((item) => `- ${category}::${item.label}`).join("\n")}`
  ).join("\n\n")}

Pick the SINGLE item this ad's message is closest to, or "none" if nothing
on the list is a genuine match — do not force a weak fit.

Return ONLY valid JSON matching the provided schema.`;

  const responseSchema = {
    type: Type.OBJECT,
    required: ["match"],
    properties: {
      match: { type: Type.STRING, enum: [...options.map((o) => o.key), "none"] },
    },
  };

  try {
    const response = await ai.models.generateContent({
      model: getGeminiModel(ai),
      contents: createUserContent([prompt]),
      config: { responseMimeType: "application/json", responseSchema },
    });
    const parsed = JSON.parse(response.text ?? "{}") as { match?: unknown };
    if (typeof parsed.match !== "string" || parsed.match === "none") return null;
    const matched = options.find((o) => o.key === parsed.match);
    return matched ? { category: matched.category, label: matched.label } : null;
  } catch (error) {
    console.error("ICP-angle classification failed:", error);
    return null;
  }
}
