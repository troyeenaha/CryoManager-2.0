-- =====================================================================
-- CryoManager 0007 — reliably ask new people to choose a password.
-- Run once in Supabase (SQL Editor → new snippet → paste → Run).
-- Safe to run more than once.
--
-- Instead of a stored yes/no flag, the app asks the login system itself
-- whether the signed-in person has a password yet.
-- =====================================================================

create or replace function public.needs_password()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select coalesce((select coalesce(encrypted_password, '') = '' from auth.users where id = auth.uid()), false)
$$;

revoke all on function public.needs_password() from public, anon;
grant execute on function public.needs_password() to authenticated;
