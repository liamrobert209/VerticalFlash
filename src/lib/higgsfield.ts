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

// Per-shot AI video generation (generate-clip.ts's runGeneration) — swapped
// from Gemini's Omni model to this. Text-to-video only: unlike Omni, this
// endpoint takes no reference media (no video refs, no extend-from-source),
// just a prompt + duration/resolution/aspect ratio — confirmed via a real
// test call (see the repo-root scratch index.ts this was validated
// against). Visual grounding that used to come from attached reference
// clips/product photos now has to be carried entirely in the prompt text
// (see generation-prompts.ts's seedancePreamble).
export const SEEDANCE_TEXT_TO_VIDEO_MODEL = "bytedance/seedance-2.5/text-to-video";

export interface SeedanceVideoResult {
  videoBytes: Buffer;
  mimeType: string;
}

export async function generateSeedanceVideo(
  prompt: string,
  opts: { durationSeconds?: number; resolution?: "480p" | "720p" | "1080p"; aspectRatio?: string } = {}
): Promise<SeedanceVideoResult> {
  ensureConfigured();

  const result = await higgsfield.subscribe(SEEDANCE_TEXT_TO_VIDEO_MODEL, {
    input: {
      prompt,
      duration: opts.durationSeconds ?? 5,
      resolution: opts.resolution ?? "720p",
      aspect_ratio: opts.aspectRatio ?? "9:16",
    },
    withPolling: true,
  });

  const videoUrl = result.status === "completed" ? result.video?.url : undefined;
  if (!videoUrl) {
    // Same defensive read as generateMarketingStudioImage above — the
    // SDK's V2Response type doesn't declare `error`, but a failed
    // generation's real response body includes one.
    const errorDetail = (result as { error?: string }).error;
    throw new Error(
      `Seedance did not return a video — status: "${result.status}"${
        errorDetail ? `, error: ${errorDetail}` : ""
      }`
    );
  }

  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download generated video: HTTP ${response.status}`);
  }

  return {
    videoBytes: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type") || "video/mp4",
  };
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
