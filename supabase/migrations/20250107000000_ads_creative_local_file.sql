-- Locally-cached filename for a static-eligible ad's creative image (see
-- ads-media/ on the Railway volume) — the remote CDN URL (creative_url)
-- can go dead well before anything uses it, so eligible images get
-- downloaded once at sync time instead of re-fetched from the CDN later.
alter table ads add column if not exists creative_local_file text;
