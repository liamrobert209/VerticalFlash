import { createCanvas, loadImage, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";
import type {
  OverlayPosition,
  OverlayRole,
  StaticAdOverlayElement,
  StaticAdTextOverlay,
} from "./static-ad-overlays-schema";
import { ensureStaticAdFontsRegistered, HEADLINE_FONT_FAMILY, BODY_FONT_FAMILY } from "./static-ad-fonts";

// Adapted from png-overlays.ts's rasterization technique (same @napi-rs/
// canvas approach, rounded pill backgrounds, stroke/shadow) but
// parameterized by the base image's own dimensions instead of a fixed
// vertical-video width, and with per-element absolute positioning instead
// of one full-width band — a static ad needs several simultaneous
// elements (headline/subhead/CTA), not one caption.

interface RolePresetSpec {
  fontScale: number; // relative to canvas width
  weight: "bold" | "normal";
  fontFamily: string;
  // rotationDeg gives the fill pill the brand's "shield" look — the
  // guidelines' shields are literally rounded rectangles at an angle, not
  // a unique polygon (see brand asset guideline-shields-intro.png) — so a
  // small rotation on the pill alone (text stays level for legibility) is
  // an authentic, low-risk way to render one.
  fill: { pad: number; radius: number; color: string; rotationDeg?: number } | null;
  stroke: { widthScale: number; color: string } | null;
  textColor: string;
}

// Read by anything that composites a static ad and has a brand color
// palette to apply — falls back to the original hardcoded look (the
// DEFAULT_ROLE_PRESETS values below) when no palette exists yet, e.g. no
// color_palette-kind brand asset has been added for the product line.
export interface OverlayPalette {
  primaryColor?: string; // headline pill background
  accentColor?: string; // CTA pill background
  fontFamily?: string;
}

const DEFAULT_ROLE_PRESETS: Record<OverlayRole, RolePresetSpec> = {
  headline: {
    fontScale: 0.075,
    weight: "bold",
    fontFamily: HEADLINE_FONT_FAMILY,
    fill: { pad: 0.35, radius: 0.25, color: "rgba(0,0,0,0.65)", rotationDeg: -2.5 },
    stroke: null,
    textColor: "#ffffff",
  },
  subhead: {
    fontScale: 0.045,
    weight: "normal",
    fontFamily: BODY_FONT_FAMILY,
    // A soft dark pill instead of bare stroked text floating on the photo
    // — legible on any background, and gives the subhead a real surface
    // like every other element instead of being the one exception.
    fill: { pad: 0.4, radius: 0.3, color: "rgba(0,0,0,0.55)" },
    stroke: null,
    textColor: "#ffffff",
  },
  // A filled button/badge, distinct from headline/subhead's caption-style
  // treatment.
  cta: {
    fontScale: 0.04,
    weight: "bold",
    fontFamily: BODY_FONT_FAMILY,
    fill: { pad: 0.7, radius: 0.5, color: "#e8482c", rotationDeg: 2.5 },
    stroke: null,
    textColor: "#ffffff",
  },
  // Trust factor (rating, review count, certification, "as seen in") — a
  // small, understated, level (not tilted) pill so a real stat stays
  // easy to read rather than looking like a decorative accent.
  badge: {
    fontScale: 0.03,
    weight: "bold",
    fontFamily: BODY_FONT_FAMILY,
    fill: { pad: 0.5, radius: 0.5, color: "rgba(255,255,255,0.92)" },
    stroke: null,
    textColor: "#1a1a1a",
  },
};

// Merges a brand palette into the default presets — only the two colors a
// palette can plausibly override (headline/CTA fill) and the font, so an
// incomplete palette (e.g. just accentColor) doesn't blow away the rest of
// the design.
function resolvePresets(palette?: OverlayPalette): Record<OverlayRole, RolePresetSpec> {
  if (!palette) return DEFAULT_ROLE_PRESETS;
  const presets = { ...DEFAULT_ROLE_PRESETS };
  if (palette.primaryColor) {
    presets.headline = { ...presets.headline, fill: { ...presets.headline.fill!, color: palette.primaryColor } };
  }
  if (palette.accentColor) {
    presets.cta = { ...presets.cta, fill: { ...presets.cta.fill!, color: palette.accentColor } };
  }
  if (palette.fontFamily) {
    for (const role of Object.keys(presets) as OverlayRole[]) {
      presets[role] = { ...presets[role], fontFamily: palette.fontFamily };
    }
  }
  return presets;
}

function wrapLines(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let current = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${current} ${word}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }
  return lines;
}

