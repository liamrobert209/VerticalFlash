import { runApifyActor } from "./apify-client";
import { recordAdSighting, markStaleAdsInactive } from "./ads-store";
import type { AdSighting } from "./ads-schema";

// Both actor ids and their I/O shapes were confirmed against Apify's store
// listings before writing this (apify.com/apify/facebook-ads-scraper,
// apify.com/scrapesage/tiktok-ad-library-scraper) — not guessed.
const FACEBOOK_ACTOR_ID = "apify/facebook-ads-scraper";
const TIKTOK_ACTOR_ID = "scrapesage/tiktok-ad-library-scraper";

export interface SyncTarget {
  accountId: string;
  name: string;
  productLineId?: string | null;
}

export interface SyncResult {
  platformId: string;
  adsSeen: number;
  markedInactive: number;
  errors: string[];
}

interface FacebookSnapshot {
  title?: string;
  body?: { text?: string } | string;
  cta_text?: string;
  link_url?: string;
  videos?: { video_hd_url?: string; video_sd_url?: string }[];
  images?: { original_image_url?: string }[];
}

interface FacebookAdItem {
  adArchiveID: string;
  pageID?: string;
  pageName?: string;
  startDate?: number | string;
  endDate?: number | string;
  isActive?: boolean;
  publisherPlatform?: string[];
  snapshot?: FacebookSnapshot;
  [key: string]: unknown;
}

function toIsoDate(value: number | string | undefined): string | null {
  if (value == null) return null;
  // The actor documents startDate/endDate as either a unix timestamp
  // (seconds) or a formatted string depending on the ad — handle both
  // rather than assume one.
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
  return snapshot?.images?.[0]?.original_image_url ?? null;
}

// A genuine static-image ad, eligible as a Static Ad Generator visual
// reference: the snapshot has a real image and no video at all. An ad with
// both (e.g. a video ad whose snapshot also includes a thumbnail image) is
// NOT eligible — that image is a poster frame, not independent creative.
function isFacebookStaticEligible(snapshot: FacebookSnapshot | undefined): boolean {
  return !(snapshot?.videos?.length) && !!snapshot?.images?.length;
}

// Meta's publisherPlatform can list facebook/instagram/messenger/
// audience_network for the same creative — one ads row per platform we
// actually track (facebook, instagram) so Weekly Ads' per-platform view is
// accurate; messenger/audience_network placements aren't distinct creative,
// so they're not split out separately.
function facebookPlatformIds(item: FacebookAdItem): string[] {
  const raw = (item.publisherPlatform ?? []).map((p) => p.toLowerCase());
  const ids = new Set<string>();
  if (raw.includes("facebook")) ids.add("facebook");
  if (raw.includes("instagram")) ids.add("instagram");
  return ids.size ? Array.from(ids) : ["facebook"];
}

export async function syncFacebookAds(targets: SyncTarget[]): Promise<SyncResult[]> {
  const startUrls = targets.map((t) => ({
    url: `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=${encodeURIComponent(t.name)}&search_type=keyword_unordered`,
  }));
  const items = await runApifyActor<FacebookAdItem>(FACEBOOK_ACTOR_ID, {
    startUrls,
    // "" (not "all") is this actor's documented value for "both active and
    // inactive" — confirmed against a real 400 response during testing.
    activeStatus: "",
    isDetailsPerAd: false,
  });
  return processFacebookItems(items, targets);
}

// Split from syncFacebookAds so the mapping/filtering logic can be
// verified against an already-fetched dataset (free — Apify bills the
// actor run, not re-reading its results) without paying for another run.
export async function processFacebookItems(
  items: FacebookAdItem[],
  targets: SyncTarget[]
): Promise<SyncResult[]> {
  const byName = new Map(targets.map((t) => [t.name.toLowerCase(), t]));
  const seenByPlatform = new Map<string, string[]>();
  const errors: string[] = [];

  for (const item of items) {
    if (!item.adArchiveID) continue;
    // The actor's startUrls use a keyword search (Facebook Ad Library has
    // no exact "ads by this exact page" API mode) — confirmed via a real
    // run that roughly half the results for a single brand's name search
    // are OTHER advertisers whose ad text/page merely mentions that word.
    // Dropping anything that doesn't match one of our target names by
    // exact page name keeps Weekly Ads to ads we can actually attribute,
    // rather than mixing in unrelated keyword noise.
    const matchedTarget = item.pageName ? byName.get(item.pageName.toLowerCase()) : undefined;
    if (!matchedTarget) continue;
    const sighting: Omit<AdSighting, "platformId"> = {
      accountId: matchedTarget.accountId,
      productLineId: matchedTarget.productLineId ?? null,
      externalAdId: item.adArchiveID,
      headline: item.snapshot?.title ?? null,
      bodyText: facebookBodyText(item.snapshot),
      creativeUrl: facebookCreativeUrl(item.snapshot),
      landingUrl: item.snapshot?.link_url ?? null,
      launchDate: toIsoDate(item.startDate),
      tags: [],
      raw: item as unknown as Record<string, unknown>,
      isStaticEligible: isFacebookStaticEligible(item.snapshot),
    };
    for (const platformId of facebookPlatformIds(item)) {
      try {
        await recordAdSighting({ ...sighting, platformId });
        const seen = seenByPlatform.get(platformId) ?? [];
        seen.push(item.adArchiveID);
        seenByPlatform.set(platformId, seen);
      } catch (err) {
        errors.push(`${item.adArchiveID} (${platformId}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const results: SyncResult[] = [];
  for (const [platformId, seenIds] of seenByPlatform) {
    const markedInactive = await markStaleAdsInactive(platformId, seenIds);
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

  const markedInactive = await markStaleAdsInactive("tiktok", seenIds);
  return { platformId: "tiktok", adsSeen: seenIds.length, markedInactive, errors };
}
