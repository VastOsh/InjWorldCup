-- =============================================================================
-- Migration 026: Native scheduling via pg_cron + pg_net
--
-- Vercel Cron only runs sub-daily jobs on a Pro plan, so instead of depending
-- on that we drive the three market jobs from inside Postgres. They are plain
-- authenticated HTTP endpoints, so pg_net POSTs to them on a pg_cron schedule.
--
--   /api/market/settle                  every 5 min   (settle finished markets)
--   /api/market/withdrawals/reconcile   every 10 min  (resolve stuck pendings)
--   /api/market/solvency                hourly        (reserve snapshot)
--
-- Secrets live in Vault BY NAME (never in this file):
--   market_cron_base_url  — target origin (dev preview alias / prod domain)
--   market_cron_bearer    — MARKET_SETTLE_SECRET (Authorization: Bearer …)
--   market_cron_bypass    — Vercel preview protection-bypass (OMIT on prod;
--                           the custom domain has no deployment protection)
--
-- Schedules are NOT started here. Call public.market_cron_enable() when a market
-- goes live; public.market_cron_disable() to stop. All three endpoints are
-- idempotent, so an extra or late tick is harmless.
--
-- Additive + ops-only (service role). Touches nothing in the live game.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ---------------------------------------------------------------------------
-- market_cron_post — fire one market job over HTTP. Reads base URL + bearer
-- (+ optional preview bypass) from Vault. Returns the pg_net request id (the
-- response lands asynchronously in net._http_response). Service role only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.market_cron_post(p_path text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $fn$
DECLARE
  v_base    text;
  v_bearer  text;
  v_bypass  text;
  v_headers jsonb;
  v_req_id  bigint;
BEGIN
  SELECT decrypted_secret INTO v_base   FROM vault.decrypted_secrets WHERE name = 'market_cron_base_url';
  SELECT decrypted_secret INTO v_bearer FROM vault.decrypted_secrets WHERE name = 'market_cron_bearer';
  SELECT decrypted_secret INTO v_bypass FROM vault.decrypted_secrets WHERE name = 'market_cron_bypass';

  IF v_base IS NULL OR v_bearer IS NULL THEN
    RAISE EXCEPTION 'market_cron secrets missing (need market_cron_base_url + market_cron_bearer in Vault)';
  END IF;

  v_headers := jsonb_build_object('Authorization', 'Bearer ' || v_bearer);
  -- Preview deployments sit behind Vercel SSO; send the bypass header only when
  -- the secret is present (absent on a production custom domain).
  IF v_bypass IS NOT NULL AND length(v_bypass) > 0 THEN
    v_headers := v_headers || jsonb_build_object('x-vercel-protection-bypass', v_bypass);
  END IF;

  SELECT net.http_get(
    url                  := rtrim(v_base, '/') || p_path,
    headers              := v_headers,
    timeout_milliseconds := 20000
  ) INTO v_req_id;

  RETURN v_req_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.market_cron_post(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.market_cron_post(text) TO service_role;

-- ---------------------------------------------------------------------------
-- Enable / disable the recurring schedules. Named jobs → re-running enable just
-- updates them; disable only unschedules jobs that exist (no error if absent).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.market_cron_enable()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $fn$
BEGIN
  PERFORM cron.schedule('market-settle',    '*/5 * * * *',
    $cmd$SELECT public.market_cron_post('/api/market/settle')$cmd$);
  PERFORM cron.schedule('market-reconcile', '*/10 * * * *',
    $cmd$SELECT public.market_cron_post('/api/market/withdrawals/reconcile')$cmd$);
  PERFORM cron.schedule('market-solvency',  '0 * * * *',
    $cmd$SELECT public.market_cron_post('/api/market/solvency')$cmd$);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.market_cron_disable()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $fn$
BEGIN
  PERFORM cron.unschedule(jobname)
    FROM cron.job
    WHERE jobname IN ('market-settle', 'market-reconcile', 'market-solvency');
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.market_cron_enable()  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.market_cron_disable() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.market_cron_enable()  TO service_role;
GRANT  EXECUTE ON FUNCTION public.market_cron_disable() TO service_role;
