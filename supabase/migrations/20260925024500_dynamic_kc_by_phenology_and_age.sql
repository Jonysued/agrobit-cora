begin;

alter table public.soil_profiles
  add column if not exists phenology_delay_days integer not null default 0,
  add column if not exists phenology_delay_start_date date,
  add column if not exists phenology_delay_end_date date,
  add column if not exists kc_override_start_date date,
  add column if not exists kc_override_end_date date;

alter table public.soil_profiles
  drop constraint if exists soil_profiles_phenology_delay_days_check;

alter table public.soil_profiles
  add constraint soil_profiles_phenology_delay_days_check
  check (phenology_delay_days between -90 and 90);

-- La campaña 2026/27 de granada se desplazó 35 días por la helada.
-- El rango evita arrastrar esa corrección a campañas futuras.
update public.soil_profiles as sp
set current_kc = null,
    kc_override_start_date = null,
    kc_override_end_date = null,
    phenology_delay_days = 35,
    phenology_delay_start_date = date '2026-09-01',
    phenology_delay_end_date = date '2027-04-30'
from public.lots as l
where l.id = sp.lot_id
  and lower(l.crop) like '%gran%';

update public.soil_profiles as sp
set current_kc = null,
    kc_override_start_date = null,
    kc_override_end_date = null,
    phenology_delay_days = 0,
    phenology_delay_start_date = null,
    phenology_delay_end_date = null
from public.lots as l
where l.id = sp.lot_id
  and lower(l.crop) like '%oli%';

commit;
