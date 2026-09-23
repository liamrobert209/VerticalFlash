import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { extname, basename } from "path";
import { verifyAssetToken } from "@/lib/signed-url";
import { staticAdAttemptImagePath } from "@/lib/static-ad-run";
import { brandAssetFilePath } from "@/lib/brand-assets-store";

export const runtime = "nodejs";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

// Same safety pattern as the other filename-in-path serving routes:
// validate every segment is a bare name before it touches the filesystem.
function isSafeSegment(value: string): boolean {
  return value === basename(value) && value !== ".." && value !== ".";
}

// Allowlist of resource kinds this unauthenticated route may expose — the
// signature only proves WE issued the token, not that the resource is safe
// to serve, so the mapping stays narrow rather than resolving arbitrary
// paths.
function resolveResourcePath(resource: string): string | null {
  const parts = resource.split("/");
  if (parts.some((p) => !isSafeSegment(p))) return null;

  if (parts[0] === "static-ads" && parts.length === 3) {
    return staticAdAttemptImagePath(parts[1], parts[2]);
  }
  if (parts[0] === "brand-assets" && parts.length === 3) {
    return brandAssetFilePath(parts[1], parts[2]);
  }
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const verified = verifyAssetToken(token);
  if (!verified) return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 });

  const filePath = resolveResourcePath(verified.resource);
  if (!filePath) return NextResponse.json({ error: "Invalid resource" }, { status: 400 });

  const buffer = await fs.readFile(filePath).catch(() => null);
  if (!buffer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}