function roundedRectPath(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// How much extra canvas margin a WxH box needs on each axis once rotated
// by rotationDeg, so its corners never clip — standard rotated-bounding-box
// trig, halved since the margin is added symmetrically on both sides.
function rotatedExtraMargin(width: number, height: number, rotationDeg: number): { x: number; y: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  const rotatedW = Math.abs(width * Math.cos(rad)) + Math.abs(height * Math.sin(rad));
  const rotatedH = Math.abs(width * Math.sin(rad)) + Math.abs(height * Math.cos(rad));
  return { x: Math.max(0, rotatedW - width) / 2, y: Math.max(0, rotatedH - height) / 2 };
}

// Rasterizes one element to its own transparent block, sized to its text —
// not a full-width band, since a CTA badge should hug its own text.
function renderElementBlock(
  text: string,
  role: OverlayRole,
  canvasWidth: number,
  presets: Record<OverlayRole, RolePresetSpec>
): { canvas: Canvas; width: number; height: number } {
  const preset = presets[role];
  const fontsize = Math.round(canvasWidth * preset.fontScale);
  const font = `${preset.weight === "bold" ? "700" : "400"} ${fontsize}px "${preset.fontFamily}"`;
  const sideMargin = canvasWidth * 0.08;
  const strokeW = preset.stroke ? Math.max(2, Math.round(fontsize * preset.stroke.widthScale)) : 0;
  const pad = preset.fill ? Math.round(fontsize * preset.fill.pad) : 0;

  const measure = createCanvas(1, 1).getContext("2d");
  measure.font = font;
  const maxTextWidth = canvasWidth - 2 * (sideMargin + pad + strokeW);
  const lines = wrapLines(measure, text, maxTextWidth);
  if (lines.length === 0) throw new Error("overlay text is empty");

  const probe = measure.measureText("Mg");
  const ascent = Math.ceil(probe.fontBoundingBoxAscent);
  const lineHeight = ascent + Math.ceil(probe.fontBoundingBoxDescent);
  const lineGap = Math.round(fontsize * 0.15);
  const rowHeight = lineHeight + 2 * pad;
  const bleed = strokeW + 2;
  const widestLine = Math.max(...lines.map((l) => measure.measureText(l).width));
  const blockWidth = Math.min(widestLine + 2 * (pad + strokeW), canvasWidth - 2 * sideMargin);
  const blockHeight = lines.length * rowHeight + (lines.length - 1) * lineGap + 2 * bleed;

  const fillWidth = Math.min(widestLine + 2 * pad, blockWidth);
  const fillHeight = blockHeight - 2 * bleed;
  const rotationDeg = preset.fill?.rotationDeg ?? 0;
  // Extra canvas margin so the rotated pill's corners don't clip — zero
  // when rotationDeg is 0 (subhead/badge), so their canvas is unaffected.
  const margin = rotationDeg ? rotatedExtraMargin(fillWidth, fillHeight, rotationDeg) : { x: 0, y: 0 };

  const canvas = createCanvas(Math.ceil(blockWidth + margin.x * 2), Math.ceil(blockHeight + margin.y * 2));
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const centerX = canvas.width / 2;

  // One pill behind the whole block (not per line) — a multi-line headline
  // is one statement, not a stack of separate captions.
  if (preset.fill) {
    ctx.fillStyle = preset.fill.color;
    if (rotationDeg) {
      ctx.save();
      ctx.translate(centerX, margin.y + bleed + fillHeight / 2);
      ctx.rotate((rotationDeg * Math.PI) / 180);
      roundedRectPath(ctx, -fillWidth / 2, -fillHeight / 2, fillWidth, fillHeight, fontsize * preset.fill.radius);
      ctx.fill();
      ctx.restore();
    } else {
      roundedRectPath(ctx, centerX - fillWidth / 2, margin.y + bleed, fillWidth, fillHeight, fontsize * preset.fill.radius);
      ctx.fill();
    }
  }

  let top = margin.y + bleed;
  for (const line of lines) {
    const baseline = top + pad + ascent;
    if (preset.stroke) {
      ctx.lineWidth = strokeW * 2;
      ctx.lineJoin = "round";
      ctx.strokeStyle = preset.stroke.color;
      ctx.strokeText(line, centerX, baseline);
    }
    ctx.fillStyle = preset.textColor;
    ctx.fillText(line, centerX, baseline);
    top += rowHeight + lineGap;
  }

  return { canvas, width: canvas.width, height: canvas.height };
}

// Elements sharing a position stack in reading order for top/center, and
// bottom-up for "bottom" so the bottom-most element stays anchored to the
// true bottom margin regardless of how many share that position.
function layoutByPosition(
  elements: StaticAdOverlayElement[]
): Record<OverlayPosition, StaticAdOverlayElement[]> {
  const grouped: Record<OverlayPosition, StaticAdOverlayElement[]> = { top: [], center: [], bottom: [] };
  for (const el of elements) {
    if (el.include && el.text.trim()) grouped[el.position].push(el);
  }
  return grouped;
}

// The guideline's stated digital minimum for the primary logo (page 10:
// "never be reproduced smaller than 70px in width... in any digital
// communication"). Exported so the Brand QA gate can verify the actual
// rendered size against the same real number rather than assuming this
// function always respects it.
export const LOGO_MIN_WIDTH_PX = 70;

export function logoMarkWidthPx(canvasWidth: number): number {
  return Math.max(LOGO_MIN_WIDTH_PX, Math.round(canvasWidth * 0.14));
}

// Draws the logo watermark on a small light chip (not directly on the
// photo) so it stays legible regardless of which logo variant was
// resolved or what's behind it in the photo — same reasoning as
// getLatestLogo's header comment.
async function drawLogoMark(
  ctx: SKRSContext2D,
  canvasWidth: number,
  canvasHeight: number,
  logoPath: string,
  corner: "top-left" | "top-right" | "bottom-left" | "bottom-right"
): Promise<void> {
  const logoImage = await loadImage(logoPath);
  const logoWidth = logoMarkWidthPx(canvasWidth);
  const logoHeight = logoWidth * (logoImage.height / logoImage.width);
  const chipPad = logoWidth * 0.22;
  const chipWidth = logoWidth + chipPad * 2;
  const chipHeight = logoHeight + chipPad * 2;
  const margin = canvasWidth * 0.04;

  const x = corner.includes("left") ? margin : canvasWidth - margin - chipWidth;
  const y = corner.includes("top") ? margin : canvasHeight - margin - chipHeight;

  ctx.fillStyle = "rgba(255,255,255,0.94)";
  roundedRectPath(ctx, x, y, chipWidth, chipHeight, chipHeight * 0.22);
  ctx.fill();
  ctx.drawImage(logoImage, x + chipPad, y + chipPad, logoWidth, logoHeight);
}

export async function compositeStaticAd(
  baseImagePath: string,
  overlay: StaticAdTextOverlay,
  palette?: OverlayPalette,
  logoPath?: string | null
): Promise<Buffer> {
  ensureStaticAdFontsRegistered();
  const image = await loadImage(baseImagePath);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, image.width, image.height);

  const presets = resolvePresets(palette);

  // "split_band" draws a solid color band across the bottom third before
  // any text, so bottom-anchored elements sit on a clean surface instead
  // of directly over busy product photography — the one structural layout
  // change beyond simple top/center/bottom stacking.
  if (overlay.layout === "split_band") {
    const bandHeight = image.height * 0.32;
    ctx.fillStyle = palette?.primaryColor ?? "rgba(0,0,0,0.72)";
    ctx.fillRect(0, image.height - bandHeight, image.width, bandHeight);
  }

  const grouped = layoutByPosition(overlay.elements);
  const margin = image.height * 0.06;
  const gap = image.height * 0.02;

  const blocks = Object.entries(grouped).flatMap(([position, els]) =>
    els.map((el) => ({
      position: position as OverlayPosition,
      block: renderElementBlock(el.text, el.role, image.width, presets),
    }))
  );

  for (const position of ["top", "center", "bottom"] as const) {
    const items = blocks.filter((b) => b.position === position);
    if (items.length === 0) continue;
    const totalHeight = items.reduce((sum, b) => sum + b.block.height, 0) + gap * (items.length - 1);
    let cursor =
      position === "top"
        ? margin
        : position === "center"
          ? (image.height - totalHeight) / 2
          : image.height - margin - totalHeight;
    for (const { block } of items) {
      const x = (image.width - block.width) / 2;
      ctx.drawImage(block.canvas, x, cursor);
      cursor += block.height + gap;
    }
  }

  if (overlay.logoMark.include && logoPath) {
    await drawLogoMark(ctx, image.width, image.height, logoPath, overlay.logoMark.corner);
  }

  return canvas.encode("png");
}
