import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { join } from "path";
import { STATIC_ADS_DIR } from "@/lib/paths";
import { loadStaticAdProject, saveStaticAdProject } from "@/lib/static-ad-store";
import { staticAdAttemptImagePath } from "@/lib/static-ad-run";
import { StaticAdTextOverlayZ } from "@/lib/static-ad-overlays-schema";
import { compositeStaticAd, type OverlayPalette } from "@/lib/static-ad-overlays";
import { getLatestColorPalette } from "@/lib/brand-assets-store";

export const runtime = "nodejs";

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
    const colors = await getLatestColorPalette();
    // First color = primary/headline, second = accent/CTA — matches the
    // order the brand-assets UI asks colors to be entered in.
    const palette: OverlayPalette | undefined = colors
      ? { primaryColor: colors[0], accentColor: colors[1] }
      : undefined;
    const composited = await compositeStaticAd(
      staticAdAttemptImagePath(projectId, accepted.file),
      overlay,
      palette
    );
    const filename = "final.png";
    await fs.mkdir(join(STATIC_ADS_DIR, projectId), { recursive: true });
    await fs.writeFile(join(STATIC_ADS_DIR, projectId, filename), composited);

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
