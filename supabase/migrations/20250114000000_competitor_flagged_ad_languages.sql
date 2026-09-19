-- Accumulates distinct non-English language codes (ISO 639-3, via franc)
-- observed among a competitor's skipped ad sightings — see
-- language-detect.ts's detectAdLanguage and weekly-ads-sync.ts's
-- recordFlaggedAdLanguage. Purely additive/observational at write time;
-- read by rankAdsTargetsForProductLine (competitor-ranking.ts) to exclude
-- a flagged competitor from the automated/ranked cron ad sync, and by
-- CompetitorsBoard.tsx to surface a visibility badge.
alter table competitor_accounts add column if not exists flagged_ad_languages text[] not null default '{}';
