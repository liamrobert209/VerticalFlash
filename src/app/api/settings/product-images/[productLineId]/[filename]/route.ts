import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { extname, basename } from "path";
import { productImagePath, deleteProductImage } from "@/lib/product-images-store";
import { getProductLinesConfig } from "@/lib/config";

export const runtime = "nodejs";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// Both params land directly in fs path construction (product-images-store.ts
// does no sanitizing of its own) — validate productLineId against the known
// list and reject any filename that isn't a bare, single-segment name before
// touching the filesystem. Without this, a productLineId of ".." resolves
// one directory above PRODUCT_IMAGES_DIR (i.e. DATA_ROOT itself), and a
// filename containing "/" or ".." could reach outside the product's folder.
function isSafeSegment(value: string): boolean {
  return value === basename(value) && value !== ".." && value !== ".";
}

function validateParams(productLineId: string, filename: string): NextResponse | null {
  if (!getProductLinesConfig().productLines.some((p) => p.id === productLineId)) {
    return NextResponse.json({ error: "Unknown product line" }, { status: 400 });
  }
  if (!isSafeSegment(filename) || !isSafeSegment(productLineId)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ productLineId: string; filename: string }> }
) {
  const { productLineId, filename } = await params;
  const invalid = validateParams(productLineId, filename);
  if (invalid) return invalid;

  const buffer = await fs.readFile(productImagePath(productLineId, filename)).catch(() => null);
  if (!buffer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": MIME_TYPES[extname(filename).toLowerCase()] || "application/octet-stream" },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ productLineId: string; filename: string }> }
) {
  const { productLineId, filename } = await params;
  const invalid = validateParams(productLineId, filename);
  if (invalid) return invalid;

  await deleteProductImage(productLineId, filename);
  return NextResponse.json({ success: true });
}
