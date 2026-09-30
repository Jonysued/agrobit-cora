-- Import valve identities from the schedule catalog. Coordinates are derived
-- from current lot boundaries by the map; manual GPS locations take precedence.
alter table public.irrigation_devices
  add column portion text not null default '' check(portion in ('','N','S','E','O')),
  add column turno text,
  add column source_key text unique,
  add column location_origin text not null default 'manual' check(location_origin in ('manual','sector_center'));
grant insert(portion,turno,location_origin),update(portion,turno,location_origin) on public.irrigation_devices to authenticated;

-- The existing trigger still enforces membership, well and lot relationships.
-- Once history exists its sector identity cannot be moved to another half.
create function public.validate_irrigation_sector() returns trigger language plpgsql set search_path='' as $$
begin
  if TG_OP='UPDATE' and old.has_events and new.portion<>old.portion then
    raise exception 'El equipo ya tiene historial. No se puede cambiar su sector.';
  end if;
  if new.portion<>'' and (new.kind<>'valve' or cardinality(new.lot_ids)<>1) then
    raise exception 'Un sector dividido debe corresponder a una válvula de un solo lote.';
  end if;
  return new;
end; $$;
revoke all on function public.validate_irrigation_sector() from public,anon,authenticated;
create trigger validate_irrigation_sector before insert or update on public.irrigation_devices for each row execute function public.validate_irrigation_sector();

-- Normalize only explicit aliases; never fall through into another farm.
create function public.irrigation_lot_code(value text) returns text language sql immutable set search_path='' as $$
  select regexp_replace(regexp_replace(lower(trim(value)),'^cuadro','c'),'\s+','','g');
$$;
revoke all on function public.irrigation_lot_code(text) from public,anon,authenticated;

