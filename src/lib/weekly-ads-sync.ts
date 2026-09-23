import { promises as fs } from "fs";
import { join } from "path";
import type { GoogleGenAI } from "@google/genai";
import { runApifyActor } from "./apify-client";
import {
  recordAdSighting,
  markStaleAdsInactive,
  saveAdAnalysis,
  listUnanalyzedStaticAds,
} from "./ads-store";
import type { AdSighting, Ad } from "./ads-schema";
import { getGeminiClient } from "./gemini";
import { analyzeStaticAd, type ProductLineCandidate } from "./ad-analyze";
import { addFacebookPageId, recordFlaggedAdLanguage, getCompetitor } from "./competitor-store";
import { fetchImageBuffer } from "./fetch-image";
import { ADS_MEDIA_DIR } from "./paths";
import { getPublicProductLines } from "./config";
import type { CompetitorAccount } from "./competitor-schema";
import { detectAdLanguage } from "./language-detect";
import { rankAdsTargetsForProductLine, type AdsPlatform } from "./competitor-ranking";
import { recordSystemNotice } from "./system-notices-store";

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
  // Every product line this account is linked to (not just the first one
  // used as `productLineId`'s default) — when there are 2+, analyzeIfNeeded
  // asks Gemini to disambiguate which one a given ad's creative actually
  // shows instead of defaulting to productLineId unconditionally. Omitted
  // (or a single id) means zero extra Gemini cost, identical to before this
  // existed.
  candidateProductLineIds?: string[];
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

