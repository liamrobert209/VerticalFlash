import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { z } from "zod";
import { AdhocBriefZ, adhocBriefPath } from "@/lib/adhoc-brief-schema";
import { REFERENCE_ORIGINS } from "@/lib/content-record-schema";
import { writeProjectProductLineIfAbsent } from "@/lib/project-product-line";
import { getProductLinesConfig } from "@/lib/config";
import { PLATFORMS } from "@/lib/platforms";
import { isValidVideoId } from "@/lib/video-id";

// Finalizes the iterate-on-content tool's submission: pins the chosen
// product line to this project and writes the ad-hoc brief sidecar
// (original/new angle, which door — creator or ad — it came through,
// target platform). Works the same whether the video arrived via
// /api/create-ad-hoc/upload or /api/proxy-video (a pasted TikTok URL).

const BodyZ = z.object({
  videoId: z.string(),
  productLineId: z.string(),
  originalAngle: z.string().nullable(),
  newAngle: z.string().nullable(),
  angleSource: z.string().nullable(),
  isCustom: z.boolean(),
  referenceOrigin: z.enum(REFERENCE_ORIGINS),
  platformId: z.string(),
});

export async function POST(request: NextRequest) {
  const body = BodyZ.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`).join("; ") },
      { status: 400 }
    );
  }
  const { videoId, productLineId } = body.data;
  if (!isValidVideoId(videoId)) {
    return NextResponse.json({ error: "invalid videoId" }, { status: 400 });
  }
  if (!getProductLinesConfig().productLines.some((p) => p.id === productLineId)) {
    return NextResponse.json({ error: "Unknown product line" }, { status: 400 });
  }
  if (!PLATFORMS.some((p) => p.id === body.data.platformId)) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
  }

  await writeProjectProductLineIfAbsent(videoId, productLineId);

  const brief = AdhocBriefZ.parse({
    originalAngle: body.data.originalAngle,
    newAngle: body.data.newAngle,
    angleSource: body.data.angleSource,
    isCustom: body.data.isCustom,
    referenceOrigin: body.data.referenceOrigin,
    platformId: body.data.platformId,
    createdAt: new Date().toISOString(),
  });
  await fs.writeFile(adhocBriefPath(videoId), JSON.stringify(brief, null, 2));

  return NextResponse.json({ videoId, filename: `${videoId}.mp4` });
}
