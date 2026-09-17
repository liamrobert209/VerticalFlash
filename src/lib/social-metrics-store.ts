import { getSocialMetricsDb } from "./social-metrics-db";
import {
  FacebookPostZ,
  InstagramPostZ,
  FacebookDailyMetricZ,
  InstagramDailyMetricZ,
  type FacebookPost,
  type InstagramPost,
  type FacebookDailyMetric,
  type InstagramDailyMetric,
} from "./social-metrics-schema";

// Read-only queries against the social-metrics database — single-account,
// no account_id column at all on any of these tables, so no join/scoping
// is needed (unlike scraped-content-store.ts's multi-competitor queries).

export async function listFacebookPosts(limit: number): Promise<FacebookPost[]> {
  const sql = getSocialMetricsDb();
  const rows = await sql`
    select created_time, created_time_full, content, post_media_views, post_total_media_views_unique,
      total_reactions, post_clicks, link_clicks, other_clicks, photo_views, video_plays
    from facebook_posts
    order by created_time desc
    limit ${limit}
  `;
  return rows.map((r) => FacebookPostZ.parse(r));
}

export async function listInstagramPosts(limit: number): Promise<InstagramPost[]> {
  const sql = getSocialMetricsDb();
  const rows = await sql`
    select creation_date, caption, media_product_type, media_type, permanent_link,
      likes, comments, saved, reach, total_interactions, shares
    from instagram_posts
    order by creation_date desc
    limit ${limit}
  `;
  return rows.map((r) => InstagramPostZ.parse(r));
}

export async function listFacebookDailyMetrics(sinceDate?: string): Promise<FacebookDailyMetric[]> {
  const sql = getSocialMetricsDb();
  const rows = await sql`
    select date, page_post_engagements, page_media_views, page_total_media_views_unique, page_follows
    from facebook_daily_insights
    where date >= ${sinceDate ?? "1970-01-01"}
    order by date asc
  `;
  return rows.map((r) => FacebookDailyMetricZ.parse(r));
}

export async function listInstagramDailyMetrics(sinceDate?: string): Promise<InstagramDailyMetric[]> {
  const sql = getSocialMetricsDb();
  const rows = await sql`
    select date, reach, follower_count
    from instagram_daily_insights
    where date >= ${sinceDate ?? "1970-01-01"}
    order by date asc
  `;
  return rows.map((r) => InstagramDailyMetricZ.parse(r));
}
