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

// Tier (a), step one: blend the reference ad's composition/style with our
// own product into one coherent photographic base image. A single
// generateContent call with both images as input parts — confirmed by a
// real test call to actually blend both inputs, not just reproduce one.
export async function generateBaseImage(
  ai: GoogleGenAI,
  reference: ImageBytes,
  product: ImageBytes,
  usp: string
): Promise<GeneratedImage> {
  const prompt = `You are creating a new advertising photo for a product, using an
existing ad as a style/composition reference.

The FIRST image is a competitor's ad creative — use its composition, framing,
lighting, and overall visual style as a reference.
The SECOND image is our own product.

Generate ONE new photographic image that follows the first image's
composition/style/layout, but features the product from the second image
instead. The ad's message is: "${usp}". Do not add any text, logos, or
captions to the image — that gets added separately. Photorealistic, no
watermarks.`;

  const response = await ai.models.generateContent({
    model: GEMINI_IMAGE_MODEL,
    contents: createUserContent([
      createPartFromBase64(reference.base64, reference.mimeType),
      createPartFromBase64(product.base64, product.mimeType),
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
