import {
  createPartFromBase64,
  createUserContent,
  Modality,
  type GoogleGenAI,
} from "@google/genai";
import { GEMINI_IMAGE_MODEL } from "./gemini";
import type { ImageBytes } from "./fetch-image";
import {
  checkProductPlacement,
  placementFixupInstruction,
  checkPersonPlacement,
  personPlacementFixupInstruction,
  type PlacementQaResult,
} from "./static-ad-qa";

export type { ImageBytes };

export interface GeneratedImage {
  base64: string;
  mimeType: string;
  usage: Record<string, unknown> | undefined;
  // Both set only by generateBaseImageWithQa — absent for plain
  // generateBaseImage/refineImage calls (the manual "make lighting warmer"
  // refine path isn't QA'd, by design; see static-ad-qa.ts's header
  // comment for scope). personQa is additionally absent whenever no actor
  // swap was attempted (no person in the reference, or no actor photos
  // uploaded for this product line).
  qa?: PlacementQaResult;
  personQa?: PlacementQaResult;
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
  // What our product actually is, in plain language (e.g. "an Ocushield
  // anti-blue-light tempered-glass screen protector for smartphones") —
  // the product line's own config description. Critical when the
  // competitor's product is a visually different TYPE of accessory (e.g.
  // their ad shows a case, ours is a thin screen protector): without an
  // explicit textual anchor, weak/generic product reference photos (e.g. a
  // plain phone shot showing no visible film) give the model nothing to
  // stop it from drifting toward the competitor's product form instead.
  productDescription: string;
  // When the reference ad shows a person (see AdAnalysisZ.hasPerson) and
  // actor reference photos exist for this product line, both are passed
  // through so generateBaseImage can attempt the person swap in the SAME
  // call as the product swap — one coherent generation instead of two
  // sequential edits, which would compound drift with each hop. Null/empty
  // actorPhotos means "don't attempt a person swap", regardless of
  // personDescription.
  personDescription: string | null;
}

// Tier (a), step one: blend the reference ad's composition/style with our
// own product (and, when applicable, our own person) into one coherent
// photographic base image. A single generateContent call with the
// reference + every product photo (+ actor photos, if attempting a person
// swap) as input parts — confirmed by a real test call to actually blend
// inputs, not just reproduce one.
export async function generateBaseImage(
  ai: GoogleGenAI,
  reference: ImageBytes,
  products: ImageBytes[],
  brief: StaticAdBrief,
  actorPhotos: ImageBytes[] = []
): Promise<GeneratedImage> {
  const swapPerson = !!brief.personDescription && actorPhotos.length > 0;

  const personRule = swapPerson
    ? `\n3. OUR PERSON, not the competitor's. The reference ad shows a person
   (${brief.personDescription}). Replace that person with the person shown
   in the actor reference photos (provided after the product photos below)
   — keep their general pose and interaction with the product, but it must
   be OUR person's actual likeness, not the competitor's model and not a
   generic stand-in.`
    : `\n3. If the reference ad shows a person, do not depict any person at all
   in the output unless product reference photos require one for scale —
   no actor reference photos were provided for this generation.`;

  const prompt = `You are creating a new advertising photo for a product, using an
existing ad as a style/composition reference.

CRITICAL RULES (all are commonly violated — follow them exactly):
1. NO TEXT. The reference image is full of text (headlines, badges, logos,
   callouts) — your output must contain ZERO text, words, letters, numbers,
   or logos anywhere in the image, even if the reference has them baked in.
   All text is added separately afterward as a real, editable layer. An
   image with any text in it is a failed result.
2. OUR PRODUCT'S ACTUAL FORM, not the competitor's. Our product is:
   "${brief.productDescription}". If the competitor's product in the
   reference is a visually different TYPE of item than ours (e.g. their ad
   shows a case/mount/stand and ours is a thin film, or vice versa), you
   must render OUR product's real physical form as described above — do
   NOT keep the competitor's product's shape, thickness, or silhouette and
   just relabel it. Our product images are among the input photos below;
   trust the text description above over the shape of a generic reference
   photo if they seem to conflict.${personRule}

The FIRST image is a competitor's ad creative — use its composition, framing,
lighting, and overall visual style as a reference ONLY. The competitor's
product itself must NOT appear anywhere in the output — do not depict it,
even partially or in the background. Replace it entirely.
The NEXT ${products.length} image(s) are real reference photos of our own
product — use them to render the actual product accurately (matching its
real shape, color, and branding), not a generic stand-in, and it must be
the ONLY product visible in the generated image.${
    swapPerson
      ? ` The FINAL ${actorPhotos.length} image(s) are real reference photos of the person to use in place of the competitor's model.`
      : ""
  }

