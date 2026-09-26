import { promises as fs } from "fs";
import { execFileAsync } from "./ffmpeg";
import { CLIP_CATEGORY_IDS } from "./brand";
import { join } from "path";
import { generateSeedanceVideo, SEEDANCE_TEXT_TO_VIDEO_MODEL } from "./higgsfield";
import { seedancePreamble } from "./generation-prompts";
import type { EffectiveProduct } from "./product-lines";
import { generatedClipDir, generatedClipName } from "./generation-schema";
import type { ClipLibrary } from "./library-schema";
import type { Analysis } from "./analysis-schema";

// Retained from the Omni era purely as a cap on pickReferenceClips' output
// below — that list is now only recorded as informational metadata on the
// generation attempt (reference_files), not fed to the model, since
// Seedance takes no reference media at all.
export const MAX_REFERENCE_CLIPS = 3;

export async function probeDurationSeconds(path: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      path,
    ]);
    const raw = parseFloat(JSON.parse(stdout)?.format?.duration);
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw * 10) / 10 : null;
  } catch {
    return null;
  }
}

type AnalysisShot = Analysis["shots"][number];

// day/night grouping, same collapse as the renderer's lighting logic
function toGroup(timeOfDay: string | null | undefined): "day" | "night" | null {
  switch (timeOfDay) {
    case "morning":
    case "midday":
    case "afternoon":
    case "golden_hour":
      return "day";
    case "night":
      return "night";
    default:
      return null;
  }
}

// Up to 3 library clips that actually show the product, to ride along as
// character references: product showcases first, matching lighting preferred
export function pickReferenceClips(
  library: ClipLibrary,
  shot: AnalysisShot
): string[] {
  const shotGroup = toGroup(shot.time_of_day);
  const candidates = library.videos.filter((v) => v.analysis?.product_present);
  const rank = (v: (typeof candidates)[number]): number => {
    let score = 0;
    if (v.analysis!.category === CLIP_CATEGORY_IDS.showcase) score += 2;
    const clipGroup = toGroup(v.analysis!.time_of_day);
    if (shotGroup && clipGroup === shotGroup) score += 1;
    return score;
  };
  return candidates
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, MAX_REFERENCE_CLIPS)
    .map((v) => v.filename);
}

export interface RunGenerationOptions {
  videoId: string;
  shotIndex: number;
  attempt: number;
  kind: "generate" | "extend";
  product: EffectiveProduct;
  // The creative prompt (seedancePreamble is appended here)
  prompt: string;
  // Used by dry-run to size the placeholder, and as Seedance's requested
  // clip duration for a real "generate" call. Unused for "extend" (see the
  // comment on the extend branch below — Seedance can't fulfill it).
  targetSeconds: number;
}

export interface RunGenerationResult {
  file: string;
  duration: number | null;
  interactionId: string | null;
  usage?: Record<string, unknown>;
  videoSeconds: number | null;
  model: string;
}

export async function runGeneration(
  opts: RunGenerationOptions
): Promise<RunGenerationResult> {
  const outDir = generatedClipDir(opts.videoId);
  await fs.mkdir(outDir, { recursive: true });
  const filename = generatedClipName(opts.shotIndex, opts.attempt);
  const outPath = join(outDir, filename);

  // Free end-to-end testing: synthesize a labeled test pattern instead of
  // calling the API
  if (process.env.GENAI_VIDEO_DRY_RUN === "1") {
    const seconds = Math.max(1, Math.ceil(opts.targetSeconds));
    await execFileAsync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc2=s=1080x1920:r=30:d=${seconds}`,
      "-vf",
      `drawtext=text='GEN shot ${opts.shotIndex} (${opts.kind})':fontsize=64:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.6`,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      outPath,
    ]);
    return {
      file: filename,
      duration: await probeDurationSeconds(outPath),
      interactionId: `dry-run-${opts.shotIndex}-${opts.attempt}`,
      videoSeconds: null,
      model: SEEDANCE_TEXT_TO_VIDEO_MODEL,
    };
  }

  // Seedance is text-to-video only — no attached reference clips, no
  // extending an existing source clip (both were Omni-specific
  // capabilities; see this file's header comment and generation-prompts.ts's
  // seedancePreamble for how product grounding is carried instead). Surface
  // that plainly rather than silently generating something unrelated to
  // what "extend" was asked to do.
  if (opts.kind === "extend") {
    throw new Error(
      "Extending an existing clip isn't supported with Seedance (text-to-video only) — use Generate instead"
    );
  }

  const promptText = opts.prompt + seedancePreamble(opts.product);
  const { videoBytes } = await generateSeedanceVideo(promptText, {
    durationSeconds: Math.max(1, Math.round(opts.targetSeconds)),
    resolution: "1080p",
    aspectRatio: "9:16",
  });
  await fs.writeFile(outPath, videoBytes);

  const duration = await probeDurationSeconds(outPath);
  return {
    file: filename,
    duration,
    interactionId: null,
    videoSeconds: duration,
    model: SEEDANCE_TEXT_TO_VIDEO_MODEL,
  };
}
