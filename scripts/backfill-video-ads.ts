/**
 * Best-effort (NOT expected to fully succeed) backfill: analyzes up to
 * LIMIT already-synced competitor VIDEO ads that predate video-ad analysis
 * support (see weekly-ads-sync.ts's analyzeIfNeeded/analyzeVideoAd). Most
 * of these ads' stored creative_url is a signed CDN link (Facebook/TikTok)
 * that expires a few hours after the sync that captured it — most attempts
 * here are expected to fail on a dead link. That's accepted, not a bug: the
 * real fix is going forward (new video ads get analyzed at sync time, while
 * the URL is still fresh); this just opportunistically recovers whichever
 * handful of the backlog happen to still be reachable (ordered by
 * last_seen_at desc to favor the freshest URLs). Ads that fail simply stay
 * unanalyzed, same as before.
 *
 * Doesn't re-run product-line disambiguation (candidates undefined) — these
 * ads already have a product_line_id from the account-level default; this
 * only aims to get them analyzed/ICP-classified, not re-bucketed.
 *
 * Usage: node --import tsx --env-file=.env.local scripts/backfill-video-ads.ts [limit]
 */
import { getDb } from "../src/lib/db";
import { getGeminiClient } from "../src/lib/gemini";
import { analyzeVideoAd, classifyIcpAngle } from "../src/lib/ad-analyze";
import { saveAdAnalysis } from "../src/lib/ads-store";
import { resolveIcp } from "../src/lib/product-lines";
import { getProductLinesConfig } from "../src/lib/config";

const DEFAULT_LIMIT = 30;

async function main() {
  const limit = Number(process.argv[2]) || DEFAULT_LIMIT;
  const sql = getDb();

  const rows = await sql`
    select id, external_ad_id, platform_id, product_line_id, creative_url, headline, body_text
    from ads
    where analyzed_at is null
      and product_line_id is not null
      and is_static_eligible = false
      and creative_url is not null
      and (
        platform_id != 'tiktok'
        or (raw->>'videoUrl' is not null and raw->>'videoUrl' != '')
      )
    order by last_seen_at desc
    limit ${limit}
  `;
  console.log(`${rows.length} candidate video ads (most-recently-seen first, to favor still-live URLs)`);

  const ai = getGeminiClient();
  const cfg = getProductLinesConfig();
  const icpCache = new Map<string, Awaited<ReturnType<typeof resolveIcp>>>();

  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    const productLineId = row.productLineId as string;
    try {
      const analysis = await analyzeVideoAd(ai, row.creativeUrl as string, {
        headline: row.headline as string | null,
        bodyText: row.bodyText as string | null,
      });

      if (!icpCache.has(productLineId)) {
        icpCache.set(productLineId, await resolveIcp(cfg, productLineId));
      }
      const icp = icpCache.get(productLineId);
      if (icp) analysis.icpAngle = await classifyIcpAngle(ai, analysis, icp);

      await saveAdAnalysis(row.id as string, analysis);
      succeeded++;
      console.log(`OK   ${row.platformId}/${row.externalAdId}`);
    } catch (err) {
      failed++;
      console.log(`FAIL ${row.platformId}/${row.externalAdId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\nDone. ${succeeded} succeeded, ${failed} failed (mostly expected: expired video CDN links).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
