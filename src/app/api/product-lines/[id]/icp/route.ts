import { NextRequest, NextResponse } from "next/server";
import { getProductLinesConfig } from "@/lib/config";
import { findProductLine, IcpProfileZ } from "@/lib/product-lines";
import { getIcpProfile, upsertIcpProfile } from "@/lib/icp-store";

export const runtime = "nodejs";

// Settings → Product Lines board: one product line's ICP content, joined
// through its icpRef. GET/PUT both key off the *product line* id in the
// URL (what the UI is browsing), not the underlying icp_profiles row id
// (what actually gets read/written) — a shared icpRef means editing one
// product line's ICP here edits the same row for every other product line
// that shares it, by design (see ProductLinesBoard's "also used by" note).

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const product = findProductLine(getProductLinesConfig(), id);
  if (!product) return NextResponse.json({ error: "Unknown product line" }, { status: 404 });

  const icp = await getIcpProfile(product.icpRef);
  return NextResponse.json({ icp });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const product = findProductLine(getProductLinesConfig(), id);
  if (!product) return NextResponse.json({ error: "Unknown product line" }, { status: 404 });

  const body = IcpProfileZ.omit({ id: true }).safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`).join("; ") },
      { status: 400 }
    );
  }

  try {
    const icp = await upsertIcpProfile(product.icpRef, body.data);
    return NextResponse.json({ icp });
  } catch (error) {
    console.error("Failed to save ICP profile:", error);
    return NextResponse.json({ error: "Could not save ICP profile" }, { status: 500 });
  }
}
