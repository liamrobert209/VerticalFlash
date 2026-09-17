import type postgres from "postgres";
import { getDb } from "./db";
import {
  AdZ,
  AdWithAccountZ,
  AdQueryZ,
  type Ad,
  type AdWithAccount,
  type AdSighting,
  type AdQuery,
} from "./ads-schema";
import type { AdAnalysis } from "./ad-analysis-schema";

// postgres.js does not auto-decode jsonb columns into objects (unlike some
// other Postgres clients) — it hands back the raw JSON text, so `raw`/
// `analysis` need an explicit parse before they reach AdZ's checks.
function parseAd(row: Record<string, unknown>): Ad {
  const raw = typeof row.raw === "string" ? JSON.parse(row.raw) : row.raw;
  const analysis =
    typeof row.analysis === "string" ? JSON.parse(row.analysis) : row.analysis;
  return AdZ.parse({ ...row, raw, analysis });
}

function parseAdWithAccount(row: Record<string, unknown>): AdWithAccount {
  const raw = typeof row.raw === "string" ? JSON.parse(row.raw) : row.raw;
  const analysis =
    typeof row.analysis === "string" ? JSON.parse(row.analysis) : row.analysis;
  return AdWithAccountZ.parse({ ...row, raw, analysis });
}

// Upsert one observed ad: first sighting inserts a fresh row (is_active,
// first_seen_at/last_seen_at all set now); every later sighting bumps
// last_seen_at, flips is_active back on (an ad can stop and restart
// between syncs), and refreshes the mutable creative fields — but
// launch_date/first_seen_at are never overwritten once set, since they're
// "when this ad actually started", not "when we last saw it".
export async function recordAdSighting(sighting: AdSighting): Promise<Ad> {
  const sql = getDb();
  const rows = await sql`
    insert into ads (
      account_id, platform_id, product_line_id, external_ad_id,
      headline, body_text, creative_url, landing_url, launch_date, tags, raw,
      is_static_eligible
    ) values (
      ${sighting.accountId ?? null}, ${sighting.platformId}, ${sighting.productLineId ?? null},
      ${sighting.externalAdId}, ${sighting.headline ?? null}, ${sighting.bodyText ?? null},
      ${sighting.creativeUrl ?? null}, ${sighting.landingUrl ?? null}, ${sighting.launchDate ?? null},
      ${sighting.tags}, ${sighting.raw ? sql.json(sighting.raw as postgres.JSONValue) : null},
      ${sighting.isStaticEligible ?? false}
    )
    on conflict (platform_id, external_ad_id) do update set
      account_id = coalesce(excluded.account_id, ads.account_id),
      product_line_id = coalesce(excluded.product_line_id, ads.product_line_id),
      headline = coalesce(excluded.headline, ads.headline),
      body_text = coalesce(excluded.body_text, ads.body_text),
      creative_url = coalesce(excluded.creative_url, ads.creative_url),
      landing_url = coalesce(excluded.landing_url, ads.landing_url),
      launch_date = coalesce(ads.launch_date, excluded.launch_date),
      tags = case when array_length(excluded.tags, 1) > 0 then excluded.tags else ads.tags end,
      raw = coalesce(excluded.raw, ads.raw),
      -- Pure function of raw, recomputed every sighting rather than kept
      -- sticky — a re-scraped ad's creative can change between syncs.
      is_static_eligible = excluded.is_static_eligible,
      last_seen_at = now(),
      is_active = true,
      updated_at = now()
    returning *
  `;
  return parseAd(rows[0]);
}

// Call once per platform after a sync batch completes: any ad belonging to
// one of the accounts actually included in this batch (`accountIds`) that
// wasn't seen this round has stopped running. Scoped to `accountIds` —
// NOT every ad on the platform — since a sync only ever re-checks the
// accounts the caller selected; an unrelated account's ads being absent
// from `seenExternalIds` means nothing (it wasn't looked at, not that it
// stopped running). A blanket platform-wide version of this previously
// caused every OTHER synced account's ads on the same platform to be
// wrongly marked inactive by an unrelated sync.
export async function markStaleAdsInactive(
  platformId: string,
  accountIds: (string | null)[],
  seenExternalIds: string[]
): Promise<number> {
  const sql = getDb();
  const ids = accountIds.filter((id): id is string => id != null);
  if (!ids.length) return 0;
  const result = await sql`
    update ads set is_active = false, updated_at = now()
    where platform_id = ${platformId}
      and account_id = any(${ids})
      and is_active = true
      and external_ad_id != all(${seenExternalIds})
  `;
  return result.count;
}

export async function listAds(query: AdQuery): Promise<Ad[]> {
  const sql = getDb();
  const parsed = AdQueryZ.parse(query);
  const rows = await sql`
    select * from ads
    where 1=1
    ${parsed.platformId ? sql`and platform_id = ${parsed.platformId}` : sql``}
    ${parsed.productLineId ? sql`and product_line_id = ${parsed.productLineId}` : sql``}
    ${parsed.isActive !== undefined ? sql`and is_active = ${parsed.isActive}` : sql``}
    ${parsed.isStaticEligible !== undefined ? sql`and is_static_eligible = ${parsed.isStaticEligible}` : sql``}
    ${
      parsed.sort === "newest"
        ? sql`order by coalesce(launch_date, first_seen_at) desc`
        : sql`order by (last_seen_at - coalesce(launch_date, first_seen_at)) desc`
    }
    limit ${parsed.limit}
  `;
  return rows.map(parseAd);
}

