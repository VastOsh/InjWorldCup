-- =============================================================================
-- Migration 004: pg_cron job — poll API-Football every 15 minutes
--
-- Calls the sync-matches Edge Function via pg_net HTTP POST.
-- verify_jwt is disabled on the function so no auth header is required.
-- The function's own DAILY_LIMIT guard (95 req/day) prevents API exhaustion.
-- The no_active_matches early-exit means cron ticks on idle days cost 0 API calls.
-- =============================================================================

SELECT cron.schedule(
  'sync-matches-every-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://wuniinmjgickvtqohsyq.supabase.co/functions/v1/sync-matches',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);
