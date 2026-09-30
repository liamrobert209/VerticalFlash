import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { extname, join } from "path";
import { getTrendingVideo } from "@/lib/tiktok-trends-store";
import { TIKTOK_MEDIA_DIR } from "@/lib/paths";

export const runtime = "nodejs";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// Same local-first/remote-fallback pattern as /api/ads/[id]/creative and
// /api/tiktok-hashtag-videos/[id]/cover.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await getTrendingVideo(id);
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  if (video.coverImageLocalFile) {
    const buffer = await fs.readFile(join(TIKTOK_MEDIA_DIR, video.coverImageLocalFile)).catch(() => null);
    if (buffer) {
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": MIME_TYPES[extname(video.coverImageLocalFile).toLowerCase()] || "application/octet-stream",
          "Cache-Control": "private, max-age=86400",
        },
      });
    }
  }

  if (video.coverImageUrl) {
    return NextResponse.redirect(video.coverImageUrl);
  }

  return NextResponse.json({ error: "No cover image available" }, { status: 404 });
}
