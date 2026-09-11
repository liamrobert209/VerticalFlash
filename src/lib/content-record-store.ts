import { promises as fs } from "fs";
import { getDb } from "./db";
import { findDownloadFile } from "./download-files";
import { readProjectMeta } from "./project-meta";
import { analysisPath } from "./paths";
import { readProjectProductLine } from "./project-product-line";
import { getCompetitorByHandle } from "./competitor-store";
import { AdhocBriefZ, adhocBriefPath } from "./adhoc-brief-schema";
import {
  ContentRecordZ,
  ContentHistoryQueryZ,
  type ContentRecord,
  type ContentType,
  type ContentSource,
  type ReferenceOrigin,
  type ContentHistoryQuery,
} from "./content-record-schema";

// Optional context a caller already has in hand (e.g. the ad-hoc/iterate
// tool's brief, or the active platform) — recordContentFromRender() will
// still work without any of this, filling in what it can find on disk.
export interface ContentRecordHints {
  platformId?: string | null;
  referenceOrigin?: ReferenceOrigin | null;
  originalAngle?: string | null;
  newAngle?: string | null;
  angleSource?: string | null;
}

function parseRecord(row: unknown): ContentRecord {
  return ContentRecordZ.parse(row);
}

async function readJsonSafe<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

interface ExtendedMetaLike {
  authorHandle?: string;
  playCount?: number;
  likeCount?: number;
  commentCount?: number;
  authorFollowerCount?: number;
}

interface AnalysisLike {
  format?: string;
  hook_description?: string;
}

async function readAdhocBrief(videoId: string): Promise<{
  originalAngle: string | null;
  newAngle: string | null;
  angleSource: string | null;
  referenceOrigin: ReferenceOrigin | null;
  platformId: string | null;
} | null> {
  // Written by the iterate-on-content tool; absent for every other content
  // type, so this is a soft, best-effort read.
  try {
    const raw = await fs.readFile(adhocBriefPath(videoId), "utf8");
    const brief = AdhocBriefZ.parse(JSON.parse(raw));
    return {
      originalAngle: brief.originalAngle,
      newAngle: brief.newAngle,
      angleSource: brief.angleSource,
      referenceOrigin: brief.referenceOrigin,
      platformId: brief.platformId,
    };
  } catch {
    return null;
  }
}

function inferContentTypeAndSource(
  projectKind: string | undefined,
  hasAdhocBrief: boolean
): { contentType: ContentType; source: ContentSource } {
  if (hasAdhocBrief) return { contentType: "adhoc", source: "uploaded_footage" };
  if (projectKind === "music") return { contentType: "music", source: "brief" };
  if (projectKind === "prompt") return { contentType: "prompt", source: "brief" };
  if (projectKind === "master" || projectKind === "cutdown") {
    return { contentType: "master_cutdown", source: "brief" };
  }
  // No project sidecar at all -> an ordinary downloaded TikTok video being remade
  return { contentType: "remake", source: "tiktok_scan" };
}

