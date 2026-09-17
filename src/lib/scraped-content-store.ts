import type postgres from "postgres";
import { getDb } from "./db";
import {
  ScrapedContentZ,
  ScrapedContentWithAccountZ,
  ScrapedContentQueryZ,
  type ScrapedContent,
  type ScrapedContentWithAccount,
  type ScrapedContentSighting,
  type ScrapedContentQuery,
} from "./scraped-content-schema";
import type { ContentAnalysis } from "./content-analysis-schema";

// postgres.js does not auto-decode jsonb columns into objects — see the
// identical note in ads-store.ts's parseAd().
function parseContent(row: Record<string, unknown>): ScrapedContent {
  const raw = typeof row.raw === "string" ? JSON.parse(row.raw) : row.raw;
  const analysis =
    typeof row.analysis === "string" ? JSON.parse(row.analysis) : row.analysis;
  return ScrapedContentZ.parse({ ...row, raw, analysis });
}

function parseContentWithAccount(row: Record<string, unknown>): ScrapedContentWithAccount {
  const raw = typeof row.raw === "string" ? JSON.parse(row.raw) : row.raw;
  const analysis =
    typeof row.analysis === "string" ? JSON.parse(row.analysis) : row.analysis;
  return ScrapedContentWithAccountZ.parse({ ...row, raw, analysis });
}

// Upsert one observed post: engagement counts (views/likes/comments/shares)
// are a snapshot as of this sync and always overwritten on a later
// sighting — unlike ads.ts's launch_date, a post's metrics are meant to
// drift over time, not be frozen at first sight.
export async function recordContentSighting(
  sighting: ScrapedContentSighting
): Promise<ScrapedContent> {
  const sql = getDb();
  const rows = await sql`
    insert into scraped_content (
      account_id, platform_id, product_line_id, external_content_id,
      posted_at, caption, media_url, thumbnail_url, thumbnail_local_file,
      view_count, like_count, comment_count, share_count, format, tags, raw
    ) values (
      ${sighting.accountId ?? null}, ${sighting.platformId}, ${sighting.productLineId ?? null},
      ${sighting.externalContentId}, ${sighting.postedAt ?? null}, ${sighting.caption ?? null},
      ${sighting.mediaUrl ?? null}, ${sighting.thumbnailUrl ?? null}, ${sighting.thumbnailLocalFile ?? null},
      ${sighting.viewCount ?? null}, ${sighting.likeCount ?? null},
      ${sighting.commentCount ?? null}, ${sighting.shareCount ?? null}, ${sighting.format ?? null},
      ${sighting.tags}, ${sighting.raw ? sql.json(sighting.raw as postgres.JSONValue) : null}
    )
    on conflict (platform_id, external_content_id) do update set
      account_id = coalesce(excluded.account_id, scraped_content.account_id),
      product_line_id = coalesce(excluded.product_line_id, scraped_content.product_line_id),
      posted_at = coalesce(scraped_content.posted_at, excluded.posted_at),
      caption = coalesce(excluded.caption, scraped_content.caption),
      media_url = coalesce(excluded.media_url, scraped_content.media_url),
      thumbnail_url = coalesce(excluded.thumbnail_url, scraped_content.thumbnail_url),
      thumbnail_local_file = coalesce(excluded.thumbnail_local_file, scraped_content.thumbnail_local_file),
      view_count = coalesce(excluded.view_count, scraped_content.view_count),
      like_count = coalesce(excluded.like_count, scraped_content.like_count),
      comment_count = coalesce(excluded.comment_count, scraped_content.comment_count),
      share_count = coalesce(excluded.share_count, scraped_content.share_count),
      -- Recomputed every sighting, not sticky — same reasoning as
      -- ads.is_static_eligible (a re-scraped post's media type is a pure
      -- function of the raw payload, not state to preserve).
      format = excluded.format,
      tags = case when array_length(excluded.tags, 1) > 0 then excluded.tags else scraped_content.tags end,
      raw = coalesce(excluded.raw, scraped_content.raw),
      last_seen_at = now(),
      updated_at = now()
    returning *
  `;
  return parseContent(rows[0]);
}

