import { NextRequest, NextResponse } from "next/server";
import { listProductImages, saveProductImage } from "@/lib/product-images-store";
import { getProductLinesConfig } from "@/lib/config";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const productLineId = request.nextUrl.searchParams.get("productLineId");
  if (!productLineId || !getProductLinesConfig().productLines.some((p) => p.id === productLineId)) {
    return NextResponse.json({ error: "Unknown product line" }, { status: 400 });
  }
  const images = await listProductImages(productLineId);
  return NextResponse.json({ images });
}

export async function POST(request: NextRequest) {
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
  const productLineId = form.get("productLineId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (typeof productLineId !== "string" || !getProductLinesConfig().productLines.some((p) => p.id === productLineId)) {
    return NextResponse.json({ error: "Unknown product line" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = await saveProductImage(productLineId, file.name, buffer);
    return NextResponse.json({ filename }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save the image" },
      { status: 500 }
    );
  }
}