// Best-effort assembler: reads whatever's on disk for this video (metadata,
// analysis, project kind, product-line pin, ad-hoc brief) and upserts one
// content_records row. Never throws — a failure here must never fail the
// render it's attached to, same contract as recordPublish().
export async function recordContentFromRender(
  videoId: string,
  hints: ContentRecordHints = {}
): Promise<void> {
  try {
    const file = await findDownloadFile(videoId);
    const [meta, adhoc, productLineId] = await Promise.all([
      file ? readProjectMeta(file.path) : Promise.resolve(null),
      readAdhocBrief(videoId),
      readProjectProductLine(videoId),
    ]);
    const extendedMeta = file
      ? await readJsonSafe<ExtendedMetaLike>(`${file.path}.metadata.json`)
      : null;
    const analysis = await readJsonSafe<AnalysisLike>(analysisPath(videoId));

    const { contentType, source } = inferContentTypeAndSource(meta?.kind, adhoc !== null);

    let referenceAccountPositioning: string | null = null;
    if (extendedMeta?.authorHandle) {
      const competitor = await getCompetitorByHandle(extendedMeta.authorHandle);
      referenceAccountPositioning = competitor?.positioning ?? null;
    }

    const sql = getDb();
    const now = new Date().toISOString();
    await sql`
      insert into content_records (
        video_id, product_line_id, platform_id, content_type, source,
        reference_origin, format, hook, original_angle, new_angle, angle_source,
        reference_video_id, reference_account_handle, reference_account_follower_count,
        reference_content_like_count, reference_content_comment_count,
        reference_account_positioning, first_rendered_at, last_rendered_at, render_count
      ) values (
        ${videoId}, ${productLineId}, ${hints.platformId ?? adhoc?.platformId ?? null}, ${contentType}, ${source},
        ${hints.referenceOrigin ?? adhoc?.referenceOrigin ?? null},
        ${analysis?.format ?? null}, ${analysis?.hook_description ?? null},
        ${hints.originalAngle ?? adhoc?.originalAngle ?? null},
        ${hints.newAngle ?? adhoc?.newAngle ?? null},
        ${hints.angleSource ?? adhoc?.angleSource ?? null},
        ${source === "tiktok_scan" || source === "tiktok_url" ? videoId : null},
        ${extendedMeta?.authorHandle ?? null},
        ${extendedMeta?.authorFollowerCount ?? null},
        ${extendedMeta?.likeCount ?? null},
        ${extendedMeta?.commentCount ?? null},
        ${referenceAccountPositioning},
        ${now}, ${now}, 1
      )
      on conflict (video_id) do update set
        product_line_id = excluded.product_line_id,
        platform_id = coalesce(excluded.platform_id, content_records.platform_id),
        content_type = excluded.content_type,
        source = excluded.source,
        reference_origin = coalesce(excluded.reference_origin, content_records.reference_origin),
        format = excluded.format,
        hook = excluded.hook,
        original_angle = coalesce(excluded.original_angle, content_records.original_angle),
        new_angle = coalesce(excluded.new_angle, content_records.new_angle),
        angle_source = coalesce(excluded.angle_source, content_records.angle_source),
        reference_account_handle = coalesce(excluded.reference_account_handle, content_records.reference_account_handle),
        reference_account_follower_count = coalesce(excluded.reference_account_follower_count, content_records.reference_account_follower_count),
        reference_content_like_count = coalesce(excluded.reference_content_like_count, content_records.reference_content_like_count),
        reference_content_comment_count = coalesce(excluded.reference_content_comment_count, content_records.reference_content_comment_count),
        reference_account_positioning = coalesce(excluded.reference_account_positioning, content_records.reference_account_positioning),
        last_rendered_at = excluded.last_rendered_at,
        render_count = content_records.render_count + 1
    `;
  } catch (error) {
    console.error(`Failed to record content for ${videoId} (render unaffected):`, error);
  }
}

export async function listContentRecords(
  query: ContentHistoryQuery
): Promise<{ records: ContentRecord[]; total: number }> {
  const sql = getDb();
  const parsed = ContentHistoryQueryZ.parse(query);

  const rows = await sql`
    select *, count(*) over() as total_count
    from content_records
    where 1=1
    ${parsed.productLineId ? sql`and product_line_id = ${parsed.productLineId}` : sql``}
    ${parsed.platformId ? sql`and platform_id = ${parsed.platformId}` : sql``}
    ${parsed.from ? sql`and last_rendered_at >= ${parsed.from}` : sql``}
    ${parsed.to ? sql`and last_rendered_at <= ${parsed.to}` : sql``}
    ${
      parsed.hook
        ? sql`and (hook ilike ${"%" + parsed.hook + "%"} or original_angle ilike ${"%" + parsed.hook + "%"} or new_angle ilike ${"%" + parsed.hook + "%"})`
        : sql``
    }
    order by last_rendered_at desc, video_id asc
    limit ${parsed.limit}
    offset ${parsed.cursor}
  `;

  const total = rows[0] ? Number(rows[0].totalCount) : 0;
  return {
    records: rows.map((r) => parseRecord({ ...r, totalCount: undefined })),
    total,
  };
}
