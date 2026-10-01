-- Regadores can resolve only a scanned QR. No equipment enumeration, geometry
-- or event history is exposed. Existing admin/user policies remain unchanged.
create policy regador_device_boundary on public.irrigation_devices
  as restrictive for all to authenticated
  using (not (select private.is_regador()))
  with check (not (select private.is_regador()));
create policy regador_event_boundary on public.irrigation_device_events
  as restrictive for all to authenticated
  using (not (select private.is_regador()))
  with check (not (select private.is_regador()));

create or replace function private.irrigation_map_lots()
returns table(id text,name text,farm text,polygon jsonb)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where profiles.id=auth.uid())
    or private.is_regador() then raise exception 'Perfil sin acceso al mapa.'; end if;
  return query select l.id,l.name,l.farm,l.polygon from public.lots l
    where exists(select 1 from public.irrigation_devices d where l.id=any(d.lot_ids));
end; $$;

-- Deliberate private definer boundary: RLS blocks all full device rows for
-- operators. This lookup checks membership, requires the unguessable QR token,
-- and returns only the identity and current switch state of that single device.
create function private.irrigation_scanned_device(p_token uuid)
returns table(id uuid,name text,kind text,current_active boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where profiles.id=auth.uid())
    then raise exception 'Usuario no habilitado.'; end if;
  return query select d.id,d.name,d.kind,d.current_active
    from public.irrigation_devices d where d.qr_token=p_token;
end; $$;
revoke all on function private.irrigation_scanned_device(uuid) from public,anon;
grant execute on function private.irrigation_scanned_device(uuid) to authenticated;
create function public.irrigation_scanned_device(p_token uuid)
returns table(id uuid,name text,kind text,current_active boolean)
language sql stable security invoker set search_path='' as $$
  select * from private.irrigation_scanned_device(p_token);
$$;
revoke all on function public.irrigation_scanned_device(uuid) from public,anon;
grant execute on function public.irrigation_scanned_device(uuid) to authenticated;
