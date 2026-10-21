-- =====================================================================
-- CryoManager 0006 — how people join, and "My Activity".
-- Run once in Supabase (SQL Editor → new snippet → paste → Run).
-- Safe to run more than once. Does not change any samples or boxes.
--
--  • New person → "Request access" (first + last name, initials, email).
--    Admins see the request (and get an email if alerts are set up).
--  • Admin approves, or adds someone directly → the person gets an email,
--    clicks it (this confirms their email) and sets their own password.
--  • Everyone can see their own activity.
-- =====================================================================

-- 1. Requests live alongside invitations.
alter table public.invitations add column if not exists status text not null default 'invited';
alter table public.invitations add column if not exists source text not null default 'admin';
alter table public.invitations add column if not exists requested_at timestamptz;
alter table public.invitations drop constraint if exists invitations_status_check;
alter table public.invitations add constraint invitations_status_check
  check (status in ('requested', 'invited', 'declined'));
alter table public.invitations drop constraint if exists invitations_source_check;
alter table public.invitations add constraint invitations_source_check
  check (source in ('admin', 'request'));

-- 2. Has this person chosen their own password yet?
-- (Added once; everyone who already had an account signed up with a password.)
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles' and column_name = 'password_set') then
    alter table public.profiles add column password_set boolean not null default false;
    update public.profiles set password_set = true;
  end if;
end $$;

-- 3. Anyone (not signed in) can ask for access — only through this function.
create or replace function public.request_access(p_email text, p_full_name text, p_initials text)
returns text language plpgsql security definer set search_path = public as $$
declare
  em  text := lower(trim(coalesce(p_email, '')));
  nm  text := trim(coalesce(p_full_name, ''));
  ini text := upper(regexp_replace(coalesce(p_initials, ''), '[^A-Za-z]', '', 'g'));
  inv public.invitations%rowtype;
begin
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter a valid email address.'; end if;
  if length(nm) < 2 or length(nm) > 120 then raise exception 'Please enter your first and last name.'; end if;
  if ini !~ '^[A-Z]{1,4}$' then raise exception 'Initials must be 1–4 letters.'; end if;

  if exists (select 1 from public.profiles where lower(email) = em) then
    return 'has_account';
  end if;

  select * into inv from public.invitations where email = em;
  if found and inv.status = 'invited' and inv.accepted_at is null then
    return 'already_invited';
  end if;
  if found and inv.status = 'requested' then
    return 'already_requested';
  end if;
  -- simple spam guard
  if (select count(*) from public.invitations where status = 'requested') >= 50 then
    raise exception 'Too many open requests. Please contact a lab administrator directly.';
  end if;

  insert into public.invitations (email, full_name, initials, role, status, source, requested_at, accepted_at)
  values (em, nm, ini, 'member', 'requested', 'request', now(), null)
  on conflict (email) do update
    set full_name = excluded.full_name, initials = excluded.initials, role = 'member',
        status = 'requested', source = 'request', requested_at = now(), accepted_at = null;
  return 'requested';
end $$;
revoke all on function public.request_access(text, text, text) from public;
grant execute on function public.request_access(text, text, text) to anon, authenticated;

-- 4. Sign-up: only *invited* (or approved) emails get in straight away.
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
      inv.role, 'active', inv.invited_by, now(),
      coalesce(new.encrypted_password, '') <> ''
    );
    update public.invitations set accepted_at = now() where email = inv.email;
  else
    insert into public.profiles (id, email, full_name, initials, password_set)
    values (new.id, coalesce(new.email, ''), nm, left(ini, 4), coalesce(new.encrypted_password, '') <> '');
  end if;
  return new;
end $$;

-- 5. "My Activity": everyone can read the history of what they did.
drop policy if exists "audit: own activity" on public.audit_log;
create policy "audit: own activity" on public.audit_log for select
  using (public.is_active_user() and actor_id = auth.uid());

-- 6. Optional email alert to an admin when someone requests access.
--    Works only after the one-time setup in docs/EMAIL_SETUP.md (a free
--    Resend API key kept in the Supabase Vault, sent with the pg_net
--    extension). Until then it quietly does nothing; requests still appear
--    on the Users page.
alter table public.app_settings drop column if exists alert_from_email;
alter table public.app_settings add column if not exists alert_email text not null default '';

create or replace function public.alert_admins_of_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  api_key text;
  to_addr text;
begin
  if new.status <> 'requested' or (tg_op = 'UPDATE' and old.status = 'requested') then
    return new;
  end if;
  begin
    select alert_email into to_addr from public.app_settings where id = 1;
    execute 'select decrypted_secret from vault.decrypted_secrets where name = ''resend_api_key'' limit 1' into api_key;
    if coalesce(api_key, '') = '' or coalesce(to_addr, '') = '' then
      return new;
    end if;
    execute 'select net.http_post(url := $1, body := $2, headers := $3)'
      using 'https://api.resend.com/emails',
            jsonb_build_object(
              'from', 'CryoManager <onboarding@resend.dev>',
              'to', jsonb_build_array(to_addr),
              'subject', 'CryoManager: ' || new.full_name || ' is asking for access',
              'text',
                new.full_name || ' (' || new.initials || ', ' || new.email || ') asked for access to the LN2 inventory.' || chr(10) || chr(10) ||
                'Approve or decline them in CryoManager → Users.'),
            jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json');
  exception when others then
    -- Never block a request because the alert could not be sent.
    raise notice 'Admin alert not sent: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists invitations_alert_admins on public.invitations;
create trigger invitations_alert_admins
  after insert or update on public.invitations
  for each row execute function public.alert_admins_of_request();
