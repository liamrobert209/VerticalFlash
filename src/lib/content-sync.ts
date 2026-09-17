import { promises as fs } from "fs";
import { extname, join } from "path";
import type { GoogleGenAI } from "@google/genai";
import { runApifyActor } from "./apify-client";
import {
  recordContentSighting,
  saveContentAnalysis,
  listUnanalyzedContent,
} from "./scraped-content-store";
import type { ScrapedContent, ScrapedContentSighting } from "./scraped-content-schema";
import type { ContentFormat } from "./content-analysis-schema";
import { getGeminiClient } from "./gemini";
import { analyzeContent, type ProductLineCandidate } from "./content-analyze";
// Both actors' I/O shapes were confirmed against real Apify runs before
// writing this (not guessed from documentation) — see Step 0 of the plan.
// resolveProductLineId is already fully generic (id/label validation only,
// zero ad-specific logic) — reused as-is rather than duplicated.
import { resolveProductLineId } from "./weekly-ads-sync";
import { fetchImageBuffer } from "./fetch-image";
import { COMPETITOR_CONTENT_MEDIA_DIR } from "./paths";
import { getPublicProductLines } from "./config";

const INSTAGRAM_ACTOR_ID = "apify/instagram-profile-scraper";
const TIKTOK_ACTOR_ID = "clockworks/tiktok-scraper";

// Organic posts fetched per target per sync — tunable. Note: Instagram's
// `resultsLimit` does NOT reliably cap `latestPosts`' size (confirmed: it
// returned 12 posts even with resultsLimit:5 in testing), so the top-N-
// most-recent slicing happens client-side in processInstagramProfiles
// regardless of what the actor itself returns. TikTok's `resultsPerPage`
// DOES properly cap results per profile (confirmed: 2 profiles x
// resultsPerPage:5 -> exactly 10 items back).
export const CONTENT_ITEMS_PER_TARGET = 5;

export interface ContentSyncTarget {
  accountId: string;
  name: string;
  // The actual handles the actors need as input (not `name`, which is only
  // used for logging/error messages here).
  instagramHandle?: string | null;
  tiktokHandle?: string | null;
  productLineId?: string | null;
  // Every product line this account is linked to (not just the first one
  // used as `productLineId`'s default) — when there are 2+,
  // analyzeContentIfNeeded asks Gemini to disambiguate which one a given
  // post's thumbnail actually shows instead of defaulting to
  // productLineId unconditionally. Omitted (or a single id) means zero
  // extra Gemini cost, identical to before this existed.
  candidateProductLineIds?: string[];
}

export interface ContentSyncResult {
  platformId: string;
  contentSeen: number;
  errors: string[];
}

// --- Instagram (apify/instagram-profile-scraper) ------------------------

interface InstagramPostItem {
  id: string;
  type?: "Image" | "Video" | "Sidecar";
  caption?: string;
  url?: string;
  commentsCount?: number;
  displayUrl?: string;
  videoUrl?: string;
  likesCount?: number;
  videoViewCount?: number;
  timestamp?: string;
  ownerUsername?: string;
  [key: string]: unknown;
}

interface InstagramProfileItem {
  username?: string;
  latestPosts?: InstagramPostItem[];
  [key: string]: unknown;
}

// Deterministic, per Step 0's confirmed media-type field — no Gemini call
// needed since the source data already has the answer.
export function deriveInstagramFormat(type: InstagramPostItem["type"]): ContentFormat {
  if (type === "Video") return "video";
  if (type === "Sidecar") return "carousel";
  return "image";
}

// --- TikTok (clockworks/tiktok-scraper) ----------------------------------

interface TikTokContentItem {
  id: string;
  text?: string;
  createTimeISO?: string;
  webVideoUrl?: string;
  diggCount?: number;
  shareCount?: number;
  playCount?: number;
  commentCount?: number;
  isSlideshow?: boolean;
  videoMeta?: { coverUrl?: string; [key: string]: unknown };
  authorMeta?: { name?: string; [key: string]: unknown };
  [key: string]: unknown;
}

// TikTok posts are otherwise always video — isSlideshow is the only
// distinguishing media-type signal the actor exposes.
export function deriveTikTokFormat(isSlideshow: boolean): ContentFormat {
  return isSlideshow ? "carousel" : "video";
}

// --- Local thumbnail caching (best-effort) -------------------------------

const THUMBNAIL_MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

