-- =====================================================================
-- CryoManager — database schema, integrity rules, security and audit
-- Run once in a new Supabase project (SQL Editor → paste → Run).
-- Safe to read top-to-bottom; every rule the app relies on lives here,
-- so it is enforced even if someone bypasses the website.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------

-- Row label for a 1-based row number: 1 -> A, 12 -> L
create or replace function public.row_label(r int)
returns text language sql immutable as $$
  select chr(64 + r)
$$;

create or replace function public.position_label(r int, c int)
returns text language sql immutable as $$
  select chr(64 + r) || c::text
$$;

-- ---------------------------------------------------------------------
-- 1. Users / profiles
-- ---------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  full_name    text not null default '',
  role         text not null default 'viewer'
               check (role in ('admin', 'member', 'viewer')),
  status       text not null default 'pending'
               check (status in ('pending', 'active', 'disabled')),
  approved_by  uuid references public.profiles(id) on delete set null,
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is
  'One row per login. New sign-ups start as pending viewers; an admin must approve them.';

-- Create a profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role helpers used by every security policy.
-- SECURITY DEFINER so they can read profiles without recursing into RLS.
create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles
  where id = auth.uid() and status = 'active'
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() is not null, false)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

create or replace function public.can_edit_samples()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() in ('admin', 'member'), false)
$$;

-- Non-admins may only change their own display name. Also stop the last
-- active admin from being demoted or disabled (would lock everyone out).
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();

  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.email is distinct from old.email
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at then
      raise exception 'Only an administrator can change roles or access status.'
        using errcode = '42501';
    end if;
  end if;

  if old.role = 'admin' and old.status = 'active'
     and (new.role <> 'admin' or new.status <> 'active') then
    if (select count(*) from public.profiles
        where role = 'admin' and status = 'active' and id <> old.id) = 0 then
      raise exception 'At least one active administrator must remain.'
        using errcode = 'P0001';
    end if;
  end if;

  if old.status = 'pending' and new.status = 'active' and new.approved_at is null then
    new.approved_at := now();
    new.approved_by := auth.uid();
  end if;

  return new;
end $$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------
-- 2. Storage hierarchy: tanks → racks → boxes → samples
-- ---------------------------------------------------------------------

create table public.tanks (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(trim(name)) > 0),
  location       text not null default '',
  rack_capacity  int  not null default 6 check (rack_capacity between 1 and 100),
  temperature_c  numeric(6,1) not null default -196,
  status         text not null default 'active'
                 check (status in ('active', 'inactive', 'archived')),
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles(id) on delete set null,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id) on delete set null,
  version        int not null default 1
);
create unique index tanks_name_unique
  on public.tanks (lower(trim(name))) where status <> 'archived';

create table public.racks (
  id            uuid primary key default gen_random_uuid(),
  tank_id       uuid not null references public.tanks(id) on delete restrict,
  name          text not null check (length(trim(name)) > 0),
  position      int check (position is null or position > 0),
  box_capacity  int  not null default 12 check (box_capacity between 1 and 100),
  status        text not null default 'active'
                check (status in ('active', 'archived')),
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles(id) on delete set null,
  version       int not null default 1
);
create unique index racks_name_unique_in_tank
  on public.racks (tank_id, lower(trim(name))) where status <> 'archived';
create index racks_tank_idx on public.racks (tank_id);

create table public.boxes (
  id          uuid primary key default gen_random_uuid(),
  rack_id     uuid not null references public.racks(id) on delete restrict,
  name        text not null check (length(trim(name)) > 0),
  rows        int  not null default 9  check (rows between 1 and 26),
  cols        int  not null default 9  check (cols between 1 and 30),
  color       text not null default 'blue',
  status      text not null default 'active'
              check (status in ('active', 'archived')),
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null,
  version     int not null default 1
);
create unique index boxes_name_unique_in_rack
  on public.boxes (rack_id, lower(trim(name))) where status <> 'archived';
create index boxes_rack_idx on public.boxes (rack_id);

-- Human-readable sample IDs: S-000001, S-000002, ...
create sequence public.sample_code_seq;

