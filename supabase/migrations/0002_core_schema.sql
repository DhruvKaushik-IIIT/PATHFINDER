-- Phase 1: full data model (CLAUDE.md section 8) + RLS basics + photo storage buckets.
-- Idempotent: safe to paste into the Supabase SQL Editor more than once.
-- Server code writes with the service role (bypasses RLS); RLS below governs the anon/auth keys.
create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- people

create table if not exists users (
  id                uuid primary key default gen_random_uuid(),
  auth_user_id      uuid unique,                 -- auth.users.id for officials/crews (Phase 4); null for anonymous reporters
  display_name      text,
  role              text not null default 'public' check (role in ('public', 'official', 'crew', 'admin')),
  org               text,
  district          text,
  scout_opt_in      boolean not null default false,
  location_mode     text not null default 'off' check (location_mode in ('off', 'while_using', 'always')),
  coarse_lat        double precision,            -- ~1 km precision only, never a history
  coarse_lng        double precision,
  coarse_updated_at timestamptz,
  speed_kmh         double precision,
  points            integer not null default 0,
  created_at        timestamptz not null default now(),
  is_demo           boolean not null default false
);

-- ---------------------------------------------------------------- reports → claims → events

create table if not exists events (
  id                uuid primary key default gen_random_uuid(),
  segment_id        text references road_segments (id),
  type              text not null check (type in ('landslide', 'snow', 'ice', 'flood_water', 'road_damage', 'pothole',
                                                  'traffic', 'accident', 'closure_notice', 'clear', 'other')),
  status            text not null default 'unknown' check (status in ('open', 'slow', 'one_lane', 'closed', 'unknown')),
  place_name        text,
  lat               double precision not null,
  lng               double precision not null,
  geom              geometry(Point, 4326) generated always as (st_setsrid(st_makepoint(lng, lat), 4326)) stored,
  passable          jsonb not null default '{"bike": null, "car": null, "bus": null}',
  measurements      jsonb not null default '{}',
  eta_clear         jsonb,                       -- {earliest, latest} ISO
  summary           text,
  summary_hi        text,
  confidence        double precision not null default 0 check (confidence between 0 and 1),
  started_at        timestamptz not null default now(),
  last_confirmed_at timestamptz not null default now(),
  resolved_at       timestamptz,
  sources           jsonb not null default '{"reports": 0, "official": 0, "news": 0, "notices": 0}',
  models_agreed     integer,
  is_demo           boolean not null default false
);
create index if not exists events_geom_idx on events using gist (geom);
create index if not exists events_segment_idx on events (segment_id) where resolved_at is null;

create table if not exists reports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references users (id) on delete set null,
  segment_id      text references road_segments (id),
  event_id        uuid references events (id) on delete set null,
  lat             double precision not null,
  lng             double precision not null,
  created_at      timestamptz not null default now(),
  media_type      text not null default 'photo' check (media_type in ('photo', 'video', 'voice', 'text')),
  text            text,
  voice_url       text,                          -- storage path (private bucket)
  transcript      text,
  transcript_lang text,
  status          text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  points_awarded  integer not null default 0,
  is_demo         boolean not null default false
);
create index if not exists reports_segment_idx on reports (segment_id, created_at desc);

create table if not exists photos (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid references reports (id) on delete cascade,
  event_id      uuid references events (id) on delete set null,
  sha256        text unique,                     -- of the EXIF-stripped JPEG → never re-run AI on the same photo
  original_url  text,                            -- storage path in the PRIVATE bucket (not a public URL)
  public_url    text,                            -- faces + plates blurred; null if privacy pass could not run
  annotated_url text,                            -- Phase 1 Part C (drawn by code next to the original)
  width         integer,
  height        integer,
  sam_masks     jsonb,                           -- boxes + bounds per concept (raw masks not stored)
  measurements  jsonb,
  faces_blurred boolean not null default false,
  source        text not null default 'traveller' check (source in ('traveller', 'scout', 'official')),
  created_at    timestamptz not null default now(),
  is_demo       boolean not null default false
);

create table if not exists claims (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid references reports (id) on delete cascade,
  source     text not null check (source in ('photo', 'video', 'voice', 'text', 'news', 'notice', 'official')),
  payload    jsonb not null,                     -- Claim (zod-validated)
  confidence double precision,
  created_at timestamptz not null default now(),
  is_demo    boolean not null default false
);

create table if not exists event_timeline (
  id       uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  at       timestamptz not null default now(),
  kind     text not null check (kind in ('report', 'official', 'news', 'notice', 'ai')),
  text     text not null,
  actor    text,
  data     jsonb,
  is_demo  boolean not null default false
);
create index if not exists event_timeline_event_idx on event_timeline (event_id, at desc);

-- ---------------------------------------------------------------- officials + crews

create table if not exists crews (
  id               uuid primary key default gen_random_uuid(),
  org              text not null,
  district         text,
  name             text not null,
  machines         jsonb not null default '[]',
  available        boolean not null default true,
  current_event_id uuid references events (id) on delete set null,
  is_demo          boolean not null default false
);