// Downloads a post's thumbnail once at sync time and caches it on the
// Railway volume (competitor-content-media/), keyed by a platform prefix +
// the post's own platform-independent external id — the remote CDN URL
// isn't reliable to keep re-fetching from later. Best-effort, identical
// try/catch shape to cacheCreativeImageLocally (weekly-ads-sync.ts): a
// failed download must never fail the sync.
async function cacheThumbnailLocally(
  url: string,
  platformPrefix: string,
  externalContentId: string
): Promise<string | null> {
  try {
    const { buffer, mimeType } = await fetchImageBuffer(url);
    const ext = THUMBNAIL_MIME_EXT[mimeType] ?? extname(url).split("?")[0] ?? ".jpg";
    const filename = `${platformPrefix}-${externalContentId}${ext}`;
    await fs.mkdir(COMPETITOR_CONTENT_MEDIA_DIR, { recursive: true });
    await fs.writeFile(join(COMPETITOR_CONTENT_MEDIA_DIR, filename), buffer);
    return filename;
  } catch {
    return null;
  }
}

// --- Gemini analysis ------------------------------------------------------

// Resolves candidate ids to {id, label} pairs Gemini can be shown, reading
// from product-lines.config.json (via the existing config loader). This is
// a duplicate of weekly-ads-sync.ts's (private, unexported)
// buildProductLineCandidates — inlined here rather than depending on a
// cross-file export mid-flight while that file is being edited in parallel
// for Part 2 of this same plan. Trivial mapping logic; safe to keep in
// sync by inspection if either copy ever changes.
function buildProductLineCandidates(candidateIds: string[]): ProductLineCandidate[] {
  const byId = new Map(getPublicProductLines().map((line) => [line.id, line]));
  return candidateIds
    .map((id) => byId.get(id))
    .filter((line): line is NonNullable<typeof line> => !!line)
    .map((line) => ({ id: line.id, label: line.label }));
}

// Dependencies analyzeContentIfNeeded/the retry pass call out to —
// defaulted to the real implementations so every production call site
// (syncInstagramContent/syncTikTokContent) needs zero changes, but
// overridable in tests with fakes instead of a live DB/Gemini key.
export interface ProcessContentItemsDeps {
  recordContentSighting: typeof recordContentSighting;
  saveContentAnalysis: typeof saveContentAnalysis;
  analyzeContent: typeof analyzeContent;
  listUnanalyzedContent: typeof listUnanalyzedContent;
  getGeminiClient: typeof getGeminiClient;
}

const defaultDeps: ProcessContentItemsDeps = {
  recordContentSighting,
  saveContentAnalysis,
  analyzeContent,
  listUnanalyzedContent,
  getGeminiClient,
};

