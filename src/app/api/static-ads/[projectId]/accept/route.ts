import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loadStaticAdProject, saveStaticAdProject } from "@/lib/static-ad-store";

export const runtime = "nodejs";

const BodyZ = z.object({ attempt: z.number().int().positive() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  let attempt: number;
  try {
    attempt = BodyZ.parse(await request.json()).attempt;
  } catch {
    return NextResponse.json({ error: "attempt is required" }, { status: 400 });
  }

  const project = await loadStaticAdProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const found = project.baseImage.attempts.find((a) => a.attempt === attempt);
  if (!found || found.status !== "ready" || !found.file) {
    return NextResponse.json({ error: "That attempt isn't a ready image" }, { status: 400 });
  }

  // Switching to a DIFFERENT accepted photo invalidates any already-
  // composited final image — it was rendered against the old photo, so it
  // no longer reflects what's actually accepted. Clear it (not textOverlay
  // — the user's typed copy/positions stay, re-applying is one click, no
  // AI cost) rather than silently leaving a stale download around. A
  // project marked "accepted" with no finalImage doesn't make sense
  // either, so that resets back to draft.
  const switchedPhoto = project.baseImage.acceptedAttempt !== attempt;
  project.baseImage.acceptedAttempt = attempt;
  if (switchedPhoto && project.finalImage) {
    project.finalImage = null;
    if (project.status === "accepted") project.status = "draft";
  }
  project.updatedAt = new Date().toISOString();
  await saveStaticAdProject(project);
  return NextResponse.json(project);
}
