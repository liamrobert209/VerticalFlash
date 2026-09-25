import { signAssetUrl } from "./signed-url";
import { generateMarketingStudioImage, type MarketingStudioImageResult } from "./higgsfield";
import { getLatestLogoAsset, getAdExamplesByStyleTemplate } from "./brand-assets-store";
import type { StaticAdTextOverlay } from "./static-ad-overlays-schema";
import type { AdStyleTemplate } from "./brand-assets-schema";
import type { AdAnalysis } from "./ad-analysis-schema";

// Signed URLs only need to outlive one generation call — Higgsfield's own
// default poll timeout is 5 minutes (see @higgsfield/client's maxPollTime),
// so 15 minutes gives headroom without leaving the link valid indefinitely.
const SIGNED_URL_TTL_SECONDS = 15 * 60;

// How many real on-brand exemplars to attach as visual reference — 2 gives
// the model a sense of "this is a family of looks", not just one exact
// template to copy; more than that dilutes attention across too many
// images for what's still a single generation call.
const EXAMPLES_PER_GENERATION = 2;

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

function describeElements(overlay: StaticAdTextOverlay): string {
  const labels: Record<StaticAdTextOverlay["elements"][number]["role"], string> = {
    headline: "Headline",
    subhead: "Subheadline",
    cta: "CTA button",
    badge: "Trust badge",
  };
  return overlay.elements
    .filter((el) => el.include && el.text.trim())
    .map((el) => `${labels[el.role]}: "${el.text}"`)
    .join("\n");
}

interface PromptImage {
  url: string;
  description: string;
}

function ordinal(n: number): string {
  return ["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH"][n] ?? `IMAGE ${n + 1}`;
}

function buildPrompt(overlay: StaticAdTextOverlay, images: PromptImage[], exampleCount: number): string {
  const imageList = images.map((img, i) => `The ${ordinal(i)} image is ${img.description}.`).join(" ");

  return `${imageList}

Add the following text directly onto the base photo, in the open/clean area
best suited to each element — do not add a separate flat color band behind
any of it:
${describeElements(overlay)}

Before placing anything, actually look at what's happening in the base
photo — its lighting, mood, colors, and whatever is already the visual
focal point — and design the text/graphics to feel like they were made
specifically for THIS photo, not dropped onto it from a generic template.
${
  exampleCount > 0
    ? `Match the visual energy of the on-brand example ad image(s) referenced
above: their color use, typography weight and personality, layout
confidence, and overall polish. These examples are references for STYLE
and FEEL only — do not copy their specific product, photo, or wording.`
    : ""
}

The result should read as a genuinely fun, premium, high-quality ad — the
kind a real design team would ship — not generic stock-photo-with-text.
Confident typography, real hierarchy between headline/subhead/CTA, and
color choices pulled from our actual brand palette wherever there's a
natural place for an accent, not just default black or white text.

Rules:
- Use the exact wording given above — do not invent, add, or alter any
  words, claims, statistics, or punctuation.
- Do not add any other text, graphics, or decorative elements beyond what's
  specified above and what's needed to match the referenced style.`;
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
  const examples = await getAdExamplesByStyleTemplate(styleTemplate, EXAMPLES_PER_GENERATION);
  for (const example of examples) {
    images.push({
      url: signAssetUrl(`brand-assets/${example.id}/${example.filename}`, SIGNED_URL_TTL_SECONDS).url,
      description: "a real, approved example of our brand's ad style — a visual reference for feel, not content to copy",
    });
  }

  return generateMarketingStudioImage(
    buildPrompt(overlay, images, examples.length),
    images.map((img) => img.url)
  );
}
