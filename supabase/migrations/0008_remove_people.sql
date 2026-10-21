-- =====================================================================
-- CryoManager 0008 — remove a person completely.
-- Run once in Supabase (SQL Editor → new snippet → paste → Run).
-- Safe to run more than once. Does not change any samples or boxes.
--
-- Removing someone deletes their login and their account. Everything they
-- did stays in the records: samples keep their details, and the history
-- still shows the email of whoever made each change.
-- =====================================================================

-- 1. "Who created / changed this" columns keep the old ID as a plain value,
--    so deleting an account never rewrites sample records or their history.
do $$
declare
  c record;
begin
  for c in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'f' and confrelid = 'public.profiles'::regclass
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

-- 2. The removal itself (administrators only).
create or replace function public.remove_person(p_user uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  p public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can remove people.' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot remove your own account.';
  end if;
  select * into p from public.profiles where id = p_user;
  if not found then
    raise exception 'That person was already removed.';
  end if;
  if p.role = 'admin' and p.status = 'active'
     and (select count(*) from public.profiles where role = 'admin' and status = 'active') <= 1 then
    raise exception 'At least one active administrator must remain.';
  end if;

  delete from public.invitations where email = lower(p.email);
  delete from public.profiles where id = p_user;   -- recorded in the audit log
  delete from auth.users where id = p_user;        -- their login
end $$;

revoke all on function public.remove_person(uuid) from public, anon;
grant execute on function public.remove_person(uuid) to authenticated;
