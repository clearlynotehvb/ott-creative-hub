-- ============================================================================
-- Sync the Shopify catalogue automatically every 5 minutes.
--
-- Vercel's Hobby plan only allows daily cron jobs, so the schedule lives here:
-- pg_cron fires every 5 minutes and pg_net calls the app's sync endpoint.
--
-- The endpoint is protected by CRON_SECRET. That secret is NOT in this file —
-- it is read from Supabase Vault at run time. Store it once, separately:
--
--   select vault.create_secret('<the CRON_SECRET value>', 'cron_secret');
--
-- Run this in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace any earlier version of the job rather than stacking duplicates.
select cron.unschedule(jobid)
from cron.job
where jobname = 'sync-shopify-products';

select cron.schedule(
  'sync-shopify-products',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := 'https://ott-creative-hub.vercel.app/api/cron/sync-products',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  $job$
);
