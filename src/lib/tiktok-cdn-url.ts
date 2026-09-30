import { promises as fs } from "fs";
import { join } from "path";
import { fetchImageBuffer } from "./fetch-image";
import { fetchVideoBuffer } from "./fetch-video";
import { TIKTOK_MEDIA_DIR } from "./paths";

// TikTok's own CDN signs media URLs with a built-in `x-expires` query
// param (a Unix timestamp, in seconds) — once that passes, the CDN starts
// returning a real 403 for the URL, permanently (confirmed via a direct
// fetch, not an assumption). Scraped cover images/avatars go dead this way
// within days of being synced; the underlying video keeps working since
// `tiktokUrl` is a plain permalink, not a signed asset URL.
export function isTiktokCdnUrlExpired(url: string | null | undefined): boolean {
  if (!url) return false;
  const match = url.match(/[?&]x-expires=(\d+)/);
  if (!match) return false;
  const expiresAtMs = Number(match[1]) * 1000;
  return Number.isFinite(expiresAtMs) && expiresAtMs < Date.now();
}

const IMAGE_MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

// Downloads a TikTok CDN image (cover image, avatar) once at sync time and
// caches it on the Railway volume (tiktok-media/), keyed by a caller-chosen
// prefix (platform table + external id) — the same "download once while the
// signed URL is still fresh, don't rely on it staying alive" reasoning as
// weekly-ads-sync.ts's cacheCreativeImageLocally and content-sync.ts's
// cacheThumbnailLocally. Best-effort: a failed download must never fail the
// sync — the row still gets stored with just its (possibly short-lived)
// remote URL, same as before this existed.
export async function cacheTiktokImageLocally(url: string, filenamePrefix: string): Promise<string | null> {
  try {
    const { buffer, mimeType } = await fetchImageBuffer(url);
    const ext = IMAGE_MIME_EXT[mimeType] ?? ".jpg";
    const filename = `${filenamePrefix}${ext}`;
    await fs.mkdir(TIKTOK_MEDIA_DIR, { recursive: true });
    await fs.writeFile(join(TIKTOK_MEDIA_DIR, filename), buffer);
    return filename;
  } catch {
    return null;
  }
}

// Same idea as cacheTiktokImageLocally, for a full video file (Weekly
// Trending Content's `videoFileUrl` — Search by Hashtag has no video file
// available at all, see tiktok-hashtag-sync.ts's header comment). Videos
// are much larger than a cover image, but the mechanism is identical.
export async function cacheTiktokVideoLocally(url: string, filenamePrefix: string): Promise<string | null> {
  try {
    const { buffer } = await fetchVideoBuffer(url);
    const filename = `${filenamePrefix}.mp4`;
    await fs.mkdir(TIKTOK_MEDIA_DIR, { recursive: true });
    await fs.writeFile(join(TIKTOK_MEDIA_DIR, filename), buffer);
    return filename;
  } catch {
    return null;
  }
}
