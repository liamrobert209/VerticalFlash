import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { loadImage } from "@napi-rs/canvas";
import { loadStaticAdProject, saveStaticAdProject } from "@/lib/static-ad-store";
import { staticAdAttemptImagePath } from "@/lib/static-ad-run";
import { runBrandQa } from "@/lib/static-ad-brand-qa";
import { getGeminiClient } from "@/lib/gemini";
import { getBrandConfig } from "@/lib/config";
import { recordQaOutcome } from "@/lib/qa-outcomes-store";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await loadStaticAdProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json(project);
}

// Marks a project finished ("accepted", ready to download) or discarded.
// "accepted" requires a finalImage — the overlay must have been applied at
// least once, since a project with no composited image has nothing to
// download.
//
// Before actually accepting, runs the Brand QA gate (static-ad-brand-qa.ts)
// on the finished, composited image. A failure doesn't error out — it
// returns { blocked: true, issues } with the project's status left
// unchanged, so the UI can show what's wrong and offer "accept anyway"
// (resubmit with `force: true`) rather than being stuck forever on a
// false positive.
export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  let body: { status?: string; force?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (body.status !== "accepted" && body.status !== "discarded") {
    return NextResponse.json({ error: "status must be 'accepted' or 'discarded'" }, { status: 400 });
  }

  const project = await loadStaticAdProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (body.status === "accepted" && !project.finalImage) {
    return NextResponse.json({ error: "Apply the text overlay before finishing this ad" }, { status: 400 });
  }

  if (body.status === "accepted" && !body.force) {
    try {
      const path = staticAdAttemptImagePath(projectId, project.finalImage!);
      const buffer = await fs.readFile(path);
      const dims = await loadImage(path);
      const texts = (project.textOverlay?.elements ?? [])
        .filter((el) => el.include && el.text.trim())
        .map((el) => el.text);
      const ai = getGeminiClient();
      const qa = await runBrandQa(
        ai,
        { base64: buffer.toString("base64"), mimeType: "image/png" },
        dims.width,
        texts,
        getBrandConfig().name,
        project.textOverlay?.logoMark.include ?? false
      );
      recordQaOutcome({ projectId, attempt: null, kind: "brand_qa", passed: qa.passed, issues: qa.issues }).catch(
        (err) => console.error(`Failed to record QA outcome (${projectId}, brand_qa):`, err)
      );
      if (!qa.passed) {
        return NextResponse.json({ blocked: true, issues: qa.issues });
      }
    } catch (error) {
      // Brand QA itself failing (Gemini unavailable, etc.) shouldn't block
      // finishing an ad forever — log and fall through to accepting.
      console.error(`brand QA failed to run (${projectId}):`, error);
    }
  }

  project.status = body.status;
  project.updatedAt = new Date().toISOString();
  await saveStaticAdProject(project);
  return NextResponse.json(project);
}