export async function listScrapedContent(
  query: ScrapedContentQuery
): Promise<ScrapedContent[]> {
  const sql = getDb();
  const parsed = ScrapedContentQueryZ.parse(query);
  const rows = await sql`
    select sc.* from scraped_content sc
    ${
      parsed.accountType
        ? sql`join competitor_accounts a on a.id = sc.account_id and a.account_type = ${parsed.accountType}`
        : sql``
    }
    where 1=1
    ${parsed.platformId ? sql`and sc.platform_id = ${parsed.platformId}` : sql``}
    ${parsed.productLineId ? sql`and sc.product_line_id = ${parsed.productLineId}` : sql``}
    ${
      parsed.sort === "newest"
        ? sql`order by sc.posted_at desc nulls last`
        : sql`order by coalesce(sc.view_count, 0) desc`
    }
    limit ${parsed.limit}
  `;
  return rows.map(parseContent);
}

// Same reasoning as ads-store.ts's listActiveAdsGroupedByProductLine: one
// windowed query across every product line instead of a separate query per
// product line, which is what the Weekly Content/Creators digests actually
// need (N parallel per-product queries very quickly saturates a pooled
// connection limit as product lines grow).
export async function listScrapedContentGroupedByProductLine(
  accountType: "brand" | "creator",
  sort: "newest" | "top_performing",
  limitPerGroup: number
): Promise<Map<string, ScrapedContentWithAccount[]>> {
  const sql = getDb();
  const rows = await sql`
    select * from (
      select sc.*, a.name as account_name, row_number() over (
        partition by sc.product_line_id
        order by ${sort === "newest" ? sql`sc.posted_at desc nulls last` : sql`coalesce(sc.view_count, 0) desc`}
      ) as rn
      from scraped_content sc
      join competitor_accounts a on a.id = sc.account_id and a.account_type = ${accountType}
      where sc.product_line_id is not null
    ) ranked
    where rn <= ${limitPerGroup}
  `;
  const byProductLine = new Map<string, ScrapedContentWithAccount[]>();
  for (const row of rows) {
    const item = parseContentWithAccount(row);
    const list = byProductLine.get(row.productLineId) ?? [];
    list.push(item);
    byProductLine.set(row.productLineId, list);
  }
  return byProductLine;
}

export interface AccountContentInsights {
  accountId: string;
  accountName: string;
  postCount: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  avgViews: number;
  topPost: ScrapedContent | null;
}

// Per-account breakdown for one platform — Content/Creator Insights show
// this rather than a single platform-wide aggregate, since "how is this
// specific competitor/creator doing" is the actual question (per the
// product spec: "Content Insights should pull data from each social media
// account specifically").
export async function listContentInsightsByAccount(
  platformId: string,
  accountType: "brand" | "creator",
  limitAccounts: number
): Promise<AccountContentInsights[]> {
  const sql = getDb();
  const stats = await sql`
    select
      a.id as account_id,
      a.name as account_name,
      count(sc.id) as post_count,
      sum(coalesce(sc.view_count, 0)) as total_views,
      sum(coalesce(sc.like_count, 0)) as total_likes,
      sum(coalesce(sc.comment_count, 0)) as total_comments,
      avg(coalesce(sc.view_count, 0)) as avg_views
    from competitor_accounts a
    join scraped_content sc on sc.account_id = a.id
    where a.account_type = ${accountType} and sc.platform_id = ${platformId}
    group by a.id, a.name
    order by total_views desc
    limit ${limitAccounts}
  `;

  if (stats.length === 0) return [];

  // One extra query for each account's top post rather than a per-row
  // correlated subquery — simpler to read, and limitAccounts keeps this
  // small (this runs against a handful of saved accounts, not hundreds).
  const results: AccountContentInsights[] = [];
  for (const row of stats) {
    const [topPostRow] = await sql`
      select * from scraped_content
      where account_id = ${row.accountId} and platform_id = ${platformId}
      order by coalesce(view_count, 0) desc
      limit 1
    `;
    results.push({
      accountId: row.accountId,
      accountName: row.accountName,
      postCount: Number(row.postCount),
      totalViews: Number(row.totalViews),
      totalLikes: Number(row.totalLikes),
      totalComments: Number(row.totalComments),
      avgViews: Number(row.avgViews),
      topPost: topPostRow ? parseContent(topPostRow) : null,
    });
  }
  return results;
}

