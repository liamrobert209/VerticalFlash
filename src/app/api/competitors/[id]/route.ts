import { NextRequest, NextResponse } from "next/server";
import { getCompetitor, updateCompetitor, deleteCompetitor, unknownProductLineIds } from "@/lib/competitor-store";
import { CompetitorAccountInputZ } from "@/lib/competitor-schema";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const account = await getCompetitor(id).catch(() => null);
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ account });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = CompetitorAccountInputZ.partial().safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`).join("; ") },
      { status: 400 }
    );
  }
  if (body.data.productLineIds !== undefined) {
    const unknown = unknownProductLineIds(body.data.productLineIds);
    if (unknown.length) {
      return NextResponse.json({ error: `Unknown product line id(s): ${unknown.join(", ")}` }, { status: 400 });
    }
  }
  try {
    const account = await updateCompetitor(id, body.data);
    if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ account });
  } catch (error) {
    console.error("Failed to update competitor:", error);
    return NextResponse.json({ error: "Could not update competitor" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const deleted = await deleteCompetitor(id);
    if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete competitor:", error);
    return NextResponse.json({ error: "Could not delete competitor" }, { status: 500 });
  }
}
