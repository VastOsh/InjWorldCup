-- =============================================================================
-- Migration 028: table grants for the app roles (fresh-project fix)
--
-- This Supabase project did NOT auto-grant DML to anon/authenticated/service_role
-- on tables created over the pooler (older projects did). BYPASSRLS on
-- service_role bypasses ROW security but NOT table-level GRANTs, so service_role
-- hit "permission denied for table" (42501) on every market table — first seen
-- as the wallet-login challenge upsert failing ("Could not create challenge").
--
-- Restore exactly what the app relies on:
--   • service_role  — full DML on all tables + sequences (it's the admin client;
--     RLS is bypassed anyway). Also set as a DEFAULT privilege so any future
--     wrapper-created table is covered automatically.
--   • authenticated — SELECT on the market tables it reads directly (the RLS
--     policies from 019/020/023 gate which rows). All writes go through
--     SECURITY DEFINER RPCs (place_stake / request_withdrawal / …) which run as
--     the owner, so authenticated needs NO direct write grant.
-- Base tables (profiles/matches/predictions) keep their 027 posture; anon stays
-- off (the app requires an authenticated session). wallet_auth_challenges stays
-- service-role-only (RLS on, no policy).
-- =============================================================================

GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

GRANT SELECT ON
  public.markets,
  public.market_pools,
  public.stakes,
  public.wallet_ledger,
  public.withdrawals
  TO authenticated;
