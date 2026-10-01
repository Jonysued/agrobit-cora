-- Consolidate duplicate physical wells while retaining the manually located
-- devices, their QR tokens, all valve identities and the complete event history.
-- The original rows are archived privately for recovery and audit.
begin;
create table if not exists private.irrigation_well_merge_audit (
  id uuid primary key default gen_random_uuid(),
  recorded_at timestamptz not null default clock_timestamp(),
  snapshot jsonb not null, result jsonb
);
alter table private.irrigation_well_merge_audit enable row level security;
revoke all on private.irrigation_well_merge_audit from public,anon,authenticated;
create policy irrigation_well_merge_audit_private on private.irrigation_well_merge_audit
  for all to authenticated using(false) with check(false);

-- Same ordering lock as both irrigation action RPCs. No state events can
-- interleave with the administrative reconciliation of the same physical wells.
select pg_advisory_xact_lock(60930202515);
lock table public.irrigation_devices,public.irrigation_device_events in share row exclusive mode;
create temporary table well_merge_pairs on commit drop as
select o.id as old_id,n.id as kept_id,o.pump_id,o.source_key,
       to_jsonb(o) as old_row,to_jsonb(n) as kept_row
from public.irrigation_devices o
join public.irrigation_devices n on n.kind='well'
  and n.latitude is not null and n.longitude is not null and n.pump_id is null
  and trim(n.name)=regexp_replace(trim(o.name),'^Pozo\s+','','i')
  and (n.farm=o.farm or (o.farm='Las 500' and n.farm='Las 115' and trim(n.name)='7'))
where o.kind='well' and o.latitude is null and o.longitude is null and o.pump_id is not null;

-- Keep the original protection flags for the recorded valve. Its equipment,
-- sector, state and events stay unchanged: only the duplicate well ID is merged.
create temporary table well_merge_valves on commit drop as
select v.* from public.irrigation_devices v join well_merge_pairs m on v.parent_well_id=m.old_id;

do $$
declare archive_id uuid; events_before jsonb; expected_valves integer;
begin
  if (select count(*) from well_merge_pairs)<>9
     or (select count(distinct old_id) from well_merge_pairs)<>9
     or (select count(distinct kept_id) from well_merge_pairs)<>9
     or (select count(*) from public.irrigation_devices where kind='well')<>18
  then raise exception 'Expected exactly nine unambiguous pairs; no changes applied.'; end if;
  if exists(select 1 from public.irrigation_device_events e join well_merge_pairs m on e.device_id=m.old_id)
     or exists(select 1 from public.irrigation_devices o join well_merge_pairs m on o.id=m.old_id where o.has_events or o.current_active is not null)
  then raise exception 'An old well has recorded history; automatic removal refused.'; end if;
  if (select count(*) from well_merge_valves)<>97
  then raise exception 'Expected the existing 97 valve associations; no changes applied.'; end if;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.sequence),'[]'::jsonb) into events_before from public.irrigation_device_events e;
  select count(*) into expected_valves from public.irrigation_devices where kind='valve';
  insert into private.irrigation_well_merge_audit(snapshot)
  values(jsonb_build_object('pairs',(select jsonb_agg(to_jsonb(m)) from well_merge_pairs m),
    'valves',(select jsonb_agg(to_jsonb(v)) from well_merge_valves v),
    'events',events_before)) returning id into archive_id;

  -- A single transaction temporarily clears/restores only this identity guard;
  -- triggers, constraints, RLS and state/history remain enabled and intact.
  update public.irrigation_devices v set has_events=false
    from well_merge_valves prior where v.id=prior.id and prior.has_events;
  update public.irrigation_devices v set parent_well_id=m.kept_id
    from well_merge_pairs m where v.parent_well_id=m.old_id;
  update public.irrigation_devices v set has_events=prior.has_events
    from well_merge_valves prior where v.id=prior.id and prior.has_events;

  -- Release the old unique pump association, then attach it to the kept well.
  update public.irrigation_devices o set pump_id=null from well_merge_pairs m where o.id=m.old_id;
  update public.irrigation_devices n set pump_id=m.pump_id,source_key=coalesce(n.source_key,m.source_key)
    from well_merge_pairs m where n.id=m.kept_id;
  update public.pumps p set farm=n.farm from well_merge_pairs m
    join public.irrigation_devices n on n.id=m.kept_id where p.id=m.pump_id and p.farm is distinct from n.farm;
  delete from public.irrigation_devices o using well_merge_pairs m where o.id=m.old_id;

  if (select count(*) from public.irrigation_devices where kind='well')<>9
     or (select count(*) from public.irrigation_devices where kind='valve')<>expected_valves
     or exists(select 1 from public.irrigation_devices where kind='well' and (latitude is null or longitude is null or pump_id is null))
     or exists(select 1 from well_merge_pairs m join public.irrigation_devices n on n.id=m.kept_id
       where n.qr_token::text<>(m.kept_row->>'qr_token') or n.latitude<> (m.kept_row->>'latitude')::double precision
       or n.longitude<>(m.kept_row->>'longitude')::double precision or n.farm<>(m.kept_row->>'farm'))
     or exists(select 1 from well_merge_valves prior join public.irrigation_devices v on v.id=prior.id
       join well_merge_pairs m on m.old_id=prior.parent_well_id
       where v.parent_well_id<>m.kept_id or v.has_events<>prior.has_events
       or v.current_active is distinct from prior.current_active or v.state_since is distinct from prior.state_since
       or v.qr_token<>prior.qr_token or v.lot_ids<>prior.lot_ids or v.portion<>prior.portion)
     or (select coalesce(jsonb_agg(to_jsonb(e) order by e.sequence),'[]'::jsonb) from public.irrigation_device_events e)<>events_before
  then raise exception 'Post-merge integrity check failed; all changes rolled back.'; end if;
  update private.irrigation_well_merge_audit set result=jsonb_build_object('wells',9,'valves',expected_valves,'events_preserved',true,'located_qrs_preserved',true) where id=archive_id;
end $$;
commit;
