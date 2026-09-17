import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { extname, basename } from "path";
import { z } from "zod";
import {
  getProductImageSlots,
  setSlotLabel,
  setSlotImage,
  clearSlotImage,
  productImagePath,
} from "@/lib/product-images-store";
import { getProductLinesConfig } from "@/lib/config";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// productLineId lands directly in fs path construction — validate against
// the known list and require a bare numeric slot id before touching the
// filesystem (same reasoning as the old [filename] route this replaces).
function validate(productLineId: string, slotIdRaw: string): { slotId: number } | NextResponse {
  if (!getProductLinesConfig().productLines.some((p) => p.id === productLineId) || productLineId !== basename(productLineId)) {
    return NextResponse.json({ error: "Unknown product line" }, { status: 400 });
  }
  const slotId = Number(slotIdRaw);
  if (!Number.isInteger(slotId) || slotId < 1 || slotId > 5) {
    return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
  }
  return { slotId };
}

// Serves the slot's current image bytes, for <img src>.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ productLineId: string; slotId: string }> }
) {
  const { productLineId, slotId: slotIdRaw } = await params;
  const check = validate(productLineId, slotIdRaw);
  if (check instanceof NextResponse) return check;

  const slots = await getProductImageSlots(productLineId);
  const slot = slots.find((s) => s.id === check.slotId);
  if (!slot?.filename) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await fs.readFile(productImagePath(productLineId, slot.filename)).catch(() => null);
  if (!buffer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": MIME_TYPES[extname(slot.filename).toLowerCase()] || "application/octet-stream" },
  });
}

// Uploads/replaces the slot's image (multipart form, field "file").
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ productLineId: string; slotId: string }> }
) {
  const { productLineId, slotId: slotIdRaw } = await params;
  const check = validate(productLineId, slotIdRaw);
  if (check instanceof NextResponse) return check;

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large (15MB max)" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const slots = await setSlotImage(productLineId, check.slotId, file.name, buffer);
    return NextResponse.json({ slots });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save the image" },
      { status: 500 }
    );
  }
}

// Relabels the slot (JSON body {label}).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ productLineId: string; slotId: string }> }
) {
  const { productLineId, slotId: slotIdRaw } = await params;
  const check = validate(productLineId, slotIdRaw);
  if (check instanceof NextResponse) return check;

  let label: string;
  try {
    label = z.object({ label: z.string() }).parse(await request.json()).label;
  } catch {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }

  const slots = await setSlotLabel(productLineId, check.slotId, label);
  return NextResponse.json({ slots });
}

// Clears the slot's image (label is kept).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ productLineId: string; slotId: string }> }
) {
  const { productLineId, slotId: slotIdRaw } = await params;
  const check = validate(productLineId, slotIdRaw);
  if (check instanceof NextResponse) return check;

  const slots = await clearSlotImage(productLineId, check.slotId);
  return NextResponse.json({ slots });
}