// One query covering every product line at once (row_number() window,
// capped per group) instead of a separate query per product line — the
// Weekly Ads digest was originally built as N parallel listAds() calls
// (2 per product line), which is exactly the kind of fan-out that blows
// through a pooled connection limit as soon as there are more than a
// handful of product lines. Grouped by productLineId in JS afterward since
// the caller wants per-product sections, not a flat list.
export async function listActiveAdsGroupedByProductLine(
  sort: "newest" | "longest_running",
  limitPerGroup: number
): Promise<Map<string, AdWithAccount[]>> {
  const sql = getDb();
  const rows = await sql`
    select * from (
      select a.*, c.name as account_name, row_number() over (
        partition by a.product_line_id
        order by ${sort === "newest" ? sql`coalesce(a.launch_date, a.first_seen_at) desc` : sql`(a.last_seen_at - coalesce(a.launch_date, a.first_seen_at)) desc`}
      ) as rn
      from ads a
      left join competitor_accounts c on c.id = a.account_id
      where a.is_active = true and a.product_line_id is not null
    ) ranked
    where rn <= ${limitPerGroup}
  `;
  const byProductLine = new Map<string, AdWithAccount[]>();
  for (const row of rows) {
    const ad = parseAdWithAccount(row);
    const list = byProductLine.get(row.productLineId) ?? [];
    list.push(ad);
    byProductLine.set(row.productLineId, list);
  }
  return byProductLine;
}

export interface CompetitorAdGroup {
  accountId: string | null;
  accountName: string | null;
  total: number;
  ads: AdWithAccount[];
}

// Newest static-eligible ads per (product line, competitor) — like
// listActiveAdsGroupedByProductLine but partitioned one level deeper, so
// Weekly Static Ads can render one row per competitor instead of mixing
// every competitor's ads into one flat per-product-line list. `total` is
// the competitor's full eligible count (via count(*) over(...)), not just
// how many are returned — same count(*) over() + windowed-limit pattern
// content-record-store.ts's listContentRecords already uses for its
// "N-M of Z" pagination.
export async function listEligibleStaticAdsGroupedByCompetitor(
  limitPerCompetitor: number
): Promise<Map<string, CompetitorAdGroup[]>> {
  const sql = getDb();
  const rows = await sql`
    select * from (
      select a.*, c.name as account_name,
        count(*) over (partition by a.product_line_id, a.account_id) as total_count,
        row_number() over (
          partition by a.product_line_id, a.account_id
          order by coalesce(a.launch_date, a.first_seen_at) desc
        ) as rn
      from ads a
      left join competitor_accounts c on c.id = a.account_id
      where a.is_active = true and a.is_static_eligible = true and a.product_line_id is not null
    ) ranked
    where rn <= ${limitPerCompetitor}
    order by total_count desc
  `;
  const byProductLine = new Map<string, CompetitorAdGroup[]>();
  const groupIndex = new Map<string, CompetitorAdGroup>();
  for (const row of rows) {
    const ad = parseAdWithAccount(row);
    const groupKey = `${row.productLineId}::${row.accountId ?? "unknown"}`;
    let group = groupIndex.get(groupKey);
    if (!group) {
      group = { accountId: row.accountId, accountName: row.accountName, total: Number(row.totalCount), ads: [] };
      groupIndex.set(groupKey, group);
      const list = byProductLine.get(row.productLineId) ?? [];
      list.push(group);
      byProductLine.set(row.productLineId, list);
    }
    group.ads.push(ad);
  }
  return byProductLine;
}

export async function getAd(id: string): Promise<Ad | null> {
  const sql = getDb();
  const rows = await sql`select * from ads where id = ${id}`;
  return rows[0] ? parseAd(rows[0]) : null;
}

export async function saveAdAnalysis(adId: string, analysis: AdAnalysis): Promise<Ad> {
  const sql = getDb();
  const rows = await sql`
    update ads set
      analysis = ${sql.json(analysis as unknown as postgres.JSONValue)},
      analyzed_at = now(),
      updated_at = now()
    where id = ${adId}
    returning *
  `;
  return parseAd(rows[0]);
}

// Eligible static ads that haven't been analyzed yet — the sync loop's
// per-ad analysis call skips anything already analyzed, and this covers
// retrying ads whose analysis failed on a prior sync.
export async function listUnanalyzedStaticAds(limit: number): Promise<Ad[]> {
  const sql = getDb();
  const rows = await sql`
    select * from ads
    where is_static_eligible = true and analyzed_at is null
    order by first_seen_at desc
    limit ${limit}
  `;
  return rows.map(parseAd);
}
