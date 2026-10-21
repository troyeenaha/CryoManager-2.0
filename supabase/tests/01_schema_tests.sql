-- Behaviour tests for the CryoManager schema. Run with scripts/test-db.sh.
-- Each check raises an exception (and stops the run) if a rule is broken.
\set ON_ERROR_STOP on
\set QUIET on

create schema test;
grant usage on schema test to authenticated, anon;

create function test.expect_error(q text, pattern text) returns void
language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if sqlerrm ilike pattern then
      raise notice 'PASS  blocked: %', sqlerrm;
      return;
    end if;
    raise exception 'FAIL  wrong error for [%]: %', q, sqlerrm;
  end;
  raise exception 'FAIL  expected error "%" but statement succeeded: %', pattern, q;
end $$;

create function test.expect_rows(q text, n int) returns void
language plpgsql as $$
declare got int;
begin
  execute q;
  get diagnostics got = row_count;
  if got <> n then
    raise exception 'FAIL  expected % row(s), got % for: %', n, got, q;
  end if;
  raise notice 'PASS  % row(s): %', got, left(q, 70);
end $$;

create function test.expect(cond boolean, what text) returns void
language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FAIL  %', what; end if;
  raise notice 'PASS  %', what;
end $$;
grant execute on all functions in schema test to authenticated, anon;

-- ----- users -------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'admin@umich.edu',   '{"full_name":"Ada Admin","initials":"a.a"}'),
 ('00000000-0000-0000-0000-00000000000b', 'member@umich.edu',  '{"full_name":"Max Member"}'),
 ('00000000-0000-0000-0000-00000000000c', 'viewer@umich.edu',  '{"full_name":"Vic Viewer"}'),
 ('00000000-0000-0000-0000-00000000000d', 'pending@umich.edu', '{"full_name":"Pat Pending"}');

select test.expect((select count(*) = 4 from profiles where status = 'pending' and role = 'viewer'),
  'new sign-ups start as pending viewers');

-- Bootstrap first admin from the SQL editor (no logged-in user)
update profiles set role = 'admin', status = 'active' where email = 'admin@umich.edu';

-- ----- log in as admin ---------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;

select test.expect(public.is_admin(), 'bootstrapped admin is admin');
update profiles set status = 'active', role = 'member' where email = 'member@umich.edu';
update profiles set status = 'active' where email = 'viewer@umich.edu';
select test.expect((select approved_by = '00000000-0000-0000-0000-00000000000a' from profiles where email='member@umich.edu'),
  'approval records who approved');

insert into tanks (id, name, location, rack_capacity) values
 ('10000000-0000-0000-0000-000000000001', 'LN2 Tank', 'NCRC Building 28, Room 028-G135', 2);
insert into racks (id, tank_id, name, box_capacity) values
 ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'A', 1);
insert into boxes (id, rack_id, name, rows, cols, color) values
 ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'A1', 12, 12, 'blue');

select test.expect_error($q$insert into racks (tank_id, name) values ('10000000-0000-0000-0000-000000000001', 'a')$q$,
  '%duplicate key%racks_name_unique_in_tank%');
insert into racks (id, tank_id, name) values
 ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'B');
select test.expect_error($q$insert into racks (tank_id, name) values ('10000000-0000-0000-0000-000000000001', 'C')$q$,
  '%is full (2 of 2 racks)%');
select test.expect_error($q$insert into boxes (rack_id, name) values ('20000000-0000-0000-0000-000000000001', 'A2')$q$,
  '%is full (1 of 1 boxes)%');
select test.expect_error($q$update tanks set rack_capacity = 1 where name = 'LN2 Tank'$q$,
  '%capacity cannot be set below%');
select test.expect_error($q$delete from tanks where name = 'LN2 Tank'$q$,
  '%violates foreign key%');
select test.expect_error($q$update tanks set status = 'archived' where name = 'LN2 Tank'$q$,
  '%Archive or move the 2 rack%');
select test.expect((select version = 1 from tanks where name='LN2 Tank'), 'failed updates leave version unchanged');

-- ----- member: samples ---------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
set role authenticated;

insert into samples (id, box_id, row_num, col_num, sample_name, transfected, transfected_with, passage_number, passaged_by, media, passage_date)
values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1, 2,
        'EO771 HER2', true, 'pLenti-HER2', 5, 'Max Member', '10% DMSO, 90% FBS', '2026-02-11');
