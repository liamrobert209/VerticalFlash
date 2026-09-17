/**
 * Weekly automated sync — runs on a Railway cron schedule (see
 * .railway/railway.ts's `weeklySync` service). Refreshes the three
 * weekly-digest data sources that already have a working sync path:
 * Weekly Ads / Weekly Static Ads / Ad Insights category pages (via the
 * shared `ads` table), Weekly Trending Content, and Search by Hashtag.
 * Weekly Content / Weekly Creators are NOT included — there is no scraper
 * wired up for `scraped_content` yet (a separate, larger project).
 *
 * Usage:
 *   node --import tsx scripts/weekly-sync.ts              # real run
 *   node --import tsx scripts/weekly-sync.ts --dry-run    # log targets, no Apify calls
 */
import { listCompetitors } from "../src/lib/competitor-store";
import { syncFacebookAds, syncTikTokAds, type SyncTarget } from "../src/lib/weekly-ads-sync";
import type { CompetitorAccount } from "../src/lib/competitor-schema";
import { syncTrendingVideos } from "../src/lib/tiktok-trends-sync";
import { TIKTOK_TREND_INDUSTRIES } from "../src/lib/tiktok-trends-schema";
import { syncHashtagVideos } from "../src/lib/tiktok-hashtag-sync";

const DRY_RUN = process.argv.includes("--dry-run");

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

function toSyncTarget(account: CompetitorAccount): SyncTarget {
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
// identical duplicate Ad Library searches. Dedupe to one representative
// row per distinct name, preferring a row that already has a known
// facebookPageIds match (seeded by the page-id auto-capture logic in
// weekly-ads-sync.ts) over an arbitrary regional row.
function dedupeFacebookTargets(accounts: CompetitorAccount[]): SyncTarget[] {
  const byName = new Map<string, CompetitorAccount>();
  for (const account of accounts) {
    const key = account.name.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing || (account.facebookPageIds.length > 0 && existing.facebookPageIds.length === 0)) {
      byName.set(key, account);
    }
  }
  return Array.from(byName.values()).map(toSyncTarget);
}

async function syncAds() {
  const accounts = await listCompetitors({});
  console.log(`[weekly-sync] ads: ${accounts.length} competitor account rows on file`);

  const facebookTargets = dedupeFacebookTargets(accounts);
  console.log(
    `[weekly-sync] ads: facebook — ${facebookTargets.length} deduped targets (from ${accounts.length} rows)`
  );
  if (!DRY_RUN) {
    const results = await syncFacebookAds(facebookTargets);
    const adsSeen = results.reduce((sum, r) => sum + r.adsSeen, 0);
    const errors = results.flatMap((r) => r.errors);
    console.log(`[weekly-sync] ads: facebook done — ${adsSeen} ads seen, ${errors.length} errors`);
    if (errors.length) console.log(errors.slice(0, 20).join("\n"));
  }

  const tiktokTargets = accounts.filter((a) => a.tiktokHandle).map(toSyncTarget);
  console.log(`[weekly-sync] ads: tiktok — ${tiktokTargets.length} accounts with a handle`);
  if (!DRY_RUN && tiktokTargets.length > 0) {
    const result = await syncTikTokAds(tiktokTargets);
    console.log(`[weekly-sync] ads: tiktok done — ${result.adsSeen} ads seen, ${result.errors.length} errors`);
    if (result.errors.length) console.log(result.errors.slice(0, 20).join("\n"));
  }
}

// Top 10 videos per TikTok content-tag category, US / 7-day window — a
// deliberately modest default (single country, single period) rather than
// the full 5-country x 6-category matrix; easy to widen later by looping
// TIKTOK_TREND_VIDEO_COUNTRIES too.
async function syncTrending() {
  console.log(`[weekly-sync] trending: ${TIKTOK_TREND_INDUSTRIES.length} categories, US, 7-day, top 10`);
  if (DRY_RUN) return;
  for (const industry of TIKTOK_TREND_INDUSTRIES) {
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
  const hashtags = uniqueHashtags();
  console.log(
    `[weekly-sync] hashtags: ${hashtags.length} unique tags across ${Object.keys(HASHTAG_CATEGORIES).length} categories`
  );
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
  await syncTrending();
  await syncHashtags();

  console.log(`[weekly-sync] finished in ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

main().catch((err) => {
  console.error("[weekly-sync] fatal error:", err);
  process.exit(1);
});