create table public.samples (
  id                      uuid primary key default gen_random_uuid(),
  sample_code             text not null unique
                          default ('S-' || lpad(nextval('public.sample_code_seq')::text, 6, '0')),
  box_id                  uuid not null references public.boxes(id) on delete restrict,
  row_num                 int  not null check (row_num >= 1),
  col_num                 int  not null check (col_num >= 1),

  -- Core fields (shown on the basic form)
  sample_name             text not null check (length(trim(sample_name)) > 0),
  transfected             boolean,
  passage_number          int check (passage_number is null or passage_number >= 0),
  passaged_by             text not null default '',
  media                   text not null default '',
  passage_date            date,

  -- Advanced details
  vial_count              int  not null default 1 check (vial_count between 1 and 50),
  date_frozen             date,
  date_added              date not null default current_date,
  cell_line_origin        text not null default '',
  genetic_modifications   text not null default '',
  selection_marker        text not null default '',
  antibiotic_resistance   text not null default '',
  project                 text not null default '',
  researcher_responsible  text not null default '',
  notes                   text not null default '',

  -- Lifecycle
  status                  text not null default 'active'
                          check (status in ('active', 'archived', 'removed')),
  archived_at             timestamptz,
  archived_by             uuid references public.profiles(id) on delete set null,
  archive_reason          text not null default '',

  created_at              timestamptz not null default now(),
  created_by              uuid references public.profiles(id) on delete set null,
  updated_at              timestamptz not null default now(),
  updated_by              uuid references public.profiles(id) on delete set null,
  version                 int not null default 1
);

comment on column public.samples.vial_count is
  'Number of vials physically stored together in this one slot. One slot = one sample record.';

-- THE key integrity rule: one active sample record per physical slot.
create unique index samples_one_per_position
  on public.samples (box_id, row_num, col_num) where status = 'active';

create index samples_box_idx on public.samples (box_id) where status = 'active';
create index samples_name_idx on public.samples (lower(sample_name));
create index samples_status_idx on public.samples (status);

create table public.app_settings (
  id                    int primary key default 1 check (id = 1),
  lab_name              text not null default 'Thurber Lab',
  default_box_rows      int  not null default 9 check (default_box_rows between 1 and 26),
  default_box_cols      int  not null default 9 check (default_box_cols between 1 and 30),
  default_temperature_c numeric(6,1) not null default -196,
  updated_at            timestamptz not null default now(),
  updated_by            uuid references public.profiles(id) on delete set null
);
insert into public.app_settings (id) values (1);

-- ---------------------------------------------------------------------
-- 3. Bookkeeping: timestamps, who-changed-it, version numbers
--    (version powers "someone else edited this first" conflict detection)
-- ---------------------------------------------------------------------

create or replace function public.stamp_row()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    new.version    := 1;
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    new.version    := old.version + 1;
  end if;
  return new;
end $$;

create trigger tanks_stamp   before insert or update on public.tanks   for each row execute function public.stamp_row();
create trigger racks_stamp   before insert or update on public.racks   for each row execute function public.stamp_row();
create trigger boxes_stamp   before insert or update on public.boxes   for each row execute function public.stamp_row();
create trigger samples_stamp before insert or update on public.samples for each row execute function public.stamp_row();

create or replace function public.stamp_settings()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger settings_stamp before update on public.app_settings
  for each row execute function public.stamp_settings();

-- ---------------------------------------------------------------------
-- 4. Physical rules: capacity, valid positions, safe archiving
--    Parent rows are locked (FOR UPDATE) so two people adding at the
--    same moment cannot both squeeze past a capacity limit.
-- ---------------------------------------------------------------------

create or replace function public.check_tank_rules()
returns trigger language plpgsql as $$
declare
  n int;
begin
  if tg_op = 'UPDATE' then
    select count(*) into n from public.racks
      where tank_id = new.id and status <> 'archived';
    if new.rack_capacity < n then
      raise exception 'This tank holds % racks; capacity cannot be set below that.', n
        using errcode = 'P0001';
    end if;
    if new.status = 'archived' and old.status <> 'archived' and n > 0 then
      raise exception 'Archive or move the % rack(s) in this tank first.', n
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger tanks_rules before update on public.tanks
  for each row execute function public.check_tank_rules();

create or replace function public.check_rack_rules()
returns trigger language plpgsql as $$
declare
  t   public.tanks%rowtype;
  n   int;
