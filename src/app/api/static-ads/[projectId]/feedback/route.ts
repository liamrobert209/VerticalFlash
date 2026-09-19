import { NextResponse } from "next/server";
import { z } from "zod";
import { loadStaticAdProject, saveStaticAdProject } from "@/lib/static-ad-store";

export const runtime = "nodejs";

const BodyZ = z.object({
  rating: z.enum(["up", "down"]).nullable(),
  note: z.string().nullable(),
});

// Records (or clears) a thumbs up/down + optional note on a finished ad —
// independent of the accept/discard status transition in the main PATCH
// route, so a rating can be added, changed, or cleared without re-running
// the Brand QA gate. See static-ad-schema.ts's StaticAdFeedbackZ.
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  let body: z.infer<typeof BodyZ>;
  try {
    body = BodyZ.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "rating must be 'up', 'down', or null" }, { status: 400 });
  }

  const project = await loadStaticAdProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  project.feedback =
    body.rating === null && !body.note
      ? null
      : { rating: body.rating, note: body.note, ratedAt: new Date().toISOString() };
  project.updatedAt = new Date().toISOString();
  await saveStaticAdProject(project);
  return NextResponse.json({ feedback: project.feedback });
}
