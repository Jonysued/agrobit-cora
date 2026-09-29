-- Actualizar el aprendizaje tras cada sincronización de Sentek.
-- La sincronización corre a los minutos 00 y 30; :15 y :45 dejan
-- tiempo para incorporar la lectura antes de recalibrar las curvas.
select cron.schedule(
  'calibrate-soil-models',
  '15,45 * * * *',
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
