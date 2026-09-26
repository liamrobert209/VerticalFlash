import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { join } from "path";
import { AnalysisZ, type Analysis } from "@/lib/analysis-schema";
import { loadLibrary } from "@/lib/library-analyze";
import { loadGenerations } from "@/lib/generation-store";
import { shotDurationSeconds } from "@/lib/generation-prompts";
import { pickReferenceClips, runGeneration } from "@/lib/generate-clip";
import {
  executeGenerationAttempt,
  generationErrorResponse,
} from "@/lib/generation-run";
import { ANALYSIS_DIR } from "@/lib/paths";
import { getBrandConfig, getProductLinesConfig } from "@/lib/config";
import { resolveEffectiveProduct } from "@/lib/product-lines";
import { resolveProductLineForVideo } from "@/lib/active-product";
import { writeProjectProductLineIfAbsent } from "@/lib/project-product-line";

// Seedance generation itself is usually well under a minute, but keep
// plenty of headroom for a slow queue.
export const maxDuration = 600;

async function loadAnalysis(videoId: string): Promise<Analysis | null> {
  try {
    const raw = await fs.readFile(join(ANALYSIS_DIR, `${videoId}.json`), "utf8");
    return AnalysisZ.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

// Generate an AI clip for one shot from its stored prompt
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;
  if (!/^[\w-]+$/.test(videoId)) {
    return NextResponse.json({ error: "invalid videoId" }, { status: 400 });
  }

  let shotIndex: number;
  let useReferences = true;
  try {
    const body = await request.json();
    shotIndex = body.shot_index;
    if (body.use_references === false) useReferences = false;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (typeof shotIndex !== "number" || !Number.isInteger(shotIndex)) {
    return NextResponse.json(
      { error: "shot_index is required" },
      { status: 400 }
    );
  }

  const analysis = await loadAnalysis(videoId);
  const shot = analysis?.shots.find((s) => s.index === shotIndex);
  if (!analysis || !shot) {
    return NextResponse.json(
      { error: "Unknown shot — run the shot analysis first" },
      { status: 404 }
    );
  }

  const generations = await loadGenerations(videoId);
  const prompt = generations.shots[String(shotIndex)]?.prompt?.trim();
  if (!prompt) {
    return NextResponse.json(
      { error: "No generation prompt for this shot — draft one first" },
      { status: 400 }
    );
  }

  const productLineId = await resolveProductLineForVideo(videoId, request);
  await writeProjectProductLineIfAbsent(videoId, productLineId);
  const product = resolveEffectiveProduct(getBrandConfig(), getProductLinesConfig(), productLineId);

  // Seedance takes no reference media — this is now purely informational
  // metadata recorded on the attempt (which library clips would have
  // grounded this shot under the old Omni pipeline), not fed to the model.
  let referenceFiles: string[] = [];
  if (useReferences) {
    const library = await loadLibrary();
    referenceFiles = pickReferenceClips(library, shot);
  }

  try {
    const outcome = await executeGenerationAttempt({
      videoId,
      shotIndex,
      kind: "generate",
      prompt,
      sourceClip: null,
      referenceFiles,
      targetSeconds: shotDurationSeconds(shot),
      run: (attempt) =>
        runGeneration({
          videoId,
          shotIndex,
          attempt,
          kind: "generate",
          product,
          prompt,
          targetSeconds: shotDurationSeconds(shot),
        }),
    });
    if ("busy" in outcome) {
      return NextResponse.json(
        { error: "A generation is already running for this shot" },
        { status: 409 }
      );
    }
    return NextResponse.json(outcome.generations);
  } catch (error) {
    console.error(`clip generation failed (shot ${shotIndex}):`, error);
    return generationErrorResponse(error);
  }
}