// Gemini client for the content-analysis pass below, built once per sync
// batch (not per post) and cached as null if GEMINI_API_KEY isn't
// configured — a missing key skips analysis for the whole batch rather
// than failing sync.
function tryGetGeminiClient(deps: ProcessContentItemsDeps, errors: string[]): GoogleGenAI | null {
  try {
    return deps.getGeminiClient();
  } catch (err) {
    errors.push(
      `Content analysis skipped for this sync: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

// Analyzes one newly-seen, not-yet-analyzed post (topic/pain point/
// solution/product/tags), optionally resolving its product line via Gemini
// when `target` is linked to 2+ product lines. Failures are collected, not
// thrown — one bad post (an unreachable thumbnail URL, a Gemini hiccup)
// must never fail the sync; analyzed_at stays null so it's retried (see
// the retry pass below, or the next sync of the same accounts). Every
// scraped post — image or video — has an analyzable thumbnail, so unlike
// ads.isStaticEligible there's no eligibility gate here.
async function analyzeContentIfNeeded(
  content: ScrapedContent,
  target: ContentSyncTarget | undefined,
  ai: GoogleGenAI | null,
  errors: string[],
  deps: ProcessContentItemsDeps
): Promise<void> {
  // For video posts, this is the thumbnail (poster frame), never the raw
  // video URL — Gemini needs a still image, same constraint the ads
  // pipeline has for TikTok ads' coverImageUrl.
  const imageUrl = content.thumbnailUrl ?? content.mediaUrl;
  if (!ai || content.analyzedAt || !imageUrl) return;
  try {
    const candidateIds = target?.candidateProductLineIds ?? [];
    const candidates = candidateIds.length > 1 ? buildProductLineCandidates(candidateIds) : undefined;
    const analysis = await deps.analyzeContent(
      ai,
      imageUrl,
      { caption: content.caption, platformId: content.platformId },
      candidates
    );
    const defaultId = target?.productLineId ?? content.productLineId ?? null;
    const resolvedProductLineId = resolveProductLineId(defaultId, candidateIds, analysis.productLineId);
    await deps.saveContentAnalysis(content.id, analysis, resolvedProductLineId);
  } catch (err) {
    errors.push(
      `Content analysis failed for ${content.externalContentId}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

const RETRY_LIMIT = 10;

// Bounded retry pass: anything still unanalyzed for these accounts (a dead
// thumbnail URL, a Gemini hiccup, a mid-batch quota error on a prior sync)
// gets one more attempt now, via the same analyzeContentIfNeeded path —
// mirrors the retry pass in processFacebookItems (weekly-ads-sync.ts).
async function runRetryPass(
  targets: ContentSyncTarget[],
  ai: GoogleGenAI | null,
  errors: string[],
  deps: ProcessContentItemsDeps
): Promise<void> {
  if (!ai) return;
  const byAccountId = new Map(targets.map((t) => [t.accountId, t]));
  const targetAccountIds = targets.map((t) => t.accountId);
  try {
    const retryContent = await deps.listUnanalyzedContent(RETRY_LIMIT, targetAccountIds);
    for (const content of retryContent) {
      const target = content.accountId ? byAccountId.get(content.accountId) : undefined;
      await analyzeContentIfNeeded(content, target, ai, errors, deps);
    }
  } catch (err) {
    errors.push(`Retry pass for unanalyzed content failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// --- Instagram sync ---------------------------------------------------

// Split from syncInstagramContent so the mapping/filtering/sorting logic
// can be verified against an already-fetched dataset (free — Apify bills
// the actor run, not re-reading its results) without paying for another
// run. Mirrors processFacebookItems's split (weekly-ads-sync.ts).
export async function processInstagramProfiles(
  profiles: InstagramProfileItem[],
  targets: ContentSyncTarget[],
  itemsPerTarget: number,
  deps: ProcessContentItemsDeps = defaultDeps
): Promise<ContentSyncResult[]> {
  const byHandle = new Map(
    targets
      .filter((t): t is ContentSyncTarget & { instagramHandle: string } => !!t.instagramHandle)
      .map((t) => [t.instagramHandle.toLowerCase(), t])
  );
  const errors: string[] = [];
  const ai = tryGetGeminiClient(deps, errors);
  let seen = 0;

  for (const profile of profiles) {
    const handle = profile.username?.toLowerCase();
    const target = handle ? byHandle.get(handle) : undefined;
    if (!target) continue;

    // resultsLimit doesn't reliably cap latestPosts server-side (confirmed
    // during Step 0), so cap client-side after sorting newest-first.
    const posts = [...(profile.latestPosts ?? [])]
      .sort((a, b) => new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime())
      .slice(0, itemsPerTarget);

    for (const post of posts) {
      if (!post.id) continue;
      try {
        const thumbnailLocalFile = post.displayUrl
          ? await cacheThumbnailLocally(post.displayUrl, "ig", post.id)
          : null;
        const sighting: ScrapedContentSighting = {
          accountId: target.accountId,
          platformId: "instagram",
          productLineId: target.productLineId ?? null,
          externalContentId: post.id,
          postedAt: post.timestamp ?? null,
          caption: post.caption ?? null,
          mediaUrl: post.displayUrl ?? null,
          thumbnailUrl: post.displayUrl ?? null,
          thumbnailLocalFile,
          // No share count is exposed by this actor.
          shareCount: null,
          viewCount: post.videoViewCount ?? null,
          likeCount: post.likesCount ?? null,
          commentCount: post.commentsCount ?? null,
          format: deriveInstagramFormat(post.type),
          tags: [],
          raw: post as unknown as Record<string, unknown>,
        };
        const content = await deps.recordContentSighting(sighting);
        seen += 1;
        await analyzeContentIfNeeded(content, target, ai, errors, deps);
      } catch (err) {
        errors.push(`${post.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  await runRetryPass(targets, ai, errors, deps);

  return [{ platformId: "instagram", contentSeen: seen, errors }];
}

// One batched actor call for every target's Instagram handle (confirmed in
// Step 0: this actor takes `{usernames: string[], resultsLimit}` and
// returns one profile item per username, posts embedded in latestPosts).
export async function syncInstagramContent(
  targets: ContentSyncTarget[],
  itemsPerTarget = CONTENT_ITEMS_PER_TARGET,
  deps: ProcessContentItemsDeps = defaultDeps
): Promise<ContentSyncResult[]> {
  const usernames = targets
    .map((t) => t.instagramHandle)
    .filter((h): h is string => !!h);
  if (!usernames.length) {
    return [{ platformId: "instagram", contentSeen: 0, errors: [] }];
  }
  try {
    const profiles = await runApifyActor<InstagramProfileItem>(INSTAGRAM_ACTOR_ID, {
      usernames,
      resultsLimit: itemsPerTarget,
    });
    return await processInstagramProfiles(profiles, targets, itemsPerTarget, deps);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [{ platformId: "instagram", contentSeen: 0, errors: [`Instagram content sync failed: ${message}`] }];
  }
}

// --- TikTok sync --------------------------------------------------------

// Split from syncTikTokContent for the same reason as
// processInstagramProfiles above.
export async function processTikTokItems(
  items: TikTokContentItem[],
  targets: ContentSyncTarget[],
  deps: ProcessContentItemsDeps = defaultDeps
): Promise<ContentSyncResult> {
  const byHandle = new Map(
    targets
      .filter((t): t is ContentSyncTarget & { tiktokHandle: string } => !!t.tiktokHandle)
      .map((t) => [t.tiktokHandle.toLowerCase(), t])
  );
  const errors: string[] = [];
  const ai = tryGetGeminiClient(deps, errors);
  let seen = 0;

  for (const item of items) {
    if (!item.id) continue;
    // Flat array (not grouped by profile), matched back via authorMeta.name
    // (confirmed in Step 0) — case-insensitive against the saved handle.
    const authorName = item.authorMeta?.name?.toLowerCase();
    const target = authorName ? byHandle.get(authorName) : undefined;
    if (!target) continue;
    try {
      const coverUrl = item.videoMeta?.coverUrl ?? null;
      // shouldDownloadCovers:true makes Apify re-host this on a stable
      // cached URL (not TikTok's own short-lived signed CDN URL) — still
      // worth locally caching for the same dead-URL resilience reasoning
      // as everywhere else.
      const thumbnailLocalFile = coverUrl ? await cacheThumbnailLocally(coverUrl, "tt", item.id) : null;
      const sighting: ScrapedContentSighting = {
        accountId: target.accountId,
        platformId: "tiktok",
        productLineId: target.productLineId ?? null,
        externalContentId: item.id,
        postedAt: item.createTimeISO ?? null,
        caption: item.text ?? null,
        mediaUrl: item.webVideoUrl ?? null,
        thumbnailUrl: coverUrl,
        thumbnailLocalFile,
        viewCount: item.playCount ?? null,
        likeCount: item.diggCount ?? null,
        commentCount: item.commentCount ?? null,
        shareCount: item.shareCount ?? null,
        format: deriveTikTokFormat(!!item.isSlideshow),
        tags: [],
        raw: item as unknown as Record<string, unknown>,
      };
      const content = await deps.recordContentSighting(sighting);
      seen += 1;
      await analyzeContentIfNeeded(content, target, ai, errors, deps);
    } catch (err) {
      errors.push(`${item.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await runRetryPass(targets, ai, errors, deps);

  return { platformId: "tiktok", contentSeen: seen, errors };
}

// One batched actor call for every target's TikTok handle (confirmed in
// Step 0: this actor takes `{profiles: string[], resultsPerPage,
// shouldDownloadCovers}` and returns a flat array of post items, capped
// per profile by resultsPerPage).
export async function syncTikTokContent(
  targets: ContentSyncTarget[],
  itemsPerTarget = CONTENT_ITEMS_PER_TARGET,
  deps: ProcessContentItemsDeps = defaultDeps
): Promise<ContentSyncResult> {
  const profiles = targets
    .map((t) => t.tiktokHandle)
    .filter((h): h is string => !!h);
  if (!profiles.length) {
    return { platformId: "tiktok", contentSeen: 0, errors: [] };
  }
  try {
    const items = await runApifyActor<TikTokContentItem>(TIKTOK_ACTOR_ID, {
      profiles,
      resultsPerPage: itemsPerTarget,
      shouldDownloadCovers: true,
    });
    return await processTikTokItems(items, targets, deps);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { platformId: "tiktok", contentSeen: 0, errors: [`TikTok content sync failed: ${message}`] };
  }
}
