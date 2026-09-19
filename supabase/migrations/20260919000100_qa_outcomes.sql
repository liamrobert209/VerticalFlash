-- Phase 13: persists every QA check run against a static ad (product
-- placement, person placement, and the finish-time Brand QA gate) so
-- pass/fail patterns can be analyzed over time instead of only being
-- visible transiently in a single project.json's attempts array.
create table if not exists qa_outcomes (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  attempt integer,
  kind text not null check (kind in ('product_placement', 'person_placement', 'brand_qa')),
  passed boolean not null,
  issues text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists qa_outcomes_kind_created_at_idx on qa_outcomes (kind, created_at desc);
create index if not exists qa_outcomes_project_id_idx on qa_outcomes (project_id);
