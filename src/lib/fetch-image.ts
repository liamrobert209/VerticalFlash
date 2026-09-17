// Shared by ad-analyze.ts and the Static Ad Generator's generation routes —
// anywhere that needs to turn an external image URL into base64 bytes for
// a Gemini inline data part.

export interface ImageBytes {
  base64: string;
  mimeType: string;
}

export async function fetchImageAsBase64(url: string): Promise<ImageBytes> {
  // Some CDNs (confirmed: Wikimedia; ad-network CDNs like Facebook's are a
  // real risk too) reject requests with no browser-like User-Agent.
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) {
    throw new Error(`Fetching image failed: HTTP ${res.status}`);
  }
  const mimeType = res.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { base64: buffer.toString("base64"), mimeType };
}
