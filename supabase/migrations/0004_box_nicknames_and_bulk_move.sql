-- =====================================================================
-- CryoManager 0004 — box nicknames and moving many samples at once.
-- Run once in Supabase (SQL Editor → new snippet → paste → Run).
-- Safe to run on a database that already has data.
-- =====================================================================

-- 1. Optional nickname for a box ("Troyee 1"). The official name (A1)
--    stays the box's ID and is still used for grid names like A1B4.
alter table public.boxes
  add column if not exists label text not null default '';

-- 2. Recreate the read views so they include the nickname.
drop view if exists public.box_summary;
drop view if exists public.sample_locations;

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
  b.name || public.position_label(s.row_num, s.col_num) as grid_name,
  b.name   as box_name,
  b.label  as box_label,
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

revoke all on public.box_summary, public.sample_locations from anon;
grant select on public.box_summary, public.sample_locations to authenticated;

-- 3. Move several samples in ONE transaction: every sample moves, or none do.
--    p_moves = [{ "id": uuid, "version": int, "box_id": uuid, "row": int, "col": int }, ...]
--    Each destination must be empty right now, and no two samples may go to
--    the same place. Each sample must still be at the version the user saw.
create or replace function public.move_samples(p_moves jsonb)
returns setof public.samples
language plpgsql security invoker set search_path = public as $$
declare
  m        jsonb;
  occupant text;
  moved    public.samples;
begin
  if not public.can_edit_samples() then
    raise exception 'You do not have permission to move samples.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_moves) <> 'array' or jsonb_array_length(p_moves) = 0 then
    raise exception 'Nothing to move.' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_moves))
     <> (select count(distinct (e->>'box_id', e->>'row', e->>'col')) from jsonb_array_elements(p_moves) e) then
    raise exception 'Two samples cannot go to the same position.' using errcode = '23505';
  end if;

  for m in select * from jsonb_array_elements(p_moves) loop
    select sample_name into occupant from public.samples
     where box_id = (m->>'box_id')::uuid
       and row_num = (m->>'row')::int and col_num = (m->>'col')::int
       and status = 'active';
    if found then
      raise exception 'Position % is already occupied by "%". Nothing was moved.',
        public.position_label((m->>'row')::int, (m->>'col')::int), occupant using errcode = '23505';
    end if;

    update public.samples
       set box_id = (m->>'box_id')::uuid, row_num = (m->>'row')::int, col_num = (m->>'col')::int
     where id = (m->>'id')::uuid and version = (m->>'version')::int and status = 'active'
    returning * into moved;

    if moved.id is null then
      raise exception 'A sample was changed by someone else. Refresh and try again — nothing was moved.'
        using errcode = '40001';
    end if;
    return next moved;
    moved := null;
  end loop;
end $$;

revoke execute on function public.move_samples(jsonb) from anon, public;
grant execute on function public.move_samples(jsonb) to authenticated;

-- 4. One slot = one vial. New and edited samples always have exactly 1 vial.
--    (NOT VALID = any older rows are left as they are.)
alter table public.samples alter column vial_count set default 1;
alter table public.samples drop constraint if exists samples_one_vial_per_slot;
alter table public.samples add constraint samples_one_vial_per_slot
  check (vial_count = 1) not valid;
