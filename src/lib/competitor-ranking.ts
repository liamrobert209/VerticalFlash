// Pure ranking helpers for the cron's ranked target selection (see the
// "Ranked cron target selection" plan) — no DB/Apify imports, so these are
// fully unit-testable against plain CompetitorAccount[] fixtures. The
// manual /weekly-ads and /weekly-content sync buttons (a human picking
// specific accounts) never call these; only scripts/weekly-sync.ts does.
import type { CompetitorAccount } from "./competitor-schema";

export type ContentPlatform = "instagram" | "tiktok";
export type AdsPlatform = "facebook" | "tiktok";

// Top `limit` accounts that have a handle for `platform`, sorted desc by
// that platform's own follower count (null treated as 0 — an account with
// an unpopulated follower count still gets a chance, ranked last among its
// peers rather than excluded). Flat — no brand/creator split: `accountType`
// is ignored entirely, to keep Apify cost down. This accepts that Weekly
// Creators may end up sparse/empty as a known, accepted tradeoff.
export function rankContentTargets(
  accounts: CompetitorAccount[],
  platform: ContentPlatform,
  limit: number
): CompetitorAccount[] {
  const handleOf = (a: CompetitorAccount) =>
    platform === "instagram" ? a.instagramHandle : a.tiktokHandle;
  const followersOf = (a: CompetitorAccount) =>
    (platform === "instagram" ? a.instagramFollowers : a.tiktokFollowers) ?? 0;

  return accounts
    .filter((a) => !!handleOf(a))
    .sort((a, b) => followersOf(b) - followersOf(a))
    .slice(0, limit);
}

// Every competitor linked to `productLineId`, sorted desc by a follower
// proxy — Facebook/TikTok follower counts are far less consistently
// populated than Instagram's, so each platform falls back to Instagram's
// count (then 0) when its own is null. No limit/slice: the cron walks as
// far down this list as it needs to find enough active advertisers.
//
// Excludes any account with a non-empty flaggedAdLanguages (see
// weekly-ads-sync.ts's recordFlaggedAdLanguage) — a competitor whose ads
// keep getting skipped for language would otherwise burn an Apify call
// every run for nothing. This is ranked-selection-only: a manually
// triggered sync (a human explicitly picking the account, who can see the
// flagged-language badge first) still works normally.
export function rankAdsTargetsForProductLine(
  accounts: CompetitorAccount[],
  productLineId: string,
  platform: AdsPlatform
): CompetitorAccount[] {
  const followerProxy = (a: CompetitorAccount) =>
    platform === "facebook"
      ? (a.facebookFollowers ?? a.instagramFollowers ?? 0)
      : (a.tiktokFollowers ?? a.instagramFollowers ?? 0);

  return accounts
    .filter((a) => a.productLineIds.includes(productLineId) && a.flaggedAdLanguages.length === 0)
    .sort((a, b) => followerProxy(b) - followerProxy(a));
}
