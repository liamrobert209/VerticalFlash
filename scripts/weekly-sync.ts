/**
 * Weekly automated sync — runs on a Railway cron schedule (see
 * .railway/railway.ts's `weeklySync` service). Refreshes every
 * weekly-digest data source with a working sync path: Weekly Ads / Weekly
 * Static Ads / Ad Insights category pages and Weekly Content / Weekly
 * Creators (via the shared `ads`/`scraped_content` tables), Weekly
 * Trending Content, and Search by Hashtag.
 *
 * Ads and content targets are both a RANKED, cost-bounded selection, not
 * "sync everything on file":
 *   - Ads: per product line, walk that line's competitors ranked by
 *     follower count (facebook/tiktok) until 5 have yielded at least one ad
 *     or the list is exhausted — see syncRankedAdsForProductLines
 *     (weekly-ads-sync.ts). Capped overall by WEEKLY_SYNC_MAX_ADS_ACCOUNTS_TOTAL
 *     (default 60 distinct accounts across the whole run).
 *   - Content: a flat top 5 accounts per channel (Instagram, TikTok),
 *     ranked by that channel's own follower count, NO brand/creator split
 *     (a deliberate cost decision — Weekly Creators may end up sparse as a
 *     result) — see rankContentTargets (competitor-ranking.ts).
 *
 * Usage:
 *   node --import tsx scripts/weekly-sync.ts              # real run
 *   node --import tsx scripts/weekly-sync.ts --dry-run    # log targets, no Apify calls
 *
 * Optional per-run caps (unset = default, see above) — set these as
 * Railway env vars on the weekly-sync service to bound cost/volume without
 * touching code:
 *   WEEKLY_SYNC_MAX_ADS_ACCOUNTS_TOTAL  e.g. "60" (see weekly-ads-sync.ts)
 *   WEEKLY_SYNC_MAX_TRENDING_CATEGORIES e.g. "3"
 *   WEEKLY_SYNC_MAX_HASHTAGS           e.g. "50"
 *
 * Hashtags are also rotated 1/5th per weekday (Mon-Fri) rather than
 * running the full tracked list every day — see `todaysHashtagSlice`.
 * Pass --day=0..6 (0=Sunday) to force a specific day's slice, e.g. for
 * testing: `node --import tsx scripts/weekly-sync.ts --dry-run --day=1`.
 */
import { listCompetitors } from "../src/lib/competitor-store";
import { syncRankedAdsForProductLines } from "../src/lib/weekly-ads-sync";
import { rankAdsTargetsForProductLine, rankContentTargets } from "../src/lib/competitor-ranking";
import { syncInstagramContent, syncTikTokContent, type ContentSyncTarget } from "../src/lib/content-sync";
import { getPublicProductLines } from "../src/lib/config";
import type { CompetitorAccount } from "../src/lib/competitor-schema";
import { syncTrendingVideos } from "../src/lib/tiktok-trends-sync";
import { TIKTOK_TREND_INDUSTRIES } from "../src/lib/tiktok-trends-schema";
import { syncHashtagVideos } from "../src/lib/tiktok-hashtag-sync";

const DRY_RUN = process.argv.includes("--dry-run");

