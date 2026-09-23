/**
 * CLI wrapper for local dry-runs/manual testing — the real logic lives in
 * src/lib/weekly-sync-run.ts, shared with /api/cron/weekly-sync (the route
 * Railway's weekly-sync cron actually calls in production; see that
 * route's header comment for why this isn't a separate deployed service).
 *
 * Usage:
 *   node --import tsx scripts/weekly-sync.ts              # real run
 *   node --import tsx scripts/weekly-sync.ts --dry-run    # log targets, no Apify calls
 *   node --import tsx scripts/weekly-sync.ts --dry-run --bucket=0
 */
import { runWeeklySync } from "../src/lib/weekly-sync-run";

const dryRun = process.argv.includes("--dry-run");

function bucketOverride(): number | undefined {
  const arg = process.argv.find((a) => a.startsWith("--bucket="));
  if (!arg) return undefined;
  const n = Number(arg.split("=")[1]);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

runWeeklySync({ dryRun, bucketOverride: bucketOverride() }).catch((err) => {
  console.error("[weekly-sync] fatal error:", err);
  process.exit(1);
});
