import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { join } from "path";
import { getTrendingVideo } from "@/lib/tiktok-trends-store";
import { TIKTOK_MEDIA_DIR } from "@/lib/paths";

export const runtime = "nodejs";

// Same local-first/remote-fallback pattern as the cover-image routes —
// video_file_local_file is always an .mp4 (see cacheTiktokVideoLocally),
// so no extension/MIME lookup table is needed.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await getTrendingVideo(id);
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  if (video.videoFileLocalFile) {
    const buffer = await fs.readFile(join(TIKTOK_MEDIA_DIR, video.videoFileLocalFile)).catch(() => null);
    if (buffer) {
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "video/mp4",
          "Cache-Control": "private, max-age=86400",
        },
      });
    }
  }

  if (video.videoFileUrl) {
    return NextResponse.redirect(video.videoFileUrl);
  }

  return NextResponse.json({ error: "No video file available" }, { status: 404 });
}
