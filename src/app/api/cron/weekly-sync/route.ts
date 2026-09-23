import { NextResponse } from "next/server";
import { runWeeklySync } from "@/lib/weekly-sync-run";
import { recordSystemNotice } from "@/lib/system-notices-store";

export const runtime = "nodejs";

// The weekly-sync cron used to run as its own separate Railway service
// (scripts/weekly-sync.ts), with its own copy of every credential the sync
// logic needs (DB, Apify) — and no access to the main app's persistent
// volume at all (Railway volumes only attach to one service's live
// deployment; a prior attempt to also mount it here detached it from the
// main VerticalFlash service instead, per .railway/railway.ts's comment).
// That second, independently-configured environment silently drifted out
// of sync with the main one (DATABASE_URL went missing there, crashing
// every run) with nothing to catch it.
//
// This route replaces that: the cron job's "code" is now just an
// authenticated HTTP call to the one process that already has every real
// credential and the volume — nothing to keep in sync a second time. A run
// can take a long time (300+ sequential Apify calls, per runWeeklySync's
// header comment) — rather than block the HTTP response for that whole
// duration (and risk a proxy/client timeout well before it's done), this
// kicks the run off in the background and responds immediately; progress
// and errors land in this service's own logs the same way the old
// standalone script's did.
let running = false;

export async function POST() {
  if (running) {
    return NextResponse.json({ error: "A sync is already running" }, { status: 409 });
  }

  running = true;
  runWeeklySync()
    .catch(async (err) => {
      console.error("[weekly-sync] fatal error:", err);
      const message = err instanceof Error ? err.message : String(err);
      await recordSystemNotice("weekly-sync", `Weekly sync failed: ${message}`).catch((noticeErr) =>
        console.error("[weekly-sync] failed to record system notice:", noticeErr)
      );
    })
    .finally(() => {
      running = false;
    });

  return NextResponse.json({ started: true });
}