begin
  -- Capacity of the parent tank (only when the rack is being placed/moved/reactivated)
  if new.status <> 'archived' and (
       tg_op = 'INSERT'
       or new.tank_id is distinct from old.tank_id
       or (old.status = 'archived')
     ) then
    select * into t from public.tanks where id = new.tank_id for update;
    if t.status = 'archived' then
      raise exception 'Tank "%" is archived.', t.name using errcode = 'P0001';
    end if;
    select count(*) into n from public.racks
      where tank_id = new.tank_id and status <> 'archived'
        and id <> new.id;
    if n >= t.rack_capacity then
      raise exception 'Tank "%" is full (% of % racks).', t.name, n, t.rack_capacity
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    select count(*) into n from public.boxes
      where rack_id = new.id and status <> 'archived';
    if new.box_capacity < n then
      raise exception 'This rack holds % boxes; capacity cannot be set below that.', n
        using errcode = 'P0001';
    end if;
    if new.status = 'archived' and old.status <> 'archived' and n > 0 then
      raise exception 'Archive or move the % box(es) in this rack first.', n
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger racks_rules before insert or update on public.racks
  for each row execute function public.check_rack_rules();

create or replace function public.check_box_rules()
returns trigger language plpgsql as $$
declare
  r   public.racks%rowtype;
  n   int;
  max_r int;
  max_c int;
begin
  if new.status <> 'archived' and (
       tg_op = 'INSERT'
       or new.rack_id is distinct from old.rack_id
       or (old.status = 'archived')
     ) then
    select * into r from public.racks where id = new.rack_id for update;
    if r.status = 'archived' then
      raise exception 'Rack "%" is archived.', r.name using errcode = 'P0001';
    end if;
    select count(*) into n from public.boxes
      where rack_id = new.rack_id and status <> 'archived' and id <> new.id;
    if n >= r.box_capacity then
      raise exception 'Rack "%" is full (% of % boxes).', r.name, n, r.box_capacity
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    select count(*), coalesce(max(row_num), 0), coalesce(max(col_num), 0)
      into n, max_r, max_c
      from public.samples where box_id = new.id and status = 'active';
    if new.rows < max_r or new.cols < max_c then
      raise exception 'Samples are stored up to row % / column %; the grid cannot be made smaller than that.',
        public.row_label(max_r), max_c using errcode = 'P0001';
    end if;
    if new.status = 'archived' and old.status <> 'archived' and n > 0 then
      raise exception 'This box still holds % active sample(s).', n using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger boxes_rules before insert or update on public.boxes
  for each row execute function public.check_box_rules();

create or replace function public.check_sample_rules()
returns trigger language plpgsql as $$
declare
  b public.boxes%rowtype;
begin
  if tg_op = 'UPDATE' then
    new.sample_code := old.sample_code;   -- sample IDs never change
  end if;

  if new.status = 'active' then
    select * into b from public.boxes where id = new.box_id;
    if b.status = 'archived' then
      raise exception 'Box "%" is archived.', b.name using errcode = 'P0001';
    end if;
    if new.row_num > b.rows or new.col_num > b.cols then
      raise exception 'Position % is outside box "%" (% × % grid).',
        public.position_label(new.row_num, new.col_num), b.name, b.rows, b.cols
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status <> 'active' and old.status = 'active' then
    new.archived_at := now();
    new.archived_by := auth.uid();
  elsif tg_op = 'UPDATE' and new.status = 'active' and old.status <> 'active' then
    new.archived_at := null;
    new.archived_by := null;
  end if;
  return new;
end $$;
create trigger samples_rules before insert or update on public.samples
  for each row execute function public.check_sample_rules();

-- ---------------------------------------------------------------------
-- 5. Audit log — every create / edit / move / archive / delete,
--    with before & after values. Written only by triggers; nobody
--    (not even admins through the app) can edit or delete it.
-- ---------------------------------------------------------------------

create table public.audit_log (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid references public.profiles(id) on delete set null,
  actor_email  text,
  action       text not null,
  entity_type  text not null,
  entity_id    uuid not null,
  entity_label text,
  old_values   jsonb,
  new_values   jsonb
);
create index audit_entity_idx on public.audit_log (entity_type, entity_id, occurred_at desc);
create index audit_time_idx   on public.audit_log (occurred_at desc);

create or replace function public.write_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  act    text;
  etype  text := tg_argv[0];
  rec    jsonb;
  oldj   jsonb;
  label  text;
  email  text;
