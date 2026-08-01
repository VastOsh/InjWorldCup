-- =============================================================================
-- Migration 029: single-use beta invite codes (closed-beta whitelist)
--
-- Each code redeems exactly once (atomic UPDATE … WHERE code=$1 AND redeemed_at
-- IS NULL in the redeem action), so a code shared publicly dies on first use.
-- Read/written ONLY by the server via the service-role admin client — RLS on,
-- no policy, so anon/authenticated can never see or touch codes.
-- =============================================================================

CREATE TABLE public.beta_invites (
  code        TEXT        PRIMARY KEY,
  label       TEXT,                                   -- optional note (who it's for)
  redeemed_at TIMESTAMPTZ,                            -- NULL = unused
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.beta_invites ENABLE ROW LEVEL SECURITY;  -- no policy → service-role only

-- Fresh Supabase projects don't auto-grant (see migration 028) — be explicit.
GRANT ALL ON public.beta_invites TO service_role;
