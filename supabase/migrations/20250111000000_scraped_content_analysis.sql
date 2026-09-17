-- Weekly Content sync: automatic Gemini analysis (topic/pain point/
-- solution/product/tags) run once per scraped organic post, mirroring
-- ads.analysis/analyzed_at from 20250103000000_static_ads.sql. `format` is
-- a plain column, not part of the jsonb, since it's derived deterministically
-- from each platform's own media-type field (see content-sync.ts), not by
-- Gemini.
alter table scraped_content add column if not exists analysis jsonb;
alter table scraped_content add column if not exists analyzed_at timestamptz;
alter table scraped_content add column if not exists format text;

create index if not exists idx_scraped_content_analyzed_at on scraped_content(analyzed_at);