begin
  if tg_op = 'INSERT' then
    act := 'create'; rec := to_jsonb(new); oldj := null;
  elsif tg_op = 'DELETE' then
    act := 'delete'; rec := null; oldj := to_jsonb(old);
  else
    rec := to_jsonb(new); oldj := to_jsonb(old);
    -- Ignore no-op saves
    if (rec - 'updated_at' - 'updated_by' - 'version')
       = (oldj - 'updated_at' - 'updated_by' - 'version') then
      return new;
    end if;
    act := 'update';
    if (rec ? 'status') and (rec->>'status') is distinct from (oldj->>'status') then
      act := case rec->>'status'
               when 'archived' then 'archive'
               when 'removed'  then 'remove'
               when 'active'   then 'restore'
               else 'update' end;
    end if;
    if etype = 'sample' and act = 'update' and (
         rec->>'box_id'  is distinct from oldj->>'box_id'
      or rec->>'row_num' is distinct from oldj->>'row_num'
      or rec->>'col_num' is distinct from oldj->>'col_num') then
      act := 'move';
    end if;
  end if;

  label := coalesce(rec, oldj) ->> (case when etype = 'sample' then 'sample_name'
                                         when etype = 'profile' then 'email'
                                         else 'name' end);
  select p.email into email from public.profiles p where p.id = auth.uid();

  insert into public.audit_log
    (actor_id, actor_email, action, entity_type, entity_id, entity_label, old_values, new_values)
  values
    (auth.uid(), email, act, etype, (coalesce(rec, oldj) ->> 'id')::uuid, label, oldj, rec);

  return coalesce(new, old);
end $$;

create trigger tanks_audit   after insert or update or delete on public.tanks   for each row execute function public.write_audit('tank');
create trigger racks_audit   after insert or update or delete on public.racks   for each row execute function public.write_audit('rack');
create trigger boxes_audit   after insert or update or delete on public.boxes   for each row execute function public.write_audit('box');
create trigger samples_audit after insert or update or delete on public.samples for each row execute function public.write_audit('sample');
create trigger profiles_audit after update or delete on public.profiles         for each row execute function public.write_audit('profile');

