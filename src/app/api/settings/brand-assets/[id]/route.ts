import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { getBrandAsset, deleteBrandAsset, brandAssetFilePath } from "@/lib/brand-assets-store";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const asset = await getBrandAsset(id);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const buffer = await fs.readFile(brandAssetFilePath(id, asset.filename)).catch(() => null);
  if (!buffer) return NextResponse.json({ error: "File missing on disk" }, { status: 404 });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": asset.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${asset.filename}"`,
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = await deleteBrandAsset(id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
