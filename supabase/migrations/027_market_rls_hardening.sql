-- =============================================================================
-- Migration 027: RLS hardening for the base tables (profiles, matches, predictions)
--
-- Migration 001 created these three tables WITHOUT row-level security. On a
-- Supabase project the default grant hands anon + authenticated full DML on
-- every public table, so with RLS off any signed-in (or anonymous) caller could,
-- via PostgREST:
--   • rewrite profiles.wallet_address → redirect another user's custodial payout
--   • DELETE / TRUNCATE profiles, matches, predictions
-- The market tables (018–026) are already RLS-locked; this closes the base-table
-- gap so the money DB isn't relying on obscurity. Least-privilege posture:
--   profiles     — read any; update ONLY your own display fields (never wallet_address)
--   matches      — read-only reference
--   predictions  — read-only (WC-era; the market never writes it)
-- All privileged writes (wallet linking, CoA sync, market RPCs, seeding) run as
-- service_role / definer and bypass RLS, so nothing legitimate breaks.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Strip the blanket write privileges the Supabase default grants to app roles,
-- and drop anon read entirely (every app surface requires an authenticated
-- session). Keep SELECT for authenticated.
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.profiles, public.matches, public.predictions
  FROM anon, authenticated;

REVOKE SELECT ON public.profiles, public.matches, public.predictions FROM anon;
GRANT  SELECT ON public.profiles, public.matches, public.predictions TO authenticated;

-- Column-scoped write: a user may edit only their own display fields. Because
-- wallet_address / total_points / holds_coa / discord_id get NO column grant,
-- they are unwritable by clients even on the user's own row.
GRANT UPDATE (username, country, tie_breaker_answer) ON public.profiles TO authenticated;

-- ---------------------------------------------------------------------------
-- Turn RLS on and add the minimal policies.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

-- profiles: readable by any authenticated user (leaderboard / opponent display);
-- writable only on your own row (and only the columns granted above).
CREATE POLICY profiles_select_authenticated ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- matches: read-only reference for authenticated clients.
CREATE POLICY matches_select_authenticated ON public.matches
  FOR SELECT TO authenticated USING (true);

-- predictions: read-only for authenticated (no client writes on the market).
CREATE POLICY predictions_select_authenticated ON public.predictions
  FOR SELECT TO authenticated USING (true);
