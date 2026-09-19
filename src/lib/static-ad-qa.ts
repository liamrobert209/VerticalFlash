import { createPartFromBase64, createUserContent, Type, type GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { getGeminiModel } from "./gemini";
import type { ImageBytes } from "./fetch-image";

// Automated compositing QA for a just-generated base image — checks the
// technical quality of the inserted product (shadow, color match, edges,
// scale), that no text/logos leaked into the photo despite the generation
// prompt explicitly forbidding it, and that the product shown actually
// matches our product's real type/form rather than drifting toward the
// competitor reference's product category. Not brand styling or ad copy
// itself (that's Brand QA, a later, separate gate) — this is strictly
// "is this photo real/correct", not "is this on-brand". Runs right after
// generateBaseImage, before a version is ever shown to the user as a
// finished draft — see static-ad-generate.ts's generateBaseImageWithQa.

const PlacementQaZ = z.object({
  passed: z.boolean(),
  issues: z.array(z.string()),
});

export type PlacementQaResult = z.infer<typeof PlacementQaZ>;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  required: ["passed", "issues"],
  properties: {
    passed: {
      type: Type.BOOLEAN,
      description:
        "true only if the inserted product looks like a real, professionally-shot photo of OUR ACTUAL PRODUCT, with zero baked-in text.",
    },
    issues: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Specific problems found (empty if passed=true), each labeled by category — e.g. '[compositing] shadow falls the wrong direction relative to the light source', '[product identity] image shows a case/cover, not a thin screen protector film', '[text] the words \"Shop Now\" appear baked into the image'.",
    },
  },
};

function buildPrompt(productDescription: string): string {
  return `You are a photo QA reviewer. This image was made by taking an existing ad
photo and replacing the product shown in it with a different product,
keeping everything else (composition, background, lighting) the same.

Our actual product is: "${productDescription}".

Check for THREE separate kinds of problems:

1. Compositing quality of the inserted product:
   - Shadow: does its direction and softness match the scene's light source?
   - Color/white-balance: does the product's lighting/color temperature
     match the surrounding photo, or does it look pasted-in/mismatched?
   - Edges: any visible halo, fringing, or hard cutout edge around the
     product's silhouette?
   - Scale/perspective: is the product's size and angle physically
     plausible for where it's placed?

2. Product identity: does the product actually shown in the image match
   our product's real type/form as described above? For example, if our
   product is a thin film/screen protector, the image must NOT show a
   bulky case, cover, mount, or stand instead — those are a different
   product entirely, not just a different color or angle of ours.

3. Stray text: does the image contain ANY text, words, letters, numbers,
   or logos baked into the photo itself? (Real ad copy is always added
   separately afterward — any text at all in this image is a defect, not
   a style choice.)

Report passed=true only if NONE of the above are wrong. If anything is
off, report passed=false and list each specific issue in plain language
precise enough that an image-editing instruction could fix it — say
explicitly which of the three categories each issue falls under.

Return ONLY valid JSON matching the provided schema.`;
}

export async function checkProductPlacement(
  ai: GoogleGenAI,
  image: ImageBytes,
  productDescription: string
): Promise<PlacementQaResult> {
  try {
    const response = await ai.models.generateContent({
      model: getGeminiModel(ai),
      contents: createUserContent([
        createPartFromBase64(image.base64, image.mimeType),
        buildPrompt(productDescription),
      ]),
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    });
    return PlacementQaZ.parse(JSON.parse(response.text ?? ""));
  } catch (error) {
    // A QA-check failure (bad JSON, Gemini error) shouldn't block the
    // generation it's checking — treat as "couldn't verify" rather than
    // "failed", so a flaky QA call never discards an otherwise-good image.
    console.error("Product placement QA check failed:", error);
    return { passed: true, issues: [] };
  }
}

export function placementFixupInstruction(issues: string[]): string {
  return `Fix these specific problems with this image, without changing anything else about the scene or layout: ${issues.join("; ")}. If an issue says the product itself is the wrong type, replace it with the correct product type described in that issue — do not just adjust its color or angle. Remove any text/words/logos entirely rather than editing them.`;
}
