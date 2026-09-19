import { createPartFromBase64, createUserContent, Type, type GoogleGenAI } from "@google/genai";
import { loadImage, createCanvas } from "@napi-rs/canvas";
import { z } from "zod";
import { getGeminiModel } from "./gemini";
import type { ImageBytes } from "./fetch-image";
import type { OverlayRole, StaticAdAnchor } from "./static-ad-overlays-schema";

// Phase 10 — replaces "always top/center/bottom" with a real analysis of
// the accepted photo: where's the open/clean space, and (given the
// competitor's ad as one input signal) where did THEY put their text.
// Colors are picked deterministically afterward by sampling the actual
// pixels in the chosen zone and computing real WCAG contrast against the
// real brand palette — not guessed. The result is a suggestion, not an
// automatic apply: the wizard shows it and lets the user override it (see
// the /suggest-placement route and OverlayEditor's "Suggest placement").

const ZoneZ = z.object({
  role: z.enum(["headline", "subhead", "cta"]),
  xPct: z.number().min(0).max(1),
  yPct: z.number().min(0).max(1),
  widthPct: z.number().min(0).max(1),
  align: z.enum(["left", "center", "right"]),
  reason: z.string(),
});

const ZonesResponseZ = z.object({ zones: z.array(ZoneZ) });

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  required: ["zones"],
  properties: {
    zones: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["role", "xPct", "yPct", "widthPct", "align", "reason"],
        properties: {
          role: { type: Type.STRING, enum: ["headline", "subhead", "cta"] },
          xPct: { type: Type.NUMBER, description: "Left edge of the open area, 0-1 fraction of image width." },
          yPct: { type: Type.NUMBER, description: "Top edge of the open area, 0-1 fraction of image height." },
          widthPct: { type: Type.NUMBER, description: "Width of the open area, 0-1 fraction of image width." },
          align: { type: Type.STRING, enum: ["left", "center", "right"], description: "Natural text alignment for this spot." },
          reason: { type: Type.STRING, description: "One short phrase: what makes this spot open/clean, e.g. 'plain sky area', 'matches where the reference ad placed its headline'." },
        },
      },
    },
  },
};

function buildPrompt(roles: OverlayRole[], hasReference: boolean): string {
  return `You are placing text on an advertising photo. Look at the FIRST image (our
finished product photo) ${hasReference ? "and the SECOND image (the competitor ad we're basing this on, for reference only)" : ""}.

For each of these text elements: ${roles.join(", ")} — find the most open,
visually clean area of OUR photo (the first image) suited to that element,
avoiding the main product/subject and any busy detail. ${
    hasReference
      ? "Where the competitor's ad placed its own equivalent text is one useful signal for where text naturally belongs in this kind of composition — but the final choice must be a genuinely open area of OUR photo, not necessarily the identical spot if our photo's composition differs."
      : ""
  }
Headline and subhead are usually near each other; CTA is often separate
(e.g. bottom-anchored). Give each a natural text alignment for its
position (near a left edge → left-aligned, etc.).

Return ONLY valid JSON matching the provided schema.`;
}

export interface PlacementSuggestion {
  role: OverlayRole;
  anchor: StaticAdAnchor;
  textColorOverride: string;
  reason: string;
}

async function suggestZones(
  ai: GoogleGenAI,
  photo: ImageBytes,
  reference: ImageBytes | null,
  roles: OverlayRole[]
): Promise<z.infer<typeof ZoneZ>[]> {
  try {
    const parts = [createPartFromBase64(photo.base64, photo.mimeType)];
    if (reference) parts.push(createPartFromBase64(reference.base64, reference.mimeType));
    const response = await ai.models.generateContent({
      model: getGeminiModel(ai),
      contents: createUserContent([...parts, buildPrompt(roles, !!reference)]),
      config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
    });
    return ZonesResponseZ.parse(JSON.parse(response.text ?? "")).zones;
  } catch (error) {
    console.error("Text placement zone suggestion failed:", error);
    return [];
  }
}

// Standard WCAG relative luminance / contrast ratio math — real formulas,
// not an approximation, since this is what actually determines whether
// text is readable.
function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const n = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Samples the REAL pixels of the given region from the actual accepted
// photo and picks whichever candidate color has the best real contrast
// ratio against that region's average color — not a guess, actual pixel
// math against actual brand colors.
async function pickContrastColor(photoPath: string, zone: { xPct: number; yPct: number; widthPct: number }, candidates: string[]): Promise<string> {
  const image = await loadImage(photoPath);
  const x = Math.round(zone.xPct * image.width);
  const y = Math.round(zone.yPct * image.height);
  const w = Math.max(1, Math.min(Math.round(zone.widthPct * image.width), image.width - x));
  const h = Math.max(1, Math.min(Math.round(image.height * 0.1), image.height - y));

  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, image.width, image.height);
  const { data } = ctx.getImageData(x, y, w, h);

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  const pixelCount = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    rSum += data[i];
    gSum += data[i + 1];
    bSum += data[i + 2];
  }
  const bgLuminance = relativeLuminance(rSum / pixelCount, gSum / pixelCount, bSum / pixelCount);

  let best = candidates[0] ?? "#ffffff";
  let bestRatio = -1;
  for (const hex of candidates) {
    const [r, g, b] = hexToRgb(hex);
    const ratio = contrastRatio(bgLuminance, relativeLuminance(r, g, b));
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = hex;
    }
  }
  return best;
}

export async function suggestTextPlacement(
  ai: GoogleGenAI,
  photoPath: string,
  photo: ImageBytes,
  reference: ImageBytes | null,
  roles: OverlayRole[],
  paletteColors: string[]
): Promise<PlacementSuggestion[]> {
  const candidates = [...paletteColors, "#ffffff", "#000000"];
  const zones = await suggestZones(ai, photo, reference, roles);
  const suggestions: PlacementSuggestion[] = [];
  for (const zone of zones) {
    const textColorOverride = await pickContrastColor(photoPath, zone, candidates);
    const anchorX = zone.align === "left" ? zone.xPct : zone.align === "right" ? zone.xPct + zone.widthPct : zone.xPct + zone.widthPct / 2;
    suggestions.push({
      role: zone.role as OverlayRole,
      anchor: { xPct: anchorX, yPct: zone.yPct, align: zone.align },
      textColorOverride,
      reason: zone.reason,
    });
  }
  return suggestions;
}
