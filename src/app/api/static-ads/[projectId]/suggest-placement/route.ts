import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { z } from "zod";
import { getGeminiClient, classifyGeminiError } from "@/lib/gemini";
import { getAd, loadAdCreativeImageBytes } from "@/lib/ads-store";
import { loadStaticAdProject } from "@/lib/static-ad-store";
import { staticAdAttemptImagePath } from "@/lib/static-ad-run";
import { getFullColorPalette } from "@/lib/brand-assets-store";
import { suggestTextPlacement } from "@/lib/static-ad-placement";
import type { ImageBytes } from "@/lib/fetch-image";

export const runtime = "nodejs";

const BodyZ = z.object({
  roles: z.array(z.enum(["headline", "subhead", "cta"])).min(1),
});

const EXT_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

// Suggests, but never applies — returns candidate anchor/color per
// requested role so the wizard can show them and let the user accept or
// override each one (see OverlayEditor's "Suggest placement").
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  let roles: ("headline" | "subhead" | "cta")[];
  try {
    roles = BodyZ.parse(await request.json()).roles;
  } catch {
    return NextResponse.json({ error: "roles is required" }, { status: 400 });
  }

  const project = await loadStaticAdProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const accepted = project.baseImage.attempts.find((a) => a.attempt === project.baseImage.acceptedAttempt);
  if (!accepted?.file) {
    return NextResponse.json({ error: "Accept a base image first" }, { status: 400 });
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
    const photoPath = staticAdAttemptImagePath(projectId, accepted.file);
    const buffer = await fs.readFile(photoPath);
    const ext = accepted.file.split(".").pop() ?? "png";
    const photo: ImageBytes = { base64: buffer.toString("base64"), mimeType: EXT_MIME[ext] ?? "image/png" };

    const referenceAd = await getAd(project.referenceAdId);
    const reference = referenceAd?.creativeUrl ? await loadAdCreativeImageBytes(referenceAd).catch(() => null) : null;

    const palette = await getFullColorPalette();

    const suggestions = await suggestTextPlacement(ai, photoPath, photo, reference, roles, palette);
    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error(`suggest-placement failed (${projectId}):`, error);
    const { kind, retryAfterMs } = classifyGeminiError(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not suggest placement", kind, retryAfterMs },
      { status: kind === "fatal" ? 500 : 429 }
    );
  }
}
