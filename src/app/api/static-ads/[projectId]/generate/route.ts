import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { extname } from "path";
import { getGeminiClient, classifyGeminiError } from "@/lib/gemini";
import { getAd, loadAdCreativeImageBytes } from "@/lib/ads-store";
import { loadStaticAdProject } from "@/lib/static-ad-store";
import { getProductImageSlots, productImagePath } from "@/lib/product-images-store";
import { getActorImageSlots, actorImagePath } from "@/lib/actor-images-store";
import type { ImageBytes } from "@/lib/fetch-image";
import { generateBaseImageWithQa } from "@/lib/static-ad-generate";
import { executeStaticAdBatchGenerate } from "@/lib/static-ad-run";
import { describeAngle } from "@/lib/icp-angles";
import { getProductLinesConfig } from "@/lib/config";
import { findProductLine } from "@/lib/product-lines";

export const runtime = "nodejs";
export const maxDuration = 300;

// Every generation now happens as a batch of 5 independent tries from the
// same locked-in inputs, so the user picks a favorite instead of iterating
// one attempt at a time.
const VERSIONS_PER_BATCH = 5;

const IMAGE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function loadImageBytes(path: string): Promise<ImageBytes> {
  const buffer = await fs.readFile(path);
  const mimeType = IMAGE_MIME[extname(path).toLowerCase()] ?? "image/jpeg";
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
    // Actor photos are scoped per product line, same as product photos —
    // whichever product line this ad is for determines which actor's
    // reference photos get used (see actor-images-store.ts). Absent/empty
    // slots just mean no person swap is attempted, handled inside
    // generateBaseImage via the personDescription/actorPhotos combination.
    const actorSlots = await getActorImageSlots(project.productLineId);
    const filledActorSlots = actorSlots.filter((s) => s.filename);

    const [referenceBytes, productBytes, actorBytes] = await Promise.all([
      loadAdCreativeImageBytes(referenceAd),
      Promise.all(filledSlots.map((s) => loadImageBytes(productImagePath(project.productLineId, s.filename as string)))),
      Promise.all(filledActorSlots.map((s) => loadImageBytes(actorImagePath(project.productLineId, s.filename as string)))),
    ]);

    const angle = describeAngle(project.angleCategory, project.angleLabel);
    const productLine = findProductLine(getProductLinesConfig(), project.productLineId);

    const brief = {
      usp: project.ourUsp,
      angle,
      persona: project.persona,
      backgroundInstruction: project.backgroundInstruction,
      productDescription: productLine?.description ?? productLine?.shortName ?? "our product",
      personDescription: referenceAd.analysis?.hasPerson ? (referenceAd.analysis.personDescription ?? null) : null,
    };

    const outcome = await executeStaticAdBatchGenerate({
      projectId,
      count: VERSIONS_PER_BATCH,
      prompt: project.ourUsp,
      run: () => generateBaseImageWithQa(ai, referenceBytes, productBytes, brief, actorBytes),
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