Generate ONE new photographic image that follows the first image's
composition/style/layout, but with the competitor's product fully replaced
by our own product from the reference photos.
The ad's message is: "${brief.usp}".
Marketing angle: ${brief.angle}.
Target persona: ${brief.persona || "same as the reference ad's apparent audience"}.
${brief.backgroundInstruction ? `Background/setting: ${brief.backgroundInstruction}.` : "Match the reference ad's setting, lighting, and composition."}
Reminder: no text/logos/captions anywhere in the image. Photorealistic, no
watermarks.`;

  const response = await ai.models.generateContent({
    model: GEMINI_IMAGE_MODEL,
    contents: createUserContent([
      createPartFromBase64(reference.base64, reference.mimeType),
      ...products.map((p) => createPartFromBase64(p.base64, p.mimeType)),
      ...(swapPerson ? actorPhotos.map((p) => createPartFromBase64(p.base64, p.mimeType)) : []),
      prompt,
    ]),
    config: { responseModalities: [Modality.IMAGE] },
  });

  return extractImage(response);
}

// Product + (when applicable) person placement QA, layered on top of
// generateBaseImage: two INDEPENDENT check→fix-up→recheck cycles, product
// first, then person (on whatever image the product cycle left behind) —
// kept as two separate cycles rather than one combined pass so a passing
// product and a flagged person (or vice versa) are each visible on their
// own, per the same reasoning as static-ad-qa.ts's two separate check
// functions. Each cycle is bounded to a single retry so a stubborn image
// can't loop forever; whatever the second check says is final, and the
// (possibly still-flagged) result is what gets shown to the user, qa
// results attached so the UI can surface them rather than silently hide
// them.
export async function generateBaseImageWithQa(
  ai: GoogleGenAI,
  reference: ImageBytes,
  products: ImageBytes[],
  brief: StaticAdBrief,
  actorPhotos: ImageBytes[] = []
): Promise<GeneratedImage> {
  let image = await generateBaseImage(ai, reference, products, brief, actorPhotos);
  let qa = await checkProductPlacement(ai, image, brief.productDescription);

  if (!qa.passed) {
    try {
      const fixed = await refineImage(ai, image, placementFixupInstruction(qa.issues));
      const recheck = await checkProductPlacement(ai, fixed, brief.productDescription);
      image = fixed;
      qa = recheck;
    } catch (error) {
      // Keep the original image + its QA result if the fix-up call itself
      // fails — a failed fix-up shouldn't discard an otherwise-usable
      // attempt, just leave it flagged.
      console.error("Product placement fix-up failed:", error);
    }
  }

  const swapPerson = !!brief.personDescription && actorPhotos.length > 0;
  if (!swapPerson) {
    return { ...image, qa };
  }

  let personQa = await checkPersonPlacement(ai, image, brief.personDescription!);
  if (!personQa.passed) {
    try {
      const fixed = await refineImage(ai, image, personPlacementFixupInstruction(personQa.issues));
      const recheck = await checkPersonPlacement(ai, fixed, brief.personDescription!);
      image = fixed;
      personQa = recheck;
    } catch (error) {
      console.error("Person placement fix-up failed:", error);
    }
  }

  return { ...image, qa, personQa };
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
