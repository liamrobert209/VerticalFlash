import { getDb } from "./db";
import {
  ScrapedContentZ,
  ScrapedContentQueryZ,
  type ScrapedContent,
  type ScrapedContentSighting,
  type ScrapedContentQuery,
} from "./scraped-content-schema";

// postgres.js does not auto-decode jsonb columns into objects — see the
// identical note in ads-store.ts's parseAd().
function parseContent(row: Record<string, unknown>): ScrapedContent {
  const raw = typeof row.raw === "string" ? JSON.parse(row.raw) : row.raw;
  return ScrapedContentZ.parse({ ...row, raw });
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
      posted_at, caption, media_url, thumbnail_url,
      view_count, like_count, comment_count, share_count, tags, raw
    ) values (
      ${sighting.accountId ?? null}, ${sighting.platformId}, ${sighting.productLineId ?? null},
      ${sighting.externalContentId}, ${sighting.postedAt ?? null}, ${sighting.caption ?? null},
      ${sighting.mediaUrl ?? null}, ${sighting.thumbnailUrl ?? null},
      ${sighting.viewCount ?? null}, ${sighting.likeCount ?? null},
      ${sighting.commentCount ?? null}, ${sighting.shareCount ?? null},
      ${sighting.tags}, ${sighting.raw ? JSON.stringify(sighting.raw) : null}::jsonb
    )
    on conflict (platform_id, external_content_id) do update set
      account_id = coalesce(excluded.account_id, scraped_content.account_id),
      product_line_id = coalesce(excluded.product_line_id, scraped_content.product_line_id),
      posted_at = coalesce(scraped_content.posted_at, excluded.posted_at),
      caption = coalesce(excluded.caption, scraped_content.caption),
      media_url = coalesce(excluded.media_url, scraped_content.media_url),
      thumbnail_url = coalesce(excluded.thumbnail_url, scraped_content.thumbnail_url),
      view_count = coalesce(excluded.view_count, scraped_content.view_count),
      like_count = coalesce(excluded.like_count, scraped_content.like_count),
      comment_count = coalesce(excluded.comment_count, scraped_content.comment_count),
      share_count = coalesce(excluded.share_count, scraped_content.share_count),
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

export async function getScrapedContent(id: string): Promise<ScrapedContent | null> {
  const sql = getDb();
  const rows = await sql`select * from scraped_content where id = ${id}`;
  return rows[0] ? parseContent(rows[0]) : null;
}
