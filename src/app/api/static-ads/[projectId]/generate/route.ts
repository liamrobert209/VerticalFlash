import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { extname } from "path";
import { getGeminiClient, classifyGeminiError } from "@/lib/gemini";
import { getAd, loadAdCreativeImageBytes } from "@/lib/ads-store";
import { loadStaticAdProject } from "@/lib/static-ad-store";
import { getProductImageSlots, productImagePath } from "@/lib/product-images-store";
import type { ImageBytes } from "@/lib/fetch-image";
import { generateBaseImage } from "@/lib/static-ad-generate";
import { executeStaticAdBatchGenerate } from "@/lib/static-ad-run";
import { ANGLE_SOURCE_LABELS } from "@/lib/icp-angles";

export const runtime = "nodejs";
export const maxDuration = 300;

// Every generation now happens as a batch of 5 independent tries from the
// same locked-in inputs, so the user picks a favorite instead of iterating
// one attempt at a time.
const VERSIONS_PER_BATCH = 5;

const PRODUCT_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function loadProductImageBytes(productLineId: string, filename: string): Promise<ImageBytes> {
  const buffer = await fs.readFile(productImagePath(productLineId, filename));
  const mimeType = PRODUCT_MIME[extname(filename).toLowerCase()] ?? "image/jpeg";
  return { base64: buffer.toString("base64"), mimeType };
}

export async function POST(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await loadStaticAdProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const referenceAd = await getAd(project.referenceAdId);
  if (!referenceAd?.creativeUrl) {
    return NextResponse.json({ error: "Reference ad's creative image is unavailable" }, { status: 400 });
  }

  const slots = await getProductImageSlots(project.productLineId);
  const filledSlots = slots.filter((s) => s.filename);
  if (filledSlots.length === 0) {
    return NextResponse.json(
      { error: "Add at least one product photo in Settings → Product images first" },
      { status: 400 }
    );
  }

  let ai;
  try {
    ai = getGeminiClient();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gemini not configured" },
      { status: 500 }
    );
  }

  try {
    const [referenceBytes, ...productBytes] = await Promise.all([
      loadAdCreativeImageBytes(referenceAd),
      ...filledSlots.map((s) => loadProductImageBytes(project.productLineId, s.filename as string)),
    ]);

    // Descriptive angle string for the generation prompt — the ICP
    // category label plus the specific angle text, e.g. "Problem we solve:
    // eye strain from prolonged screen use" — replaces the old raw
    // AD_INTENTS key (e.g. "product_launch"), which said nothing about our
    // actual ICP pain points.
    const angle = project.angleCategory
      ? `${ANGLE_SOURCE_LABELS[project.angleCategory]}: ${project.angleLabel}`
      : project.angleLabel;

    const brief = {
      usp: project.ourUsp,
      angle,
      persona: project.persona,
      backgroundInstruction: project.backgroundInstruction,
    };

    const outcome = await executeStaticAdBatchGenerate({
      projectId,
      count: VERSIONS_PER_BATCH,
      prompt: project.ourUsp,
      run: () => generateBaseImage(ai, referenceBytes, productBytes, brief),
    });

    if ("notFound" in outcome) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if ("busy" in outcome) {
      return NextResponse.json({ error: "A generation is already running for this project" }, { status: 409 });
    }
    return NextResponse.json(outcome.project);
  } catch (error) {
    console.error(`static ad generation failed (${projectId}):`, error);
    const { kind, retryAfterMs } = classifyGeminiError(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed", kind, retryAfterMs },
      { status: kind === "fatal" ? 500 : 429 }
    );
  }
}
