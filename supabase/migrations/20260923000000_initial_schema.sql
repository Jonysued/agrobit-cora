-- Initial Lucient schema migrated from the previous application backend.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when not exists (select 1 from public.profiles) then 'admin' else 'user' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.set_updated_date()
returns trigger
language plpgsql
as $$
begin
  new.updated_date = now();
  return new;
end;
$$;

alter table public.profiles enable row level security;
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles_admin_update" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, update on public.profiles to authenticated;


create table if not exists public.campaigns (
  id text primary key default gen_random_uuid()::text,
  name text,
  start_year double precision,
  end_year double precision,
  is_current boolean,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.campaigns enable row level security;
create policy "campaigns_select_authenticated" on public.campaigns
  for select to authenticated using (true);
create policy "campaigns_insert_admin" on public.campaigns
  for insert to authenticated with check (public.is_admin());
create policy "campaigns_update_admin" on public.campaigns
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "campaigns_delete_admin" on public.campaigns
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.campaigns to authenticated;

create trigger set_campaigns_updated_date
  before update on public.campaigns
  for each row execute procedure public.set_updated_date();


create table if not exists public.energy_tariffs (
  id text primary key default gen_random_uuid()::text,
  name text,
  price_per_kwh double precision,
  start_time text,
  end_time text,
  notes text,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.energy_tariffs enable row level security;
create policy "energy_tariffs_select_authenticated" on public.energy_tariffs
  for select to authenticated using (true);
create policy "energy_tariffs_insert_admin" on public.energy_tariffs
  for insert to authenticated with check (public.is_admin());
create policy "energy_tariffs_update_admin" on public.energy_tariffs
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "energy_tariffs_delete_admin" on public.energy_tariffs
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.energy_tariffs to authenticated;

create trigger set_energy_tariffs_updated_date
  before update on public.energy_tariffs
  for each row execute procedure public.set_updated_date();


create table if not exists public.farms (
  id text primary key default gen_random_uuid()::text,
  name text,
  latitude double precision,
  longitude double precision,
  weather_source text,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.farms enable row level security;
create policy "farms_select_authenticated" on public.farms
  for select to authenticated using (true);
create policy "farms_insert_admin" on public.farms
  for insert to authenticated with check (public.is_admin());
create policy "farms_update_admin" on public.farms
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "farms_delete_admin" on public.farms
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.farms to authenticated;

create trigger set_farms_updated_date
  before update on public.farms
  for each row execute procedure public.set_updated_date();


create table if not exists public.health_records (
  id text primary key default gen_random_uuid()::text,
  lot_id text,
  campaign text,
  date date,
  problem text,
  incidence text,
  severity text,
  affected_area_ha double precision,
  status text,
  treatment text,
  result text,
  notes text,
  photo_url text,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.health_records enable row level security;
create policy "health_records_select_authenticated" on public.health_records
  for select to authenticated using (true);
create policy "health_records_insert_admin" on public.health_records
  for insert to authenticated with check (public.is_admin());
create policy "health_records_update_admin" on public.health_records
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "health_records_delete_admin" on public.health_records
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.health_records to authenticated;

create trigger set_health_records_updated_date
  before update on public.health_records
  for each row execute procedure public.set_updated_date();


create table if not exists public.irrigation_designs (
  id text primary key default gen_random_uuid()::text,
  lot_id text,
  water_source text,
  well text,
  pump text,
  reservoir text,
  irrigation_sector text,
  valve_code text,
  irrigation_type text,
  sector_area_ha double precision,
  drip_lines_per_row double precision,
  lateral_diameter_mm double precision,
  average_lateral_length_m double precision,
  emitter_spacing_m double precision,
  emitter_flow_lh double precision,
  emitters_per_plant double precision,
  design_pressure_bar double precision,
  emitter_model text,
  filtration_type text,
  installation_year double precision,
  plan_url text,
  notes text,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.irrigation_designs enable row level security;
create policy "irrigation_designs_select_authenticated" on public.irrigation_designs
  for select to authenticated using (true);
create policy "irrigation_designs_insert_admin" on public.irrigation_designs
  for insert to authenticated with check (public.is_admin());
create policy "irrigation_designs_update_admin" on public.irrigation_designs
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "irrigation_designs_delete_admin" on public.irrigation_designs
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.irrigation_designs to authenticated;

create trigger set_irrigation_designs_updated_date
  before update on public.irrigation_designs
  for each row execute procedure public.set_updated_date();


create table if not exists public.irrigation_logs (
  id text primary key default gen_random_uuid()::text,
  program_id text,
  date date,
  applied_mm double precision,
  notes text,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.irrigation_logs enable row level security;
create policy "irrigation_logs_select_authenticated" on public.irrigation_logs
  for select to authenticated using (true);
create policy "irrigation_logs_insert_admin" on public.irrigation_logs
  for insert to authenticated with check (public.is_admin());
create policy "irrigation_logs_update_admin" on public.irrigation_logs
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "irrigation_logs_delete_admin" on public.irrigation_logs
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.irrigation_logs to authenticated;

create trigger set_irrigation_logs_updated_date
  before update on public.irrigation_logs
  for each row execute procedure public.set_updated_date();


create table if not exists public.irrigation_programs (
  id text primary key default gen_random_uuid()::text,
  lot_ids jsonb default '[]'::jsonb,
  items jsonb default '[]'::jsonb,
  mm double precision,
  date date,
  start_time text,
  well text,
  turno text,
  duration_min double precision,
  status text,
  notes text,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.irrigation_programs enable row level security;
create policy "irrigation_programs_select_authenticated" on public.irrigation_programs
  for select to authenticated using (true);
create policy "irrigation_programs_insert_admin" on public.irrigation_programs
  for insert to authenticated with check (public.is_admin());
create policy "irrigation_programs_update_admin" on public.irrigation_programs
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "irrigation_programs_delete_admin" on public.irrigation_programs
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.irrigation_programs to authenticated;

create trigger set_irrigation_programs_updated_date
  before update on public.irrigation_programs
  for each row execute procedure public.set_updated_date();


create table if not exists public.irrigation_recommendations (
  id text primary key default gen_random_uuid()::text,
  lot_id text,
  created_at timestamptz,
  recommended_irrigation_mm double precision,
  recommended_irrigation_m3 double precision,
  recommended_start_date date,
  estimated_irrigation_hours double precision,
  estimated_energy_kwh double precision,
  estimated_energy_cost double precision,
  reason text,
  status text,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.irrigation_recommendations enable row level security;
create policy "irrigation_recommendations_select_authenticated" on public.irrigation_recommendations
  for select to authenticated using (true);
create policy "irrigation_recommendations_insert_admin" on public.irrigation_recommendations
  for insert to authenticated with check (public.is_admin());
create policy "irrigation_recommendations_update_admin" on public.irrigation_recommendations
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "irrigation_recommendations_delete_admin" on public.irrigation_recommendations
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.irrigation_recommendations to authenticated;

create trigger set_irrigation_recommendations_updated_date
  before update on public.irrigation_recommendations
  for each row execute procedure public.set_updated_date();


create table if not exists public.lots (
  id text primary key default gen_random_uuid()::text,
  name text,
  farm text,
  sector text,
  area_ha double precision,
  crop text,
  variety text,
  planting_year double precision,
  planting_date date,
  row_spacing double precision,
  plant_spacing double precision,
  current_plants double precision,
  soil_type text,
  notes text,
  polygon jsonb default '[]'::jsonb,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.lots enable row level security;
create policy "lots_select_authenticated" on public.lots
  for select to authenticated using (true);
create policy "lots_insert_admin" on public.lots
  for insert to authenticated with check (public.is_admin());
create policy "lots_update_admin" on public.lots
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "lots_delete_admin" on public.lots
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.lots to authenticated;

create trigger set_lots_updated_date
  before update on public.lots
  for each row execute procedure public.set_updated_date();


create table if not exists public.lot_documents (
  id text primary key default gen_random_uuid()::text,
  lot_id text,
  campaign text,
  date date,
  type text,
  name text,
  file_url text,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.lot_documents enable row level security;
create policy "lot_documents_select_authenticated" on public.lot_documents
  for select to authenticated using (true);
create policy "lot_documents_insert_admin" on public.lot_documents
  for insert to authenticated with check (public.is_admin());
create policy "lot_documents_update_admin" on public.lot_documents
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "lot_documents_delete_admin" on public.lot_documents
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.lot_documents to authenticated;

create trigger set_lot_documents_updated_date
  before update on public.lot_documents
  for each row execute procedure public.set_updated_date();


create table if not exists public.lot_water_states (
  id text primary key default gen_random_uuid()::text,
  lot_id text,
  timestamp timestamptz,
  profile_water_mm double precision,
  source text,
  model_version text,
  notes text,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.lot_water_states enable row level security;
create policy "lot_water_states_select_authenticated" on public.lot_water_states
  for select to authenticated using (true);
create policy "lot_water_states_insert_admin" on public.lot_water_states
  for insert to authenticated with check (public.is_admin());
create policy "lot_water_states_update_admin" on public.lot_water_states
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "lot_water_states_delete_admin" on public.lot_water_states
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.lot_water_states to authenticated;

create trigger set_lot_water_states_updated_date
  before update on public.lot_water_states
  for each row execute procedure public.set_updated_date();


create table if not exists public.objectives (
  id text primary key default gen_random_uuid()::text,
  lot_id text,
  campaign text,
  total_kg double precision,
  kg_ha double precision,
  kg_plant double precision,
  category_1_pct double precision,
  max_discard_pct double precision,
  caliber double precision,
  brix double precision,
  estimated_kg_ha double precision,
  comments text,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.objectives enable row level security;
create policy "objectives_select_authenticated" on public.objectives
  for select to authenticated using (true);
create policy "objectives_insert_admin" on public.objectives
  for insert to authenticated with check (public.is_admin());
create policy "objectives_update_admin" on public.objectives
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "objectives_delete_admin" on public.objectives
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.objectives to authenticated;

create trigger set_objectives_updated_date
  before update on public.objectives
  for each row execute procedure public.set_updated_date();


create table if not exists public.observations (
  id text primary key default gen_random_uuid()::text,
  lot_id text,
  campaign text,
  date date,
  user_name text,
  category text,
  comment text,
  photo_url text,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.observations enable row level security;
create policy "observations_select_authenticated" on public.observations
  for select to authenticated using (true);
create policy "observations_insert_admin" on public.observations
  for insert to authenticated with check (public.is_admin());
create policy "observations_update_admin" on public.observations
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "observations_delete_admin" on public.observations
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.observations to authenticated;

create trigger set_observations_updated_date
  before update on public.observations
  for each row execute procedure public.set_updated_date();


create table if not exists public.production_records (
  id text primary key default gen_random_uuid()::text,
  lot_id text,
  campaign text,
  total_kg double precision,
  kg_ha double precision,
  kg_plant double precision,
  harvest_start date,
  harvest_end date,
  commercial_quality text,
  category_1_pct double precision,
  category_2_pct double precision,
  discard_pct double precision,
  average_caliber double precision,
  average_brix double precision,
  estimated boolean,
  notes text,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.production_records enable row level security;
create policy "production_records_select_authenticated" on public.production_records
  for select to authenticated using (true);
create policy "production_records_insert_admin" on public.production_records
  for insert to authenticated with check (public.is_admin());
create policy "production_records_update_admin" on public.production_records
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "production_records_delete_admin" on public.production_records
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.production_records to authenticated;

create trigger set_production_records_updated_date
  before update on public.production_records
  for each row execute procedure public.set_updated_date();


create table if not exists public.pruning_records (
  id text primary key default gen_random_uuid()::text,
  lot_id text,
  campaign text,
  date date,
  type text,
  intensity text,
  objective text,
  notes text,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.pruning_records enable row level security;
create policy "pruning_records_select_authenticated" on public.pruning_records
  for select to authenticated using (true);
create policy "pruning_records_insert_admin" on public.pruning_records
  for insert to authenticated with check (public.is_admin());
create policy "pruning_records_update_admin" on public.pruning_records
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "pruning_records_delete_admin" on public.pruning_records
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.pruning_records to authenticated;

create trigger set_pruning_records_updated_date
  before update on public.pruning_records
  for each row execute procedure public.set_updated_date();


create table if not exists public.pumps (
  id text primary key default gen_random_uuid()::text,
  name text,
  lot_id text,
  irrigation_sector text,
  power_kw double precision,
  flow_m3_h double precision,
  design_pressure_bar double precision,
  efficiency_percent double precision,
  active boolean,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.pumps enable row level security;
create policy "pumps_select_authenticated" on public.pumps
  for select to authenticated using (true);
create policy "pumps_insert_admin" on public.pumps
  for insert to authenticated with check (public.is_admin());
create policy "pumps_update_admin" on public.pumps
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "pumps_delete_admin" on public.pumps
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.pumps to authenticated;

create trigger set_pumps_updated_date
  before update on public.pumps
  for each row execute procedure public.set_updated_date();


create table if not exists public.sensors (
  id text primary key default gen_random_uuid()::text,
  lot_id text,
  name text,
  sensor_type text,
  depth_cm double precision,
  unit text,
  active boolean,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.sensors enable row level security;
create policy "sensors_select_authenticated" on public.sensors
  for select to authenticated using (true);
create policy "sensors_insert_admin" on public.sensors
  for insert to authenticated with check (public.is_admin());
create policy "sensors_update_admin" on public.sensors
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "sensors_delete_admin" on public.sensors
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.sensors to authenticated;

create trigger set_sensors_updated_date
  before update on public.sensors
  for each row execute procedure public.set_updated_date();


create table if not exists public.sensor_readings (
  id text primary key default gen_random_uuid()::text,
  sensor_id text,
  farm_id text,
  lot_id text,
  monitoring_point_id text,
  probe_id text,
  probe_channel_id text,
  timestamp timestamptz,
  value double precision,
  depth_cm double precision,
  unit text,
  source text,
  quality_status text,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.sensor_readings enable row level security;
create policy "sensor_readings_select_authenticated" on public.sensor_readings
  for select to authenticated using (true);
create policy "sensor_readings_insert_admin" on public.sensor_readings
  for insert to authenticated with check (public.is_admin());
create policy "sensor_readings_update_admin" on public.sensor_readings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "sensor_readings_delete_admin" on public.sensor_readings
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.sensor_readings to authenticated;

create trigger set_sensor_readings_updated_date
  before update on public.sensor_readings
  for each row execute procedure public.set_updated_date();


create table if not exists public.soil_behavior_models (
  id text primary key default gen_random_uuid()::text,
  name text,
  reference_probe_id text,
  depletion_rate_mm_day double precision,
  recharge_efficiency double precision,
  irrigation_response_delay_hours double precision,
  drainage_rate double precision,
  sample_count double precision,
  calibration_status text,
  last_calibration_at timestamptz,
  notes text,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.soil_behavior_models enable row level security;
create policy "soil_behavior_models_select_authenticated" on public.soil_behavior_models
  for select to authenticated using (true);
create policy "soil_behavior_models_insert_admin" on public.soil_behavior_models
  for insert to authenticated with check (public.is_admin());
create policy "soil_behavior_models_update_admin" on public.soil_behavior_models
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "soil_behavior_models_delete_admin" on public.soil_behavior_models
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.soil_behavior_models to authenticated;

create trigger set_soil_behavior_models_updated_date
  before update on public.soil_behavior_models
  for each row execute procedure public.set_updated_date();


create table if not exists public.soil_layers (
  id text primary key default gen_random_uuid()::text,
  soil_profile_id text,
  depth_top_cm double precision,
  depth_bottom_cm double precision,
  field_capacity_vwc double precision,
  wilting_point_vwc double precision,
  saturation_vwc double precision,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.soil_layers enable row level security;
create policy "soil_layers_select_authenticated" on public.soil_layers
  for select to authenticated using (true);
create policy "soil_layers_insert_admin" on public.soil_layers
  for insert to authenticated with check (public.is_admin());
create policy "soil_layers_update_admin" on public.soil_layers
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "soil_layers_delete_admin" on public.soil_layers
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.soil_layers to authenticated;

create trigger set_soil_layers_updated_date
  before update on public.soil_layers
  for each row execute procedure public.set_updated_date();


create table if not exists public.soil_monitoring_points (
  id text primary key default gen_random_uuid()::text,
  farm_id text,
  lot_id text,
  name text,
  latitude double precision,
  longitude double precision,
  active boolean,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.soil_monitoring_points enable row level security;
create policy "soil_monitoring_points_select_authenticated" on public.soil_monitoring_points
  for select to authenticated using (true);
create policy "soil_monitoring_points_insert_admin" on public.soil_monitoring_points
  for insert to authenticated with check (public.is_admin());
create policy "soil_monitoring_points_update_admin" on public.soil_monitoring_points
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "soil_monitoring_points_delete_admin" on public.soil_monitoring_points
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.soil_monitoring_points to authenticated;

create trigger set_soil_monitoring_points_updated_date
  before update on public.soil_monitoring_points
  for each row execute procedure public.set_updated_date();


create table if not exists public.soil_probes (
  id text primary key default gen_random_uuid()::text,
  monitoring_point_id text,
  farm_id text,
  lot_id text,
  name text,
  provider text,
  brand text,
  model text,
  external_device_id text,
  installation_depth_cm double precision,
  active boolean,
  connection_status text,
  last_reading_at timestamptz,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.soil_probes enable row level security;
create policy "soil_probes_select_authenticated" on public.soil_probes
  for select to authenticated using (true);
create policy "soil_probes_insert_admin" on public.soil_probes
  for insert to authenticated with check (public.is_admin());
create policy "soil_probes_update_admin" on public.soil_probes
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "soil_probes_delete_admin" on public.soil_probes
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.soil_probes to authenticated;

create trigger set_soil_probes_updated_date
  before update on public.soil_probes
  for each row execute procedure public.set_updated_date();


create table if not exists public.soil_probe_channels (
  id text primary key default gen_random_uuid()::text,
  probe_id text,
  external_channel_id text,
  sensor_type text,
  depth_cm double precision,
  unit text,
  active boolean,
  channel_order double precision,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.soil_probe_channels enable row level security;
create policy "soil_probe_channels_select_authenticated" on public.soil_probe_channels
  for select to authenticated using (true);
create policy "soil_probe_channels_insert_admin" on public.soil_probe_channels
  for insert to authenticated with check (public.is_admin());
create policy "soil_probe_channels_update_admin" on public.soil_probe_channels
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "soil_probe_channels_delete_admin" on public.soil_probe_channels
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.soil_probe_channels to authenticated;

create trigger set_soil_probe_channels_updated_date
  before update on public.soil_probe_channels
  for each row execute procedure public.set_updated_date();


create table if not exists public.soil_profiles (
  id text primary key default gen_random_uuid()::text,
  lot_id text,
  name text,
  soil_type text,
  root_zone_depth_cm double precision,
  field_capacity_vwc double precision,
  wilting_point_vwc double precision,
  target_min_vwc double precision,
  target_max_vwc double precision,
  initial_vwc double precision,
  current_kc double precision,
  notes text,
  sensor_id text,
  probe_id text,
  soil_behavior_model_id text,
  pump_id text,
  manual_initial_water_mm double precision,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.soil_profiles enable row level security;
create policy "soil_profiles_select_authenticated" on public.soil_profiles
  for select to authenticated using (true);
create policy "soil_profiles_insert_admin" on public.soil_profiles
  for insert to authenticated with check (public.is_admin());
create policy "soil_profiles_update_admin" on public.soil_profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "soil_profiles_delete_admin" on public.soil_profiles
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.soil_profiles to authenticated;

create trigger set_soil_profiles_updated_date
  before update on public.soil_profiles
  for each row execute procedure public.set_updated_date();


create table if not exists public.water_balance_forecasts (
  id text primary key default gen_random_uuid()::text,
  lot_id text,
  forecast_date date,
  current_vwc double precision,
  forecast_vwc double precision,
  water_available_percent double precision,
  eto_mm double precision,
  etc_mm double precision,
  rainfall_mm double precision,
  effective_rainfall_mm double precision,
  irrigation_mm double precision,
  drainage_mm double precision,
  forecast_type text,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.water_balance_forecasts enable row level security;
create policy "water_balance_forecasts_select_authenticated" on public.water_balance_forecasts
  for select to authenticated using (true);
create policy "water_balance_forecasts_insert_admin" on public.water_balance_forecasts
  for insert to authenticated with check (public.is_admin());
create policy "water_balance_forecasts_update_admin" on public.water_balance_forecasts
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "water_balance_forecasts_delete_admin" on public.water_balance_forecasts
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.water_balance_forecasts to authenticated;

create trigger set_water_balance_forecasts_updated_date
  before update on public.water_balance_forecasts
  for each row execute procedure public.set_updated_date();


create table if not exists public.weather_forecasts (
  id text primary key default gen_random_uuid()::text,
  lot_id text,
  date date,
  temperature_min_c double precision,
  temperature_max_c double precision,
  rainfall_mm double precision,
  effective_rainfall_mm double precision,
  eto_mm double precision,
  kc double precision,
  etc_mm double precision,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.weather_forecasts enable row level security;
create policy "weather_forecasts_select_authenticated" on public.weather_forecasts
  for select to authenticated using (true);
create policy "weather_forecasts_insert_admin" on public.weather_forecasts
  for insert to authenticated with check (public.is_admin());
create policy "weather_forecasts_update_admin" on public.weather_forecasts
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "weather_forecasts_delete_admin" on public.weather_forecasts
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.weather_forecasts to authenticated;

create trigger set_weather_forecasts_updated_date
  before update on public.weather_forecasts
  for each row execute procedure public.set_updated_date();


create table if not exists public.weather_observations (
  id text primary key default gen_random_uuid()::text,
  farm_id text,
  weather_station_id text,
  timestamp timestamptz,
  temperature_c double precision,
  relative_humidity_percent double precision,
  rainfall_mm double precision,
  wind_speed_kmh double precision,
  wind_gust_kmh double precision,
  wind_direction_deg double precision,
  solar_radiation_w_m2 double precision,
  atmospheric_pressure_hpa double precision,
  eto_mm double precision,
  et_day_mm double precision,
  source text,
  quality_status text,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.weather_observations enable row level security;
create policy "weather_observations_select_authenticated" on public.weather_observations
  for select to authenticated using (true);
create policy "weather_observations_insert_admin" on public.weather_observations
  for insert to authenticated with check (public.is_admin());
create policy "weather_observations_update_admin" on public.weather_observations
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "weather_observations_delete_admin" on public.weather_observations
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.weather_observations to authenticated;

create trigger set_weather_observations_updated_date
  before update on public.weather_observations
  for each row execute procedure public.set_updated_date();


create table if not exists public.weather_stations (
  id text primary key default gen_random_uuid()::text,
  farm_id text,
  farm_ids jsonb default '[]'::jsonb,
  name text,
  provider text,
  external_station_id text,
  connection_type text,
  active boolean,
  last_data_at timestamptz,
  connection_status text,
  latitude double precision,
  longitude double precision,
  elevation_m double precision,
  notes text,
  created_by_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.weather_stations enable row level security;
create policy "weather_stations_select_authenticated" on public.weather_stations
  for select to authenticated using (true);
create policy "weather_stations_insert_admin" on public.weather_stations
  for insert to authenticated with check (public.is_admin());
create policy "weather_stations_update_admin" on public.weather_stations
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "weather_stations_delete_admin" on public.weather_stations
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.weather_stations to authenticated;

create trigger set_weather_stations_updated_date
  before update on public.weather_stations
  for each row execute procedure public.set_updated_date();

create index if not exists health_records_lot_id_idx on public.health_records (lot_id);
create index if not exists health_records_date_idx on public.health_records (date);
create index if not exists irrigation_designs_lot_id_idx on public.irrigation_designs (lot_id);
create index if not exists irrigation_logs_program_id_idx on public.irrigation_logs (program_id);
create index if not exists irrigation_logs_date_idx on public.irrigation_logs (date);
create index if not exists irrigation_programs_date_idx on public.irrigation_programs (date);
create index if not exists irrigation_recommendations_lot_id_idx on public.irrigation_recommendations (lot_id);
create index if not exists irrigation_recommendations_recommended_start_date_idx on public.irrigation_recommendations (recommended_start_date);
create index if not exists lots_planting_date_idx on public.lots (planting_date);
create index if not exists lot_documents_lot_id_idx on public.lot_documents (lot_id);
create index if not exists lot_documents_date_idx on public.lot_documents (date);
create index if not exists lot_water_states_lot_id_idx on public.lot_water_states (lot_id);
create index if not exists lot_water_states_timestamp_idx on public.lot_water_states (timestamp);
create index if not exists objectives_lot_id_idx on public.objectives (lot_id);
create index if not exists observations_lot_id_idx on public.observations (lot_id);
create index if not exists observations_date_idx on public.observations (date);
create index if not exists production_records_lot_id_idx on public.production_records (lot_id);
create index if not exists production_records_harvest_start_idx on public.production_records (harvest_start);
create index if not exists production_records_harvest_end_idx on public.production_records (harvest_end);
create index if not exists pruning_records_lot_id_idx on public.pruning_records (lot_id);
create index if not exists pruning_records_date_idx on public.pruning_records (date);
create index if not exists pumps_lot_id_idx on public.pumps (lot_id);
create index if not exists sensors_lot_id_idx on public.sensors (lot_id);
create index if not exists sensor_readings_sensor_id_idx on public.sensor_readings (sensor_id);
create index if not exists sensor_readings_farm_id_idx on public.sensor_readings (farm_id);
create index if not exists sensor_readings_lot_id_idx on public.sensor_readings (lot_id);
create index if not exists sensor_readings_monitoring_point_id_idx on public.sensor_readings (monitoring_point_id);
create index if not exists sensor_readings_probe_id_idx on public.sensor_readings (probe_id);
create index if not exists sensor_readings_probe_channel_id_idx on public.sensor_readings (probe_channel_id);
create index if not exists sensor_readings_timestamp_idx on public.sensor_readings (timestamp);
create index if not exists soil_behavior_models_reference_probe_id_idx on public.soil_behavior_models (reference_probe_id);
create index if not exists soil_layers_soil_profile_id_idx on public.soil_layers (soil_profile_id);
create index if not exists soil_monitoring_points_farm_id_idx on public.soil_monitoring_points (farm_id);
create index if not exists soil_monitoring_points_lot_id_idx on public.soil_monitoring_points (lot_id);
create index if not exists soil_probes_monitoring_point_id_idx on public.soil_probes (monitoring_point_id);
create index if not exists soil_probes_farm_id_idx on public.soil_probes (farm_id);
create index if not exists soil_probes_lot_id_idx on public.soil_probes (lot_id);
create index if not exists soil_probes_external_device_id_idx on public.soil_probes (external_device_id);
create index if not exists soil_probe_channels_probe_id_idx on public.soil_probe_channels (probe_id);
create index if not exists soil_probe_channels_external_channel_id_idx on public.soil_probe_channels (external_channel_id);
create index if not exists soil_profiles_lot_id_idx on public.soil_profiles (lot_id);
create index if not exists soil_profiles_sensor_id_idx on public.soil_profiles (sensor_id);
create index if not exists soil_profiles_probe_id_idx on public.soil_profiles (probe_id);
create index if not exists soil_profiles_soil_behavior_model_id_idx on public.soil_profiles (soil_behavior_model_id);
create index if not exists soil_profiles_pump_id_idx on public.soil_profiles (pump_id);
create index if not exists water_balance_forecasts_lot_id_idx on public.water_balance_forecasts (lot_id);
create index if not exists water_balance_forecasts_forecast_date_idx on public.water_balance_forecasts (forecast_date);
create index if not exists weather_forecasts_lot_id_idx on public.weather_forecasts (lot_id);
create index if not exists weather_forecasts_date_idx on public.weather_forecasts (date);
create index if not exists weather_observations_farm_id_idx on public.weather_observations (farm_id);
create index if not exists weather_observations_weather_station_id_idx on public.weather_observations (weather_station_id);
create index if not exists weather_observations_timestamp_idx on public.weather_observations (timestamp);
create index if not exists weather_stations_farm_id_idx on public.weather_stations (farm_id);
create index if not exists weather_stations_external_station_id_idx on public.weather_stations (external_station_id);

-- Irrigation screens listen for live program changes.
do $$
begin
  alter publication supabase_realtime add table public.irrigation_programs;
exception
  when duplicate_object then null;
end $$;

-- Document uploads used by the historical-files screen.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do update set public = excluded.public;

create policy "documents_upload_admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and public.is_admin());
create policy "documents_update_admin" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and public.is_admin())
  with check (bucket_id = 'documents' and public.is_admin());
create policy "documents_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and public.is_admin());
