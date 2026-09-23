-- Edge Functions run with SUPABASE_SERVICE_ROLE_KEY. The normalized tables
-- were originally granted only to `authenticated`, so scheduled integrations
-- could bypass RLS but still failed at the table privilege layer.
grant select, insert, update, delete on table
  public.weather_stations,
  public.weather_observations,
  public.soil_probes,
  public.soil_probe_channels,
  public.sensor_readings,
  public.soil_profiles,
  public.soil_behavior_models
to service_role;