export async function getScrapedContent(id: string): Promise<ScrapedContent | null> {
  const sql = getDb();
  const rows = await sql`select * from scraped_content where id = ${id}`;
  return rows[0] ? parseContent(rows[0]) : null;
}

// Dedup + normalize a set of content tags: trim, lowercase, sort. Pure —
// identical body to mergeAdTags (ads-store.ts), duplicated rather than
// imported so the ads/content pairs stay independent of each other. Used
// to merge Gemini's per-analysis tags into the tags already stored on a
// post (which start empty at sync time; see recordContentSighting's
// `tags: []` sighting default) without ever losing or duplicating a tag
// across repeated analyses/re-syncs.
export function mergeContentTags(existing: string[], incoming: string[]): string[] {
  const merged = new Set<string>();
  for (const tag of [...existing, ...incoming]) {
    const normalized = tag.trim().toLowerCase();
    if (normalized) merged.add(normalized);
  }
  return Array.from(merged).sort();
}

// `productLineId`, when provided, is the already-resolved value (default or
// Gemini's pick — see resolveProductLineId in weekly-ads-sync.ts) to write
// directly; omitted entirely (not just `null`) means "leave whatever's
// already stored alone" (e.g. no product-line disambiguation ran). Mirrors
// saveAdAnalysis (ads-store.ts) exactly.
export async function saveContentAnalysis(
  contentId: string,
  analysis: ContentAnalysis,
  productLineId?: string | null
): Promise<ScrapedContent> {
  const sql = getDb();
  const existing = await sql`select tags from scraped_content where id = ${contentId}`;
  if (!existing[0]) throw new Error(`Scraped content not found: ${contentId}`);
  const mergedTags = mergeContentTags(existing[0].tags ?? [], analysis.tags);
  const rows = await sql`
    update scraped_content set
      analysis = ${sql.json(analysis as unknown as postgres.JSONValue)},
      analyzed_at = now(),
      tags = ${mergedTags},
      ${productLineId !== undefined ? sql`product_line_id = ${productLineId},` : sql``}
      updated_at = now()
    where id = ${contentId}
    returning *
  `;
  return parseContent(rows[0]);
}

// Scraped posts that haven't been analyzed yet — the sync loop's per-post
// analysis call skips anything already analyzed, and this covers retrying
// posts whose analysis failed on a prior sync. Unlike
// listUnanalyzedStaticAds, there's no eligibility gate: every scraped post
// (image or video) has an analyzable thumbnail, so the only filter is
// `analyzed_at is null`. `accountIds`, when given, scopes the retry to the
// accounts actually included in the current sync batch (same scoping
// philosophy as markStaleAdsInactive) rather than retrying every
// unanalyzed post on the platform.
export async function listUnanalyzedContent(
  limit: number,
  accountIds?: string[]
): Promise<ScrapedContent[]> {
  const sql = getDb();
  const rows = await sql`
    select * from scraped_content
    where analyzed_at is null
    ${accountIds && accountIds.length ? sql`and account_id = any(${accountIds})` : sql``}
    order by first_seen_at desc
    limit ${limit}
  `;
  return rows.map(parseContent);
}
