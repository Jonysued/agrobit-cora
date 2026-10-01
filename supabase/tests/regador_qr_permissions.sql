-- Integration assertions against a seeded database. All role/state changes
-- roll back, including the action and its event. Run with an admin DB connection.
begin;
select set_config('test.operator_id',(select id::text from public.profiles order by id limit 1),true);
select set_config('test.device_id',(select id::text from public.irrigation_devices where kind='well' order by id limit 1),true);
select set_config('test.qr_token',(select qr_token::text from public.irrigation_devices where id=current_setting('test.device_id')::uuid),true);
select set_config('test.next_state',(select coalesce(not current_active,true)::text from public.irrigation_devices where id=current_setting('test.device_id')::uuid),true);
update public.profiles set role='regador' where id=current_setting('test.operator_id')::uuid;
select set_config('request.jwt.claim.sub',current_setting('test.operator_id'),true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$
declare scanned record; ev public.irrigation_device_events; req uuid:=gen_random_uuid(); denied boolean:=false;
begin
  if not private.is_regador() then raise exception 'Test did not assume regador role'; end if;
  if exists(select 1 from public.irrigation_devices) then raise exception 'Regador can enumerate equipment'; end if;
  if exists(select 1 from public.irrigation_device_events) then raise exception 'Regador can read event history'; end if;
  if exists(select 1 from public.lots) then raise exception 'Regador can read lots'; end if;
  if exists(select 1 from public.pumps) then raise exception 'Regador can read pump configuration'; end if;
  if exists(select 1 from public.irrigation_programs) then raise exception 'Regador can read schedules'; end if;
  begin perform public.irrigation_map_lots(); exception when raise_exception then denied:=true; end;
  if not denied then raise exception 'Regador can retrieve map geometry'; end if;
  select * into scanned from public.irrigation_scanned_device(current_setting('test.qr_token')::uuid);
  if not found or scanned.id<>current_setting('test.device_id')::uuid then raise exception 'Scanned QR lookup failed'; end if;
  if (select count(*) from jsonb_object_keys(to_jsonb(scanned)))<>4 then raise exception 'QR lookup exposes additional fields'; end if;
  if exists(select 1 from public.irrigation_scanned_device(gen_random_uuid())) then raise exception 'Unknown QR resolves a device'; end if;
  ev:=public.record_irrigation_action(scanned.id,current_setting('test.next_state')::boolean,req);
  if ev.device_id<>scanned.id or ev.actor_id<>auth.uid() then raise exception 'Action identity is incorrect'; end if;
  if (public.record_irrigation_action(scanned.id,current_setting('test.next_state')::boolean,req)).id<>ev.id then raise exception 'Action retry is not idempotent'; end if;
  select * into scanned from public.irrigation_scanned_device(current_setting('test.qr_token')::uuid);
  if scanned.current_active is distinct from current_setting('test.next_state')::boolean then raise exception 'Action did not change current state'; end if;
  if exists(select 1 from public.irrigation_device_sessions(scanned.id,now()-interval '30 days')) then raise exception 'Regador can retrieve sessions'; end if;
  denied:=false;
  begin perform public.correct_irrigation_action(ev.id,false,now(),'Test correction'); exception when raise_exception then denied:=true; end;
  if not denied then raise exception 'Regador can correct history'; end if;
end; $$;
reset role;
update public.profiles set role='user' where id=current_setting('test.operator_id')::uuid;
set local role authenticated;
do $$ begin
  if not exists(select 1 from public.irrigation_devices) then raise exception 'Normal user lost equipment access'; end if;
  perform public.irrigation_map_lots();
end; $$;
reset role;
update public.profiles set role='admin' where id=current_setting('test.operator_id')::uuid;
set local role authenticated;
do $$ begin
  if not public.is_admin() or not exists(select 1 from public.irrigation_devices) then raise exception 'Admin access changed'; end if;
end; $$;
reset role;
select 'regador QR access, action, retries, data isolation, user and admin access: passed' as result;
rollback;
