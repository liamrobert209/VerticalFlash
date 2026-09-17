import {
  createPartFromBase64,
  createUserContent,
  Modality,
  type GoogleGenAI,
} from "@google/genai";
import { GEMINI_IMAGE_MODEL } from "./gemini";
import type { ImageBytes } from "./fetch-image";

export type { ImageBytes };

export interface GeneratedImage {
  base64: string;
  mimeType: string;
  usage: Record<string, unknown> | undefined;
}

function extractImage(response: {
  candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
  text?: string;
  usageMetadata?: unknown;
}): GeneratedImage {
  const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) {
    throw new Error(
      response.text
        ? `Gemini returned text instead of an image: ${response.text.slice(0, 300)}`
        : "Gemini did not return an image"
    );
  }
  return {
    base64: part.inlineData.data,
    mimeType: part.inlineData.mimeType || "image/png",
    usage: response.usageMetadata as Record<string, unknown> | undefined,
  };
}

export interface StaticAdBrief {
  usp: string;
  angle: string;
  persona: string;
  backgroundInstruction: string | null;
}

// Tier (a), step one: blend the reference ad's composition/style with our
// own product into one coherent photographic base image. A single
// generateContent call with the reference + every product photo as input
// parts — confirmed by a real test call to actually blend inputs, not just
// reproduce one.
export async function generateBaseImage(
  ai: GoogleGenAI,
  reference: ImageBytes,
  products: ImageBytes[],
  brief: StaticAdBrief
): Promise<GeneratedImage> {
  const prompt = `You are creating a new advertising photo for a product, using an
existing ad as a style/composition reference.

The FIRST image is a competitor's ad creative — use its composition, framing,
lighting, and overall visual style as a reference ONLY. The competitor's
product itself must NOT appear anywhere in the output — do not depict it,
even partially or in the background. Replace it entirely.
The REMAINING image(s) are real reference photos of our own product — use
them to render the actual product accurately (matching its real shape,
color, and branding), not a generic stand-in, and it must be the ONLY
product visible in the generated image.

Generate ONE new photographic image that follows the first image's
composition/style/layout, but with the competitor's product fully replaced
by our own product from the reference photos.
The ad's message is: "${brief.usp}".
Marketing angle: ${brief.angle}.
Target persona: ${brief.persona || "same as the reference ad's apparent audience"}.
${brief.backgroundInstruction ? `Background/setting: ${brief.backgroundInstruction}.` : "Match the reference ad's setting, lighting, and composition."}
Do not add any text, logos, or captions to the image — that gets added
separately. Photorealistic, no watermarks.`;

  const response = await ai.models.generateContent({
    model: GEMINI_IMAGE_MODEL,
    contents: createUserContent([
      createPartFromBase64(reference.base64, reference.mimeType),
      ...products.map((p) => createPartFromBase64(p.base64, p.mimeType)),
      prompt,
    ]),
    config: { responseModalities: [Modality.IMAGE] },
  });

  return extractImage(response);
}

// Tier (a), sequential refinement: an edit-style follow-up against the
// previously accepted/latest attempt's image — "make the lighting
// warmer", "move the product left", etc. Single-image input, same
// generateContent + IMAGE modality mechanism.
export async function refineImage(
  ai: GoogleGenAI,
  previous: ImageBytes,
  instruction: string
): Promise<GeneratedImage> {
  const response = await ai.models.generateContent({
    model: GEMINI_IMAGE_MODEL,
    contents: createUserContent([
      createPartFromBase64(previous.base64, previous.mimeType),
      `Edit this image: ${instruction}. Keep everything else the same. Do not add any text, logos, or captions.`,
    ]),
    config: { responseModalities: [Modality.IMAGE] },
  });

  return extractImage(response);
}
