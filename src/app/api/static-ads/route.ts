import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAd } from "@/lib/ads-store";
import { getProductLinesConfig } from "@/lib/config";
import { createStaticAdProject, listStaticAdProjects } from "@/lib/static-ad-store";
import { STATIC_AD_STATUSES } from "@/lib/static-ad-schema";
import { ANGLE_SOURCE_LISTS } from "@/lib/icp-angles";

export const runtime = "nodejs";

const CreateBodyZ = z.object({
  referenceAdId: z.string().min(1),
  productLineId: z.string().min(1),
  ourUsp: z.string().min(1),
  angleCategory: z.enum(ANGLE_SOURCE_LISTS).nullable(),
  angleLabel: z.string().min(1),
  persona: z.string().default(""),
  backgroundInstruction: z.string().nullable().default(null),
});

export async function POST(request: NextRequest) {
  let body: z.infer<typeof CreateBodyZ>;
  try {
    body = CreateBodyZ.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`).join("; ")
            : "Invalid request",
      },
      { status: 400 }
    );
  }

  if (!getProductLinesConfig().productLines.some((p) => p.id === body.productLineId)) {
    return NextResponse.json({ error: "Unknown product line" }, { status: 400 });
  }

  const referenceAd = await getAd(body.referenceAdId);
  if (!referenceAd) {
    return NextResponse.json({ error: "Reference ad not found" }, { status: 404 });
  }
  if (!referenceAd.isStaticEligible) {
    return NextResponse.json(
      { error: "That ad isn't eligible as a static reference (no genuine static-image creative)" },
      { status: 400 }
    );
  }

  const project = await createStaticAdProject(body);
  return NextResponse.json(project, { status: 201 });
}

export async function GET(request: NextRequest) {
  const statusParam = request.nextUrl.searchParams.get("status");
  const status =
    statusParam && (STATIC_AD_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as (typeof STATIC_AD_STATUSES)[number])
      : undefined;
  const since = request.nextUrl.searchParams.get("since") ?? undefined;
  const projects = await listStaticAdProjects({ status, since });
  return NextResponse.json({ projects });
}
