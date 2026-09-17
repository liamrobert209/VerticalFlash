-- Static Ad Generator: flags which scraped ads have a genuine static-image
-- creative (eligible as a visual reference for generation) and stores the
-- automatic Gemini analysis (intent/USP/persona/product) run on them.

alter table ads add column if not exists is_static_eligible boolean not null default false;
alter table ads add column if not exists analysis jsonb;
alter table ads add column if not exists analyzed_at timestamptz;

create index if not exists idx_ads_is_static_eligible on ads(is_static_eligible);
