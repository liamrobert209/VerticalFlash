// Mirrors fetch-image.ts's retry/timeout pattern for ad-analyze.ts's video
// path — same underlying risk (Facebook/TikTok's signed CDN URLs expire a
// few hours after a sync), just a bigger payload, so a longer timeout.

export interface VideoBytes {
  buffer: Buffer;
  mimeType: string;
}

const FETCH_TIMEOUT_MS = 45_000;

async function fetchOnce(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Fetching video failed: HTTP ${res.status}`);
  }
  return res;
}

export async function fetchVideoBuffer(url: string): Promise<VideoBytes> {
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
          ? "Timed out fetching the ad video — its CDN link has likely expired."
          : `Could not fetch the ad video: ${firstError instanceof Error ? firstError.message : String(firstError)}`
      );
    }
  }
  const mimeType = res.headers.get("content-type") || "video/mp4";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mimeType };
}
