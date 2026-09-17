import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { z } from "zod";
import { getGeminiClient, classifyGeminiError } from "@/lib/gemini";
import { loadStaticAdProject } from "@/lib/static-ad-store";
import { staticAdAttemptImagePath, executeStaticAdAttempt } from "@/lib/static-ad-run";
import { refineImage } from "@/lib/static-ad-generate";

export const runtime = "nodejs";
export const maxDuration = 120;

const BodyZ = z.object({ instruction: z.string().min(1) });

const EXT_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  let instruction: string;
  try {
    instruction = BodyZ.parse(await request.json()).instruction;
  } catch {
    return NextResponse.json({ error: "instruction is required" }, { status: 400 });
  }

  const project = await loadStaticAdProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Refines chain off the accepted attempt by default, falling back to the
  // latest attempt if nothing's been accepted yet.
  const parent =
    project.baseImage.attempts.find((a) => a.attempt === project.baseImage.acceptedAttempt) ??
    project.baseImage.attempts[project.baseImage.attempts.length - 1];
  if (!parent?.file) {
    return NextResponse.json({ error: "Generate a base image first" }, { status: 400 });
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
    const buffer = await fs.readFile(staticAdAttemptImagePath(projectId, parent.file));
    const ext = parent.file.split(".").pop() ?? "png";
    const previous = { base64: buffer.toString("base64"), mimeType: EXT_MIME[ext] ?? "image/png" };

    const outcome = await executeStaticAdAttempt({
      projectId,
      kind: "refine",
      prompt: instruction,
      parentAttempt: parent.attempt,
      run: () => refineImage(ai, previous, instruction),
    });

    if ("notFound" in outcome) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if ("busy" in outcome) {
      return NextResponse.json({ error: "A generation is already running for this project" }, { status: 409 });
    }
    return NextResponse.json(outcome.project);
  } catch (error) {
    console.error(`static ad refine failed (${projectId}):`, error);
    const { kind, retryAfterMs } = classifyGeminiError(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Refine failed", kind, retryAfterMs },
      { status: kind === "fatal" ? 500 : 429 }
    );
  }
}
