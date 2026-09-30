-- Operator permissions come from the protected profile, never user_metadata.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin','user','regador'));

create schema if not exists private;
grant usage on schema private to authenticated;
create function private.is_regador() returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid() and role='regador');
$$;
revoke all on function private.is_regador() from public,anon;
grant execute on function private.is_regador() to authenticated;

-- Existing permissive policies are ANDed with this boundary, so other roles
-- retain their current behavior. Operators receive map-only lot fields via RPC.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='public'
    and tablename not in ('profiles','irrigation_devices','irrigation_device_events') loop
    execute format('create policy regador_module_boundary on public.%I as restrictive for all to authenticated using (not (select private.is_regador())) with check (not (select private.is_regador()))',t.tablename);
  end loop;
end; $$;
create policy regador_storage_boundary on storage.objects as restrictive for all to authenticated
  using (not (select private.is_regador())) with check (not (select private.is_regador()));

-- Only this audited/authorized boundary changes roles. No self-escalation or
-- concurrent removal of the last administrator through direct profile writes.
revoke update on public.profiles from authenticated;
create function private.set_user_profile_role(p_user_id uuid,p_role text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Iniciá sesión.'; end if;
  lock table public.profiles in share row exclusive mode;
  if not public.is_admin() then raise exception 'Solo un administrador puede asignar perfiles.'; end if;
  if p_role is null or p_role not in ('admin','user','regador') then raise exception 'Perfil inválido.'; end if;
  if p_user_id=auth.uid() then raise exception 'No podés modificar tu propio perfil.'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Usuario no encontrado.'; end if;
  if p_role<>'admin' and exists(select 1 from public.profiles where id=p_user_id and role='admin')
    and (select count(*) from public.profiles where role='admin')<=1 then raise exception 'Debe quedar al menos un administrador.'; end if;
  update public.profiles set role=p_role where id=p_user_id;
end; $$;
revoke all on function private.set_user_profile_role(uuid,text) from public,anon;
grant execute on function private.set_user_profile_role(uuid,text) to authenticated;
create function public.set_user_profile_role(p_user_id uuid,p_role text) returns void
language sql security invoker set search_path='' as $$ select private.set_user_profile_role(p_user_id,p_role); $$;
revoke all on function public.set_user_profile_role(uuid,text) from public,anon;
grant execute on function public.set_user_profile_role(uuid,text) to authenticated;

create function private.irrigation_map_lots() returns table(id text,name text,farm text,polygon jsonb)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where profiles.id=auth.uid()) then raise exception 'Usuario no habilitado.'; end if;
  return query select l.id,l.name,l.farm,l.polygon from public.lots l
    where exists(select 1 from public.irrigation_devices d where l.id=any(d.lot_ids));
end; $$;
revoke all on function private.irrigation_map_lots() from public,anon;
grant execute on function private.irrigation_map_lots() to authenticated;
create function public.irrigation_map_lots() returns table(id text,name text,farm text,polygon jsonb)
language sql stable security invoker set search_path='' as $$ select * from private.irrigation_map_lots(); $$;
revoke all on function public.irrigation_map_lots() from public,anon;
grant execute on function public.irrigation_map_lots() to authenticated;
