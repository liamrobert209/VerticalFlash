import { NextResponse } from "next/server";
import { loadStaticAdProject, saveStaticAdProject } from "@/lib/static-ad-store";

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
export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  let body: { status?: string };
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

  project.status = body.status;
  project.updatedAt = new Date().toISOString();
  await saveStaticAdProject(project);
  return NextResponse.json(project);
}
