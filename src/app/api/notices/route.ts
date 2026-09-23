import { NextResponse } from "next/server";
import { listUndismissedNotices } from "@/lib/system-notices-store";

export const runtime = "nodejs";

export async function GET() {
  const notices = await listUndismissedNotices();
  return NextResponse.json({ notices });
}
