-- Background-job/system-level failures (e.g. a weekly-sync crash) that a
-- user should be told about even though no one was looking at a page tied
-- to that action when it happened — surfaced as dismissible toasts (see
-- SystemNoticesToaster.tsx) rather than only living in server logs.
create table if not exists system_notices (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  message text not null,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz
);

create index if not exists system_notices_undismissed_idx
  on system_notices (created_at desc)
  where dismissed_at is null;
