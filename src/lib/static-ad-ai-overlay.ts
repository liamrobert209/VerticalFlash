import { signAssetUrl } from "./signed-url";
import { generateMarketingStudioImage, type MarketingStudioImageResult } from "./higgsfield";
import { getLatestLogoAsset } from "./brand-assets-store";
import type { StaticAdTextOverlay } from "./static-ad-overlays-schema";

// Signed URLs only need to outlive one generation call — Higgsfield's own
// default poll timeout is 5 minutes (see @higgsfield/client's maxPollTime),
// so 15 minutes gives headroom without leaving the link valid indefinitely.
const SIGNED_URL_TTL_SECONDS = 15 * 60;

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

function buildPrompt(overlay: StaticAdTextOverlay, hasLogo: boolean): string {
  return `The FIRST image is our finished product ad photo — do not change the photo
itself.${hasLogo ? " The SECOND image is our brand logo." : ""}

Add the following text directly onto the photo, in the open/clean area best
suited to each element — do not add a separate flat color band behind any
of it:
${describeElements(overlay)}

Rules:
- Use the exact wording given above — do not invent, add, or alter any
  words, claims, statistics, or punctuation.
- Typography should be clean and legible, matching a professional ad —
  medium weight, not overly bold or decorative.
${hasLogo ? "- Include our logo, small, in one corner, matching the SECOND reference image exactly — do not redraw, recolor, or reinterpret it." : ""}
- Do not add any other text, graphics, or decorative elements beyond what's
  specified above.`;
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
  overlay: StaticAdTextOverlay
): Promise<MarketingStudioImageResult> {
  const imageUrls = [
    signAssetUrl(`static-ads/${projectId}/${basePhotoFilename}`, SIGNED_URL_TTL_SECONDS).url,
  ];

  let hasLogo = false;
  if (overlay.logoMark.include) {
    const logo = await getLatestLogoAsset();
    if (logo) {
      imageUrls.push(signAssetUrl(`brand-assets/${logo.id}/${logo.filename}`, SIGNED_URL_TTL_SECONDS).url);
      hasLogo = true;
    }
  }

  return generateMarketingStudioImage(buildPrompt(overlay, hasLogo), imageUrls);
}
