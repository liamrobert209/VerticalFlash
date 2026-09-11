import { promises as fs } from "fs";
import { join } from "path";
import { execFileAsync, ensureFfmpeg } from "./ffmpeg";
import { probeDuration } from "./master-assemble";
import { RENDERS_DIR } from "./paths";
import { renderVideoPath } from "./render-remake";
import { getPlatform, DEFAULT_PLATFORM_ID, type PlatformSpec } from "./platforms";

// Every platform shares the same edit (shots, text, B-roll, audio) — only
// the frame shape differs, the way a real content team exports one cut at
// multiple aspect ratios rather than re-editing per platform. This derives
// a platform-shaped export from the already-rendered canonical TikTok
// (1080x1920) output; it never touches the shot-compositing pipeline that
// produces that canonical render.

export function platformRenderPath(videoId: string, platformId: string): string {
  if (platformId === DEFAULT_PLATFORM_ID) return renderVideoPath(videoId);
  return join(RENDERS_DIR, `${videoId}.${platformId}.mp4`);
}

function needsReframe(platform: PlatformSpec): boolean {
  return platform.width !== 1080 || platform.height !== 1920;
}

// Landscape targets (width > height, e.g. YouTube standard/LinkedIn/Reddit)
// letterbox with black bars — cropping a 9:16 source down to 16:9 would keep
// only a ~32%-width sliver, destroying the frame. Every other target is
// still portrait-or-square relative to its own frame (even ones wider than
// 9:16, like Instagram's 4:5 feed) and gets a center-crop instead, the same
// treatment Instagram's own Reel-to-feed conversion uses — comparing against
// the *source*'s aspect ratio here (rather than checking if the target
// itself is landscape) would wrongly pad 4:5 too, shrinking and pillarboxing
// a conversion that should just trim top/bottom.
function reframeFilter(platform: PlatformSpec): string {
  const targetAspect = platform.width / platform.height;
  if (targetAspect > 1) {
    return [
      `scale=${platform.width}:${platform.height}:force_original_aspect_ratio=decrease`,
      `pad=${platform.width}:${platform.height}:(ow-iw)/2:(oh-ih)/2:black`,
      `fps=${platform.fps}`,
      "setsar=1",
    ].join(",");
  }
  return [
    `scale=${platform.width}:${platform.height}:force_original_aspect_ratio=increase`,
    `crop=${platform.width}:${platform.height}`,
    `fps=${platform.fps}`,
    "setsar=1",
  ].join(",");
}

export interface PlatformRenderResult {
  path: string;
  durationSeconds: number | null;
  reused: boolean;
}

// Idempotent-ish: re-derives the platform export from whatever the
// canonical render currently is. Caller is responsible for re-running this
// after a re-render if a stale platform export would be a problem.
export async function renderForPlatform(
  videoId: string,
  platformId: string
): Promise<PlatformRenderResult> {
  const platform = getPlatform(platformId);
  const canonicalPath = renderVideoPath(videoId);
  await fs.access(canonicalPath); // throws if the video hasn't been rendered yet

  if (!needsReframe(platform)) {
    return { path: canonicalPath, durationSeconds: await probeDuration(canonicalPath), reused: true };
  }

  await ensureFfmpeg();
  const outPath = platformRenderPath(videoId, platformId);
  const tmpPath = `${outPath}.tmp.mp4`;
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      canonicalPath,
      "-vf",
      reframeFilter(platform),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      tmpPath,
    ]
  );
  await fs.rename(tmpPath, outPath);
  return { path: outPath, durationSeconds: await probeDuration(outPath), reused: false };
}
