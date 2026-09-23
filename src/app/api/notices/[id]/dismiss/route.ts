import { NextResponse } from "next/server";
import { dismissSystemNotice } from "@/lib/system-notices-store";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dismissed = await dismissSystemNotice(id);
  if (!dismissed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
