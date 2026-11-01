-- 0004 · Crew builder (Option B, Nov 1): on-site workers and machines as their own rows, so the
-- Command Centre can work out what a site needs, propose the nearest on-duty people + free machines
-- as a crew, and send each worker their job. Run once in the Supabase SQL Editor. Re-runnable.

-- ---------------------------------------------------------------- workers (people on the ground)
create table if not exists workers (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references users (id) on delete set null,      -- their device / login (alerts go here)
  name             text not null,
  skill            text not null check (skill in ('supervisor', 'operator', 'driver', 'helper', 'marshal')),
  org              text not null,                                       -- "PWD Mandi", "BRO Project Deepak"
  district         text,
  base_name        text,                                                -- depot / sub-division they report to
  base_lat         double precision not null,
  base_lng         double precision not null,
  on_duty          boolean not null default false,                      -- "Start shift": location shared while on duty
  duty_lat         double precision,                                    -- last position while on duty (~100 m)
  duty_lng         double precision,
  duty_updated_at  timestamptz,
  crew_id          uuid references crews (id) on delete set null,       -- the crew they are in right now
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists workers_district_idx on workers (district, on_duty);
create index if not exists workers_crew_idx on workers (crew_id);
create unique index if not exists workers_user_idx on workers (user_id) where user_id is not null;

-- ---------------------------------------------------------------- machines (JCBs, tippers, …)
create table if not exists machines (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,                                     -- "JCB-07", "TIP-12"
  kind        text not null check (kind in ('backhoe', 'excavator', 'tipper', 'rock_breaker', 'dozer', 'snow_cutter', 'loader')),
  label       text not null,                                            -- "JCB 3DX backhoe"
  org         text not null,
  district    text,
  depot_name  text,
  lat         double precision not null,                                -- depot, or where it is working
  lng         double precision not null,
  available   boolean not null default true,
  crew_id     uuid references crews (id) on delete set null,
  is_demo     boolean not null default false
);
create index if not exists machines_district_idx on machines (district, available);

-- ---------------------------------------------------------------- crews: standing gangs or assembled per job
alter table crews add column if not exists kind            text not null default 'standing';
alter table crews add column if not exists status          text not null default 'idle';
alter table crews add column if not exists supervisor_id   uuid references workers (id) on delete set null;
alter table crews add column if not exists plan            jsonb;      -- needs + reasons + who/what was picked
alter table crews add column if not exists dispatched_at   timestamptz;
alter table crews add column if not exists acknowledged_at timestamptz; -- first worker opened the job
alter table crews add column if not exists arrived_at      timestamptz;
alter table crews add column if not exists done_at         timestamptz;
alter table crews add column if not exists created_at      timestamptz not null default now();
do $$ begin
  alter table crews add constraint crews_kind_chk check (kind in ('standing', 'assembled'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table crews add constraint crews_status_chk check (status in ('idle', 'proposed', 'dispatched', 'on_site', 'done'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- privacy
-- Worker names + positions are NOT public: no select policy → only the server (service role) reads them.
alter table workers  enable row level security;
alter table machines enable row level security;
