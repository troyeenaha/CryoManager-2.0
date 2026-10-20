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
