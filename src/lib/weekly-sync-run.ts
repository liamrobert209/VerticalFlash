/**
 * The actual sync logic behind the Railway "daily-sync" cron (weekdays,
 * 0 2 * * 1-5 — not actually weekly, despite the route/function names
 * below) — refreshes every weekly-digest data source with a working sync
 * path: Weekly Ads / Weekly Static Ads / Ad Insights category pages (via
 * the shared `ads` table), Weekly Content / Weekly Creators, Weekly
 * Trending Content, and Search by Hashtag — plus a cleanup phase that
 * purges Trending/Hashtag rows whose cover image has permanently expired
 * on TikTok's CDN (see tiktok-cdn-url.ts), so those feeds don't
 * accumulate videos with a dead/black thumbnail forever.
 *
 * Runs inside the MAIN app process (via /api/cron/weekly-sync — see that
 * route's header comment for why), not as a separate Railway service.
 * scripts/weekly-sync.ts is now just a thin CLI wrapper around
 * runWeeklySync for local dry-runs/manual testing — the logic itself lives
 * here so both callers share one implementation.
 *
 * Ads and content targets are both a RANKED, cost-bounded selection, not
 * "sync everything on file":
 *   - Ads: per product line, walk that line's competitors ranked by
 *     follower count (facebook/tiktok) until 5 have yielded at least one ad
 *     or the list is exhausted — see syncRankedAdsForProductLines
 *     (weekly-ads-sync.ts). Capped overall by WEEKLY_SYNC_MAX_ADS_ACCOUNTS_TOTAL
 *     (default 60 distinct accounts across the whole run).
 *   - Content: a flat top 5 accounts per channel (Instagram, TikTok),
 *     ranked by that channel's own follower count, NO brand/creator split
 *     (a deliberate cost decision — Weekly Creators may end up sparse as a
 *     result) — see rankContentTargets (competitor-ranking.ts).
 *
 * Optional per-run caps (unset = default, see above) — set as env vars to
 * bound cost/volume without touching code:
 *   WEEKLY_SYNC_MAX_ADS_ACCOUNTS_TOTAL  e.g. "60" (see weekly-ads-sync.ts)
 *   WEEKLY_SYNC_MAX_TRENDING_CATEGORIES e.g. "3"
 *   WEEKLY_SYNC_MAX_HASHTAGS           e.g. "5" (bucket size is already ~10)
 *
 * Hashtags are rotated in small daily buckets rather than running the full
 * tracked list every day — see `todaysHashtagSlice`. Bucket size is fixed
 * at HASHTAG_PER_RUN_TARGET (~10), timed against a real measured ~14-25s
 * per hashtag call to reliably finish in well under 5 minutes; full
 * coverage of the tracked list takes several weeks to cycle through rather
 * than one week, as a direct tradeoff for that speed.
 */
import { listCompetitors } from "./competitor-store";
import { syncRankedAdsForProductLines } from "./weekly-ads-sync";
import { rankAdsTargetsForProductLine, rankContentTargets } from "./competitor-ranking";
import { syncInstagramContent, syncTikTokContent, type ContentSyncTarget } from "./content-sync";
import { getPublicProductLines } from "./config";
import type { CompetitorAccount } from "./competitor-schema";
import { syncTrendingVideos } from "./tiktok-trends-sync";
import { TIKTOK_TREND_INDUSTRIES } from "./tiktok-trends-schema";
import { syncHashtagVideos } from "./tiktok-hashtag-sync";
import { HASHTAG_CATEGORIES, uniqueHashtags } from "./tiktok-hashtag-categories";
import { deleteExpiredHashtagVideos } from "./tiktok-hashtag-store";
import { deleteExpiredTrendingVideos } from "./tiktok-trends-store";
import { recordSystemNotice } from "./system-notices-store";

export interface WeeklySyncOptions {
  dryRun?: boolean;
  // Force a specific hashtag rotation bucket instead of deriving it from
  // today's date — for testing (see todaysHashtagSlice).
  bucketOverride?: number;
}

