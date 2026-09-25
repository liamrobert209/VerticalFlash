import { promises as fs } from "fs";
import { extname } from "path";
import { signAssetUrl } from "./signed-url";
import { generateMarketingStudioImage, type MarketingStudioImageResult } from "./higgsfield";
import {
  getLatestLogoAsset,
  getAdExamplesByStyleTemplate,
  getShieldUsageExamples,
  getFullColorPalette,
} from "./brand-assets-store";
import { staticAdAttemptImagePath } from "./static-ad-run";
import { getGeminiClient } from "./gemini";
import { suggestTextPlacement, type PlacementSuggestion } from "./static-ad-placement";
import type { StaticAdTextOverlay, OverlayRole } from "./static-ad-overlays-schema";
import type { AdStyleTemplate } from "./brand-assets-schema";
import type { AdAnalysis } from "./ad-analysis-schema";
import type { ImageBytes } from "./fetch-image";

// Signed URLs only need to outlive one generation call — Higgsfield's own
// default poll timeout is 5 minutes (see @higgsfield/client's maxPollTime),
// so 15 minutes gives headroom without leaving the link valid indefinitely.
const SIGNED_URL_TTL_SECONDS = 15 * 60;

// How many real on-brand exemplars to attach as visual reference — 2 gives
// the model a sense of "this is a family of looks", not just one exact
// template to copy; more than that dilutes attention across too many
// images for what's still a single generation call.
const STYLE_EXAMPLES_PER_GENERATION = 2;
// Shield-compositing guidance is a narrower, single question ("how does
// the mark actually sit on a photo") — one real example answers it.
const SHIELD_EXAMPLES_PER_GENERATION = 1;

const IMAGE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// Which of our own approved ad-style exemplars (see brand-assets-schema.ts's
// AD_STYLE_TEMPLATES) best matches this generation, derived from signals
// already computed per reference ad (ad-analyze.ts) — no new classification
// step needed. Only the styles with a clear automatic signal are mapped;
// the rest (testimonial, comparison, editorial_listicle, annotated_diagram,
// product_macro) don't have one yet and fall back to product_hero rather
// than guessing.
const PROMO_INTENTS = new Set(["seasonal_promo", "direct_response"]);

function styleTemplateFor(analysis: AdAnalysis | null): AdStyleTemplate {
  if (analysis?.hasPerson) return "actor";
  if (analysis && PROMO_INTENTS.has(analysis.intent)) return "announcement_sale";
  return "product_hero";
}

const ROLE_LABELS: Record<OverlayRole, string> = {
  headline: "Headline",
  subhead: "Subheadline",
  cta: "CTA button",
  badge: "Trust badge",
};

function describeElements(overlay: StaticAdTextOverlay): string {
  return overlay.elements
    .filter((el) => el.include && el.text.trim())
    .map((el) => `${ROLE_LABELS[el.role]}: "${el.text}"`)
    .join("\n");
}

// Turns real, computed placement/contrast data (static-ad-placement.ts —
// actual pixel sampling + WCAG contrast math against the base photo, the
// same mechanism the deterministic canvas compositor relies on) into
// concrete per-element directives, instead of leaving color and position to
// the model's own creative judgment. That judgment is exactly what was
// producing text with insufficient contrast against its background — a
// prose instruction like "make sure it's readable" isn't a hard constraint
// any more reliably here than the shield-arch device-gate rule was earlier.
function describePlacements(placements: PlacementSuggestion[]): string {
  return placements
    .map((p) => {
      const x = Math.round(p.anchor.xPct * 100);
      const y = Math.round(p.anchor.yPct * 100);
      return `- ${ROLE_LABELS[p.role]}: anchor it at approximately ${x}% from the left, ${y}% from
  the top of the photo, ${p.anchor.align}-aligned. Render this text in
  color ${p.textColorOverride} exactly — this color was computed from the
  real pixels at that spot for guaranteed contrast, do not substitute a
  different color.`;
    })
    .join("\n");
}

interface PromptImage {
  url: string;
  description: string;
}

function ordinal(n: number): string {
  return ["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH", "SIXTH"][n] ?? `IMAGE ${n + 1}`;
}

