import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { z } from "zod";
import { getPlatform, PLATFORMS } from "@/lib/platforms";
import { renderForPlatform, platformRenderPath } from "@/lib/platform-render";
import { sidecarPath } from "@/lib/paths";
import { CaptionsZ } from "@/lib/captions-schema";
import { getDb } from "@/lib/db";

// The unified "finish" step: (re)derive the platform-shaped export, hand
// back a caption trimmed to that platform's conventions, and tell the
// client whether this platform can auto-publish (only TikTok, today) or
// needs a manual download-and-post finish. See PlatformFinishPanel.

const BodyZ = z.object({ platformId: z.string() });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;
  if (!/^[\w-]+$/.test(videoId)) {
    return NextResponse.json({ error: "invalid videoId" }, { status: 400 });
  }
  const body = BodyZ.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "platformId is required" }, { status: 400 });
  }
  const platform = getPlatform(body.data.platformId);

  let result;
  try {
    result = await renderForPlatform(videoId, platform.id);
  } catch {
    return NextResponse.json(
      { error: "No render found for this video yet — render it first" },
      { status: 404 }
    );
  }

  let caption: string | null = null;
  try {
    const raw = await fs.readFile(sidecarPath(videoId, "captions"), "utf8");
    const captions = CaptionsZ.parse(JSON.parse(raw));
    const best = captions.captions[0]?.text ?? null;
    const hashtags = captions.hashtags.map((h) => `#${h.tag}`).join(" ");
    const full = best ? [best, hashtags].filter(Boolean).join("\n\n") : null;
    caption = full ? full.slice(0, platform.captionCharLimit) : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`Could not read captions for ${videoId} (finish continues without one):`, error);
    }
  }

  try {
    const sql = getDb();
    await sql`update content_records set platform_id = ${platform.id} where video_id = ${videoId}`;
  } catch (error) {
    console.error("Could not tag content record with platform (finish unaffected):", error);
  }

  return NextResponse.json({
    platform,
    durationSeconds: result.durationSeconds,
    caption,
    downloadUrl: `/api/analyze/${videoId}/finish?platformId=${platform.id}`,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;
  const platformId = request.nextUrl.searchParams.get("platformId") ?? "tiktok";
  if (!/^[\w-]+$/.test(videoId) || !PLATFORMS.some((p) => p.id === platformId)) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const filePath = platformRenderPath(videoId, platformId);
  const buffer = await fs.readFile(filePath).catch(() => null);
  if (!buffer) {
    return NextResponse.json({ error: "Not rendered for this platform yet" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${videoId}-${platformId}.mp4"`,
    },
  });
}
