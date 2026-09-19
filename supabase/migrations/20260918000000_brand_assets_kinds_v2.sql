-- Round 2 of Brand Assets expansion, driven by the brand guidelines PDF
-- extraction work: split the flat "color_palette" kind into primary/
-- secondary (creative-engine consumers need to address each palette
-- unambiguously, not parse a positional array), and add "illustration" +
-- "typography" kinds. Typography entries are tagged by use case
-- (headlines/body copy/etc.) via a new column.
alter table brand_assets add column if not exists use_case text;

-- Existing color_palette rows didn't distinguish primary/secondary —
-- default them to primary rather than orphaning them against the new
-- constraint below.
update brand_assets set kind = 'color_palette_primary' where kind = 'color_palette';

alter table brand_assets drop constraint if exists brand_assets_kind_check;
alter table brand_assets add constraint brand_assets_kind_check
  check (kind in (
    'guideline','logo','illustration','typography',
    'color_palette_primary','color_palette_secondary',
    'website','social_example','ad_example','product_image',
    'icp_source','competitor_source'
  ));
