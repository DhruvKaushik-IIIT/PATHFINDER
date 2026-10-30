-- Phase 6B: Slope Sentinel — warning signs on the hillside ABOVE a road, before it fails.
-- A site = one stretch of hillside (observations within ~300 m on the same segment join it).
-- Risk is advice only: it never changes an event's status or closes a road.
-- Idempotent: safe to paste into the Supabase SQL Editor more than once.

create table if not exists slope_sites (
  id               uuid primary key default gen_random_uuid(),
  segment_id       text references road_segments (id),
  road_ref         text,
  lat              double precision not null,
  lng              double precision not null,
  geom             geometry(Point, 4326) generated always as (st_setsrid(st_makepoint(lng, lat), 4326)) stored,
  place_name       text,
  risk_level       text not null default 'none' check (risk_level in ('none', 'watch', 'elevated', 'high')),
  risk             jsonb,                         -- latest SlopeRisk assessment (level, reasons, advice EN/HI, by, inputs)
  history          jsonb not null default '[]',   -- small timeline: risk changes, "crew sent to inspect" (newest last, capped in code)
  last_observed_at timestamptz,
  last_assessed_at timestamptz,
  created_at       timestamptz not null default now(),
  is_demo          boolean not null default false
);
create index if not exists slope_sites_geom_idx on slope_sites using gist (geom);
create index if not exists slope_sites_segment_idx on slope_sites (segment_id);

create table if not exists slope_observations (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references slope_sites (id) on delete cascade,
  report_id    uuid references reports (id) on delete set null,
  photo_id     uuid references photos (id) on delete set null,
  reading      jsonb,                             -- SlopeReading (Baseten Spark Open → Meta Spark)
  "check"      jsonb,                             -- second model's check (agrees / downgrades / rejects)
  sign_metrics jsonb not null default '{}',       -- SAM areas per concept, normalised to a reference in the frame
  created_at   timestamptz not null default now(),
  is_demo      boolean not null default false
);
create index if not exists slope_observations_site_idx on slope_observations (site_id, created_at desc);

-- Reports can now be about a slope (kind = 'slope') instead of the road surface.
alter table reports add column if not exists kind text not null default 'road';
-- Scout requests can ask for a newer photo of a slope site.
alter table scout_requests add column if not exists slope_site_id uuid references slope_sites (id) on delete cascade;

alter table slope_sites        enable row level security;
alter table slope_observations enable row level security;
drop policy if exists "slope sites are public" on slope_sites;
create policy "slope sites are public" on slope_sites for select using (true);
drop policy if exists "slope observations are public" on slope_observations;
create policy "slope observations are public" on slope_observations for select using (true);
