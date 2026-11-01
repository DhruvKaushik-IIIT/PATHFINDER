-- 0005_event_votes.sql — safe concurrent updates of road events (Nov 1).
-- Many cars can vote / pass / report on the same spot at the same moment. Two things make that safe:
--   1) events.rev: bumped by a trigger on EVERY update. Writers that read-modify-write `sources` /
--      `confidence` update with `rev=eq.<what they read>` and retry if someone else wrote first
--      (optimistic locking, src/lib/events/mutate.ts). No vote, pass or report count is lost.
--   2) event_votes: one row per (event, device, kind, 6-hour window). The primary key makes a
--      double-tap from one phone count once, even when the taps arrive at the same instant.
-- Run once in the Supabase SQL Editor. Safe to re-run.

alter table public.events add column if not exists rev bigint not null default 0;

create or replace function public.events_bump_rev() returns trigger
language plpgsql as $$
begin
  new.rev := coalesce(old.rev, 0) + 1;
  return new;
end $$;

drop trigger if exists events_bump_rev on public.events;
create trigger events_bump_rev
  before update on public.events
  for each row execute function public.events_bump_rev();

create table if not exists public.event_votes (
  event_id uuid        not null references public.events(id) on delete cascade,
  device   text        not null,                -- anonymous pf_uid of the phone
  kind     text        not null check (kind in ('tap', 'pass')),
  bucket   bigint      not null,                -- floor(epoch / 6 h): one vote per 6-hour window
  at       timestamptz not null default now(),
  is_demo  boolean     not null default false,
  primary key (event_id, device, kind, bucket)
);

-- Server (service role) only: no public policies.
alter table public.event_votes enable row level security;

-- The data version (src/lib/events/version.ts) reads the newest timeline row every ~1.5 s; keep it an index lookup.
create index if not exists event_timeline_at_idx on public.event_timeline (at desc);
