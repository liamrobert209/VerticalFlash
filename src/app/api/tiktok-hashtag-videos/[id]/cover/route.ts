import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { extname, join } from "path";
import { getHashtagVideo } from "@/lib/tiktok-hashtag-store";
import { TIKTOK_MEDIA_DIR } from "@/lib/paths";

export const runtime = "nodejs";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// One stable URL for a hashtag video's cover image regardless of whether
// it's cached locally — same pattern as /api/ads/[id]/creative: serves the
// local file directly (fast, never expires) when one exists, otherwise
// redirects to the remote CDN URL (which may itself be dead for a row
// synced before local caching existed, or whose download failed).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await getHashtagVideo(id);
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
