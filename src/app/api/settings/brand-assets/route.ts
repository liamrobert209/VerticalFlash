import { NextRequest, NextResponse } from "next/server";
import { listBrandAssets, createBrandAsset } from "@/lib/brand-assets-store";
import { BRAND_ASSET_KINDS } from "@/lib/brand-assets-schema";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

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

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (typeof kind !== "string" || !(BRAND_ASSET_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const asset = await createBrandAsset({
      kind: kind as (typeof BRAND_ASSET_KINDS)[number],
      filename: file.name,
      mimeType: file.type || null,
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      buffer,
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    console.error("Failed to save brand asset:", error);
    return NextResponse.json({ error: "Could not save the file" }, { status: 500 });
  }
}
