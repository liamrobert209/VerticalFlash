import { NextResponse } from "next/server";
import { adnovaConfigured } from "@/lib/adnova-db";
import { listSpendByCategory } from "@/lib/adnova-store";
import { getProductLinesConfig } from "@/lib/config";
import { productLinesWithoutAdSpend } from "@/lib/product-line-category-map";

export const runtime = "nodejs";

export async function GET() {
  if (!adnovaConfigured()) {
    return NextResponse.json({ error: "ADNOVA_DATABASE_URL is not configured" }, { status: 500 });
  }
  const [categorySpend, { productLines }] = await Promise.all([
    listSpendByCategory(),
    Promise.resolve(getProductLinesConfig()),
  ]);
  const suggestions = productLinesWithoutAdSpend(productLines, categorySpend);
  return NextResponse.json({
    categorySpend,
    suggestions: suggestions.map((p) => ({ id: p.id, label: p.label })),
  });
}
