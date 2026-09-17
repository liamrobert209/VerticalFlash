import { createCanvas, loadImage, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";
import type {
  OverlayPosition,
  OverlayRole,
  StaticAdOverlayElement,
  StaticAdTextOverlay,
} from "./static-ad-overlays-schema";

// Adapted from png-overlays.ts's rasterization technique (same @napi-rs/
// canvas approach, rounded pill backgrounds, stroke/shadow) but
// parameterized by the base image's own dimensions instead of a fixed
// vertical-video width, and with per-element absolute positioning instead
// of one full-width band — a static ad needs several simultaneous
// elements (headline/subhead/CTA), not one caption.

const FONT_STACK = '"Arial Black", "Helvetica Neue", "Apple Color Emoji"';

interface RolePresetSpec {
  fontScale: number; // relative to canvas width
  weight: "bold" | "normal";
  fill: { pad: number; radius: number; color: string } | null;
  stroke: { widthScale: number; color: string } | null;
  textColor: string;
}

const ROLE_PRESETS: Record<OverlayRole, RolePresetSpec> = {
  headline: {
    fontScale: 0.075,
    weight: "bold",
    fill: { pad: 0.35, radius: 0.25, color: "rgba(0,0,0,0.65)" },
    stroke: null,
    textColor: "#ffffff",
  },
  subhead: {
    fontScale: 0.045,
    weight: "normal",
    fill: null,
    stroke: { widthScale: 0.09, color: "#000000" },
    textColor: "#ffffff",
  },
  // A filled button/badge, distinct from headline/subhead's caption-style
  // treatment — this is the one genuinely new visual surface here.
  cta: {
    fontScale: 0.04,
    weight: "bold",
    fill: { pad: 0.7, radius: 0.5, color: "#e8482c" },
    stroke: null,
    textColor: "#ffffff",
  },
};

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

// Rasterizes one element to its own transparent block, sized to its text —
// not a full-width band, since a CTA badge should hug its own text.
function renderElementBlock(
  text: string,
  role: OverlayRole,
  canvasWidth: number
): { canvas: Canvas; width: number; height: number } {
  const preset = ROLE_PRESETS[role];
  const fontsize = Math.round(canvasWidth * preset.fontScale);
  const font = `${preset.weight === "bold" ? "900" : "400"} ${fontsize}px ${FONT_STACK}`;
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

  const canvas = createCanvas(Math.ceil(blockWidth), Math.ceil(blockHeight));
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const centerX = canvas.width / 2;

  // One pill behind the whole block (not per line) — a multi-line headline
  // is one statement, not a stack of separate captions.
  if (preset.fill) {
    const fillWidth = Math.min(widestLine + 2 * pad, canvas.width);
    const fillHeight = canvas.height - 2 * bleed;
    ctx.fillStyle = preset.fill.color;
    roundedRectPath(ctx, centerX - fillWidth / 2, bleed, fillWidth, fillHeight, fontsize * preset.fill.radius);
    ctx.fill();
  }

  let top = bleed;
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

export async function compositeStaticAd(
  baseImagePath: string,
  overlay: StaticAdTextOverlay
): Promise<Buffer> {
  const image = await loadImage(baseImagePath);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, image.width, image.height);

  const grouped = layoutByPosition(overlay.elements);
  const margin = image.height * 0.06;
  const gap = image.height * 0.02;

  const blocks = Object.entries(grouped).flatMap(([position, els]) =>
    els.map((el) => ({ position: position as OverlayPosition, block: renderElementBlock(el.text, el.role, image.width) }))
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

  return canvas.encode("png");
}
