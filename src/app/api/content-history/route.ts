import { NextRequest, NextResponse } from "next/server";
import { listContentRecords } from "@/lib/content-record-store";
import { ContentHistoryQueryZ } from "@/lib/content-record-schema";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const query = ContentHistoryQueryZ.safeParse(params);
  if (!query.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  try {
    const { records, total } = await listContentRecords(query.data);
    return NextResponse.json({ records, total });
  } catch (error) {
    console.error("Failed to load content history:", error);
    return NextResponse.json({ error: "Could not load content history" }, { status: 500 });
  }
}