-- ---------------------------------------------------------------------
-- 6. Read models: where is every sample, how full is everything
--    (security_invoker → the caller's own permissions apply)
-- ---------------------------------------------------------------------

create view public.sample_locations with (security_invoker = true) as
select
  s.*,
  public.position_label(s.row_num, s.col_num) as position,
  b.name   as box_name,
  b.color  as box_color,
  b.rows   as box_rows,
  b.cols   as box_cols,
  r.id     as rack_id,
  r.name   as rack_name,
  t.id     as tank_id,
  t.name   as tank_name,
  t.location as tank_location
from public.samples s
join public.boxes b on b.id = s.box_id
join public.racks r on r.id = b.rack_id
join public.tanks t on t.id = r.tank_id;

create view public.box_summary with (security_invoker = true) as
select
  b.*,
  r.name  as rack_name,
  r.tank_id,
  t.name  as tank_name,
  b.rows * b.cols as total_positions,
  (select count(*) from public.samples s
     where s.box_id = b.id and s.status = 'active')::int as filled_positions
from public.boxes b
join public.racks r on r.id = b.rack_id
join public.tanks t on t.id = r.tank_id;

create view public.rack_summary with (security_invoker = true) as
select
  r.*,
  t.name as tank_name,
  (select count(*) from public.boxes b
     where b.rack_id = r.id and b.status <> 'archived')::int as box_count
from public.racks r
join public.tanks t on t.id = r.tank_id;

create view public.tank_summary with (security_invoker = true) as
select
  t.*,
  (select count(*) from public.racks r
     where r.tank_id = t.id and r.status <> 'archived')::int as rack_count
from public.tanks t;

-- Dashboard numbers. Utilisation = occupied physical slots / total slots
-- in non-archived boxes (not sample names, not vials).
create or replace function public.inventory_stats()
returns json language sql stable security invoker set search_path = public as $$
  with bx as (
    select b.id, b.rows * b.cols as slots
    from public.boxes b where b.status <> 'archived'
  ),
  occ as (
    select count(*) as n from public.samples s
    join bx on bx.id = s.box_id
    where s.status = 'active'
  )
  select json_build_object(
    'tanks',     (select count(*) from public.tanks where status <> 'archived'),
    'racks',     (select count(*) from public.racks where status <> 'archived'),
    'boxes',     (select count(*) from bx),
    'samples',   (select count(*) from public.samples where status = 'active'),
    'vials',     (select coalesce(sum(vial_count), 0) from public.samples where status = 'active'),
    'total_positions',    (select coalesce(sum(slots), 0) from bx),
    'occupied_positions', (select n from occ),
    'available_positions',(select coalesce(sum(slots), 0) from bx) - (select n from occ)
  )
$$;

-- ---------------------------------------------------------------------
-- 7. Moving a sample — one atomic statement with a version check.
--    Fails cleanly if the target slot is taken or someone else changed
--    the sample after you opened it.
-- ---------------------------------------------------------------------

create or replace function public.move_sample(
  p_sample_id        uuid,
  p_box_id           uuid,
  p_row              int,
  p_col              int,
  p_expected_version int
)
returns public.samples
language plpgsql security invoker set search_path = public as $$
declare
  result public.samples;
  occupant text;
begin
  if not public.can_edit_samples() then
    raise exception 'You do not have permission to move samples.' using errcode = '42501';
  end if;

  select sample_name into occupant from public.samples
   where box_id = p_box_id and row_num = p_row and col_num = p_col
     and status = 'active' and id <> p_sample_id;
  if found then
    raise exception 'Position % is already occupied by "%".',
      public.position_label(p_row, p_col), occupant using errcode = '23505';
  end if;

  update public.samples
     set box_id = p_box_id, row_num = p_row, col_num = p_col
   where id = p_sample_id
     and version = p_expected_version
     and status = 'active'
  returning * into result;

  if result.id is null then
    raise exception 'This sample was changed by someone else. Refresh and try again.'
      using errcode = '40001';
  end if;
  return result;
end $$;

-- ---------------------------------------------------------------------
-- 8. Row Level Security — the real permission system
--      admin  : everything
--      member : read all, add / edit / move / archive samples
--      viewer : read only
--      pending or disabled accounts: nothing (except their own profile)
-- ---------------------------------------------------------------------

alter table public.profiles     enable row level security;
alter table public.tanks        enable row level security;
alter table public.racks        enable row level security;
alter table public.boxes        enable row level security;
alter table public.samples      enable row level security;
alter table public.audit_log    enable row level security;
alter table public.app_settings enable row level security;

-- profiles
create policy "profiles: see self"         on public.profiles for select using (id = auth.uid());
create policy "profiles: lab sees lab"     on public.profiles for select using (public.is_active_user());
create policy "profiles: edit own name"    on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles: admin manages"    on public.profiles for update using (public.is_admin()) with check (public.is_admin());

-- tanks / racks / boxes: everyone active reads, admins write
create policy "tanks: read"   on public.tanks for select using (public.is_active_user());
create policy "tanks: insert" on public.tanks for insert with check (public.is_admin());
create policy "tanks: update" on public.tanks for update using (public.is_admin()) with check (public.is_admin());
create policy "tanks: delete" on public.tanks for delete using (public.is_admin());

create policy "racks: read"   on public.racks for select using (public.is_active_user());
create policy "racks: insert" on public.racks for insert with check (public.is_admin());
create policy "racks: update" on public.racks for update using (public.is_admin()) with check (public.is_admin());
create policy "racks: delete" on public.racks for delete using (public.is_admin());

create policy "boxes: read"   on public.boxes for select using (public.is_active_user());
create policy "boxes: insert" on public.boxes for insert with check (public.is_admin());
create policy "boxes: update" on public.boxes for update using (public.is_admin()) with check (public.is_admin());
create policy "boxes: delete" on public.boxes for delete using (public.is_admin());

-- samples: members and admins write; only admins hard-delete
create policy "samples: read"   on public.samples for select using (public.is_active_user());
create policy "samples: insert" on public.samples for insert with check (public.can_edit_samples());
create policy "samples: update" on public.samples for update using (public.can_edit_samples()) with check (public.can_edit_samples());
create policy "samples: delete" on public.samples for delete using (public.is_admin());

-- audit log: read-only. Everyone active can see sample history; admins see all.
create policy "audit: admin reads all" on public.audit_log for select using (public.is_admin());
create policy "audit: sample history"  on public.audit_log for select
  using (public.is_active_user() and entity_type = 'sample');

-- settings
create policy "settings: read"   on public.app_settings for select using (public.is_active_user());
create policy "settings: update" on public.app_settings for update using (public.is_admin()) with check (public.is_admin());

-- Logged-out visitors get nothing at all.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on function public.move_sample(uuid, uuid, int, int, int) from anon, public;
revoke execute on function public.inventory_stats() from anon, public;
grant  execute on function public.move_sample(uuid, uuid, int, int, int) to authenticated;
grant  execute on function public.inventory_stats() to authenticated;

-- The audit log is append-only for app users.
revoke insert, update, delete, truncate on public.audit_log from authenticated;

-- Live updates in the Grid View when a colleague changes something.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.samples, public.boxes, public.racks, public.tanks;
  end if;
end $$;
