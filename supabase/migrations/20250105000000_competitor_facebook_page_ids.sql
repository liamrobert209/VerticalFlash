-- Facebook Ad Library matching was exact-page-name-only, which misses a
-- brand's regional Facebook Pages (e.g. "Barner Brand KW" vs the saved
-- account name "Barner") since each region is a genuinely distinct Page
-- with its own id, not the same Page under a different display name.
-- Page ids are stable and exact regardless of display name, so a
-- competitor can now carry a set of known page ids matched first, with
-- name-matching staying as the fallback for pages not yet recorded here.
alter table competitor_accounts add column if not exists facebook_page_ids text[] not null default '{}';
