import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { extname, basename } from "path";
import { staticAdAttemptImagePath } from "@/lib/static-ad-run";

export const runtime = "nodejs";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

// Both params land directly in fs path construction — same safety pattern
// as the product-images serving route: validate both are bare,
// single-segment names before touching the filesystem.
function isSafeSegment(value: string): boolean {
  return value === basename(value) && value !== ".." && value !== ".";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; filename: string }> }
) {
  const { projectId, filename } = await params;
  if (!isSafeSegment(projectId) || !isSafeSegment(filename)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const buffer = await fs.readFile(staticAdAttemptImagePath(projectId, filename)).catch(() => null);
  if (!buffer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": MIME_TYPES[extname(filename).toLowerCase()] || "application/octet-stream" },
  });
}
