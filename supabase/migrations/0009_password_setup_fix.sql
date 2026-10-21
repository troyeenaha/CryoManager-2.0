-- =====================================================================
-- CryoManager 0009 — make sure new people are asked to choose a password.
-- Run once in Supabase (SQL Editor → new snippet → paste → Run).
-- Safe to run more than once. Does not change any samples or boxes.
--
-- Why: when Supabase creates an account from an emailed link, it gives the
-- account a hidden random password. So "does the account have a password?"
-- is always yes. Instead, CryoManager now remembers whether the person has
-- chosen their own password in the app.
-- =====================================================================

-- 1. Every new account starts as "hasn't chosen a password yet".
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv public.invitations%rowtype;
  ini text := upper(regexp_replace(coalesce(new.raw_user_meta_data ->> 'initials', ''), '[^A-Za-z]', '', 'g'));
  nm  text := coalesce(new.raw_user_meta_data ->> 'full_name', '');
begin
  select * into inv from public.invitations
   where email = lower(trim(coalesce(new.email, ''))) and status = 'invited' and accepted_at is null;

  if found then
    insert into public.profiles (id, email, full_name, initials, role, status, approved_by, approved_at, password_set)
    values (
      new.id, coalesce(new.email, ''),
      coalesce(nullif(inv.full_name, ''), nm),
      left(coalesce(nullif(inv.initials, ''), ini), 4),
      inv.role, 'active', inv.invited_by, now(), false
    );
    update public.invitations set accepted_at = now() where email = inv.email;
  else
    insert into public.profiles (id, email, full_name, initials, password_set)
    values (new.id, coalesce(new.email, ''), nm, left(ini, 4), false);
  end if;
  return new;
end $$;

-- 2. The app asks this to decide whether to show "Finish setting up".
create or replace function public.needs_password()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select not password_set from public.profiles where id = auth.uid()), false)
$$;
revoke all on function public.needs_password() from public, anon;
grant execute on function public.needs_password() to authenticated;

-- 3. Called by the app right after the person chooses their password.
alter table public.profiles add column if not exists password_chosen_at timestamptz;

create or replace function public.mark_password_set()
returns void language sql security definer set search_path = public as $$
  update public.profiles set password_set = true, password_chosen_at = now() where id = auth.uid()
$$;
revoke all on function public.mark_password_set() from public, anon;
grant execute on function public.mark_password_set() to authenticated;

-- 4. Fix for people who already joined through an invitation/approval email
--    and never got the chance to choose a password: ask them next time.
--    (Anyone who has chosen one in the app is never asked again.)
update public.profiles p set password_set = false
 where p.password_set
   and p.password_chosen_at is null
   and exists (select 1 from public.invitations i where i.email = lower(p.email) and i.accepted_at is not null);
