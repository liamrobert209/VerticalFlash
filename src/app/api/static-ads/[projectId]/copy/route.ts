import { NextResponse } from "next/server";
import { getGeminiClient, classifyGeminiError } from "@/lib/gemini";
import { getAd } from "@/lib/ads-store";
import { loadStaticAdProject, saveStaticAdProject } from "@/lib/static-ad-store";
import { getProductLinesConfig, getBrandConfig } from "@/lib/config";
import { findProductLine } from "@/lib/product-lines";
import { describeAngle } from "@/lib/icp-angles";
import { generateAdCopy } from "@/lib/static-ad-copy";

export const runtime = "nodejs";

// Writes real headline/subhead/CTA copy for a project — separate from
// /generate (the base photo) since copy needs no image round-trip and can
// run in parallel with it. Best-effort: a failure here leaves headline/
// subhead/cta blank (same as a brand-new project) rather than failing the
// whole creation flow — the overlay step's text inputs are always
// user-editable regardless.
export async function POST(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await loadStaticAdProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const referenceAd = await getAd(project.referenceAdId);
  const productLine = findProductLine(getProductLinesConfig(), project.productLineId);

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
    const copy = await generateAdCopy(
      ai,
      {
        referenceHeadline: referenceAd?.headline ?? null,
        referenceBodyText: referenceAd?.bodyText ?? null,
      },
      {
        brandName: getBrandConfig().name,
        productName: productLine?.shortName ?? "our product",
        usp: project.ourUsp,
        angle: describeAngle(project.angleCategory, project.angleLabel),
        persona: project.persona,
      }
    );

    project.headline = copy.headline;
    project.subhead = copy.subhead;
    project.cta = copy.cta;
    project.updatedAt = new Date().toISOString();
    await saveStaticAdProject(project);
    return NextResponse.json(project);
  } catch (error) {
    console.error(`static ad copy generation failed (${projectId}):`, error);
    const { kind, retryAfterMs } = classifyGeminiError(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Copy generation failed", kind, retryAfterMs },
      { status: kind === "fatal" ? 500 : 429 }
    );
  }
}
