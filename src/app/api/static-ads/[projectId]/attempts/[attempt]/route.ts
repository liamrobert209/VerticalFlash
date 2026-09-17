import { NextResponse } from "next/server";
import { deleteStaticAdAttempt } from "@/lib/static-ad-store";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; attempt: string }> }
) {
  const { projectId, attempt: attemptParam } = await params;
  const attempt = Number(attemptParam);
  if (!Number.isInteger(attempt) || attempt < 1) {
    return NextResponse.json({ error: "Invalid attempt number" }, { status: 400 });
  }

  const project = await deleteStaticAdAttempt(projectId, attempt);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json(project);
}
