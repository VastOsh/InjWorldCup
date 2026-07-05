-- =============================================================================
-- Migration 015: remove the unused API-Football sync path
--
-- Match data is curated manually, so the sync-matches Edge Function, its 15-min
-- pg_cron job (migration 004), and its request-budget table are all removed.
-- Idempotent: a fresh `supabase db reset` self-heals (004 schedules the cron,
-- this unschedules it) and re-running is safe.
-- =============================================================================

-- Unschedule the sync cron if it exists (no-op otherwise).
DO $$
BEGIN
  PERFORM cron.unschedule('sync-matches-every-15min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Drop the request-budget table used only by the removed function.
DROP TABLE IF EXISTS public.api_request_log;
