import { promises as fs } from "fs";
import { join } from "path";
import type { GoogleGenAI } from "@google/genai";
import { runApifyActor } from "./apify-client";
import { recordAdSighting, markStaleAdsInactive, saveAdAnalysis } from "./ads-store";
import type { AdSighting, Ad } from "./ads-schema";
import { getGeminiClient } from "./gemini";
import { analyzeStaticAd } from "./ad-analyze";
import { addFacebookPageId } from "./competitor-store";
import { fetchImageBuffer } from "./fetch-image";
import { ADS_MEDIA_DIR } from "./paths";

// Both actor ids and their I/O shapes were confirmed against real Apify
// runs before writing this (not guessed from documentation alone).
// igolaizola/facebook-ad-library-scraper replaced apify/facebook-ads-scraper
// (~10-19x cheaper: ~$0.30/1K ads vs $3.40-5.80/1K) — same snapshot.body/
// videos/images shape, but top-level fields are snake_case
// (ad_archive_id, page_name, start_date, publisher_platform, is_active)
// instead of the old actor's camelCase, and it takes one `query` per call
// instead of a batch of startUrls, so syncFacebookAds now runs one actor
// call per target instead of one call for the whole batch.
const FACEBOOK_ACTOR_ID = "igolaizola/facebook-ad-library-scraper";
const TIKTOK_ACTOR_ID = "scrapesage/tiktok-ad-library-scraper";

// Ads fetched per target per sync — tunable; the old actor had no cap
// (unbounded "get as many as possible"), this one requires an explicit
// maxItems. Raise or lower freely; this isn't tied to any other decision.
const FACEBOOK_MAX_ITEMS_PER_TARGET = 30;

export interface SyncTarget {
  accountId: string;
  name: string;
  productLineId?: string | null;
  // Known Facebook Page ids for this account (see facebook-schema's
  // comment) — matched first, before falling back to page-name matching.
  facebookPageIds?: string[];
}

export interface SyncResult {
  platformId: string;
  adsSeen: number;
  markedInactive: number;
  errors: string[];
}

interface FacebookSnapshotCard {
  video_hd_url?: string;
  video_sd_url?: string;
  original_image_url?: string;
}

interface FacebookSnapshot {
  title?: string;
  body?: { text?: string } | string;
  cta_text?: string;
  link_url?: string;
  videos?: { video_hd_url?: string; video_sd_url?: string }[];
  images?: { original_image_url?: string }[];
  // Carousel-format ads put their creative here instead of in the
  // top-level images/videos arrays — each card is one carousel slide.
  cards?: FacebookSnapshotCard[];
}

interface FacebookAdItem {
  ad_archive_id: string;
  page_id?: string;
  page_name?: string;
  start_date?: number | string;
  end_date?: number | string;
  is_active?: boolean;
  publisher_platform?: string[];
  snapshot?: FacebookSnapshot;
  [key: string]: unknown;
}