function envLimit(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

// Applies a cap (if set) and logs what got dropped — no silent truncation,
// since a capped run should read as "capped", not "this is everything."
function applyLimit<T>(items: T[], limit: number | undefined, envVarName: string): T[] {
  if (limit == null || items.length <= limit) return items;
  console.log(`[weekly-sync] capped to ${limit} of ${items.length} (${envVarName} is set)`);
  return items.slice(0, limit);
}

// Real measured latency (3 live calls): 13.8s / 18.7s / 25.2s, avg ~19s —
// 10 hashtags/run keeps even a slow run (10 x 25s = 250s) comfortably under
// 5 minutes. The hashtag scraper is also the single most expensive piece of
// this run ($5/1,000 results), so a small daily bucket keeps per-run cost
// down too, at the cost of taking several weeks (not one week) to cycle
// through the full tracked list once.
const HASHTAG_PER_RUN_TARGET = 10;

// A fixed Monday reference point — arbitrary, just needs to be a real
// anchor for counting weekday runs from.
const HASHTAG_ROTATION_EPOCH = Date.UTC(2026, 0, 5);

// Counts actual weekdays (Mon-Fri) between the epoch and `nowMs`, treating
// weekends as if they don't exist — so the bucket index advances by
// exactly one on every real cron run, with nothing skipped or
// double-visited around a weekend gap (a plain calendar-day-mod would skip
// some buckets forever, since only 5 of every 7 calendar days are ever
// actually run).
function weekdayRunsSince(epochMs: number, nowMs: number): number {
  let count = 0;
  let cursor = epochMs;
  const oneDayMs = 24 * 60 * 60 * 1000;
  while (cursor < nowMs) {
    const day = new Date(cursor).getUTCDay();
    if (day >= 1 && day <= 5) count++;
    cursor += oneDayMs;
  }
  return count;
}

function todaysHashtagSlice(all: string[], bucketOverride: number | undefined): string[] {
  const bucketCount = Math.ceil(all.length / HASHTAG_PER_RUN_TARGET);
  const runIndex = bucketOverride ?? weekdayRunsSince(HASHTAG_ROTATION_EPOCH, Date.now());
  const bucketIndex = ((runIndex % bucketCount) + bucketCount) % bucketCount;
  const start = bucketIndex * HASHTAG_PER_RUN_TARGET;
  return all.slice(start, start + HASHTAG_PER_RUN_TARGET);
}

// Tracked hashtag categories now live in tiktok-hashtag-categories.ts —
// shared with the Search by Hashtag preset picker, which needs the exact
// same list client-side (see that file's header comment for why).

// Every competitor linked to product line, ranked by follower count, is
// walked (up to 5 per line per platform yielding at least one ad, or
// exhausted) inside syncRankedAdsForProductLines — regional-duplicate
// collapsing (e.g. "Belkin" uk/eu/us) happens there too, per product
// line's ranked subset, via dedupeFacebookTargets (weekly-ads-sync.ts).
async function syncAds(dryRun: boolean) {
  const accounts = await listCompetitors({});
  console.log(`[weekly-sync] ads: ${accounts.length} competitor account rows on file`);

  if (dryRun) {
    // Ranking is pure/free — log what each product line's walk WOULD
    // consider without making any real Apify calls.
    for (const line of getPublicProductLines()) {
      const facebook = rankAdsTargetsForProductLine(accounts, line.id, "facebook");
      const tiktok = rankAdsTargetsForProductLine(accounts, line.id, "tiktok");
      console.log(
        `[weekly-sync] ads: "${line.label}" — facebook ${facebook.length} ranked candidates, tiktok ${tiktok.length} ranked candidates (walking up to 5 with ads)`
      );
    }
    return;
  }

  // maxItemsPerTarget intentionally left at its default (30, the same as
  // the manual sync button) rather than capped down for cost — Facebook is
  // the cheapest actor by far ($0.30/1,000), so there's no real cost
  // reason to shrink it, and doing so previously caused a real bug: any
  // account with more real active ads than the cap would have the excess
  // wrongly marked inactive by the old "wasn't seen this sync" pass (now
  // removed anyway — see recordAdSighting's comment). Cost is controlled
  // by how many ACCOUNTS get walked (targetsWithAdsGoal /
  // WEEKLY_SYNC_MAX_ADS_ACCOUNTS_TOTAL), not by shrinking each one's
  // result set.
  const { facebook, tiktok } = await syncRankedAdsForProductLines(accounts, {
    targetsWithAdsGoal: 5,
  });

  const facebookAdsSeen = facebook.reduce((sum, r) => sum + r.adsSeen, 0);
  const facebookErrors = facebook.flatMap((r) => r.errors);
  console.log(`[weekly-sync] ads: facebook done — ${facebookAdsSeen} ads seen, ${facebookErrors.length} errors`);
  if (facebookErrors.length) console.log(facebookErrors.slice(0, 20).join("\n"));

  const tiktokAdsSeen = tiktok.reduce((sum, r) => sum + r.adsSeen, 0);
  const tiktokErrors = tiktok.flatMap((r) => r.errors);
  console.log(`[weekly-sync] ads: tiktok done — ${tiktokAdsSeen} ads seen, ${tiktokErrors.length} errors`);
  if (tiktokErrors.length) console.log(tiktokErrors.slice(0, 20).join("\n"));
}

function toContentSyncTarget(account: CompetitorAccount): ContentSyncTarget {
  return {
    accountId: account.id,
    name: account.name,
    instagramHandle: account.instagramHandle,
    tiktokHandle: account.tiktokHandle,
    productLineId: account.productLineIds[0] ?? null,
    candidateProductLineIds: account.productLineIds,
  };
}

// Flat top 5 accounts per channel, no brand/creator split — a deliberate
// cost decision (confirmed): Weekly Creators may end up sparse/empty as a
// known, accepted tradeoff rather than doubling Apify spend with a
// brand+creator split like the ads side doesn't need (ads walk by product
// line, not a flat top-N).
async function syncContent(dryRun: boolean) {
  const accounts = await listCompetitors({});
  const instagramTargets = rankContentTargets(accounts, "instagram", 5).map(toContentSyncTarget);
  const tiktokTargets = rankContentTargets(accounts, "tiktok", 5).map(toContentSyncTarget);
  console.log(
    `[weekly-sync] content: instagram ${instagramTargets.length} accounts, tiktok ${tiktokTargets.length} accounts (flat top 5 per channel, no brand/creator split)`
  );
  if (dryRun) return;

  const igResults = await syncInstagramContent(instagramTargets);
  const igContentSeen = igResults.reduce((sum, r) => sum + r.contentSeen, 0);
  const igErrors = igResults.flatMap((r) => r.errors);
  console.log(`[weekly-sync] content: instagram done — ${igContentSeen} posts seen, ${igErrors.length} errors`);
  if (igErrors.length) console.log(igErrors.slice(0, 20).join("\n"));

  const ttResult = await syncTikTokContent(tiktokTargets);
  console.log(`[weekly-sync] content: tiktok done — ${ttResult.contentSeen} posts seen, ${ttResult.errors.length} errors`);
  if (ttResult.errors.length) console.log(ttResult.errors.slice(0, 20).join("\n"));
}

// Top 10 videos per TikTok content-tag category, US / 7-day window — a
// deliberately modest default (single country, single period) rather than
// the full 5-country x 6-category matrix; easy to widen later by looping
// TIKTOK_TREND_VIDEO_COUNTRIES too.
async function syncTrending(dryRun: boolean) {
  const categories = applyLimit(
    [...TIKTOK_TREND_INDUSTRIES],
    envLimit("WEEKLY_SYNC_MAX_TRENDING_CATEGORIES"),
    "WEEKLY_SYNC_MAX_TRENDING_CATEGORIES"
  );
  console.log(`[weekly-sync] trending: ${categories.length} categories, US, 7-day, top 10`);
  if (dryRun) return;
  for (const industry of categories) {
    try {
      const result = await syncTrendingVideos({
        industry: industry.id,
        country: "US",
        period: "7",
        organicOnly: false,
        maxItems: 10,
      });
      console.log(
        `[weekly-sync] trending "${industry.label}": ${result.videosSeen} videos, ${result.errors.length} errors`
      );
      if (result.errors.length) console.log(result.errors.slice(0, 5).join("\n"));
    } catch (err) {
      console.error(`[weekly-sync] trending "${industry.label}" failed:`, err);
    }
  }
}

async function syncHashtags(dryRun: boolean, bucketOverride: number | undefined) {
  const allHashtags = uniqueHashtags();
  const todaysSlice = todaysHashtagSlice(allHashtags, bucketOverride);
  console.log(
    `[weekly-sync] hashtags: ${allHashtags.length} unique tags total across ${Object.keys(HASHTAG_CATEGORIES).length} categories — today's slice: ${todaysSlice.length}`
  );
  const hashtags = applyLimit(todaysSlice, envLimit("WEEKLY_SYNC_MAX_HASHTAGS"), "WEEKLY_SYNC_MAX_HASHTAGS");
  if (dryRun) return;
  for (const hashtag of hashtags) {
    try {
      const result = await syncHashtagVideos({ hashtag, maxItems: 20 });
      console.log(`[weekly-sync] hashtag #${hashtag}: ${result.videosSeen} videos, ${result.errors.length} errors`);
      if (result.errors.length) console.log(result.errors.slice(0, 5).join("\n"));
    } catch (err) {
      console.error(`[weekly-sync] hashtag #${hashtag} failed:`, err);
    }
  }
}

// Each phase is independent (ads/content/trending/hashtags hit entirely
// different tables and Apify actors) — one phase throwing (a DB blip, an
// actor quota, anything unexpected the phase's own internal handling
// didn't already catch) used to abort every phase after it too. Isolating
// them here means a bad day for one data source still lets the rest of
// the run finish.
async function runPhase(name: string, phase: () => Promise<void>): Promise<void> {
  try {
    await phase();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[weekly-sync] phase "${name}" failed:`, err);
    await recordSystemNotice("daily-sync", `"${name}" phase failed: ${message}`).catch((noticeErr) =>
      console.error("[weekly-sync] failed to record system notice:", noticeErr)
    );
  }
}

// TikTok signs cover-image/avatar URLs with a short-lived x-expires token
// (see tiktok-cdn-url.ts) — once that passes the CDN 403s it permanently,
// so an old row just sits there rendering a broken thumbnail forever
// (nothing re-scrapes a sighting that already exists). Purging both tables
// every run keeps Search by Hashtag / Weekly Trending Content showing only
// videos with a real preview, instead of accumulating dead ones.
async function syncCleanup(dryRun: boolean) {
  if (dryRun) {
    console.log("[weekly-sync] cleanup: dry run — skipping (would delete expired hashtag/trending rows)");
    return;
  }
  const hashtagDeleted = await deleteExpiredHashtagVideos();
  console.log(`[weekly-sync] cleanup: deleted ${hashtagDeleted} expired hashtag video(s)`);
  const trendingDeleted = await deleteExpiredTrendingVideos();
  console.log(`[weekly-sync] cleanup: deleted ${trendingDeleted} expired trending video(s)`);
}

export async function runWeeklySync(opts: WeeklySyncOptions = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const startedAt = Date.now();
  console.log(`[weekly-sync] starting${dryRun ? " (dry run)" : ""} at ${new Date().toISOString()}`);

  await runPhase("ads", () => syncAds(dryRun));
  await runPhase("content", () => syncContent(dryRun));
  await runPhase("trending", () => syncTrending(dryRun));
  await runPhase("hashtags", () => syncHashtags(dryRun, opts.bucketOverride));
  await runPhase("cleanup", () => syncCleanup(dryRun));

  console.log(`[weekly-sync] finished in ${Math.round((Date.now() - startedAt) / 1000)}s`);
}
