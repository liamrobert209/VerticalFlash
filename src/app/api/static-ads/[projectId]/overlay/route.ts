import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { join } from "path";
import { STATIC_ADS_DIR } from "@/lib/paths";
import { loadStaticAdProject, saveStaticAdProject } from "@/lib/static-ad-store";
import { StaticAdTextOverlayZ } from "@/lib/static-ad-overlays-schema";
import { generateAiTextOverlay } from "@/lib/static-ad-ai-overlay";
import { getAd } from "@/lib/ads-store";

export const runtime = "nodejs";

const MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  let overlay;
  try {
    overlay = StaticAdTextOverlayZ.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid overlay" },
      { status: 400 }
    );
  }

  const project = await loadStaticAdProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const accepted = project.baseImage.attempts.find((a) => a.attempt === project.baseImage.acceptedAttempt);
  if (!accepted?.file) {
    return NextResponse.json({ error: "Accept a base image first" }, { status: 400 });
  }

  try {
    const referenceAd = await getAd(project.referenceAdId);
    const result = await generateAiTextOverlay(
      projectId,
      accepted.file,
      overlay,
      referenceAd?.analysis ?? null
    );
    const filename = `final${MIME_EXT[result.mimeType] ?? ".png"}`;
    await fs.mkdir(join(STATIC_ADS_DIR, projectId), { recursive: true });
    await fs.writeFile(join(STATIC_ADS_DIR, projectId, filename), result.imageBytes);

    project.textOverlay = overlay;
    project.finalImage = filename;
    project.updatedAt = new Date().toISOString();
    await saveStaticAdProject(project);
    return NextResponse.json(project);
  } catch (error) {
    console.error(`static ad overlay failed (${projectId}):`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Overlay failed" },
      { status: 500 }
    );
  }
}
