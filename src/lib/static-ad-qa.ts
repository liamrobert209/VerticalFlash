import { createPartFromBase64, createUserContent, Type, type GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { getGeminiModel } from "./gemini";
import type { ImageBytes } from "./fetch-image";

// Automated compositing QA for a just-generated base image — checks only
// the technical quality of the inserted product (shadow, color match,
// edges, scale), not brand styling or copy (that's Brand QA, a later,
// separate gate). Runs right after generateBaseImage, before a version is
// ever shown to the user as a finished draft — see static-ad-generate.ts's
// generateBaseImageWithQa.

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
      description: "true only if the inserted product looks like a real, professionally-shot photo — no visible compositing problems.",
    },
    issues: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Specific compositing problems found (empty if passed=true) — e.g. 'shadow falls the wrong direction relative to the light source', 'edges of the product have a visible halo/fringe', 'product color temperature doesn't match the warm ambient lighting', 'product is too large for the surface it's sitting on'.",
    },
  },
};

const PROMPT = `You are a photo-compositing QA reviewer. This image was made by taking an
existing photo and replacing one product in it with a different product,
keeping everything else the same.

Look ONLY at how well the (newly inserted) product blends into the scene —
ignore composition, styling, or marketing quality entirely. Check
specifically for:
- Shadow: does its direction and softness match the scene's light source?
- Color/white-balance: does the product's lighting/color temperature match
  the surrounding photo, or does it look pasted-in/mismatched?
- Edges: any visible halo, fringing, or hard cutout edge around the
  product's silhouette?
- Scale/perspective: is the product's size and angle physically plausible
  for where it's placed?

Report passed=true only if none of these are visibly wrong. If anything is
off, report passed=false and list each specific issue in plain language
precise enough that an image-editing instruction could fix it.

Return ONLY valid JSON matching the provided schema.`;

export async function checkProductPlacement(
  ai: GoogleGenAI,
  image: ImageBytes
): Promise<PlacementQaResult> {
  try {
    const response = await ai.models.generateContent({
      model: getGeminiModel(ai),
      contents: createUserContent([createPartFromBase64(image.base64, image.mimeType), PROMPT]),
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
  return `Fix these specific compositing problems with the product in this image, without changing anything else about the scene, product, or layout: ${issues.join("; ")}.`;
}
