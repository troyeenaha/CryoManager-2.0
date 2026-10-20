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
 ('00000000-0000-0000-0000-00000000000a', 'admin@umich.edu',   '{"full_name":"Ada Admin"}'),
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

insert into samples (id, box_id, row_num, col_num, sample_name, transfected, passage_number, passaged_by, media, passage_date)
values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1, 2,
        'EO771 HER2', true, 5, 'Max Member', '10% DMSO, 90% FBS', '2026-02-11');
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

reset role;
\echo
\echo 'ALL DATABASE TESTS PASSED'
