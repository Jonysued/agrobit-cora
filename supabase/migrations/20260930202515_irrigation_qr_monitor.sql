-- QR monitoring: registered operators record actions; admins configure devices.
-- Operational state and events can only be changed together through audited RPCs.
create table public.irrigation_devices (
  id uuid primary key default gen_random_uuid(),
  qr_token uuid not null unique default gen_random_uuid(),
  kind text not null check (kind in ('well','valve')),
  name text not null check (length(trim(name)) between 1 and 120),
  farm text not null check (length(trim(farm)) between 1 and 120),
  pump_id text unique references public.pumps(id) on delete restrict,
  parent_well_id uuid references public.irrigation_devices(id) on delete restrict,
  lot_ids text[] not null default '{}',
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  notes text not null default '',
  current_active boolean,
  state_since timestamptz,
  has_events boolean not null default false,
  created_date timestamptz not null default clock_timestamp(),
  updated_date timestamptz not null default clock_timestamp(),
  check ((latitude is null) = (longitude is null)),
  check ((kind = 'well' and parent_well_id is null and cardinality(lot_ids) = 0)
      or (kind = 'valve' and parent_well_id is not null and cardinality(lot_ids) > 0)),
  check (kind = 'well' or pump_id is null),
  unique (farm,kind,name)
);
create index irrigation_devices_parent_idx on public.irrigation_devices(parent_well_id);
create table public.irrigation_device_events (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  request_id uuid not null unique,
  device_id uuid not null references public.irrigation_devices(id) on delete restrict,
  active boolean not null,
  occurred_at timestamptz not null default clock_timestamp(),
  recorded_at timestamptz not null default clock_timestamp(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  corrections jsonb not null default '[]'::jsonb
);
create index irrigation_device_events_time_idx on public.irrigation_device_events(device_id,occurred_at,sequence);
alter table public.irrigation_devices enable row level security;
alter table public.irrigation_device_events enable row level security;
create policy irrigation_devices_read on public.irrigation_devices for select to authenticated
  using (exists(select 1 from public.profiles where id=(select auth.uid())));
create policy irrigation_devices_create on public.irrigation_devices for insert to authenticated with check (public.is_admin());
create policy irrigation_devices_edit on public.irrigation_devices for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy irrigation_events_read on public.irrigation_device_events for select to authenticated
  using (exists(select 1 from public.profiles where id=(select auth.uid())));
revoke all on public.irrigation_devices,public.irrigation_device_events from anon,authenticated;
grant select on public.irrigation_devices,public.irrigation_device_events to authenticated;
grant insert(kind,name,farm,pump_id,parent_well_id,lot_ids,latitude,longitude,notes) on public.irrigation_devices to authenticated;
grant update(name,farm,parent_well_id,lot_ids,latitude,longitude,notes) on public.irrigation_devices to authenticated;

create function public.validate_irrigation_device() returns trigger language plpgsql set search_path='' as $$
begin
  if TG_OP='UPDATE' and old.has_events and
    (new.kind<>old.kind or new.farm<>old.farm or new.parent_well_id is distinct from old.parent_well_id or new.lot_ids<>old.lot_ids) then
    raise exception 'El equipo ya tiene historial. No se puede cambiar su finca, pozo ni lotes vinculados.';
  end if;
  if new.kind='valve' then
    if not exists(select 1 from public.irrigation_devices where id=new.parent_well_id and kind='well') then
      raise exception 'Seleccioná un pozo válido.';
    end if;
    if exists(select 1 from unnest(new.lot_ids) as l(id) where not exists(select 1 from public.lots where lots.id=l.id and lots.farm=new.farm)) then
      raise exception 'Los lotes deben pertenecer a la finca de la válvula.';
    end if;
  end if;
  new.updated_date=clock_timestamp(); return new;
end; $$;
revoke all on function public.validate_irrigation_device() from public,anon,authenticated;
create trigger validate_irrigation_device before insert or update on public.irrigation_devices
  for each row execute function public.validate_irrigation_device();

-- The SECURITY DEFINER boundary is deliberate: operators cannot update state or
-- insert/change events directly. It checks membership, locks, and stamps identity.
create function public.record_irrigation_action(p_device_id uuid,p_active boolean,p_request_id uuid)
returns public.irrigation_device_events language plpgsql security definer set search_path='' as $$
declare d public.irrigation_devices; ev public.irrigation_device_events; actor text; ts timestamptz;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para registrar una acción.'; end if;
  select coalesce(nullif(full_name,''),email,'Operador') into actor from public.profiles where id=auth.uid();
  if actor is null then raise exception 'Usuario no habilitado.'; end if;
  if p_active is null or p_request_id is null then raise exception 'Acción incompleta.'; end if;
  perform pg_advisory_xact_lock(60930202515);
  select * into ev from public.irrigation_device_events where request_id=p_request_id;
  if found then
    if ev.device_id<>p_device_id or ev.active<>p_active or ev.actor_id<>auth.uid() then raise exception 'Solicitud inválida.'; end if;
    return ev;
  end if;
  select * into d from public.irrigation_devices where id=p_device_id for update;
  if not found then raise exception 'Equipo no encontrado.'; end if;
  if d.current_active is not distinct from p_active then raise exception 'El equipo ya tiene ese estado. Actualizá la vista.'; end if;
  ts=clock_timestamp();
  insert into public.irrigation_device_events(request_id,device_id,active,occurred_at,recorded_at,actor_id,actor_name)
    values(p_request_id,p_device_id,p_active,ts,ts,auth.uid(),actor) returning * into ev;
  update public.irrigation_devices set current_active=p_active,state_since=ts,has_events=true where id=p_device_id;
  return ev;
end; $$;
revoke all on function public.record_irrigation_action(uuid,boolean,uuid) from public,anon;
grant execute on function public.record_irrigation_action(uuid,boolean,uuid) to authenticated;

create function public.correct_irrigation_action(p_event_id uuid,p_active boolean,p_occurred_at timestamptz,p_reason text)
returns public.irrigation_device_events language plpgsql security definer set search_path='' as $$
declare ev public.irrigation_device_events; last_ev public.irrigation_device_events; actor text; created timestamptz;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Solo un administrador puede corregir registros.'; end if;
  if p_active is null or p_occurred_at is null or length(trim(coalesce(p_reason,'')))<5 then raise exception 'Completá fecha, estado y motivo de la corrección.'; end if;
  if p_occurred_at>clock_timestamp() then raise exception 'La acción no puede estar en el futuro.'; end if;
  perform pg_advisory_xact_lock(60930202515);
  select * into ev from public.irrigation_device_events where id=p_event_id for update;
  if not found then raise exception 'Registro no encontrado.'; end if;
  select created_date into created from public.irrigation_devices where id=ev.device_id for update;
  if p_occurred_at<created then raise exception 'La acción no puede ser anterior al alta del equipo.'; end if;
  select coalesce(nullif(full_name,''),email,'Administrador') into actor from public.profiles where id=auth.uid();
  update public.irrigation_device_events set active=p_active,occurred_at=p_occurred_at,
    corrections=corrections || jsonb_build_array(jsonb_build_object('previous_active',ev.active,'previous_occurred_at',ev.occurred_at,'corrected_at',clock_timestamp(),'corrected_by',auth.uid(),'corrected_by_name',actor,'reason',trim(p_reason)))
    where id=p_event_id returning * into ev;
  select * into last_ev from public.irrigation_device_events where device_id=ev.device_id order by occurred_at desc,sequence desc limit 1;
  update public.irrigation_devices set current_active=last_ev.active,state_since=last_ev.occurred_at where id=ev.device_id;
  return ev;
end; $$;
revoke all on function public.correct_irrigation_action(uuid,boolean,timestamptz,text) from public,anon;
grant execute on function public.correct_irrigation_action(uuid,boolean,timestamptz,text) to authenticated;

-- Consecutive equal states (after an administrative correction) collapse into
-- one interval. Unknown time before the first record never counts as irrigation.
create function public.irrigation_device_sessions(p_device_id uuid,p_from timestamptz,p_limit integer default 50,p_offset integer default 0)
returns table(event_id uuid,started_at timestamptz,ended_at timestamptz,duration_seconds numeric,effective_seconds numeric,actor_name text,calculated_at timestamptz)
language sql stable security invoker set search_path='' as $$
  with ordered as (
    select e.*,lag(active) over(partition by device_id order by occurred_at,sequence) as previous
    from public.irrigation_device_events e
    where device_id=p_device_id or device_id=(select parent_well_id from public.irrigation_devices where id=p_device_id)
  ), changes as (
    select * from ordered where active is distinct from previous
  ), intervals as (
    select *,lead(occurred_at) over(partition by device_id order by occurred_at,sequence) as finish from changes
  )
  select i.id,i.occurred_at,i.finish,
    extract(epoch from(coalesce(i.finish,statement_timestamp())-i.occurred_at)),
    case when d.kind='well' then extract(epoch from(coalesce(i.finish,statement_timestamp())-i.occurred_at))
      else coalesce((select sum(greatest(0,extract(epoch from(least(coalesce(w.finish,statement_timestamp()),coalesce(i.finish,statement_timestamp()))-greatest(w.occurred_at,i.occurred_at)))))
        from intervals w where w.device_id=d.parent_well_id and w.active),0) end,
    i.actor_name,statement_timestamp()
  from intervals i join public.irrigation_devices d on d.id=i.device_id
  where i.device_id=p_device_id and i.active and coalesce(i.finish,statement_timestamp())>=p_from
  order by i.occurred_at desc,i.sequence desc limit least(greatest(p_limit,1),100) offset greatest(p_offset,0);
$$;
revoke all on function public.irrigation_device_sessions(uuid,timestamptz,integer,integer) from public,anon;
grant execute on function public.irrigation_device_sessions(uuid,timestamptz,integer,integer) to authenticated;

-- Only known wells are imported. Valve identities/coordinates are not guessed.
insert into public.irrigation_devices(kind,name,farm,pump_id)
select 'well',p.name,coalesce(nullif(p.farm,''),'Sin finca'),p.id from public.pumps p where nullif(trim(p.name),'') is not null
on conflict(pump_id) do nothing;

-- Polling remains a fallback while Realtime broadcasts committed changes.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.irrigation_devices,public.irrigation_device_events;
  end if;
end; $$;