function envLimit(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

// Applies a cap (if set) and logs what got dropped — no silent truncation,
// since a capped run should read as "capped", not "this is everything."
function applyLimit<T>(items: T[], limit: number | undefined, envVarName: string): T[] {
  if (limit == null || items.length <= limit) return items;
  console.log(`[weekly-sync] capped to ${limit} of ${items.length} (${envVarName} is set)`);
  return items.slice(0, limit);
}

const HASHTAG_ROTATION_DAYS = 5;

function dayOverride(): number | undefined {
  const arg = process.argv.find((a) => a.startsWith("--day="));
  if (!arg) return undefined;
  const n = Number(arg.split("=")[1]);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : undefined;
}

// The hashtag scraper is the single most expensive piece of this run
// ($5/1,000 results — see the cost breakdown that motivated this) — at
// full volume every weekday that's ~5x the cost of running it once a
// week. Splitting the tracked list into 5 slices and running one slice
// per weekday keeps the DAILY cost down to ~1/5th while still covering
// every tracked hashtag once per work week. Rotation is keyed off the
// UTC day-of-week (0=Sunday..6=Saturday) — Mon-Fri map to slices 0-4;
// a weekend/manual run falls back to Friday's slice rather than throwing.
function todaysHashtagSlice(all: string[]): string[] {
  const chunkSize = Math.ceil(all.length / HASHTAG_ROTATION_DAYS);
  const dayOfWeek = dayOverride() ?? new Date().getUTCDay();
  const mondayIndexed = dayOfWeek >= 1 && dayOfWeek <= 5 ? dayOfWeek - 1 : HASHTAG_ROTATION_DAYS - 1;
  const start = mondayIndexed * chunkSize;
  return all.slice(start, start + chunkSize);
}

// --- Tracked hashtags (Ocushield marketing categories, Sept 2026) --------
// One flat list per category for readability/maintenance; deduped at
// runtime (`uniqueHashtags` below) since the same tag appears in more than
// one category and each hashtag should only be searched once per run.
const HASHTAG_CATEGORIES: Record<string, string[]> = {
  "Brand-wide": [
    "Ocushield", "EyeHealth", "DigitalWellness", "SleepHealth", "HealthyScreenTime",
    "WellnessTechnology", "HealthTech", "EverydayWellness", "ScreenTime", "HealthyHabits",
    "EyeCare", "BetterSleep", "WellnessRoutine", "Biohacking",
  ],
  "Medical and expert credibility": [
    "OptometristDeveloped", "MedicallyRegistered", "MedicallyRated", "EyeCareExpert",
    "EyeHealthEducation", "EvidenceBasedWellness", "WellnessScience", "ExpertExplains",
    "HealthEducation", "MythVsFact",
  ],
  "Blue-light glasses": [
    "BlueLightGlasses", "ComputerGlasses", "DigitalEyeStrain", "EyeStrainRelief", "TiredEyes",
    "ScreenFatigue", "ScreenWorker", "MigraineRelief", "HeadacheRelief", "LightSensitivity",
    "LongWorkday", "StudentWellness", "OfficeWellness", "EveningRoutine", "BetterSleep",
    "CircadianRhythm", "StylishEyewear", "WorkdayWellness", "WorkFromHomeEssentials", "Ocushield",
  ],
  "iPhone screen protectors": [
    "BlueLightFilter", "ScreenProtector", "iPhoneScreenProtector", "iPhoneAccessories",
    "iPhoneTips", "NewPhoneSetup", "PhoneProtection", "TemperedGlass", "ProtectYourPhone",
    "DigitalEyeStrain", "TiredEyes", "ScreenTime", "HealthyScreenTime", "NighttimeScrolling",
    "PhoneBeforeBed", "BedtimeRoutine", "BetterSleep", "PrivacyScreen", "PhonePrivacy",
    "PrivacyProtector", "DigitalPrivacy", "BlueLightSkincare", "ScreenSkin", "BeautyTech", "Ocushield",
  ],
  "iPad screen filters": [
    "iPadTips", "iPadAccessories", "TabletAccessories", "DigitalReading", "TabletReader",
    "ReadingInBed", "BedtimeReading", "HealthyAging", "EyeHealthOver50", "SeniorWellness",
    "MatureWellness", "TiredEyes", "DryEyes", "DigitalEyeStrain", "HealthyScreenTime",
    "FamilyScreenTime", "Grandparents", "KidsScreenTime", "Ocushield",
  ],
  "Laptop and MacBook filters": [
    "DigitalEyeStrain", "ScreenFatigue", "RemoteWorker", "RemoteWork", "HybridWork",
    "WorkFromHome", "WorkFromHomeHealth", "HomeOfficeEssentials", "DeskSetup", "WorkspaceSetup",
    "LaptopAccessories", "MacBookAccessories", "MacBookTips", "WorkdayWellness", "FullShift",
    "LongWorkday", "WorkplaceHealth", "EmployeeWellbeing", "OccupationalHealth", "MigraineAtWork",
    "ProductivityTips", "BlueLightSkincare", "ScreenSkin", "MelasmaCare", "Hyperpigmentation", "Ocushield",
  ],
  "Monitor and desktop filters": [
    "MonitorSetup", "DesktopSetup", "OfficeSetup", "OfficeEyeStrain", "DigitalEyeStrain",
    "ScreenFatigue", "LongWorkday", "WorkplaceWellness", "OfficeWellness", "EmployeeWellbeing",
    "OccupationalHealth", "HealthyWorkplace", "PrivacyScreen", "ScreenPrivacy", "OfficePrivacy",
    "DeskPrivacy", "VisualHacking", "DataPrivacy", "WorkplaceSecurity", "ClientConfidentiality",
    "OpenOffice", "HybridWork", "Ocushield",
  ],
  "Weighted sleep mask": [
    "SleepMask", "WeightedEyeMask", "BetterSleep", "SleepRoutine", "BedtimeRoutine",
    "NightRoutine", "SleepTok", "SleepTips", "SleepHacks", "SleepMaxxing", "DeepSleep",
    "BlackoutSleep", "NightShiftLife", "DaytimeSleep", "TravelEssentials", "TravelWellness",
    "MigraineRoutine", "LightSensitivity", "SelfCareRoutine", "Ocushield",
  ],
  "Red-light therapy and Ocuglow": [
    "RedLightTherapy", "RedLightMask", "LEDMask", "LEDLightTherapy", "BeautyTech",
    "AtHomeSkincare", "SkincareRoutine", "NighttimeSkincare", "RedLightSkincare", "GlowingSkin",
    "SkinRejuvenation", "MatureSkin", "SkinAgeing", "FineLines", "SkinTone", "AgeWell",
    "BeautyOver40", "SkincareOver40", "WellnessRoutine", "EveningWellness", "RedLightScience",
    "SkincareScience", "EvidenceBasedSkincare", "Ocuglow",
  ],
  "Heated eye masks and dry-eye products": [
    "DryEyeRelief", "DryEyeRoutine", "DryEyeAwareness", "HeatedEyeMask", "WarmEyeCompress",
    "EyeCompress", "EyeCareRoutine", "TiredEyes", "ScreenRecovery", "EyeWellness",
    "EveningRoutine", "SelfCareRoutine", "Ocushield",
  ],
  "Ocubulb and Oculamp": [
    "SleepLighting", "LowBlueLight", "BlueLightFree", "CircadianRhythm", "HealthyLighting",
    "EveningRoutine", "WindDownRoutine", "BedtimeRoutine", "SleepEnvironment", "SleepHygiene",
    "BedroomLighting", "AmbientLighting", "CalmLighting", "RelaxingHome", "SleepFriendlyHome",
    "HomeWellness", "MigraineFriendlyHome", "LightSensitivity", "ReadingAtNight", "Ocushield",
  ],
  "EMF protection": [
    "EMFProtection", "EMFAwareness", "PhoneRadiation", "DigitalWellness", "HealthyTechnology",
    "TechWellness", "SaferTechnology", "PhoneSafety", "HealthyHome", "FamilyWellness",
    "WellnessTechnology", "EverydayProtection", "ScreenTime", "Ocushield",
  ],
  "Children and family": [
    "HealthyScreenTime", "KidsScreenTime", "KidsEyeHealth", "DigitalParenting", "ParentingTips",
    "HealthyScreenHabits", "FamilyWellness", "FamilyScreenTime", "OnlineLearning",
    "HomeworkSetup", "SchoolEssentials", "ParentingHacks", "TechHealthyFamily", "Ocushield",
  ],
  "B2B and workplace wellness": [
    "WorkplaceWellness", "EmployeeWellbeing", "EmployeeHealth", "OfficeWellness",
    "CorporateWellness", "HealthyWorkplace", "WorkplaceHealth", "OccupationalHealth",
    "FutureOfWork", "HybridWork", "RemoteWork", "PeopleAndCulture", "HRLeadership",
    "WorkplaceSecurity", "OfficePrivacy", "Ocushield",
  ],
};

function uniqueHashtags(): string[] {
  const seen = new Set<string>();
  for (const tags of Object.values(HASHTAG_CATEGORIES)) {
    for (const tag of tags) seen.add(tag.toLowerCase());
  }
  return Array.from(seen);
}

// Every competitor linked to product line, ranked by follower count, is
// walked (up to 5 per line per platform yielding at least one ad, or
// exhausted) inside syncRankedAdsForProductLines — regional-duplicate
// collapsing (e.g. "Belkin" uk/eu/us) happens there too, per product line's
// ranked subset, via dedupeFacebookTargets (weekly-ads-sync.ts).
async function syncAds() {
  const accounts = await listCompetitors({});
  console.log(`[weekly-sync] ads: ${accounts.length} competitor account rows on file`);

  if (DRY_RUN) {
    // Ranking is pure/free — log what each product line's walk WOULD
    // consider without making any real Apify calls.
    for (const line of getPublicProductLines()) {
      const facebook = rankAdsTargetsForProductLine(accounts, line.id, "facebook");
      const tiktok = rankAdsTargetsForProductLine(accounts, line.id, "tiktok");
      console.log(
        `[weekly-sync] ads: "${line.label}" — facebook ${facebook.length} ranked candidates, tiktok ${tiktok.length} ranked candidates (walking up to 5 with ads)`
      );
    }
    return;
  }

  // maxItemsPerTarget intentionally left at its default (30, the same as
  // the manual sync button) rather than capped down for cost — Facebook is
  // the cheapest actor by far ($0.30/1,000), so there's no real cost
  // reason to shrink it, and doing so previously caused a real bug: any
  // account with more real active ads than the cap would have the excess
  // wrongly marked inactive by the old "wasn't seen this sync" pass (now
  // removed anyway — see recordAdSighting's comment). Cost is controlled
  // by how many ACCOUNTS get walked (targetsWithAdsGoal /
  // WEEKLY_SYNC_MAX_ADS_ACCOUNTS_TOTAL), not by shrinking each one's
  // result set.
  const { facebook, tiktok } = await syncRankedAdsForProductLines(accounts, {
    targetsWithAdsGoal: 5,
  });

  const facebookAdsSeen = facebook.reduce((sum, r) => sum + r.adsSeen, 0);
  const facebookErrors = facebook.flatMap((r) => r.errors);
  console.log(`[weekly-sync] ads: facebook done — ${facebookAdsSeen} ads seen, ${facebookErrors.length} errors`);
  if (facebookErrors.length) console.log(facebookErrors.slice(0, 20).join("\n"));

  const tiktokAdsSeen = tiktok.reduce((sum, r) => sum + r.adsSeen, 0);
  const tiktokErrors = tiktok.flatMap((r) => r.errors);
  console.log(`[weekly-sync] ads: tiktok done — ${tiktokAdsSeen} ads seen, ${tiktokErrors.length} errors`);
  if (tiktokErrors.length) console.log(tiktokErrors.slice(0, 20).join("\n"));
}

function toContentSyncTarget(account: CompetitorAccount): ContentSyncTarget {
  return {
    accountId: account.id,
    name: account.name,
    instagramHandle: account.instagramHandle,
    tiktokHandle: account.tiktokHandle,
    productLineId: account.productLineIds[0] ?? null,
    candidateProductLineIds: account.productLineIds,
  };
}

// Flat top 5 accounts per channel, no brand/creator split — a deliberate
// cost decision (confirmed): Weekly Creators may end up sparse/empty as a
// known, accepted tradeoff rather than doubling Apify spend with a
// brand+creator split like the ads side doesn't need (ads walk by product
// line, not a flat top-N).
async function syncContent() {
  const accounts = await listCompetitors({});
  const instagramTargets = rankContentTargets(accounts, "instagram", 5).map(toContentSyncTarget);
  const tiktokTargets = rankContentTargets(accounts, "tiktok", 5).map(toContentSyncTarget);
  console.log(
    `[weekly-sync] content: instagram ${instagramTargets.length} accounts, tiktok ${tiktokTargets.length} accounts (flat top 5 per channel, no brand/creator split)`
  );
  if (DRY_RUN) return;

  const igResults = await syncInstagramContent(instagramTargets);
  const igContentSeen = igResults.reduce((sum, r) => sum + r.contentSeen, 0);
  const igErrors = igResults.flatMap((r) => r.errors);
  console.log(`[weekly-sync] content: instagram done — ${igContentSeen} posts seen, ${igErrors.length} errors`);
  if (igErrors.length) console.log(igErrors.slice(0, 20).join("\n"));

  const ttResult = await syncTikTokContent(tiktokTargets);
  console.log(`[weekly-sync] content: tiktok done — ${ttResult.contentSeen} posts seen, ${ttResult.errors.length} errors`);
  if (ttResult.errors.length) console.log(ttResult.errors.slice(0, 20).join("\n"));
}

// Top 10 videos per TikTok content-tag category, US / 7-day window — a
// deliberately modest default (single country, single period) rather than
// the full 5-country x 6-category matrix; easy to widen later by looping
// TIKTOK_TREND_VIDEO_COUNTRIES too.
async function syncTrending() {
  const categories = applyLimit(
    [...TIKTOK_TREND_INDUSTRIES],
    envLimit("WEEKLY_SYNC_MAX_TRENDING_CATEGORIES"),
    "WEEKLY_SYNC_MAX_TRENDING_CATEGORIES"
  );
  console.log(`[weekly-sync] trending: ${categories.length} categories, US, 7-day, top 10`);
  if (DRY_RUN) return;
  for (const industry of categories) {
    try {
      const result = await syncTrendingVideos({
        industry: industry.id,
        country: "US",
        period: "7",
        organicOnly: false,
        maxItems: 10,
      });
      console.log(
        `[weekly-sync] trending "${industry.label}": ${result.videosSeen} videos, ${result.errors.length} errors`
      );
      if (result.errors.length) console.log(result.errors.slice(0, 5).join("\n"));
    } catch (err) {
      console.error(`[weekly-sync] trending "${industry.label}" failed:`, err);
    }
  }
}

async function syncHashtags() {
  const allHashtags = uniqueHashtags();
  const todaysSlice = todaysHashtagSlice(allHashtags);
  console.log(
    `[weekly-sync] hashtags: ${allHashtags.length} unique tags total across ${Object.keys(HASHTAG_CATEGORIES).length} categories — today's slice: ${todaysSlice.length}`
  );
  const hashtags = applyLimit(todaysSlice, envLimit("WEEKLY_SYNC_MAX_HASHTAGS"), "WEEKLY_SYNC_MAX_HASHTAGS");
  if (DRY_RUN) return;
  for (const hashtag of hashtags) {
    try {
      const result = await syncHashtagVideos({ hashtag, maxItems: 20 });
      console.log(`[weekly-sync] hashtag #${hashtag}: ${result.videosSeen} videos, ${result.errors.length} errors`);
      if (result.errors.length) console.log(result.errors.slice(0, 5).join("\n"));
    } catch (err) {
      console.error(`[weekly-sync] hashtag #${hashtag} failed:`, err);
    }
  }
}

async function main() {
  const startedAt = Date.now();
  console.log(`[weekly-sync] starting${DRY_RUN ? " (dry run)" : ""} at ${new Date().toISOString()}`);

  await syncAds();
  await syncContent();
  await syncTrending();
  await syncHashtags();

  console.log(`[weekly-sync] finished in ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

main().catch((err) => {
  console.error("[weekly-sync] fatal error:", err);
  process.exit(1);
});