export async function syncFacebookAds(
  targets: SyncTarget[],
  maxItemsPerTarget: number = FACEBOOK_MAX_ITEMS_PER_TARGET
): Promise<SyncResult[]> {
  // One actor call per target (this actor takes a single `query`, not a
  // batch of startUrls) — sequential, not parallel, to stay under any
  // concurrent-run cap on the Apify plan. Cost is identical either way.
  //
  // `query` is a fuzzy full-text search across ad content, NOT an exact
  // advertiser-name match — confirmed by direct testing: searching a real
  // brand's exact name routinely returns pages with no relation to it at
  // all (e.g. "3M" → random unrelated shops/clinics/restaurants). Combined
  // with processFacebookItems' exact-name match against our stored
  // `name`, this meant almost nothing without an already-known
  // facebookPageIds ever matched. Once we DO know a target's real page
  // id(s) (seeded by a prior name-match hit, or added manually in
  // Settings > Competitors), always look it up directly via `pageId`
  // instead — an exact, reliable lookup with no keyword-search noise.
  const items: FacebookAdItem[] = [];
  const runErrors: string[] = [];
  for (const target of targets) {
    const knownPageIds = target.facebookPageIds ?? [];
    try {
      if (knownPageIds.length > 0) {
        for (const pageId of knownPageIds) {
          const results = await runApifyActor<FacebookAdItem>(FACEBOOK_ACTOR_ID, {
            pageId,
            maxItems: maxItemsPerTarget,
            activeStatus: "all",
          });
          items.push(...results);
        }
      } else {
        const results = await runApifyActor<FacebookAdItem>(FACEBOOK_ACTOR_ID, {
          query: target.name,
          maxItems: maxItemsPerTarget,
          // "all" (not "" like the old actor) is this actor's documented
          // value for "both active and inactive" — confirmed against a real
          // 400 response during testing ("active"|"inactive"|"all").
          activeStatus: "all",
        });
        items.push(...results);
      }
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

// Pure: only trusts Gemini's pick when it's actually one of the candidates
// offered — a hallucinated or omitted pick (invalid JSON field, model
// declining to choose, etc.) falls back to the competitor's first-linked
// line rather than writing garbage into ads.product_line_id.
export function resolveProductLineId(
  defaultId: string | null,
  candidateIds: string[],
  geminiPick: string | null | undefined
): string | null {
  if (geminiPick && candidateIds.includes(geminiPick)) return geminiPick;
  return defaultId;
}

// Resolves candidate ids to {id, label} pairs Gemini can be shown, reading
// from product-lines.config.json (via the existing config loader) — the
// only thing the disambiguation prompt needs from product-line config. An
// id with no matching config entry (stale/renamed) is silently dropped
// rather than failing the whole analysis.
function buildProductLineCandidates(candidateIds: string[]): ProductLineCandidate[] {
  const byId = new Map(getPublicProductLines().map((line) => [line.id, line]));
  return candidateIds
    .map((id) => byId.get(id))
    .filter((line): line is NonNullable<typeof line> => !!line)
    .map((line) => ({ id: line.id, label: line.label }));
}

// Dependencies `processFacebookItems` calls out to — defaulted to the real
// implementations so every production call site (syncFacebookAds) needs
// zero changes, but overridable in tests with fakes instead of a live
// DB/Gemini key.
export interface ProcessFacebookItemsDeps {
  recordAdSighting: typeof recordAdSighting;
  saveAdAnalysis: typeof saveAdAnalysis;
  markStaleAdsInactive: typeof markStaleAdsInactive;
  addFacebookPageId: typeof addFacebookPageId;
  analyzeStaticAd: typeof analyzeStaticAd;
  listUnanalyzedStaticAds: typeof listUnanalyzedStaticAds;
  getGeminiClient: typeof getGeminiClient;
  recordFlaggedAdLanguage: typeof recordFlaggedAdLanguage;
}

const defaultDeps: ProcessFacebookItemsDeps = {
  recordAdSighting,
  saveAdAnalysis,
  markStaleAdsInactive,
  addFacebookPageId,
  analyzeStaticAd,
  listUnanalyzedStaticAds,
  getGeminiClient,
  recordFlaggedAdLanguage,
};

// Gemini client for the ad-analysis pass below, built once per sync batch
// (not per ad) and cached as null if GEMINI_API_KEY isn't configured — a
// missing key skips analysis for the whole batch rather than failing sync.
function tryGetGeminiClient(deps: ProcessFacebookItemsDeps, errors: string[]): GoogleGenAI | null {
  try {
    return deps.getGeminiClient();
  } catch (err) {
    errors.push(
      `Ad analysis skipped for this sync: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

// Analyzes one newly-eligible, not-yet-analyzed ad (tags/intent/USP/
// persona/product), optionally resolving its product line via Gemini when
// `target` is linked to 2+ product lines. Failures are collected, not
// thrown — one bad ad's creative (an unreachable URL, a Gemini hiccup) must
// never fail the sync; analyzed_at stays null so it's retried (see the
// retry pass below, or the next sync of the same accounts).
async function analyzeIfNeeded(
  ad: Ad,
  target: SyncTarget | undefined,
  ai: GoogleGenAI | null,
  errors: string[],
  deps: ProcessFacebookItemsDeps
): Promise<void> {
  if (!ai || !ad.isStaticEligible || ad.analyzedAt || !ad.creativeUrl) return;
  try {
    const candidateIds = target?.candidateProductLineIds ?? [];
    const candidates = candidateIds.length > 1 ? buildProductLineCandidates(candidateIds) : undefined;
    const analysis = await deps.analyzeStaticAd(
      ai,
      ad.creativeUrl,
      { headline: ad.headline, bodyText: ad.bodyText },
      candidates
    );
    const defaultId = target?.productLineId ?? ad.productLineId ?? null;
    const resolvedProductLineId = resolveProductLineId(defaultId, candidateIds, analysis.productLineId);
    await deps.saveAdAnalysis(ad.id, analysis, resolvedProductLineId);
  } catch (err) {
    errors.push(`Ad analysis failed for ${ad.externalAdId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Split from syncFacebookAds so the mapping/filtering logic can be
// verified against an already-fetched dataset (free — Apify bills the
// actor run, not re-reading its results) without paying for another run.
export async function processFacebookItems(
  items: FacebookAdItem[],
  targets: SyncTarget[],
  deps: ProcessFacebookItemsDeps = defaultDeps
): Promise<SyncResult[]> {
  const byName = new Map(targets.map((t) => [t.name.toLowerCase(), t]));
  const byPageId = new Map<string, SyncTarget>();
  const byAccountId = new Map(targets.map((t) => [t.accountId, t]));
  for (const t of targets) {
    for (const pageId of t.facebookPageIds ?? []) byPageId.set(pageId, t);
  }
  const seenByPlatform = new Map<string, string[]>();
  // Confirmed-ended count per platform, straight from Meta's own signal —
  // reported in SyncResult.markedInactive in place of the old "wasn't seen
  // this sync" bulk deactivation (removed; see recordAdSighting's comment).
  const confirmedInactiveByPlatform = new Map<string, number>();
  const errors: string[] = [];
  const ai = tryGetGeminiClient(deps, errors);
  let skippedNonEnglish = 0;

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
        await deps.addFacebookPageId(matchedTarget.accountId, item.page_id);
        matchedTarget.facebookPageIds = [...(matchedTarget.facebookPageIds ?? []), item.page_id];
      } catch (err) {
        errors.push(`Could not record Facebook page id for ${matchedTarget.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    // Skip non-English ad copy entirely — never stored. The Facebook Ad
    // Library actor exposes no language field (confirmed by inspecting real
    // synced rows: e.g. a UK/EU/US iPad-case brand's page also runs Thai-
    // language regional campaigns under the same page id), so this is
    // detected from the ad's own text via franc rather than actor metadata.
    // The detected language is also tagged onto the competitor
    // (flaggedAdLanguages) so future syncs stop wasting Apify calls on it
    // (see rankAdsTargetsForProductLine's exclusion) without losing the
    // fact that this account does produce non-English creative.
    const adText = `${item.snapshot?.title ?? ""} ${facebookBodyText(item.snapshot) ?? ""}`;
    const adLanguage = detectAdLanguage(adText);
    if (adLanguage) {
      skippedNonEnglish++;
      try {
        await deps.recordFlaggedAdLanguage(matchedTarget.accountId, adLanguage);
      } catch (err) {
        errors.push(`Could not tag ${matchedTarget.name} with language ${adLanguage}: ${err instanceof Error ? err.message : String(err)}`);
      }
      continue;
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
      // Meta's own per-ad signal (queried with activeStatus: "all", so
      // this is populated for both currently-running and ended ads) —
      // see recordAdSighting's comment for why this replaced the old
      // "wasn't seen in this sync" inference.
      isActive: item.is_active ?? true,
    };
    for (const platformId of facebookPlatformIds(item)) {
      try {
        const ad = await deps.recordAdSighting({ ...sighting, platformId });
        const seen = seenByPlatform.get(platformId) ?? [];
        seen.push(item.ad_archive_id);
        seenByPlatform.set(platformId, seen);
        if (item.is_active === false) {
          confirmedInactiveByPlatform.set(platformId, (confirmedInactiveByPlatform.get(platformId) ?? 0) + 1);
        }
        await analyzeIfNeeded(ad, matchedTarget, ai, errors, deps);
      } catch (err) {
        errors.push(`${item.ad_archive_id} (${platformId}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const targetAccountIds = targets.map((t) => t.accountId);

  // Bounded retry pass: anything still unanalyzed for these accounts (a
  // dead creative URL, a Gemini hiccup, a mid-batch quota error on a prior
  // sync) gets one more attempt now, via the same analyzeIfNeeded path —
  // matches listUnanalyzedStaticAds' original intent, which had zero
  // callers before this.
  const RETRY_LIMIT = 10;
  if (ai) {
    try {
      const retryAds = await deps.listUnanalyzedStaticAds(RETRY_LIMIT, targetAccountIds);
      for (const ad of retryAds) {
        const target = ad.accountId ? byAccountId.get(ad.accountId) : undefined;
        await analyzeIfNeeded(ad, target, ai, errors, deps);
      }
    } catch (err) {
      errors.push(`Retry pass for unanalyzed ads failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Surfaced once per call, not per platform — a non-English ad is skipped
  // before it's ever attributed to a platform row, so there's no natural
  // per-platform count to attach it to.
  if (skippedNonEnglish > 0) errors.push(`Skipped ${skippedNonEnglish} non-English ad(s)`);

  const results: SyncResult[] = [];
  for (const [platformId, seenIds] of seenByPlatform) {
    results.push({
      platformId,
      adsSeen: seenIds.length,
      markedInactive: confirmedInactiveByPlatform.get(platformId) ?? 0,
      errors,
    });
  }
  // No platform ever got a row (e.g. every item this run was non-English,
  // or unmatched) but there's still something worth surfacing — same
  // synthesize-a-carrier-row pattern syncFacebookAds uses for runErrors, so
  // the skipped-non-English note (or any other error) is never silently
  // dropped just because nothing was actually recorded.
  if (results.length === 0 && errors.length > 0) {
    results.push({ platformId: "facebook", adsSeen: 0, markedInactive: 0, errors });
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
  let skippedNonEnglish = 0;

  for (const item of items) {
    if (!item.adId) continue;
    const matchedTarget = item.advertiserName ? byName.get(item.advertiserName.toLowerCase()) : undefined;
    // Same reasoning as syncFacebookAds: drop anything that doesn't match
    // one of our target names rather than store unattributed ads.
    if (!matchedTarget) continue;
    // Same non-English filter + language tagging as syncFacebookAds — never
    // stored. See language-detect.ts and processFacebookItems' comment for
    // the "why".
    const adLanguage = detectAdLanguage(`${item.adTitle ?? ""} ${item.adCaption ?? ""}`);
    if (adLanguage) {
      skippedNonEnglish++;
      try {
        await recordFlaggedAdLanguage(matchedTarget.accountId, adLanguage);
      } catch (err) {
        errors.push(`Could not tag ${matchedTarget.name} with language ${adLanguage}: ${err instanceof Error ? err.message : String(err)}`);
      }
      continue;
    }
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

  if (skippedNonEnglish > 0) errors.push(`Skipped ${skippedNonEnglish} non-English ad(s)`);

  // No "wasn't seen this sync" deactivation here (or in syncFacebookAds
  // above) — see recordAdSighting's comment. This actor's output has no
  // per-ad active/ended signal at all (unlike Facebook's activeStatus:
  // "all"), so TikTok ads are never auto-deactivated; markedInactive is
  // always 0 for this platform until a real signal exists.
  return { platformId: "tiktok", adsSeen: seenIds.length, markedInactive: 0, errors };
}

// --- Ranked cron target selection ---------------------------------------
// Everything below is cron-only (scripts/weekly-sync.ts) — the manual
// /weekly-ads sync route (a human picking specific accounts) is untouched
// and never calls any of this.

// One CompetitorAccount -> SyncTarget conversion, shared by every caller
// (previously duplicated as a private `toSyncTarget` in
// scripts/weekly-sync.ts) so there's exactly one implementation to keep in
// sync with SyncTarget's shape.
export function accountToSyncTarget(account: CompetitorAccount): SyncTarget {
  return {
    accountId: account.id,
    name: account.name,
    productLineId: account.productLineIds[0] ?? null,
    candidateProductLineIds: account.productLineIds,
    facebookPageIds: account.facebookPageIds,
  };
}

// Facebook Ad Library is queried by `name` (facebook_handle/facebook_url
// are unpopulated for every account on file) — many rows are the SAME
// brand tagged once per region (e.g. "Belkin" uk/eu/us all point at the
// same Instagram/Facebook presence), so syncing every row would issue
// identical duplicate Ad Library searches. Two accounts are treated as the
// same real target if EITHER their names match OR they share a known
// Facebook page id (page-id match is the stronger signal — it catches a
// same-brand-different-spelling case name matching would miss — but as of
// this writing only a handful of accounts have a populated
// facebook_page_ids, so name matching still does most of the work). A
// simple union-find groups accounts linked by either signal, then one
// representative per group is kept — preferring a row that already has a
// known facebookPageIds match over an arbitrary regional row.
//
// Moved here from scripts/weekly-sync.ts so the ranked ads walk below
// (which lives in this lib file, not the script) can reuse it too — see
// syncRankedAdsForProductLines. Order-preserving: the representative
// chosen for each group is whichever member the caller's list encountered
// first, so calling this on an already-ranked (followers-desc) subset
// keeps that ranking intact.
export function dedupeFacebookTargets(accounts: CompetitorAccount[]): SyncTarget[] {
  const parent = accounts.map((_, i) => i);
  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  const byName = new Map<string, number>();
  const byPageId = new Map<string, number>();
  accounts.forEach((account, i) => {
    const nameKey = account.name.trim().toLowerCase();
    const nameMatch = byName.get(nameKey);
    if (nameMatch != null) union(i, nameMatch);
    else byName.set(nameKey, i);

    for (const pageId of account.facebookPageIds) {
      const pageMatch = byPageId.get(pageId);
      if (pageMatch != null) union(i, pageMatch);
      else byPageId.set(pageId, i);
    }
  });

  const groups = new Map<number, CompetitorAccount[]>();
  accounts.forEach((account, i) => {
    const root = find(i);
    const group = groups.get(root) ?? [];
    group.push(account);
    groups.set(root, group);
  });

  const representatives: CompetitorAccount[] = [];
  for (const group of groups.values()) {
    const withPageId = group.find((a) => a.facebookPageIds.length > 0);
    representatives.push(withPageId ?? group[0]);
  }
  return representatives.map(accountToSyncTarget);
}

// Per-account, per-platform cache entry for one syncRankedAdsForProductLines
// run — a competitor linked to N product lines gets at most one real Apify
// call per platform across the whole run; every later product line's walk
// that encounters the same account reuses these cached rows instead.
// syncFacebookAds can return more than one row per call (an ad running on
// both Facebook and Instagram yields a "facebook" row and an "instagram"
// row from a single call), so `facebook` caches the whole array; TikTok's
// syncTikTokAds returns exactly one result, cached as-is.
export interface RankedAdsCacheEntry {
  facebook?: SyncResult[];
  tiktok?: SyncResult;
}

// Dependencies the ranked walk calls out to — defaulted to the real
// implementations so production callers need zero changes, overridable in
// tests with fakes.
export interface RankedAdsSyncDeps {
  syncFacebookAds: typeof syncFacebookAds;
  syncTikTokAds: typeof syncTikTokAds;
}

export const defaultRankedAdsSyncDeps: RankedAdsSyncDeps = {
  syncFacebookAds,
  syncTikTokAds,
};

const DEFAULT_MAX_ADS_ACCOUNTS_TOTAL = 60;

function maxAdsAccountsTotal(): number {
  const raw = process.env.WEEKLY_SYNC_MAX_ADS_ACCOUNTS_TOTAL;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_ADS_ACCOUNTS_TOTAL;
}

// Walks one product line's already-deduped, ranked target list for one ads
// platform. A target already present in `cache` for this platform (synced
// during an earlier product line's walk in the same run) is never
// re-synced — its cached result is reused. A not-yet-cached target is
// real-synced UNLESS the global per-run cap (`totalRealSynced`, shared
// across every platform/product-line walk in the run) has already been
// reached for a brand-new account id — in that case it's skipped entirely
// (not synced, not counted toward this line's goal), never erroring. An
// account already counted in `totalRealSynced` (e.g. real-synced for the
// other platform earlier this run) can still proceed past the cap: the cap
// bounds distinct accounts touched this run, not calls per account. The
// walk stops once `targetsWithAdsGoal` targets have yielded at least one ad
// (adsSeen > 0), or the ranked list is exhausted — no cap on how far down
// it walks otherwise.
// One account/platform's Apify call throwing (a hard quota limit, a dead
// actor, etc.) used to abort the entire ranked walk — every remaining
// target for every remaining product line, plus everything after syncAds
// in runWeeklySync (content/trending/hashtags) never even ran. Caught here
// instead: the failure is real and worth surfacing (recordSystemNotice —
// best-effort, must never itself throw over the original error), but it
// shouldn't stop the walk from moving on to the next target.
// A platform-wide outage (e.g. an exhausted monthly Apify quota) fails
// identically for every remaining target — notifiedPlatforms caps this at
// one notice per platform per run instead of one per target, so a run with
// 40 remaining targets doesn't flood the dismissible-toast list with 40
// near-duplicate copies of the same underlying failure.
async function errorResult(
  platform: AdsPlatform,
  target: SyncTarget,
  err: unknown,
  notifiedPlatforms: Set<AdsPlatform>
): Promise<SyncResult> {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[weekly-sync] ${platform} sync failed for ${target.name}:`, err);
  if (!notifiedPlatforms.has(platform)) {
    notifiedPlatforms.add(platform);
    await recordSystemNotice(
      "weekly-sync",
      `${platform} sync failed for ${target.name}: ${message}`
    ).catch((noticeErr) => console.error("[weekly-sync] failed to record system notice:", noticeErr));
  }
  return { platformId: platform, adsSeen: 0, markedInactive: 0, errors: [message] };
}

export async function walkRankedTargets(
  rankedTargets: SyncTarget[],
  platform: AdsPlatform,
  maxItemsPerTarget: number,
  targetsWithAdsGoal: number,
  cache: Map<string, RankedAdsCacheEntry>,
  totalRealSynced: Set<string>,
  maxTotalAccounts: number,
  deps: RankedAdsSyncDeps = defaultRankedAdsSyncDeps,
  notifiedPlatforms: Set<AdsPlatform> = new Set()
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  let targetsWithAds = 0;

  for (const target of rankedTargets) {
    if (targetsWithAds >= targetsWithAdsGoal) break;

    const entry = cache.get(target.accountId) ?? {};
    const cached = platform === "facebook" ? entry.facebook : entry.tiktok ? [entry.tiktok] : undefined;

    let rows: SyncResult[];
    if (cached) {
      rows = cached;
    } else {
      const alreadyCountedAccount = totalRealSynced.has(target.accountId);
      if (!alreadyCountedAccount && totalRealSynced.size >= maxTotalAccounts) {
        // Global per-run cap hit and this is a brand-new account — skip
        // it rather than error; it doesn't count toward this line's goal.
        continue;
      }
      totalRealSynced.add(target.accountId);
      // This walk can otherwise run silent for many minutes (one real,
      // sequential Apify call per account, sometimes with a Gemini
      // analysis call on top) — a visible line per real call is the
      // difference between "still working" and "looks hung."
      console.log(`[weekly-sync] ads: syncing ${target.name} (${platform})...`);
      if (platform === "facebook") {
        try {
          rows = await deps.syncFacebookAds([target], maxItemsPerTarget);
        } catch (err) {
          rows = [await errorResult("facebook", target, err, notifiedPlatforms)];
        }
        entry.facebook = rows;
      } else {
        // scrapesage/tiktok-ad-library-scraper documents no result-count
        // cap in its input (only source/libraryRegions/advertiserName/
        // includeAdDetails) — deliberately NOT inventing a `maxItems`
        // field for it. A single-target call still forces
        // syncTikTokAds' existing `advertiserName: targets.length === 1
        // ? ... : undefined` branch into a real scoped search, so cost is
        // bounded by the "stop at N accounts with ads" rule and the total-
        // accounts cap above, just not a per-call item cap.
        let result: SyncResult;
        try {
          result = await deps.syncTikTokAds([target]);
        } catch (err) {
          result = await errorResult("tiktok", target, err, notifiedPlatforms);
        }
        rows = [result];
        entry.tiktok = result;
      }
      cache.set(target.accountId, entry);
    }

    results.push(...rows);
    const adsSeenTotal = rows.reduce((sum, r) => sum + r.adsSeen, 0);
    if (adsSeenTotal > 0) targetsWithAds++;
  }

  return results;
}

// Orchestrates the ranked ads walk across every product line (fixed config
// order, so runs are deterministic), returning combined Facebook/TikTok
// results. Before walking each product line's ranked list, runs
// dedupeFacebookTargets' regional-duplicate collapse over just that line's
// ranked subset first — the same real brand is sometimes stored as
// multiple regional rows (e.g. "Belkin" uk/eu/us), and without this each
// region would separately consume the line's targetsWithAdsGoal quota.
// Applied to both platforms' lists (not just Facebook's), since the
// regional-duplicate problem it solves is platform-agnostic even though
// the function itself is named for Facebook's page-id/name matching.
export async function syncRankedAdsForProductLines(
  accounts: CompetitorAccount[],
  opts: { maxItemsPerTarget?: number; targetsWithAdsGoal?: number } = {},
  deps: RankedAdsSyncDeps = defaultRankedAdsSyncDeps
): Promise<{ facebook: SyncResult[]; tiktok: SyncResult[] }> {
  const maxItemsPerTarget = opts.maxItemsPerTarget ?? FACEBOOK_MAX_ITEMS_PER_TARGET;
  const targetsWithAdsGoal = opts.targetsWithAdsGoal ?? 5;
  const maxTotalAccounts = maxAdsAccountsTotal();

  // Shared across every product line's walk (both platforms) in this run —
  // see walkRankedTargets/RankedAdsCacheEntry above.
  const cache = new Map<string, RankedAdsCacheEntry>();
  const totalRealSynced = new Set<string>();
  // Shared too, so a platform-wide outage only produces one notice across
  // the whole run, not one per product line — see errorResult.
  const notifiedPlatforms = new Set<AdsPlatform>();

  const facebookResults: SyncResult[] = [];
  const tiktokResults: SyncResult[] = [];

  for (const line of getPublicProductLines()) {
    const facebookRanked = rankAdsTargetsForProductLine(accounts, line.id, "facebook");
    const facebookTargets = dedupeFacebookTargets(facebookRanked);
    facebookResults.push(
      ...(await walkRankedTargets(
        facebookTargets,
        "facebook",
        maxItemsPerTarget,
        targetsWithAdsGoal,
        cache,
        totalRealSynced,
        maxTotalAccounts,
        deps,
        notifiedPlatforms
      ))
    );

    const tiktokRanked = rankAdsTargetsForProductLine(accounts, line.id, "tiktok");
    const tiktokTargets = dedupeFacebookTargets(tiktokRanked);
    tiktokResults.push(
      ...(await walkRankedTargets(
        tiktokTargets,
        "tiktok",
        maxItemsPerTarget,
        targetsWithAdsGoal,
        cache,
        totalRealSynced,
        maxTotalAccounts,
        deps,
        notifiedPlatforms
      ))
    );
  }

  return { facebook: facebookResults, tiktok: tiktokResults };
}

// On-demand refresh for exactly one ad whose cached creative has gone
// stale (missing local file AND its remote CDN URL has since expired) —
// used when a user tries to generate a static ad from it right now,
// rather than waiting for that account to come up again in a scheduled
// walk. A real, historical cause of this: an earlier attempt to mount
// verticalflash-volume onto a second service temporarily detached it from
// the main app (see .railway/railway.ts's comment) — some already-cached
// files from around that window never made it back. This can't recover
// those specific bytes, but re-running this exact ad's account through the
// normal sync path will pick up a live URL again if the platform still
// serves it, same as any other resync would.
export async function refreshAdCreative(ad: Ad): Promise<void> {
  if (!ad.accountId) throw new Error("This ad has no linked competitor account to refresh from");
  const account = await getCompetitor(ad.accountId);
  if (!account) throw new Error("This ad's competitor account no longer exists");

  const target: SyncTarget = {
    accountId: account.id,
    name: account.name,
    productLineId: account.productLineIds[0] ?? null,
    candidateProductLineIds: account.productLineIds,
    facebookPageIds: account.facebookPageIds,
  };

  if (ad.platformId === "tiktok") {
    await syncTikTokAds([target]);
  } else {
    await syncFacebookAds([target]);
  }
}