with catalog as (
  select * from jsonb_to_recordset($turnos$[{"well":"Glonet 1","turno":"T1","lot":"C1","portion":""},{"well":"Glonet 1","turno":"T1","lot":"C3","portion":"S"},{"well":"Glonet 1","turno":"T1","lot":"C5","portion":"S"},{"well":"Glonet 1","turno":"T1","lot":"C7","portion":"S"},{"well":"Glonet 1","turno":"T2","lot":"C3","portion":"N"},{"well":"Glonet 1","turno":"T2","lot":"C5","portion":"N"},{"well":"Glonet 1","turno":"T2","lot":"C7","portion":"N"},{"well":"Glonet 1","turno":"T2","lot":"C4","portion":"S"},{"well":"Glonet 1","turno":"T2","lot":"C6","portion":"S"},{"well":"Glonet 1","turno":"T2","lot":"C8","portion":"S"},{"well":"Glonet 1","turno":"T3","lot":"C2","portion":""},{"well":"Glonet 1","turno":"T3","lot":"C4","portion":"N"},{"well":"Glonet 1","turno":"T3","lot":"C6","portion":"N"},{"well":"Glonet 1","turno":"T3","lot":"C8","portion":"N"},{"well":"Glonet 2","turno":"T4","lot":"C9","portion":"S"},{"well":"Glonet 2","turno":"T4","lot":"C11","portion":"S"},{"well":"Glonet 2","turno":"T4","lot":"C13","portion":"S"},{"well":"Glonet 2","turno":"T4","lot":"C15","portion":""},{"well":"Glonet 2","turno":"T5","lot":"C9","portion":"N"},{"well":"Glonet 2","turno":"T5","lot":"C11","portion":"N"},{"well":"Glonet 2","turno":"T5","lot":"C13","portion":"N"},{"well":"Glonet 2","turno":"T5","lot":"C12","portion":"S"},{"well":"Glonet 2","turno":"T5","lot":"C14","portion":"S"},{"well":"Glonet 2","turno":"T6","lot":"C12","portion":"N"},{"well":"Glonet 2","turno":"T6","lot":"C14","portion":"N"},{"well":"Glonet 2","turno":"T6","lot":"C16","portion":""},{"well":"Pozo 1","turno":"T1","lot":"C3","portion":"O"},{"well":"Pozo 1","turno":"T1","lot":"C3","portion":"E"},{"well":"Pozo 1","turno":"T1","lot":"C4","portion":"O"},{"well":"Pozo 1","turno":"T1","lot":"C4","portion":"E"},{"well":"Pozo 1","turno":"T1","lot":"Int C 3","portion":""},{"well":"Pozo 1","turno":"T2","lot":"P3","portion":"O"},{"well":"Pozo 1","turno":"T2","lot":"P3","portion":"E"},{"well":"Pozo 1","turno":"T2","lot":"P4","portion":"O"},{"well":"Pozo 1","turno":"T2","lot":"P4","portion":"E"},{"well":"Pozo 1","turno":"T2","lot":"Int C 4","portion":""},{"well":"Pozo 1","turno":"T3","lot":"P1","portion":"O"},{"well":"Pozo 1","turno":"T3","lot":"P1","portion":"E"},{"well":"Pozo 1","turno":"T3","lot":"P2","portion":"O"},{"well":"Pozo 1","turno":"T3","lot":"P2","portion":"E"},{"well":"Pozo 1","turno":"T3","lot":"Int C 2","portion":""},{"well":"Pozo 2","turno":"T1","lot":"Op1 NO","portion":""},{"well":"Pozo 2","turno":"T1","lot":"Op1 NE","portion":""},{"well":"Pozo 2","turno":"T1","lot":"Op2 NO","portion":""},{"well":"Pozo 2","turno":"T2","lot":"Op1 SO","portion":""},{"well":"Pozo 2","turno":"T2","lot":"Op1 SE","portion":""},{"well":"Pozo 2","turno":"T2","lot":"Op2 SO","portion":""},{"well":"Pozo 3","turno":"T1","lot":"H3","portion":"O"},{"well":"Pozo 3","turno":"T1","lot":"H3","portion":"E"},{"well":"Pozo 3","turno":"T1","lot":"H4","portion":"O"},{"well":"Pozo 3","turno":"T1","lot":"H4","portion":"E"},{"well":"Pozo 3","turno":"T1","lot":"Int A 4","portion":""},{"well":"Pozo 3","turno":"T2","lot":"B3","portion":"O"},{"well":"Pozo 3","turno":"T2","lot":"B3","portion":"E"},{"well":"Pozo 3","turno":"T2","lot":"B4","portion":"O"},{"well":"Pozo 3","turno":"T2","lot":"B4","portion":"E"},{"well":"Pozo 3","turno":"T2","lot":"Int A 3","portion":""},{"well":"Pozo 3","turno":"T3","lot":"Int BS","portion":""},{"well":"Pozo 4","turno":"T1","lot":"H1","portion":"O"},{"well":"Pozo 4","turno":"T1","lot":"H1","portion":"E"},{"well":"Pozo 4","turno":"T1","lot":"H2","portion":"O"},{"well":"Pozo 4","turno":"T1","lot":"H2","portion":"E"},{"well":"Pozo 4","turno":"T1","lot":"Int A 2","portion":""},{"well":"Pozo 4","turno":"T2","lot":"B1","portion":"O"},{"well":"Pozo 4","turno":"T2","lot":"B1","portion":"E"},{"well":"Pozo 4","turno":"T2","lot":"B2","portion":"O"},{"well":"Pozo 4","turno":"T2","lot":"B2","portion":"E"},{"well":"Pozo 4","turno":"T2","lot":"Int A 1","portion":""},{"well":"Pozo 4","turno":"T3","lot":"C1","portion":"O"},{"well":"Pozo 4","turno":"T3","lot":"C1","portion":"E"},{"well":"Pozo 4","turno":"T3","lot":"C2","portion":"O"},{"well":"Pozo 4","turno":"T3","lot":"C2","portion":"E"},{"well":"Pozo 4","turno":"T3","lot":"Int C 1","portion":""},{"well":"Pozo 5","turno":"T3","lot":"Op2 NE","portion":""},{"well":"Pozo 5","turno":"T3","lot":"Op3 NO","portion":""},{"well":"Pozo 5","turno":"T3","lot":"Op3 NE","portion":""},{"well":"Pozo 5","turno":"T4","lot":"Op2 SE","portion":""},{"well":"Pozo 5","turno":"T4","lot":"Op3 SO","portion":""},{"well":"Pozo 5","turno":"T4","lot":"Op3 SE","portion":""},{"well":"Pozo 6","turno":"T1","lot":"Int BC","portion":""},{"well":"Pozo 6","turno":"T2","lot":"Int BN","portion":""},{"well":"Pozo 6","turno":"T3","lot":"Arbosana","portion":""}]$turnos$::jsonb) as c(well text,turno text,lot text,portion text)
), candidates as (
  select l.id as lot_id,l.name,l.farm,c.portion,c.turno,w.id as well_id
  from catalog c
  join public.irrigation_devices w on w.kind='well'
    and w.farm=case when c.well like 'Glonet %' then 'Glonet' else 'Las 500' end
    and w.name=case when c.well like 'Glonet %' then replace(c.well,'Glonet','Pozo') else c.well end
  join public.lots l on l.farm=w.farm and (
    public.irrigation_lot_code(l.name)=public.irrigation_lot_code(c.lot)
    or (c.lot in ('Int BS','Int BC','Int BN') and public.irrigation_lot_code(l.name) ~ ('^'||public.irrigation_lot_code(c.lot)||'[123]$'))
    or (c.lot='Arbosana' and public.irrigation_lot_code(l.name) ~ '^abs[123]$')
  )
), uncovered as (
  -- Lots absent from the turno catalog retain their recorded well assignment.
  -- No turno or cardinal division is invented for these lots (e.g. Las 115).
  select l.id as lot_id,l.name,l.farm,'' as portion,null::text as turno,w.id as well_id
  from public.lots l join public.irrigation_designs d on d.lot_id=l.id
  join public.irrigation_devices w on w.kind='well'
    and w.farm=case when l.farm='Las 115' then 'Las 500' else l.farm end
    and w.name=case when d.well ~ '^[0-9]+$' then 'Pozo '||d.well else d.well end
  where not exists(select 1 from candidates c where c.lot_id=l.id)
), inventory as (
  select * from candidates union select * from uncovered
)
insert into public.irrigation_devices(kind,name,farm,parent_well_id,lot_ids,portion,turno,source_key,location_origin,notes)
select 'valve',trim(name)||case portion when 'N' then ' · Norte' when 'S' then ' · Sur' when 'E' then ' · Este' when 'O' then ' · Oeste' else '' end,
  farm,well_id,array[lot_id],portion,turno,'lot:'||lot_id||':portion:'||portion,'sector_center',
  'Posición de referencia: centro del lote o sector. Ajustable a la ubicación física de la válvula.'
from inventory i
where not exists(select 1 from public.irrigation_devices d where d.kind='valve' and d.lot_ids=array[i.lot_id] and d.portion=i.portion)
on conflict(source_key) do nothing;
