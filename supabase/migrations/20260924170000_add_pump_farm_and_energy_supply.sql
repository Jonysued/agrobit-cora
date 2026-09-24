alter table public.pumps
  add column if not exists farm text,
  add column if not exists energy_supply_number text;

comment on column public.pumps.farm is
  'Finca en la que se encuentra el pozo o bomba.';

comment on column public.pumps.energy_supply_number is
  'Identificador del suministro eléctrico. No es único: un suministro puede alimentar varios pozos.';

create index if not exists pumps_farm_idx
  on public.pumps (farm);

create index if not exists pumps_energy_supply_number_idx
  on public.pumps (energy_supply_number);
