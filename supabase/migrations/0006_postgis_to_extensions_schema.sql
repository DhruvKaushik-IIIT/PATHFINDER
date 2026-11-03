-- 0006 · Move PostGIS out of the public schema (Supabase security advisor: rls_disabled_in_public).
--
-- Why: PostGIS put its reference table `spatial_ref_sys` in `public`. That table is owned by
-- supabase_admin, has no row-level security, and grants INSERT/UPDATE/DELETE to anon/authenticated
-- (granted by supabase_admin, so the postgres role cannot revoke them). Anyone with the public anon
-- key could edit or delete coordinate-system rows and break the map maths.
-- Fix: reinstall PostGIS in Supabase's `extensions` schema (not exposed by the API), then rebuild the
-- four map columns, their indexes and the two map functions.
--
-- Safe to run once in the Supabase SQL Editor. Everything is one transaction: if any step fails,
-- nothing changes. The road shapes (the only non-generated geometry) are backed up first and checked
-- after the restore; a mismatch aborts the whole thing.

begin;

-- 1. Back up the road shapes as text (places/events/slope_sites geoms are generated from lat/lng).
create temp table _road_geom_backup on commit drop as
  select id, st_astext(geom) as wkt from public.road_segments;

do $$
begin
  if (select count(*) from _road_geom_backup) <> (select count(*) from public.road_segments) then
    raise exception 'backup row count mismatch, aborting';
  end if;
end $$;

-- 2. Reinstall PostGIS in the extensions schema (drops the geometry columns + their indexes).
drop extension postgis cascade;
create extension postgis with schema extensions;

-- 3. Rebuild the map columns.
alter table public.road_segments add column geom extensions.geometry(LineString, 4326);
update public.road_segments r
   set geom = extensions.st_geomfromtext(b.wkt, 4326)
  from _road_geom_backup b
 where b.id = r.id;
alter table public.road_segments alter column geom set not null;
create index road_segments_geom_idx on public.road_segments using gist (geom);

alter table public.places add column geom extensions.geometry(Point, 4326)
  generated always as (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)) stored;
create index places_geom_idx on public.places using gist (geom);

alter table public.events add column geom extensions.geometry(Point, 4326)
  generated always as (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)) stored;
create index events_geom_idx on public.events using gist (geom);

alter table public.slope_sites add column geom extensions.geometry(Point, 4326)
  generated always as (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)) stored;
create index slope_sites_geom_idx on public.slope_sites using gist (geom);

-- 4. Recreate the two map functions so they find PostGIS in its new schema.
create or replace function public.segments_in_bbox(w double precision, s double precision, e double precision, n double precision)
returns setof public.road_segments
language sql stable
set search_path = public, extensions
as $$
  select * from public.road_segments where geom && st_makeenvelope(w, s, e, n, 4326);
$$;

create or replace function public.nearest_segment(p_lat double precision, p_lng double precision, max_m double precision default 300)
returns table (id text, road_ref text, road_name text, km_start double precision, distance_m double precision)
language sql stable
set search_path = public, extensions
as $$
  select s.id, s.road_ref, s.road_name, s.km_start,
         st_distance(s.geom::geography, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) as distance_m
  from public.road_segments s
  where st_dwithin(s.geom::geography, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, max_m)
  order by s.geom <-> st_setsrid(st_makepoint(p_lng, p_lat), 4326)
  limit 1;
$$;

-- 5. Verify before committing: every road shape restored, and the functions answer.
do $$
begin
  if exists (select 1 from public.road_segments where geom is null) then
    raise exception 'some road shapes were not restored, aborting';
  end if;
  if (select count(*) from public.nearest_segment(31.797, 77.018, 1000)) <> 1 then
    raise exception 'nearest_segment check failed, aborting';
  end if;
  if (select count(*) from public.segments_in_bbox(76.9, 31.6, 77.1, 31.8)) = 0 then
    raise exception 'segments_in_bbox check failed, aborting';
  end if;
end $$;

commit;

-- Tell the API to pick up the changed tables and functions.
notify pgrst, 'reload schema';
