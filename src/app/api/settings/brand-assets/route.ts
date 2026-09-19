import { NextRequest, NextResponse } from "next/server";
import { listBrandAssets, createBrandAsset } from "@/lib/brand-assets-store";
import { BRAND_ASSET_KINDS, AD_STYLE_TEMPLATES, type BrandAssetKind, type AdStyleTemplate } from "@/lib/brand-assets-schema";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// "website" (url and/or an uploaded mockup) and the two color-palette
// kinds (hex codes only) never require a file. "typography" accepts an
// optional specimen image but doesn't require one — text specs alone are
// valid. Everything else keeps the original file-required behavior.
const FILELESS_KINDS = new Set<BrandAssetKind>([
  "website",
  "color_palette_primary",
  "color_palette_secondary",
  "typography",
]);

export async function GET() {
  try {
    const assets = await listBrandAssets();
    return NextResponse.json({ assets });
  } catch (error) {
    console.error("Failed to list brand assets:", error);
    return NextResponse.json({ error: "Could not load brand assets" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large (25MB max)" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  const file = form.get("file");
  const kind = form.get("kind");
  const description = form.get("description");
  const url = form.get("url");
  const colorsRaw = form.get("colors");
  const productLineId = form.get("productLineId");
  const useCase = form.get("useCase");
  const styleTemplateRaw = form.get("styleTemplate");

  if (typeof kind !== "string" || !(BRAND_ASSET_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  const assetKind = kind as BrandAssetKind;

  if (FILELESS_KINDS.has(assetKind)) {
    if (assetKind === "website" && !(typeof url === "string" && url.trim()) && !(file instanceof File)) {
      return NextResponse.json(
        { error: "A URL or an image is required for a website asset" },
        { status: 400 }
      );
    }
    if (
      (assetKind === "color_palette_primary" || assetKind === "color_palette_secondary") &&
      (typeof colorsRaw !== "string" || !colorsRaw.trim())
    ) {
      return NextResponse.json({ error: "At least one color is required" }, { status: 400 });
    }
  } else if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (assetKind === "product_image" && (typeof productLineId !== "string" || !productLineId.trim())) {
    return NextResponse.json({ error: "A product line is required for a product image" }, { status: 400 });
  }

  if (
    typeof styleTemplateRaw === "string" &&
    styleTemplateRaw.trim() &&
    !(AD_STYLE_TEMPLATES as readonly string[]).includes(styleTemplateRaw)
  ) {
    return NextResponse.json({ error: "Invalid style template" }, { status: 400 });
  }
  const styleTemplate =
    typeof styleTemplateRaw === "string" && styleTemplateRaw.trim()
      ? (styleTemplateRaw as AdStyleTemplate)
      : null;

  try {
    const buffer = file instanceof File ? Buffer.from(await file.arrayBuffer()) : undefined;
    const colors =
      typeof colorsRaw === "string" && colorsRaw.trim()
        ? colorsRaw.split(",").map((c) => c.trim()).filter(Boolean)
        : null;
    const asset = await createBrandAsset({
      kind: assetKind,
      filename: file instanceof File ? file.name : null,
      mimeType: file instanceof File ? file.type || null : null,
      buffer,
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      url: typeof url === "string" && url.trim() ? url.trim() : null,
      colors,
      productLineId: typeof productLineId === "string" && productLineId.trim() ? productLineId.trim() : null,
      useCase: typeof useCase === "string" && useCase.trim() ? useCase.trim() : null,
      styleTemplate,
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    console.error("Failed to save brand asset:", error);
    return NextResponse.json({ error: "Could not save the asset" }, { status: 500 });
  }
}
