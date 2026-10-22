-- Custom change (email preferences via Brevo, on time): a once-a-minute
-- pg_cron job that calls the API server's POST /jobs/tick, which runs the
-- time-sensitive notification jobs (checkout reminder / checkout-time-is-up,
-- appointment reminder, nightly care-log summary).
--
-- Why the database drives this: the production API server runs on Render's
-- free plan, which sleeps after ~15 minutes without traffic. Its in-process
-- setTimeout pollers stop while it sleeps, so a "15 minutes before checkout"
-- reminder went out whenever the next visitor happened to wake the server -
-- often minutes late. Supabase never sleeps; this HTTP call also wakes the
-- server when needed.
--
-- The URL and shared secret are NOT in this file. They live in Supabase
-- Vault and are read at run time, so nothing secret is committed. Until
-- both are created, every run is a no-op. One-time setup (SQL editor):
--
--   select vault.create_secret('https://<server-host>/jobs/tick', 'jobs_tick_url');
--   select vault.create_secret('<same value as the server''s JOBS_TICK_SECRET>', 'jobs_tick_secret');
--
-- To change either later: vault.update_secret(<id>, '<new value>') with the
-- id from vault.secrets where name = '...'.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.run_jobs_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'jobs_tick_url';

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'jobs_tick_secret';

  if v_url is null or v_secret is null then
    return;
  end if;

  -- Fire-and-forget: pg_net queues the request and returns immediately. The
  -- server answers 202 before doing the work, so the timeout only has to
  -- cover a cold start.
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-jobs-secret', v_secret
    ),
    timeout_milliseconds := 60000
  );
end;
$$;

-- Only the scheduler (running as postgres) should ever call this - it reads
-- a secret from Vault.
revoke execute on function public.run_jobs_tick() from public, anon, authenticated;

-- cron.schedule upserts by job name, so re-running this migration just
-- re-points the existing job.
select cron.schedule(
  'server-jobs-tick',
  '* * * * *',
  'select public.run_jobs_tick()'
);
