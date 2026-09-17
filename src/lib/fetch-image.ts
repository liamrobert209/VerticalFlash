// Shared by ad-analyze.ts and the Static Ad Generator's generation routes —
// anywhere that needs to turn an external image URL into base64 bytes for
// a Gemini inline data part.

export interface ImageBytes {
  base64: string;
  mimeType: string;
}

const FETCH_TIMEOUT_MS = 20_000;

// Facebook's signed CDN URLs (the only kind ads.creative_url ever stores —
// see weekly-ads-sync.ts) carry an x-expires param and go dead a few hours
// after a sync. An expired/dead URL doesn't fail fast: it just hangs until
// something times out, which without an explicit timeout meant a raw,
// confusing "fetch failed" (cause: ETIMEDOUT) surfacing straight to the
// user — confirmed from a real production occurrence. One retry plus a
// clear message covers the common transient case and names the likely
// cause when it's actually a dead URL.
async function fetchOnce(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Fetching image failed: HTTP ${res.status}`);
  }
  return res;
}

export interface ImageBuffer {
  buffer: Buffer;
  mimeType: string;
}

export async function fetchImageBuffer(url: string): Promise<ImageBuffer> {
  let res: Response;
  try {
    res = await fetchOnce(url);
  } catch (firstError) {
    try {
      res = await fetchOnce(url);
    } catch {
      const timedOut = firstError instanceof Error && firstError.name === "TimeoutError";
      throw new Error(
        timedOut
          ? "Timed out fetching the reference image — its CDN link has likely expired. Re-sync this competitor from Weekly Ads to get a fresh one."
          : `Could not fetch the reference image: ${firstError instanceof Error ? firstError.message : String(firstError)}`
      );
    }
  }
  const mimeType = res.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mimeType };
}

export async function fetchImageAsBase64(url: string): Promise<ImageBytes> {
  const { buffer, mimeType } = await fetchImageBuffer(url);
  return { base64: buffer.toString("base64"), mimeType };
}