select test.expect((select sample_code like 'S-0000%' and position = 'A2' from sample_locations), 'sample gets ID and A2 label');
select test.expect((select tank_name || ' > ' || rack_name || ' > ' || box_name = 'LN2 Tank > A > A1' from sample_locations),
  'location path resolves');

select test.expect_error($q$insert into samples (box_id, row_num, col_num, sample_name)
  values ('30000000-0000-0000-0000-000000000001', 1, 2, 'Overwrite attempt')$q$, '%samples_one_per_position%');
select test.expect_error($q$insert into samples (box_id, row_num, col_num, sample_name)
  values ('30000000-0000-0000-0000-000000000001', 13, 1, 'Off grid')$q$, '%outside box%');
select test.expect_error($q$insert into samples (box_id, row_num, col_num, sample_name)
  values ('30000000-0000-0000-0000-000000000001', 3, 3, '   ')$q$, '%check constraint%');

insert into samples (id, box_id, row_num, col_num, sample_name) values
 ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 1, 3, '4T1');

-- move: success, then occupied target, then stale version
select test.expect((select (move_sample('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 2, 1, 1)).version = 2),
  'move to B1 succeeds and bumps version');
select test.expect_error($q$select move_sample('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1, 3, 2)$q$,
  '%already occupied by "4T1"%');
select test.expect_error($q$select move_sample('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 5, 5, 1)$q$,
  '%changed by someone else%');

-- optimistic edit: stale version updates nothing
select test.expect_rows($q$update samples set notes = 'x' where id = '40000000-0000-0000-0000-000000000002' and version = 99$q$, 0);
select test.expect_rows($q$update samples set notes = 'thawed one vial' where id = '40000000-0000-0000-0000-000000000002' and version = 1$q$, 1);
select test.expect_rows($q$update samples set sample_code = 'HACK' where id = '40000000-0000-0000-0000-000000000002'$q$, 1);
select test.expect((select sample_code <> 'HACK' from samples where id = '40000000-0000-0000-0000-000000000002'), 'sample IDs are immutable');

-- members cannot touch storage structure or delete
select test.expect_error($q$insert into tanks (name) values ('Rogue tank')$q$, '%row-level security%');
select test.expect_rows($q$update tanks set name = 'Renamed'$q$, 0);
select test.expect_rows($q$delete from samples$q$, 0);
select test.expect_error($q$update profiles set role = 'admin' where id = auth.uid()$q$, '%Only an administrator%');
select test.expect_error($q$insert into audit_log (action, entity_type, entity_id) values ('x','x',gen_random_uuid())$q$, '%permission denied%');

-- archive frees the slot; restoring into a now-taken slot fails
update samples set status = 'archived', archive_reason = 'used up' where id = '40000000-0000-0000-0000-000000000002';
insert into samples (box_id, row_num, col_num, sample_name) values ('30000000-0000-0000-0000-000000000001', 1, 3, 'MDA-MB-231');
select test.expect_error($q$update samples set status = 'active' where id = '40000000-0000-0000-0000-000000000002'$q$,
  '%samples_one_per_position%');

select test.expect((select string_agg(action, ',' order by id) = 'create,move,update,archive'
                    from audit_log where entity_id = '40000000-0000-0000-0000-000000000002'
                       or (entity_id = '40000000-0000-0000-0000-000000000001' and action = 'move')),
  'audit trail records create / move / edits / archive');
select test.expect((select count(*) = 0 from audit_log where entity_type = 'tank'), 'members cannot read non-sample audit');

-- ----- viewer: read only -------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
set role authenticated;
select test.expect((select count(*) = 2 from samples where status = 'active'), 'viewer can read inventory');
select test.expect_error($q$insert into samples (box_id, row_num, col_num, sample_name) values ('30000000-0000-0000-0000-000000000001', 4, 4, 'x')$q$,
  '%row-level security%');
select test.expect_rows($q$update samples set notes = 'viewer edit'$q$, 0);
select test.expect_error($q$select move_sample('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 6, 6, 2)$q$,
  '%permission%');
select test.expect((select (inventory_stats() ->> 'occupied_positions')::int = 2
                       and (inventory_stats() ->> 'total_positions')::int = 144), 'stats use physical slots, not names or vials');

-- ----- pending user: sees nothing ----------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', false);
set role authenticated;
select test.expect((select count(*) = 0 from samples) and (select count(*) = 0 from tanks), 'pending user sees no inventory');
select test.expect((select count(*) = 1 from profiles), 'pending user sees only own profile');

-- ----- anonymous: nothing ------------------------------------------
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select test.expect_error($q$select * from samples$q$, '%permission denied%');

-- ----- admin: box rules, disabling, last-admin guard ----------------
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;
select test.expect_error($q$update boxes set rows = 1 where name = 'A1'$q$, '%cannot be made smaller%');
select test.expect_error($q$update boxes set status = 'archived' where name = 'A1'$q$, '%still holds 2 active sample%');
select test.expect_error($q$update profiles set role = 'member' where email = 'admin@umich.edu'$q$, '%At least one active administrator%');
update profiles set status = 'disabled' where email = 'member@umich.edu';

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
set role authenticated;
select test.expect((select count(*) = 0 from samples), 'disabled member loses access immediately');

-- ----- rack colors & box shades -------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;
update racks set color = 'purple', box_capacity = 12 where name = 'A';
insert into boxes (rack_id, name) values ('20000000-0000-0000-0000-000000000001', 'A10'), ('20000000-0000-0000-0000-000000000001', 'A2');
select test.expect((select string_agg(name || ':' || shade_index || '/' || shade_count, ',' order by shade_index)
                      = 'A1:1/3,A2:2/3,A10:3/3' from box_summary where rack_name = 'A'),
  'boxes take natural-order shades of their rack');
select test.expect((select bool_and(rack_color = 'purple') from box_summary where rack_name = 'A'), 'boxes inherit rack color');
select test.expect((select rack_color = 'purple' and shade_count = 3 from sample_locations limit 1), 'sample locations carry the rack shade');

-- ----- initials, transfected_with, grid name, bulk fill ------------------
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000e', 'new@umich.edu', '{"full_name":"Nia Newton","initials":"n.n"}');
select test.expect((select initials = 'NN' from profiles where email = 'new@umich.edu'), 'initials from sign-up are cleaned to NN');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
set role authenticated;
select test.expect_rows($q$update profiles set initials = 'VV' where id = auth.uid()$q$, 1);
select test.expect_error($q$update profiles set initials = 'v1' where id = auth.uid()$q$, '%check constraint%');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;
select test.expect_rows($q$insert into samples (box_id, row_num, col_num, sample_name, transfected, transfected_with)
  select '30000000-0000-0000-0000-000000000001', 5, c, 'Bulk line', true, 'pLenti-HER2' from generate_series(1, 4) c$q$, 4);
select test.expect((select count(distinct sample_code) = 4 and bool_and(grid_name like 'A1E_')
                    from sample_locations where sample_name = 'Bulk line'), 'bulk fill gives 4 IDs and grid names A1E1..A1E4');
select test.expect_error($q$insert into samples (box_id, row_num, col_num, sample_name)
  select '30000000-0000-0000-0000-000000000001', 5, c, 'Clash' from generate_series(4, 6) c$q$, '%samples_one_per_position%');
select test.expect((select count(*) = 0 from samples where sample_name = 'Clash'), 'a bulk fill that hits a taken slot saves nothing');

-- ----- initials & transfected-with -----------------------------------
select test.expect((select initials = 'AA' from profiles where email = 'admin@umich.edu'), 'initials captured at sign-up, cleaned to capitals');
update profiles set initials = 'AD' where id = auth.uid();
select test.expect_error($q$update profiles set initials = 'toolong' where id = auth.uid()$q$, '%profiles_initials_check%');
select test.expect_error($q$insert into samples (box_id, row_num, col_num, sample_name, transfected)
  values ('30000000-0000-0000-0000-000000000001', 9, 9, 'X', true)$q$, '%samples_transfected_with_check%');
insert into samples (box_id, row_num, col_num, sample_name, transfected, transfected_with) values
  ('30000000-0000-0000-0000-000000000001', 9, 9, 'X', true, 'pLenti-HER2'),
  ('30000000-0000-0000-0000-000000000001', 9, 10, 'X', true, 'pLenti-HER2');
select test.expect((select grid_name = 'A1I9' from sample_locations where row_num = 9 and col_num = 9), 'grid name = box name + position');
select test.expect_error($q$insert into samples (box_id, row_num, col_num, sample_name) values
  ('30000000-0000-0000-0000-000000000001', 9, 11, 'Y'), ('30000000-0000-0000-0000-000000000001', 9, 9, 'Y')$q$, '%samples_one_per_position%');
select test.expect((select count(*) = 0 from samples where sample_name = 'Y'), 'batch add is all-or-nothing');

-- ----- box nicknames, one vial per slot, bulk move ---------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;
update boxes set label = 'Troyee 1' where id = '30000000-0000-0000-0000-000000000001';
select test.expect((select bool_and(box_label = 'Troyee 1') from sample_locations where box_name = 'A1'), 'box nickname shows on sample locations');
select test.expect((select label = 'Troyee 1' from box_summary where name = 'A1'), 'box nickname shows on box summary');
select test.expect_error($q$insert into samples (box_id, row_num, col_num, sample_name, vial_count)
  values ('30000000-0000-0000-0000-000000000001', 11, 1, 'Two vials', 2)$q$, '%samples_one_vial_per_slot%');

-- bulk move: two samples from A1 row K into box A2, all-or-nothing
insert into samples (id, box_id, row_num, col_num, sample_name) values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 11, 1, 'M1'),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 11, 2, 'M2');
select test.expect((select count(*) = 2 from move_samples(jsonb_build_array(
  jsonb_build_object('id','50000000-0000-0000-0000-000000000001','version',1,'box_id',(select id from boxes where name='A10'),'row',1,'col',1),
  jsonb_build_object('id','50000000-0000-0000-0000-000000000002','version',1,'box_id',(select id from boxes where name='A10'),'row',1,'col',2)))),
  'bulk move moves both samples to another box');
select test.expect((select count(*) = 2 from audit_log where action = 'move' and entity_label in ('M1','M2')), 'each bulk move is in the history');
select test.expect_error($q$select * from move_samples(jsonb_build_array(
  jsonb_build_object('id','50000000-0000-0000-0000-000000000001','version',2,'box_id','30000000-0000-0000-0000-000000000001','row',11,'col',1),
  jsonb_build_object('id','50000000-0000-0000-0000-000000000002','version',2,'box_id','30000000-0000-0000-0000-000000000001','row',1,'col',3)))$q$,
  '%already occupied%');
select test.expect((select count(*) = 2 from samples s join boxes b on b.id = s.box_id where b.name = 'A10' and s.sample_name in ('M1','M2')),
  'a failed bulk move leaves every sample where it was');
select test.expect_error($q$select * from move_samples(jsonb_build_array(
  jsonb_build_object('id','50000000-0000-0000-0000-000000000001','version',2,'box_id','30000000-0000-0000-0000-000000000001','row',12,'col',1),
  jsonb_build_object('id','50000000-0000-0000-0000-000000000002','version',2,'box_id','30000000-0000-0000-0000-000000000001','row',12,'col',1)))$q$,
  '%same position%');
select test.expect_error($q$select * from move_samples(jsonb_build_array(
  jsonb_build_object('id','50000000-0000-0000-0000-000000000001','version',1,'box_id','30000000-0000-0000-0000-000000000001','row',12,'col',1)))$q$,
  '%changed by someone else%');

-- ----- adding people from the app --------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;
insert into invitations (email, full_name, initials, role) values (' Kim.Lee@UMICH.edu ', 'Kim Lee', 'KL', 'member');
select test.expect((select email = 'kim.lee@umich.edu' and invited_by = '00000000-0000-0000-0000-00000000000a' from invitations), 'invitation stored with clean email and inviter');
reset role;
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000f1', 'kim.lee@umich.edu', '{}');
select test.expect((select role = 'member' and status = 'active' and initials = 'KL' and full_name = 'Kim Lee'
                      from profiles where email = 'kim.lee@umich.edu'), 'invited person is active immediately with their role');
select test.expect((select accepted_at is not null from invitations where email = 'kim.lee@umich.edu'), 'invitation marked as used');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f2', 'stranger@gmail.com');
select test.expect((select status = 'pending' and role = 'viewer' from profiles where email = 'stranger@gmail.com'), 'uninvited sign-ups still wait for approval');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', false);
set role authenticated;
select test.expect((select count(*) = 0 from invitations), 'non-admins cannot see invitations');
select test.expect_error($q$insert into invitations (email) values ('x@y.edu')$q$, '%row-level security%');

-- ----- requesting access, approval, own activity --------------------------
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
set role anon;
select test.expect((select public.request_access(' New.Person@Gmail.com ', 'Nora Person', 'n.p') = 'requested'), 'anyone can request access');
select test.expect((select public.request_access('new.person@gmail.com', 'Nora Person', 'NP') = 'already_requested'), 'a second request is recognised');
select test.expect((select public.request_access('admin@umich.edu', 'Ada', 'AA') = 'has_account'), 'existing accounts are told to sign in');
select test.expect_error($q$select public.request_access('bad', 'X Y', 'XY')$q$, '%valid email%');
select test.expect_error($q$select * from invitations$q$, '%permission denied%');
reset role;
-- signing up while still only "requested" does NOT let them in
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'new.person@gmail.com');
select test.expect((select status = 'pending' from profiles where email = 'new.person@gmail.com'), 'a requested (not approved) person stays pending');
delete from profiles where email = 'new.person@gmail.com';
delete from auth.users where email = 'new.person@gmail.com';
-- admin approves → becomes an invitation; the email link creates the account (no password yet)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;
update invitations set status = 'invited', role = 'viewer' where email = 'new.person@gmail.com';
reset role;
insert into auth.users (id, email, encrypted_password) values ('00000000-0000-0000-0000-0000000000a2', 'new.person@gmail.com', '');
select test.expect((select status = 'active' and role = 'viewer' and initials = 'NP' and full_name = 'Nora Person' and password_set = false
                      from profiles where email = 'new.person@gmail.com'), 'approved person gets in with their details and must set a password');
-- they set their password (allowed for themselves)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', false);
set role authenticated;
select test.expect_rows($q$update profiles set password_set = true, full_name = 'Nora P. Person' where id = auth.uid()$q$, 1);
-- my activity: a member sees their own non-sample activity too
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', false);
set role authenticated;
select test.expect((select count(*) >= 1 from audit_log where actor_id = auth.uid() and entity_type = 'profile'), 'people can read their own activity');
select test.expect((select count(*) = 0 from audit_log where entity_type = 'tank'), 'but not other people''s non-sample activity');
reset role;
select test.expect((select count(*) = 1 from invitations where email = 'new.person@gmail.com' and accepted_at is not null), 'approval marked as used');

-- ----- needs_password -----------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', false);
set role authenticated;
select test.expect((select public.needs_password()), 'someone who came in by email link must choose a password');
reset role;
update auth.users set encrypted_password = '$2a$hash' where id = '00000000-0000-0000-0000-0000000000a2';
set role authenticated;
select test.expect((select not public.needs_password()), 'once a password is set they are not asked again');
reset role;
set role anon;
select test.expect_error($q$select public.needs_password()$q$, '%permission denied%');

-- ----- removing a person completely ---------------------------------------
reset role;
-- Max Member (b) created samples; remember what they look like
create temp table before_rm as select id, version, updated_at, created_by from samples where created_by = '00000000-0000-0000-0000-00000000000b';
grant select on before_rm to authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
set role authenticated;
select test.expect_error($q$select public.remove_person('00000000-0000-0000-0000-00000000000b')$q$, '%Only an administrator%');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;
select test.expect_error($q$select public.remove_person(auth.uid())$q$, '%your own account%');
select public.remove_person('00000000-0000-0000-0000-00000000000b');
reset role;
select test.expect((select count(*) = 0 from profiles where id = '00000000-0000-0000-0000-00000000000b')
                   and (select count(*) = 0 from auth.users where id = '00000000-0000-0000-0000-00000000000b'), 'removed person has no account or login left');
select test.expect((select count(*) > 0 from before_rm) and not exists (
  select 1 from before_rm b join samples s using (id) where s.version <> b.version or s.updated_at <> b.updated_at or s.created_by is distinct from b.created_by),
  'their samples are untouched (no new versions, history intact)');
select test.expect((select count(*) = 1 from audit_log where entity_type = 'profile' and action = 'delete' and entity_label = 'member@umich.edu'), 'the removal itself is recorded');
select test.expect((select count(*) > 0 from audit_log where actor_email = 'member@umich.edu'), 'their past actions still show who did them');

reset role;
\echo
\echo 'ALL DATABASE TESTS PASSED'
