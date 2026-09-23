-- Move legacy Base44 records into the normalized Supabase tables.
-- The legacy public.app_records table is intentionally preserved as a backup.
-- This migration is idempotent: rerunning it updates rows with the same id.

do $$
declare
  mapping record;
  insert_columns text;
  select_expressions text;
  update_assignments text;
  statement text;
begin
  if to_regclass('public.app_records') is null then
    raise notice 'public.app_records does not exist; skipping legacy data migration';
    return;
  end if;

  for mapping in
    select *
    from (values
      ('Campaign', 'campaigns'),
      ('EnergyTariff', 'energy_tariffs'),
      ('Farm', 'farms'),
      ('HealthRecord', 'health_records'),
      ('IrrigationDesign', 'irrigation_designs'),
      ('IrrigationLog', 'irrigation_logs'),
      ('IrrigationProgram', 'irrigation_programs'),
      ('IrrigationRecommendation', 'irrigation_recommendations'),
      ('Lot', 'lots'),
      ('LotDocument', 'lot_documents'),
      ('LotWaterState', 'lot_water_states'),
      ('Objective', 'objectives'),
      ('Observation', 'observations'),
      ('ProductionRecord', 'production_records'),
      ('PruningRecord', 'pruning_records'),
      ('Pump', 'pumps'),
      ('Sensor', 'sensors'),
      ('SensorReading', 'sensor_readings'),
      ('SoilBehaviorModel', 'soil_behavior_models'),
      ('SoilLayer', 'soil_layers'),
      ('SoilMonitoringPoint', 'soil_monitoring_points'),
      ('SoilProbe', 'soil_probes'),
      ('SoilProbeChannel', 'soil_probe_channels'),
      ('SoilProfile', 'soil_profiles'),
      ('WaterBalanceForecast', 'water_balance_forecasts'),
      ('WeatherForecast', 'weather_forecasts'),
      ('WeatherObservation', 'weather_observations'),
      ('WeatherStation', 'weather_stations')
    ) as entities(entity_name, table_name)
  loop
    if to_regclass(format('public.%I', mapping.table_name)) is null then
      raise notice 'Target table public.% does not exist; skipping %',
        mapping.table_name, mapping.entity_name;
      continue;
    end if;

    select
      string_agg(format('%I', column_name), ', ' order by ordinal_position),
      string_agg(
        case
          when column_name = 'id' then 'legacy.id'
          when column_name = 'created_date' then 'legacy.created_at'
          when column_name = 'updated_date' then 'legacy.updated_at'
          else format(
            '(jsonb_populate_record(null::public.%I, legacy.data - ''created_by_id'')).%I',
            mapping.table_name,
            column_name
          )
        end,
        ', ' order by ordinal_position
      ),
      string_agg(
        case
          when column_name in ('id', 'created_date') then null
          else format('%I = excluded.%I', column_name, column_name)
        end,
        ', ' order by ordinal_position
      )
    into insert_columns, select_expressions, update_assignments
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = mapping.table_name
      -- Base44 user ids are not Supabase auth UUIDs. Ownership is assigned
      -- separately through authenticated profiles, so do not coerce them.
      and c.column_name <> 'created_by_id'
      and (
        c.column_name in ('id', 'created_date', 'updated_date')
        or exists (
          select 1
          from public.app_records source_record
          where source_record.entity = mapping.entity_name
            and source_record.data ? c.column_name
        )
      );

    if insert_columns is null then
      continue;
    end if;

    statement := format(
      'insert into public.%I (%s) '
      || 'select %s from public.app_records legacy where legacy.entity = %L '
      || 'on conflict (id) do update set %s',
      mapping.table_name,
      insert_columns,
      select_expressions,
      mapping.entity_name,
      update_assignments
    );

    begin
      execute statement;
      raise notice 'Migrated % records into public.%', mapping.entity_name, mapping.table_name;
    exception when others then
      -- Keep other entity migrations moving and surface the precise failure.
      raise warning 'Could not migrate % into public.%: %',
        mapping.entity_name, mapping.table_name, sqlerrm;
    end;
  end loop;
end
$$;
