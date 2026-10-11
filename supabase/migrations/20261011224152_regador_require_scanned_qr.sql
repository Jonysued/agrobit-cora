-- Keep the existing offline ledger logic, but make its core inaccessible to clients.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('private.record_irrigation_offline_action(uuid,boolean,uuid,timestamptz)'::regprocedure);
  execute replace(definition, 'FUNCTION private.record_irrigation_offline_action(', 'FUNCTION private.record_irrigation_action_core(');
  definition := pg_get_functiondef('public.record_irrigation_action(uuid,boolean,uuid)'::regprocedure);
  if position(E'\nbegin\n' in definition)=0 then raise exception 'Unexpected online action definition'; end if;
  execute replace(definition,E'\nbegin\n',E'\nbegin\n  if private.is_regador() then raise exception ''Escaneá el QR para registrar esta acción.''; end if;\n');
end $$;
revoke all on function private.record_irrigation_action_core(uuid,boolean,uuid,timestamptz) from public,anon,authenticated;

create or replace function private.record_irrigation_offline_action(p_device_id uuid,p_active boolean,p_request_id uuid,p_occurred_at timestamptz)
returns public.irrigation_device_events language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','user')) then
    raise exception 'Escaneá el QR para registrar esta acción.';
  end if;
  return private.record_irrigation_action_core(p_device_id,p_active,p_request_id,p_occurred_at);
end $$;

create function private.record_irrigation_qr_action(p_token uuid,p_active boolean,p_request_id uuid,p_occurred_at timestamptz)
returns public.irrigation_device_events language plpgsql security definer set search_path='' as $$
declare device_id uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','user','regador')) then
    raise exception 'Usuario no habilitado.';
  end if;
  select id into device_id from public.irrigation_devices where qr_token=p_token;
  if device_id is null then raise exception 'El QR no corresponde a un equipo disponible.'; end if;
  return private.record_irrigation_action_core(device_id,p_active,p_request_id,p_occurred_at);
end $$;
revoke all on function private.record_irrigation_qr_action(uuid,boolean,uuid,timestamptz) from public,anon;
grant execute on function private.record_irrigation_qr_action(uuid,boolean,uuid,timestamptz) to authenticated;
create function public.record_irrigation_qr_action(p_token uuid,p_active boolean,p_request_id uuid,p_occurred_at timestamptz)
returns public.irrigation_device_events language sql security invoker set search_path='' as $$
  select private.record_irrigation_qr_action(p_token,p_active,p_request_id,p_occurred_at);
$$;
revoke all on function public.record_irrigation_qr_action(uuid,boolean,uuid,timestamptz) from public,anon;
grant execute on function public.record_irrigation_qr_action(uuid,boolean,uuid,timestamptz) to authenticated;
