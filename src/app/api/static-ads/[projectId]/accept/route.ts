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

  project.baseImage.acceptedAttempt = attempt;
  project.updatedAt = new Date().toISOString();
  await saveStaticAdProject(project);
  return NextResponse.json(project);
}