create table if not exists official_updates (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events (id) on delete cascade,
  user_id       uuid references users (id) on delete set null,
  status        text check (status in ('open', 'slow', 'one_lane', 'closed', 'unknown')),
  pct_cleared   integer check (pct_cleared between 0 and 100),
  eta_full_open timestamptz,
  machines      jsonb,
  photo_id      uuid references photos (id) on delete set null,
  ai_check      jsonb,
  created_at    timestamptz not null default now(),
  is_demo       boolean not null default false
);

-- ---------------------------------------------------------------- travellers

create table if not exists watched_trips (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references users (id) on delete cascade,
  from_place   jsonb not null,
  to_place     jsonb not null,
  depart_at    timestamptz,
  route_cache  jsonb,
  last_verdict jsonb,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  is_demo      boolean not null default false
);

create table if not exists alerts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references users (id) on delete cascade,
  kind       text not null check (kind in ('road_watch', 'scout_request', 'info')),
  title      text not null,
  body       text,
  data       jsonb,
  read       boolean not null default false,
  created_at timestamptz not null default now(),
  is_demo    boolean not null default false
);

create table if not exists scout_requests (
  id                     uuid primary key default gen_random_uuid(),
  segment_id             text references road_segments (id),
  question               text not null,
  demand_count           integer not null default 0,
  sent_to                uuid[] not null default '{}',
  fulfilled_by_report_id uuid references reports (id) on delete set null,
  created_at             timestamptz not null default now(),
  is_demo                boolean not null default false
);

create table if not exists news_items (
  id           uuid primary key default gen_random_uuid(),
  url          text unique not null,
  title        text,
  published_at timestamptz,
  segment_id   text references road_segments (id),
  claim_id     uuid references claims (id) on delete set null,
  created_at   timestamptz not null default now(),
  is_demo      boolean not null default false
);

-- ---------------------------------------------------------------- AI cost log

create table if not exists ai_calls (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  purpose       text not null,
  provider      text not null check (provider in ('meta', 'baseten', 'mock')),
  model         text not null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd      numeric(10, 6),
  latency_ms    integer,
  ok            boolean not null,
  fallback_used boolean not null default false,
  error_kind    text
);
create index if not exists ai_calls_at_idx on ai_calls (at desc);

-- ---------------------------------------------------------------- RLS

alter table users            enable row level security;
alter table events           enable row level security;
alter table reports          enable row level security;
alter table photos           enable row level security;
alter table claims           enable row level security;
alter table event_timeline   enable row level security;
alter table crews            enable row level security;
alter table official_updates enable row level security;
alter table watched_trips    enable row level security;
alter table alerts           enable row level security;
alter table scout_requests   enable row level security;
alter table news_items       enable row level security;
alter table ai_calls         enable row level security;  -- no policies → service role only

-- Is the signed-in user an official/crew/admin? (security definer avoids RLS recursion on users)
create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from users where auth_user_id = auth.uid() and role in ('official', 'crew', 'admin'));
$$;

-- Public reads: the world state everyone sees.
drop policy if exists "events are public" on events;
create policy "events are public" on events for select using (true);
drop policy if exists "timeline is public" on event_timeline;
create policy "timeline is public" on event_timeline for select using (true);
drop policy if exists "crews are public" on crews;
create policy "crews are public" on crews for select using (true);
drop policy if exists "official updates are public" on official_updates;
create policy "official updates are public" on official_updates for select using (true);
-- Photo rows are readable; original_url is a path in a PRIVATE bucket, so only public_url/annotated_url resolve.
drop policy if exists "photos are public" on photos;
create policy "photos are public" on photos for select using (true);

-- Own rows only.
drop policy if exists "own profile" on users;
create policy "own profile" on users for select using (auth_user_id = auth.uid());
drop policy if exists "own alerts" on alerts;
create policy "own alerts" on alerts for select using (user_id in (select id from users where auth_user_id = auth.uid()));
drop policy if exists "own trips" on watched_trips;
create policy "own trips" on watched_trips for select using (user_id in (select id from users where auth_user_id = auth.uid()));

-- Only officials/crews write official updates (Phase 4 uses this from the browser session).
drop policy if exists "staff write official updates" on official_updates;
create policy "staff write official updates" on official_updates for insert with check (is_staff());

-- Reports/claims/news/scout requests: written only by our API routes (service role). No public policies.

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public)
values ('photos-original', 'photos-original', false),   -- EXIF-stripped, NOT blurred → never public
       ('photos-public', 'photos-public', true)          -- faces/plates blurred + annotated versions
on conflict (id) do nothing;

-- ---------------------------------------------------------------- helpers

-- Nearest road segment within max_m metres (Phase 1 Part B snapping uses this).
create or replace function nearest_segment(p_lat double precision, p_lng double precision, max_m double precision default 300)
returns table (id text, road_ref text, road_name text, km_start double precision, distance_m double precision)
language sql stable
as $$
  select s.id, s.road_ref, s.road_name, s.km_start,
         st_distance(s.geom::geography, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) as distance_m
  from road_segments s
  where st_dwithin(s.geom::geography, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, max_m)
  order by s.geom <-> st_setsrid(st_makepoint(p_lng, p_lat), 4326)
  limit 1;
$$;

-- Wipe demo data: delete from events where is_demo; (cascades timeline) — see scripts/seed.ts (Part C).
