import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { recordSystemNotice } from "@/lib/system-notices-store";

export const runtime = "nodejs";

// Companion to weekly-sync/route.ts (Railway cron service now named
// "daily-sync" — see .railway/railway.ts): checks whether that sync has
// actually run recently, by looking at ads.last_seen_at (bumped by syncAds,
// the first phase runWeeklySync always runs). Catches a silently-stalled
// sync (e.g. the cron itself stops firing, or every run starts failing
// before it gets far enough to log anything) that wouldn't otherwise
// surface anywhere until someone opens the app and looks at System Notices
// -- which is also where THIS check reports to, since that's the only
// alert sink this app has today (no email/webhook channel exists here,
// unlike the Python sibling pipelines' alerts.py). A real notification
// channel could be added later if wanted; this at least makes a stall
// visible in-app instead of invisible.
//
// Threshold defaults to 78h, not ~24h, because the cron itself is weekdays
// only (0 2 * * 1-5) -- a healthy Friday run leaves ads.last_seen_at
// untouched all weekend, so a same-week Monday-morning check needs to
// tolerate that gap without false-alarming every week.
const STALENESS_HOURS = Number(process.env.DEADMAN_STALENESS_HOURS ?? "78");

export async function POST() {
  const sql = getDb();
  const rows = await sql`select max(last_seen_at) as last_seen_at from ads`;
  const lastSeenAtRaw = rows[0]?.lastSeenAt as string | null | undefined;
  const lastSeenAt = lastSeenAtRaw ? new Date(lastSeenAtRaw) : null;
  const stalenessMs = lastSeenAt ? Date.now() - lastSeenAt.getTime() : null;
  const thresholdMs = STALENESS_HOURS * 3600_000;
  const stalenessHours = stalenessMs === null ? null : stalenessMs / 3600_000;

  if (stalenessMs === null || stalenessMs > thresholdMs) {
    const stalenessText = stalenessHours === null ? "never" : `${stalenessHours.toFixed(1)}h`;
    const message = `daily-sync has gone quiet: ads.last_seen_at staleness=${stalenessText} (threshold=${STALENESS_HOURS}h)`;
    console.error(`[deadman-check] ${message}`);
    await recordSystemNotice("deadman-check", message).catch((err) =>
      console.error("[deadman-check] failed to record system notice:", err)
    );
    return NextResponse.json({ healthy: false, lastSeenAt, stalenessHours });
  }

  return NextResponse.json({ healthy: true, lastSeenAt, stalenessHours });
}
