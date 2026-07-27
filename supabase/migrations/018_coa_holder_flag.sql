-- =============================================================================
-- Migration 018: Cult of Anons holder flag
--
-- Adds the persisted result of the on-chain CoA ownership check to profiles.
-- The check itself is a read-only CW721 smart query (see lib/coa/verify.ts);
-- this stores its outcome so perk-gating and the holders-only league don't
-- re-query the chain on every request.
--
-- Tri-state, read from two columns:
--   coa_checked_at IS NULL            → never verified
--   holds_coa = true                  → held ≥1 CoA as of coa_checked_at
--   holds_coa = false, checked_at set → verified NON-holder
--
-- SECURITY — this flag must never be self-settable, or a player could forge a
-- season pass. Migration 006 revoked table-level UPDATE on profiles from
-- `authenticated` and re-granted only a column whitelist. We deliberately add
-- NO column grant here, so holds_coa / coa_checked_at are writable by the
-- service role ONLY (the server-side verifier), exactly like total_points.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN holds_coa      BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN coa_checked_at TIMESTAMPTZ;                 -- null until first check

COMMENT ON COLUMN public.profiles.holds_coa IS
  'Cult of Anons holder as of coa_checked_at. Service-role write only (on-chain verified).';
COMMENT ON COLUMN public.profiles.coa_checked_at IS
  'When the CoA ownership check last ran. NULL = never verified.';

-- Holders-only league leaderboard: holders ranked by points. Partial index
-- keeps it small (only holder rows) and pre-sorted for the league query.
CREATE INDEX idx_profiles_coa_leaderboard
  ON public.profiles (total_points DESC)
  WHERE holds_coa;
