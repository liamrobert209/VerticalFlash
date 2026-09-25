-- brand_assets had zero indexes despite every real query (getLatestLogo,
-- getAdExamplesByStyleTemplate, getShieldUsageExamples, getLatestColorPalette,
-- getFullColorPalette, listBrandAssets' own kind filters in the settings
-- API) filtering by kind first — each was a full table scan. Harmless at
-- today's row count, but avoidable regardless.
create index if not exists idx_brand_assets_kind on brand_assets(kind);
