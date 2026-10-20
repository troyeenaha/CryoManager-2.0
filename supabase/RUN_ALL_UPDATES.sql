-- =====================================================================
-- CryoManager — ALL UPDATES IN ONE FILE (0002 → 0005)
-- Paste this whole file into Supabase → SQL Editor → new snippet → Run.
-- Safe to run even if you already ran some (or all) of these updates,
-- and safe to run more than once. It never deletes your data.
-- =====================================================================

-- >>>>>>>>>> 0002_rack_colors.sql
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

-- >>>>>>>>>> 0003_initials_and_sample_fields.sql
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

-- >>>>>>>>>> 0004_box_nicknames_and_bulk_move.sql
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

-- >>>>>>>>>> 0005_add_people.sql
-- =====================================================================
-- CryoManager 0005 — admins add people directly from the app.
-- Run once in Supabase (SQL Editor → new snippet → paste → Run).
--
-- An admin adds someone's name, initials, email and role. When that person
-- creates their account with that email, they are let in straight away
-- with that role (no separate approval step).
-- =====================================================================

create table if not exists public.invitations (
  email       text primary key check (email = lower(trim(email)) and email like '%_@_%'),
  full_name   text not null default '',
  initials    text not null default '' check (initials = '' or initials ~ '^[A-Z]{1,4}$'),
  role        text not null default 'member' check (role in ('admin', 'member', 'viewer')),
  invited_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz
);

alter table public.invitations enable row level security;
drop policy if exists "invitations: admins only" on public.invitations;
create policy "invitations: admins only" on public.invitations
  for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.invitations from anon;
grant select, insert, update, delete on public.invitations to authenticated;

create or replace function public.stamp_invitation()
returns trigger language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  if tg_op = 'INSERT' then new.invited_by := coalesce(auth.uid(), new.invited_by); end if;
  return new;
end $$;
drop trigger if exists invitations_stamp on public.invitations;
create trigger invitations_stamp before insert or update on public.invitations
  for each row execute function public.stamp_invitation();

-- Sign-up: use the invitation if there is one.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv public.invitations%rowtype;
  ini text := upper(regexp_replace(coalesce(new.raw_user_meta_data ->> 'initials', ''), '[^A-Za-z]', '', 'g'));
  nm  text := coalesce(new.raw_user_meta_data ->> 'full_name', '');
begin
  select * into inv from public.invitations
   where email = lower(trim(coalesce(new.email, ''))) and accepted_at is null;

  if found then
    insert into public.profiles (id, email, full_name, initials, role, status, approved_by, approved_at)
    values (
      new.id, coalesce(new.email, ''),
      coalesce(nullif(nm, ''), inv.full_name),
      left(coalesce(nullif(ini, ''), inv.initials), 4),
      inv.role, 'active', inv.invited_by, now()
    );
    update public.invitations set accepted_at = now() where email = inv.email;
  else
    insert into public.profiles (id, email, full_name, initials)
    values (new.id, coalesce(new.email, ''), nm, left(ini, 4));
  end if;
  return new;
end $$;