function buildPrompt(
  overlay: StaticAdTextOverlay,
  images: PromptImage[],
  hasStyleExamples: boolean,
  hasShieldExample: boolean,
  placements: PlacementSuggestion[]
): string {
  const imageList = images.map((img, i) => `The ${ordinal(i)} image is ${img.description}.`).join(" ");
  const hasPlacements = placements.length > 0;

  return `${imageList}

Add the following text directly onto the base photo${
    hasPlacements ? ", using the exact placement and color given below for each element" : ", in the open/clean area best suited to each element"
  } — do not add a separate flat color band behind any of it:
${describeElements(overlay)}
${hasPlacements ? `\n${describePlacements(placements)}\n` : ""}
Text legibility is non-negotiable: every word must have strong, comfortable
contrast against whatever is directly behind it.${
    hasPlacements
      ? " The colors above were computed for exactly that, so use them as given."
      : ""
  } If anything behind a text element is busy or close in tone to the text
color, add a subtle scrim, soft shadow, or semi-transparent backing directly
behind that element ONLY — never a full-width flat band — rather than letting
contrast suffer.

Before placing anything, actually look at what's happening in the base
photo — its lighting, mood, colors, and whatever is already the visual
focal point — and design the text/graphics to feel like they were made
specifically for THIS photo, not dropped onto it from a generic template.
${
  hasStyleExamples
    ? `Match the visual energy of the on-brand example ad image(s) referenced
above: their color use, typography weight and personality, layout
confidence, and overall polish. These examples are references for STYLE
and FEEL only — do not copy their specific product, photo, or wording.`
    : ""
}
${
  hasShieldExample
    ? `One of the reference images shows how our brand mark (the "shield")
gets composited onto a real photo. ONLY use that treatment if the base
photo actually shows a phone, laptop, tablet, or other screen — match how
it's sized and positioned relative to the device in the reference. If the
base photo has no device in it, ignore this reference entirely; do not
force the mark into a photo that has nothing for it to relate to.`
    : ""
}

The result should read as a genuinely fun, premium, high-quality ad — the
kind a real design team would ship — not generic stock-photo-with-text.
Confident typography and real hierarchy between headline/subhead/CTA.

Rules:
- Use the exact wording given above — do not invent, add, or alter any
  words, claims, statistics, or punctuation.
- Do not add any other text, graphics, or decorative elements beyond what's
  specified above and what's needed to match the referenced style.`;
}

async function loadPhotoBytes(path: string): Promise<ImageBytes> {
  const buffer = await fs.readFile(path);
  const mimeType = IMAGE_MIME[extname(path).toLowerCase()] ?? "image/jpeg";
  return { base64: buffer.toString("base64"), mimeType };
}

// Best-effort: a failure here (missing GEMINI_API_KEY, a bad photo path,
// Gemini erroring) should degrade to the old generic "open/clean area"
// wording, never break the Higgsfield generation over it.
async function suggestPlacements(
  projectId: string,
  basePhotoFilename: string,
  roles: OverlayRole[]
): Promise<PlacementSuggestion[]> {
  if (roles.length === 0) return [];
  try {
    const ai = getGeminiClient();
    const photoPath = staticAdAttemptImagePath(projectId, basePhotoFilename);
    const [photo, palette] = await Promise.all([loadPhotoBytes(photoPath), getFullColorPalette()]);
    return await suggestTextPlacement(ai, photoPath, photo, null, roles, palette);
  } catch (error) {
    console.error("Text placement/contrast suggestion failed, falling back to generic placement:", error);
    return [];
  }
}

// The AI-baked alternative to static-ad-overlays.ts's deterministic canvas
// compositor — same inputs (a project's accepted base photo + its text
// overlay config), different mechanism (Marketing Studio Image bakes the
// text/logo into pixels instead of drawing them). See that file's header
// comment for why the deterministic path exists; this one trades its
// typo-proof guarantee for AI-native styling, by explicit choice.
export async function generateAiTextOverlay(
  projectId: string,
  basePhotoFilename: string,
  overlay: StaticAdTextOverlay,
  referenceAnalysis: AdAnalysis | null
): Promise<MarketingStudioImageResult> {
  const images: PromptImage[] = [
    {
      url: signAssetUrl(`static-ads/${projectId}/${basePhotoFilename}`, SIGNED_URL_TTL_SECONDS).url,
      description: "our finished product ad photo — do not change the photo itself",
    },
  ];

  if (overlay.logoMark.include) {
    const logo = await getLatestLogoAsset();
    if (logo) {
      images.push({
        url: signAssetUrl(`brand-assets/${logo.id}/${logo.filename}`, SIGNED_URL_TTL_SECONDS).url,
        description:
          "our brand logo — include it small, in one corner, matching this image exactly; do not redraw, recolor, or reinterpret it",
      });
    }
  }

  const styleTemplate = styleTemplateFor(referenceAnalysis);
  const activeRoles = overlay.elements.filter((el) => el.include && el.text.trim()).map((el) => el.role);
  const [styleExamples, shieldExamples, placements] = await Promise.all([
    getAdExamplesByStyleTemplate(styleTemplate, STYLE_EXAMPLES_PER_GENERATION),
    getShieldUsageExamples(SHIELD_EXAMPLES_PER_GENERATION),
    suggestPlacements(projectId, basePhotoFilename, activeRoles),
  ]);

  for (const example of styleExamples) {
    images.push({
      url: signAssetUrl(`brand-assets/${example.id}/${example.filename}`, SIGNED_URL_TTL_SECONDS).url,
      description: "a real, approved example of our brand's ad style — a visual reference for feel, not content to copy",
    });
  }
  for (const example of shieldExamples) {
    images.push({
      url: signAssetUrl(`brand-assets/${example.id}/${example.filename}`, SIGNED_URL_TTL_SECONDS).url,
      description: "a real, approved example of how we composite our shield brand mark onto a photo",
    });
  }

  return generateMarketingStudioImage(
    buildPrompt(overlay, images, styleExamples.length > 0, shieldExamples.length > 0, placements),
    images.map((img) => img.url)
  );
}
