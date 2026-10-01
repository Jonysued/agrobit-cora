-- Durable idempotency receipts are not exposed through the Data API.
create table private.offline_receipts (
  request_id uuid primary key, actor_id uuid not null, request jsonb not null,
  result jsonb not null, recorded_at timestamptz not null default clock_timestamp()
);
alter table private.offline_receipts enable row level security;
revoke all on private.offline_receipts from public,anon,authenticated;

create function private.apply_offline_change(p_request_id uuid,p_table text,p_operation text,p_id text,p_payload jsonb,p_expected jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old_row jsonb; result jsonb; receipt private.offline_receipts; req jsonb; cols text; vals text; k text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Solo un administrador puede guardar estos registros.'; end if;
  if p_request_id is null or p_id is null or p_operation is null or p_operation not in ('create','update','delete') then raise exception 'Cambio inválido.'; end if;
  if p_table is null or p_table not in ('campaigns','energy_tariffs','farms','health_records','irrigation_designs','irrigation_logs','irrigation_programs','irrigation_recommendations','lots','lot_documents','lot_water_states','objectives','observations','production_records','pumps','pruning_records','sensors','sensor_readings','soil_behavior_models','soil_layers','soil_monitoring_points','soil_probes','soil_probe_channels','soil_profiles','water_balance_forecasts','weather_stations','weather_observations','weather_forecasts') then raise exception 'Tabla no habilitada para sincronización.'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(p_expected) is distinct from 'object' then raise exception 'Datos inválidos.'; end if;
  req=jsonb_build_object('table',p_table,'operation',p_operation,'id',p_id,'payload',p_payload,'expected',p_expected);
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into receipt from private.offline_receipts where request_id=p_request_id;
  if found then
    if receipt.actor_id<>auth.uid() or receipt.request<>req then raise exception 'Solicitud reutilizada con otros datos.'; end if;
    return receipt.result;
  end if;
  execute format('select to_jsonb(t) from public.%I t where id::text=$1 for update',p_table) into old_row using p_id;
  if p_operation='create' and old_row is not null then raise exception 'El registro ya existe. Revisá el cambio pendiente.'; end if;
  if p_operation<>'create' and old_row is null then raise exception 'El registro fue eliminado. Revisá el cambio pendiente.'; end if;
  if p_operation<>'create' then
    for k in select jsonb_object_keys(p_expected) loop
      if coalesce(old_row->k,'null'::jsonb) is distinct from p_expected->k then raise exception 'El registro cambió en otro dispositivo. Se conserva tu cambio pendiente para revisar.'; end if;
    end loop;
  end if;
  if p_operation='delete' then
    execute format('delete from public.%I where id::text=$1',p_table) using p_id;
    result=jsonb_build_object('id',p_id);
  else
    p_payload=(p_payload-'id') || case when p_operation='create' then jsonb_build_object('id',p_id) else '{}'::jsonb end;
    for k in select jsonb_object_keys(p_payload) loop
      if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=p_table and column_name=k and is_generated='NEVER') then raise exception 'Campo inválido: %',k; end if;
    end loop;
    if p_operation='create' then
      select string_agg(format('%I',key),','),string_agg(format('r.%I',key),',') into cols,vals from jsonb_object_keys(p_payload) key;
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(%I.*)',p_table,cols,vals,p_table,p_table) into result using p_payload;
    else
      select string_agg(format('%I=r.%I',key,key),',') into cols from jsonb_object_keys(p_payload) key;
      if cols is null then result=old_row;
      else execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id::text=$2 returning to_jsonb(t.*)',p_table,cols,p_table) into result using p_payload,p_id; end if;
    end if;
  end if;
  insert into private.offline_receipts(request_id,actor_id,request,result) values(p_request_id,auth.uid(),req,result);
  return result;
end; $$;
revoke all on function private.apply_offline_change(uuid,text,text,text,jsonb,jsonb) from public,anon;
grant execute on function private.apply_offline_change(uuid,text,text,text,jsonb,jsonb) to authenticated;
create function public.apply_offline_change(p_request_id uuid,p_table text,p_operation text,p_id text,p_payload jsonb,p_expected jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.apply_offline_change(p_request_id,p_table,p_operation,p_id,p_payload,p_expected); $$;
revoke all on function public.apply_offline_change(uuid,text,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.apply_offline_change(uuid,text,text,text,jsonb,jsonb) to authenticated;

alter table public.irrigation_device_events add column occurrence_source text not null default 'server' check(occurrence_source in ('server','device'));
create function private.record_irrigation_offline_action(p_device_id uuid,p_active boolean,p_request_id uuid,p_occurred_at timestamptz)
returns public.irrigation_device_events language plpgsql security definer set search_path='' as $$
declare ev public.irrigation_device_events; latest public.irrigation_device_events; actor text;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para sincronizar.'; end if;
  select coalesce(nullif(full_name,''),email,'Operador') into actor from public.profiles where id=auth.uid() and role in ('admin','user','regador');
  if actor is null then raise exception 'Usuario no habilitado.'; end if;
  if p_active is null or p_request_id is null or p_occurred_at is null then raise exception 'Acción incompleta.'; end if;
  if p_occurred_at>clock_timestamp() then raise exception 'La hora del teléfono está adelantada. Revisá su fecha y hora para sincronizar.'; end if;
  perform pg_advisory_xact_lock(60930202515);
  select * into ev from public.irrigation_device_events where request_id=p_request_id;
  if found then
    if ev.actor_id<>auth.uid() or ev.device_id<>p_device_id or ev.active<>p_active or (ev.occurrence_source='device' and ev.occurred_at<>p_occurred_at) then raise exception 'Solicitud inválida.'; end if;
    return ev;
  end if;
  perform 1 from public.irrigation_devices where id=p_device_id for update;
  if not found then raise exception 'Equipo no encontrado.'; end if;
  insert into public.irrigation_device_events(request_id,device_id,active,occurred_at,recorded_at,actor_id,actor_name,occurrence_source)
    values(p_request_id,p_device_id,p_active,p_occurred_at,clock_timestamp(),auth.uid(),actor,'device') returning * into ev;
  select * into latest from public.irrigation_device_events where device_id=p_device_id order by occurred_at desc,sequence desc limit 1;
  update public.irrigation_devices set current_active=latest.active,state_since=latest.occurred_at,has_events=true where id=p_device_id;
  return ev;
end; $$;
revoke all on function private.record_irrigation_offline_action(uuid,boolean,uuid,timestamptz) from public,anon;
grant execute on function private.record_irrigation_offline_action(uuid,boolean,uuid,timestamptz) to authenticated;
create function public.record_irrigation_offline_action(p_device_id uuid,p_active boolean,p_request_id uuid,p_occurred_at timestamptz)
returns public.irrigation_device_events language sql security invoker set search_path='' as $$ select private.record_irrigation_offline_action(p_device_id,p_active,p_request_id,p_occurred_at); $$;
revoke all on function public.record_irrigation_offline_action(uuid,boolean,uuid,timestamptz) from public,anon;
grant execute on function public.record_irrigation_offline_action(uuid,boolean,uuid,timestamptz) to authenticated;
