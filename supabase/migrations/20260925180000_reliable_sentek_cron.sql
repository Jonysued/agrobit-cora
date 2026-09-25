-- Poll Sentek every 30 minutes. The provider may publish logger data less often;
-- this cadence bounds the delay after a new reading becomes available.
-- pg_net defaults to a five-second timeout, shorter than a full probe sync.
select cron.schedule(
  'sync-sentek-probes',
  '*/30 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/agro-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := '{"action":"syncAllSentekProbes","payload":{}}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);
