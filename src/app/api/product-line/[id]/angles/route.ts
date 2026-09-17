import { NextResponse } from "next/server";
import { getProductLinesConfig } from "@/lib/config";
import { resolveIcp, angleOptionsForIcp } from "@/lib/product-lines";

// The closed hook/angle vocabulary for one product line, drawn from its
// ICP's problems-solved/loves/purchase-drivers/objections lists — used by
// the iterate-on-content tool's angle pickers. Deliberately narrower than
// the full ICP (no raw survey/review percentages, demographic read, or
// quote) — this is the one piece of ICP data that's safe and useful to
// expose to the browser.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const config = getProductLinesConfig();
  const icp = await resolveIcp(config, id);
  if (!icp) {
    return NextResponse.json({ error: "Unknown product line" }, { status: 404 });
  }
  return NextResponse.json({ options: angleOptionsForIcp(icp) });
}
