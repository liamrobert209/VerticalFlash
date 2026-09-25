/**
 * One-time backfill: classifies every already-analyzed ad's icpAngle field
 * (added after those ads were analyzed — see ad-analysis-schema.ts). New
 * ads get this automatically going forward via weekly-ads-sync.ts's
 * analyzeIfNeeded; this just catches up the ones that predate it.
 *
 * Usage: node --import tsx --env-file=.env.local scripts/backfill-icp-angles.ts
 */
import { getDb } from "../src/lib/db";
import { getGeminiClient } from "../src/lib/gemini";
import { classifyIcpAngle } from "../src/lib/ad-analyze";
import { saveAdAnalysis } from "../src/lib/ads-store";
import { resolveIcp } from "../src/lib/product-lines";
import { getProductLinesConfig } from "../src/lib/config";
import { AdAnalysisZ } from "../src/lib/ad-analysis-schema";

async function main() {
  const sql = getDb();
  const rows = await sql`
    select id, product_line_id, analysis
    from ads
    where analyzed_at is not null
      and product_line_id is not null
      and (analysis->'icpAngle') is null
  `;
  console.log(`${rows.length} ads to classify`);

  const ai = getGeminiClient();
  const cfg = getProductLinesConfig();
  const icpCache = new Map<string, Awaited<ReturnType<typeof resolveIcp>>>();

  let classified = 0;
  let skippedNoIcp = 0;
  let noMatch = 0;

  for (const row of rows) {
    const productLineId = row.productLineId as string;
    if (!icpCache.has(productLineId)) {
      icpCache.set(productLineId, await resolveIcp(cfg, productLineId));
    }
    const icp = icpCache.get(productLineId);
    if (!icp) {
      skippedNoIcp++;
      continue;
    }

    try {
      const analysis = AdAnalysisZ.parse(row.analysis);
      const match = await classifyIcpAngle(ai, analysis, icp);
      if (!match) noMatch++;
      else classified++;

      await saveAdAnalysis(row.id as string, { ...analysis, icpAngle: match });
    } catch (err) {
      console.error(`Failed on ad ${row.id}:`, err instanceof Error ? err.message : err);
    }

    if ((classified + noMatch) % 25 === 0) {
      console.log(`...${classified + noMatch}/${rows.length} processed`);
    }
  }

  console.log(`Done. Classified: ${classified}, no genuine match: ${noMatch}, no ICP profile for their product line: ${skippedNoIcp}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
