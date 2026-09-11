import { NextRequest, NextResponse } from "next/server";
import { listCompetitors, createCompetitor, unknownProductLineIds } from "@/lib/competitor-store";
import { CompetitorQueryZ, CompetitorAccountInputZ } from "@/lib/competitor-schema";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const query = CompetitorQueryZ.safeParse(params);
  if (!query.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  try {
    const accounts = await listCompetitors(query.data);
    return NextResponse.json({ accounts });
  } catch (error) {
    console.error("Failed to list competitors:", error);
    return NextResponse.json({ error: "Could not load competitors" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = CompetitorAccountInputZ.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`).join("; ") },
      { status: 400 }
    );
  }
  const unknown = unknownProductLineIds(body.data.productLineIds);
  if (unknown.length) {
    return NextResponse.json({ error: `Unknown product line id(s): ${unknown.join(", ")}` }, { status: 400 });
  }
  try {
    const account = await createCompetitor(body.data);
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    console.error("Failed to create competitor:", error);
    return NextResponse.json({ error: "Could not create competitor" }, { status: 500 });
  }
}
