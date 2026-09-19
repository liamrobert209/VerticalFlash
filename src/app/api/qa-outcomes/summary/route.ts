import { NextRequest, NextResponse } from "next/server";
import { summarizeQaOutcomes } from "@/lib/qa-outcomes-store";

export const runtime = "nodejs";

// Real aggregation of qa_outcomes over a rolling window (default 30 days,
// ?days=N to override) — the answer to "is the QA pipeline actually
// catching/passing things consistently" as numbers, not impression.
export async function GET(request: NextRequest) {
  const daysParam = request.nextUrl.searchParams.get("days");
  const days = daysParam ? Number(daysParam) : 30;
  if (!Number.isFinite(days) || days <= 0) {
    return NextResponse.json({ error: "days must be a positive number" }, { status: 400 });
  }
  try {
    const summary = await summarizeQaOutcomes(days);
    return NextResponse.json({ days, summary });
  } catch (error) {
    console.error("Failed to summarize QA outcomes:", error);
    return NextResponse.json({ error: "Could not load QA outcome summary" }, { status: 500 });
  }
}