function toIsoDate(value: number | string | undefined): string | null {
  if (value == null) return null;
  // start_date/end_date come back as unix timestamps (seconds) from this
  // actor, but handle a formatted string too rather than assume one shape.
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function facebookBodyText(snapshot: FacebookSnapshot | undefined): string | null {
  if (!snapshot?.body) return null;
  return typeof snapshot.body === "string" ? snapshot.body : (snapshot.body.text ?? null);
}

function facebookCreativeUrl(snapshot: FacebookSnapshot | undefined): string | null {
  const video = snapshot?.videos?.[0];
  if (video?.video_hd_url || video?.video_sd_url) {
    return video.video_hd_url ?? video.video_sd_url ?? null;
  }
  if (snapshot?.images?.[0]?.original_image_url) {
    return snapshot.images[0].original_image_url;
  }
  // Carousel ads (multiple products/cards in one ad) carry no top-level
  // images/videos at all — fall back to the first card's creative.
  const card = snapshot?.cards?.[0];
  if (card?.video_hd_url || card?.video_sd_url) {
    return card.video_hd_url ?? card.video_sd_url ?? null;
  }
  return card?.original_image_url ?? null;
}

// A genuine static-image ad, eligible as a Static Ad Generator visual
// reference: the snapshot (top-level or, for carousels, any card) has a
// real image and no video anywhere. An ad with both (e.g. a video ad whose
// snapshot also includes a thumbnail image) is NOT eligible — that image
// is a poster frame, not independent creative.
function isFacebookStaticEligible(snapshot: FacebookSnapshot | undefined): boolean {
  const hasVideo =
    !!snapshot?.videos?.length || !!snapshot?.cards?.some((c) => c.video_hd_url || c.video_sd_url);
  if (hasVideo) return false;
  return !!snapshot?.images?.length || !!snapshot?.cards?.some((c) => c.original_image_url);
}

const CREATIVE_MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

// Downloads a static-eligible ad's creative image once at sync time and
// caches it on the Railway volume (ads-media/), keyed by the ad's own
// platform-independent archive id — the remote CDN URL isn't reliable to
// keep re-fetching from later (Facebook's especially can go dead well
// before anything downstream actually uses it). Best-effort: a failed
// download must never fail the sync — the ad still gets stored with just
// its (possibly short-lived) remote creativeUrl, same as before this
// existed.
async function cacheCreativeImageLocally(url: string, adArchiveId: string): Promise<string | null> {
  try {
    const { buffer, mimeType } = await fetchImageBuffer(url);
    const ext = CREATIVE_MIME_EXT[mimeType] ?? ".jpg";
    const filename = `fb-${adArchiveId}${ext}`;
    await fs.mkdir(ADS_MEDIA_DIR, { recursive: true });
    await fs.writeFile(join(ADS_MEDIA_DIR, filename), buffer);
    return filename;
  } catch {
    return null;
  }
}

// Meta's publisherPlatform can list facebook/instagram/messenger/
// audience_network for the same creative — one ads row per platform we
// actually track (facebook, instagram) so Weekly Ads' per-platform view is
// accurate; messenger/audience_network placements aren't distinct creative,
// so they're not split out separately.
function facebookPlatformIds(item: FacebookAdItem): string[] {
  const raw = (item.publisher_platform ?? []).map((p) => p.toLowerCase());
  const ids = new Set<string>();
  if (raw.includes("facebook")) ids.add("facebook");
  if (raw.includes("instagram")) ids.add("instagram");
  return ids.size ? Array.from(ids) : ["facebook"];
}

export async function syncFacebookAds(targets: SyncTarget[]): Promise<SyncResult[]> {
  // One actor call per target (this actor takes a single `query`, not a
  // batch of startUrls) — sequential, not parallel, to stay under any
  // concurrent-run cap on the Apify plan. Cost is identical either way.
  const items: FacebookAdItem[] = [];
  const runErrors: string[] = [];
  for (const target of targets) {
    try {
      const results = await runApifyActor<FacebookAdItem>(FACEBOOK_ACTOR_ID, {
        query: target.name,
        maxItems: FACEBOOK_MAX_ITEMS_PER_TARGET,
        // "all" (not "" like the old actor) is this actor's documented
        // value for "both active and inactive" — confirmed against a real
        // 400 response during testing ("active"|"inactive"|"all").
        activeStatus: "all",
      });
      items.push(...results);
    } catch (err) {
      runErrors.push(`${target.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const results = await processFacebookItems(items, targets);
  if (runErrors.length) {
    for (const result of results) result.errors.push(...runErrors);
    if (results.length === 0) {
      results.push({ platformId: "facebook", adsSeen: 0, markedInactive: 0, errors: runErrors });
    }
  }
  return results;
}

// Gemini client for the ad-analysis pass below, built once per sync batch
// (not per ad) and cached as null if GEMINI_API_KEY isn't configured — a
// missing key skips analysis for the whole batch rather than failing sync.
function tryGetGeminiClient(errors: string[]): GoogleGenAI | null {
  try {
    return getGeminiClient();
  } catch (err) {
    errors.push(
      `Ad analysis skipped for this sync: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

// Analyzes one newly-eligible, not-yet-analyzed ad (tags/intent/USP/
// persona/product). Failures are collected, not thrown — one bad ad's
// creative (an unreachable URL, a Gemini hiccup) must never fail the sync;
// analyzed_at stays null so it's retried on the next sync.
async function analyzeIfNeeded(ad: Ad, ai: GoogleGenAI | null, errors: string[]): Promise<void> {
  if (!ai || !ad.isStaticEligible || ad.analyzedAt || !ad.creativeUrl) return;
  try {
    const analysis = await analyzeStaticAd(ai, ad.creativeUrl, {
      headline: ad.headline,
      bodyText: ad.bodyText,
    });
    await saveAdAnalysis(ad.id, analysis);
  } catch (err) {
    errors.push(`Ad analysis failed for ${ad.externalAdId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Split from syncFacebookAds so the mapping/filtering logic can be
// verified against an already-fetched dataset (free — Apify bills the
// actor run, not re-reading its results) without paying for another run.
export async function processFacebookItems(
  items: FacebookAdItem[],
  targets: SyncTarget[]
): Promise<SyncResult[]> {
  const byName = new Map(targets.map((t) => [t.name.toLowerCase(), t]));
  const byPageId = new Map<string, SyncTarget>();
  for (const t of targets) {
    for (const pageId of t.facebookPageIds ?? []) byPageId.set(pageId, t);
  }
  const seenByPlatform = new Map<string, string[]>();
  const errors: string[] = [];
  const ai = tryGetGeminiClient(errors);

  for (const item of items) {
    if (!item.ad_archive_id) continue;
    // Page id is exact and display-name-independent — tried first. Falls
    // back to matching by exact page name (the actor's `query` is a
    // keyword search, which can surface other advertisers whose page name
    // merely contains the searched word — dropping anything that doesn't
    // match a saved name keeps this to ads we can actually attribute). A
    // name match auto-records its page id below so the *next* sync for
    // that same page matches by id even if its display name ever changes;
    // it does NOT retroactively catch a brand's other regional Pages
    // (each is a genuinely distinct Page/id) — add those ids manually
    // once you've spotted them in a sync's results.
    const matchedTarget =
      (item.page_id && byPageId.get(item.page_id)) ||
      (item.page_name ? byName.get(item.page_name.toLowerCase()) : undefined);
    if (!matchedTarget) continue;
    if (item.page_id && !(matchedTarget.facebookPageIds ?? []).includes(item.page_id)) {
      try {
        await addFacebookPageId(matchedTarget.accountId, item.page_id);
        matchedTarget.facebookPageIds = [...(matchedTarget.facebookPageIds ?? []), item.page_id];
      } catch (err) {
        errors.push(`Could not record Facebook page id for ${matchedTarget.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const creativeUrl = facebookCreativeUrl(item.snapshot);
    const isStaticEligible = isFacebookStaticEligible(item.snapshot);
    // Cached once per item (not per platform row below) — the same
    // creative image would otherwise be downloaded twice for an ad that
    // runs on both Facebook and Instagram.
    const creativeLocalFile =
      isStaticEligible && creativeUrl ? await cacheCreativeImageLocally(creativeUrl, item.ad_archive_id) : null;
    const sighting: Omit<AdSighting, "platformId"> = {
      accountId: matchedTarget.accountId,
      productLineId: matchedTarget.productLineId ?? null,
      externalAdId: item.ad_archive_id,
      headline: item.snapshot?.title ?? null,
      bodyText: facebookBodyText(item.snapshot),
      creativeUrl,
      creativeLocalFile,
      landingUrl: item.snapshot?.link_url ?? null,
      launchDate: toIsoDate(item.start_date),
      tags: [],
      raw: item as unknown as Record<string, unknown>,
      isStaticEligible,
    };
    for (const platformId of facebookPlatformIds(item)) {
      try {
        const ad = await recordAdSighting({ ...sighting, platformId });
        const seen = seenByPlatform.get(platformId) ?? [];
        seen.push(item.ad_archive_id);
        seenByPlatform.set(platformId, seen);
        await analyzeIfNeeded(ad, ai, errors);
      } catch (err) {
        errors.push(`${item.ad_archive_id} (${platformId}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const targetAccountIds = targets.map((t) => t.accountId);
  const results: SyncResult[] = [];
  for (const [platformId, seenIds] of seenByPlatform) {
    const markedInactive = await markStaleAdsInactive(platformId, targetAccountIds, seenIds);
    results.push({ platformId, adsSeen: seenIds.length, markedInactive, errors });
  }
  return results;
}

interface TikTokAdItem {
  adId: string;
  advertiserName?: string;
  adTitle?: string;
  adCaption?: string;
  videoUrl?: string;
  coverImageUrl?: string;
  landingPageUrl?: string;
  firstShownDate?: string;
  tags?: string[];
  [key: string]: unknown;
}

export async function syncTikTokAds(targets: SyncTarget[]): Promise<SyncResult> {
  const byName = new Map(targets.map((t) => [t.name.toLowerCase(), t]));

  const items = await runApifyActor<TikTokAdItem>(TIKTOK_ACTOR_ID, {
    source: "library",
    libraryRegions: ["ALL"],
    advertiserName: targets.length === 1 ? targets[0].name : undefined,
    includeAdDetails: false,
  });

  const seenIds: string[] = [];
  const errors: string[] = [];

  for (const item of items) {
    if (!item.adId) continue;
    const matchedTarget = item.advertiserName ? byName.get(item.advertiserName.toLowerCase()) : undefined;
    // Same reasoning as syncFacebookAds: drop anything that doesn't match
    // one of our target names rather than store unattributed ads.
    if (!matchedTarget) continue;
    try {
      await recordAdSighting({
        platformId: "tiktok",
        accountId: matchedTarget.accountId,
        productLineId: matchedTarget.productLineId ?? null,
        externalAdId: item.adId,
        headline: item.adTitle ?? null,
        bodyText: item.adCaption ?? null,
        creativeUrl: item.videoUrl ?? item.coverImageUrl ?? null,
        landingUrl: null,
        launchDate: item.firstShownDate ?? null,
        tags: item.tags ?? [],
        raw: item as unknown as Record<string, unknown>,
        // coverImageUrl is a video poster frame, not independent static
        // creative — TikTok ads are never eligible as a visual reference.
        isStaticEligible: false,
      });
      seenIds.push(item.adId);
    } catch (err) {
      errors.push(`${item.adId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const markedInactive = await markStaleAdsInactive(
    "tiktok",
    targets.map((t) => t.accountId),
    seenIds
  );
  return { platformId: "tiktok", adsSeen: seenIds.length, markedInactive, errors };
}
