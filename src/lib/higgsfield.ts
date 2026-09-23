import { config as configureHiggsfield, higgsfield } from "@higgsfield/client/v2";

// Static Ad Generator's AI text-overlay path (see static-ad-ai-overlay.ts).
// Bakes headline/subhead/CTA/logo directly into the photo as pixels — the
// deliberate alternative to static-ad-overlays.ts's deterministic canvas
// compositor, chosen for cases where baked-in text/branding is wanted
// instead of a real editable layer. Confirmed via real test calls that this
// model requires publicly-reachable image URLs (base64 data URIs fail
// silently) — every input image must go through signAssetUrl first.
export const MARKETING_STUDIO_IMAGE_MODEL = "marketing-studio/image";

let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  const credentials = process.env.HF_CREDENTIALS;
  if (!credentials) {
    throw new Error(
      "HF_CREDENTIALS is not configured — add it to .env.local (KEY_ID:KEY_SECRET format)"
    );
  }
  configureHiggsfield({ credentials });
  configured = true;
}

export interface MarketingStudioImageResult {
  imageBytes: Buffer;
  mimeType: string;
}

export async function generateMarketingStudioImage(
  prompt: string,
  imageUrls: string[],
  opts: { resolution?: "1k" | "2k" | "4k"; aspectRatio?: string } = {}
): Promise<MarketingStudioImageResult> {
  ensureConfigured();

  const result = await higgsfield.subscribe(MARKETING_STUDIO_IMAGE_MODEL, {
    input: {
      prompt,
      image_urls: imageUrls,
      resolution: opts.resolution ?? "2k",
      aspect_ratio: opts.aspectRatio ?? "auto",
    },
    withPolling: true,
  });

  const imageUrl = result.status === "completed" ? result.images?.[0]?.url : undefined;
  if (!imageUrl) {
    // The SDK's V2Response type doesn't declare `error`, but a failed
    // generation's real response body includes one (confirmed by an actual
    // failed call) — read it defensively rather than widening the type.
    const errorDetail = (result as { error?: string }).error;
    throw new Error(
      `Marketing Studio Image did not return an image — status: "${result.status}"${
        errorDetail ? `, error: ${errorDetail}` : ""
      }`
    );
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download generated image: HTTP ${response.status}`);
  }

  return {
    imageBytes: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type") || "image/png",
  };
}
