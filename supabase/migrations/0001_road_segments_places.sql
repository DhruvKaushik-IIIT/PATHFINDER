-- Phase 0: road segments (what events snap to) + named places. CLAUDE.md section 8.
create extension if not exists postgis;

create table if not exists road_segments (
  id          text primary key,                 -- "{ref|name}-{osm_way_id}-{chunk}"
  road_ref    text,                             -- e.g. "NH3" (older name NH21)
  road_name   text,
  highway     text,                             -- OSM class: trunk, primary, ...
  km_start    double precision,
  km_end      double precision,
  length_m    integer,
  district    text,
  geom        geometry(LineString, 4326) not null,
  is_demo     boolean not null default false
);
create index if not exists road_segments_geom_idx on road_segments using gist (geom);
create index if not exists road_segments_ref_idx on road_segments (road_ref);

create table if not exists places (
  id      text primary key,                     -- slug, e.g. "atal-tunnel-south"
  name    text not null,
  kind    text not null check (kind in ('town', 'pass', 'trek', 'tunnel', 'village')),
  lat     double precision not null,
  lng     double precision not null,
  geom    geometry(Point, 4326) generated always as (st_setsrid(st_makepoint(lng, lat), 4326)) stored
);
create index if not exists places_geom_idx on places using gist (geom);

-- Public read-only; writes only via the service role (seed/fetch scripts).
alter table road_segments enable row level security;
alter table places enable row level security;
create policy "road_segments are public" on road_segments for select using (true);
create policy "places are public" on places for select using (true);

-- Segments inside a bounding box, for GET /api/segments?bbox=
create or replace function segments_in_bbox(w double precision, s double precision, e double precision, n double precision)
returns setof road_segments
language sql stable
as $$
  select * from road_segments where geom && st_makeenvelope(w, s, e, n, 4326);
$$;
