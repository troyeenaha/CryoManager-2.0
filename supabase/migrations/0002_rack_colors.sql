-- =====================================================================
-- CryoManager 0002 — colors belong to racks; boxes get shades of them.
-- Run once in Supabase (SQL Editor → new snippet → paste → Run).
-- Safe to run on a database that already has data.
-- =====================================================================

alter table public.racks
  add column if not exists color text not null default 'blue';

-- Shade position of each box inside its rack (1 = lightest).
-- Boxes are ordered naturally by name: A1, A2 … A9, A10.
create or replace view public.box_shades with (security_invoker = true) as
select
  b.id as box_id,
  r.color as rack_color,
  row_number() over (partition by b.rack_id order by length(b.name), lower(b.name), b.created_at)::int as shade_index,
  count(*) over (partition by b.rack_id)::int as shade_count
from public.boxes b
join public.racks r on r.id = b.rack_id
where b.status <> 'archived';

-- Recreate the read views so they include the new color information.
drop view if exists public.rack_summary;
drop view if exists public.box_summary;
drop view if exists public.sample_locations;

create view public.rack_summary with (security_invoker = true) as
select
  r.*,
  t.name as tank_name,
  (select count(*) from public.boxes b
     where b.rack_id = r.id and b.status <> 'archived')::int as box_count
from public.racks r
join public.tanks t on t.id = r.tank_id;

create view public.box_summary with (security_invoker = true) as
select
  b.*,
  r.name  as rack_name,
  r.color as rack_color,
  coalesce(sh.shade_index, 1) as shade_index,
  coalesce(sh.shade_count, 1) as shade_count,
  r.tank_id,
  t.name  as tank_name,
  b.rows * b.cols as total_positions,
  (select count(*) from public.samples s
     where s.box_id = b.id and s.status = 'active')::int as filled_positions
from public.boxes b
join public.racks r on r.id = b.rack_id
join public.tanks t on t.id = r.tank_id
left join public.box_shades sh on sh.box_id = b.id;

create view public.sample_locations with (security_invoker = true) as
select
  s.*,
  public.position_label(s.row_num, s.col_num) as position,
  b.name   as box_name,
  b.color  as box_color,
  b.rows   as box_rows,
  b.cols   as box_cols,
  r.color  as rack_color,
  coalesce(sh.shade_index, 1) as shade_index,
  coalesce(sh.shade_count, 1) as shade_count,
  r.id     as rack_id,
  r.name   as rack_name,
  t.id     as tank_id,
  t.name   as tank_name,
  t.location as tank_location
from public.samples s
join public.boxes b on b.id = s.box_id
join public.racks r on r.id = b.rack_id
join public.tanks t on t.id = r.tank_id
left join public.box_shades sh on sh.box_id = b.id;

-- Logged-out visitors still get nothing.
revoke all on public.box_shades, public.rack_summary, public.box_summary, public.sample_locations from anon;
grant select on public.box_shades, public.rack_summary, public.box_summary, public.sample_locations to authenticated;
