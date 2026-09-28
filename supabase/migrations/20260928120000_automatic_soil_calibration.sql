-- La evaluación diaria no modifica parámetros aprendidos si faltan muestras.
alter table public.soil_behavior_models
  add column if not exists last_calibration_attempt_at timestamptz,
  add column if not exists calibration_diagnostics jsonb;

-- Garita y Sentek se sincronizan a los minutos 00 y 30. Calibrar después.
select cron.schedule(
  'calibrate-soil-models',
  '15 9 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/agro-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := '{"action":"calibrateSoilModels","payload":{}}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);
