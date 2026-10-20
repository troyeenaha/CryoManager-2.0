-- =====================================================================
-- CryoManager 0003 — user initials, "transfected with", required fields.
-- Run once in Supabase (SQL Editor → new snippet → paste → Run).
-- Safe to run on a database that already has data.
-- =====================================================================

-- 1. Initials for every user (what goes on the vial label, e.g. "TN").
alter table public.profiles
  add column if not exists initials text not null default '';

alter table public.profiles drop constraint if exists profiles_initials_check;
alter table public.profiles add constraint profiles_initials_check
  check (initials = '' or initials ~ '^[A-Z]{1,4}$');

-- Fill initials in automatically at sign-up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ini text := upper(regexp_replace(coalesce(new.raw_user_meta_data ->> 'initials', ''), '[^A-Za-z]', '', 'g'));
begin
  insert into public.profiles (id, email, full_name, initials)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    left(ini, 4)
  );
  return new;
end $$;

-- 2. What a transfected sample was transfected with.
alter table public.samples
  add column if not exists transfected_with text not null default '';

-- New and edited samples marked "transfected" must say with what.
-- (NOT VALID = existing rows are left alone.)
alter table public.samples drop constraint if exists samples_transfected_with_check;
alter table public.samples add constraint samples_transfected_with_check
  check (transfected is distinct from true or length(trim(transfected_with)) > 0) not valid;

-- 3. Recreate the location view so it includes the new column.
drop view if exists public.sample_locations;
create view public.sample_locations with (security_invoker = true) as
select
  s.*,
  public.position_label(s.row_num, s.col_num) as position,
  b.name || public.position_label(s.row_num, s.col_num) as grid_name,
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

revoke all on public.sample_locations from anon;
grant select on public.sample_locations to authenticated;
