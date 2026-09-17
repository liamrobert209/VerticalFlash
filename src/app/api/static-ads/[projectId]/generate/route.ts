import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { extname } from "path";
import { getGeminiClient, classifyGeminiError } from "@/lib/gemini";
import { getAd } from "@/lib/ads-store";
import { loadStaticAdProject } from "@/lib/static-ad-store";
import { productImagePath } from "@/lib/product-images-store";
import { fetchImageAsBase64, type ImageBytes } from "@/lib/fetch-image";
import { generateBaseImage } from "@/lib/static-ad-generate";
import { executeStaticAdAttempt } from "@/lib/static-ad-run";

export const runtime = "nodejs";
export const maxDuration = 120;

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
    const [referenceBytes, productBytes] = await Promise.all([
      fetchImageAsBase64(referenceAd.creativeUrl),
      loadProductImageBytes(project.productLineId, project.ourProductImage),
    ]);

    const outcome = await executeStaticAdAttempt({
      projectId,
      kind: "generate",
      prompt: project.ourUsp,
      parentAttempt: null,
      run: () => generateBaseImage(ai, referenceBytes, productBytes, project.ourUsp),
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
