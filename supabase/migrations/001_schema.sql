-- =============================================================================
-- Migration 001: Core Schema
-- Tables: profiles, matches, predictions
-- Also provisions: auto-profile creation trigger on Discord OAuth signup
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PROFILES
-- Central identity node. Bridges Discord (Web2) and Injective wallet (Web3).
-- Primary key maps directly to auth.users, enforced by Supabase Auth.
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id                   UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  discord_id           TEXT        NOT NULL UNIQUE,
  username             TEXT        NOT NULL,
  avatar_url           TEXT        NOT NULL,
  wallet_address       TEXT        UNIQUE,                  -- nullable until Web3 linkage
  country              TEXT,                                -- reserved for future geo segmentation
  total_points         INTEGER     NOT NULL DEFAULT 0,
  tie_breaker_answer   INTEGER,                             -- minute of first goal in the final (immutable after first set)
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Leaderboard sort: descending points, then ascending tie-breaker delta
CREATE INDEX idx_profiles_total_points ON public.profiles (total_points DESC);

-- ---------------------------------------------------------------------------
-- MATCHES
-- Temporal and mathematical anchor. ID comes directly from API-Football
-- to avoid a mapping table. NUMERIC multipliers guarantee exact arithmetic.
-- ---------------------------------------------------------------------------
CREATE TABLE public.matches (
  id               INTEGER     PRIMARY KEY,               -- sourced from API-Football
  team_home        TEXT        NOT NULL,
  team_away        TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'SCHEDULED'
                               CHECK (status IN ('SCHEDULED', 'LIVE', 'FINISHED')),
  score_home       INTEGER,                               -- null until FINISHED
  score_away       INTEGER,                               -- null until FINISHED
  multiplier_home  NUMERIC(6,2) NOT NULL DEFAULT 1.0,    -- NUMERIC is mandatory; float would break scoring math
  multiplier_draw  NUMERIC(6,2) NOT NULL DEFAULT 1.0,
  multiplier_away  NUMERIC(6,2) NOT NULL DEFAULT 1.0,
  match_date       TIMESTAMPTZ  NOT NULL                  -- controls prediction lock; stored in UTC
);

-- ---------------------------------------------------------------------------
-- PREDICTIONS
-- Resolves the many-to-many between profiles and matches.
-- UNIQUE(user_id, match_id) prevents duplicate submissions at the DB level.
-- is_calculated is the atomic idempotency lock: once true, the row is inert.
-- ---------------------------------------------------------------------------
CREATE TABLE public.predictions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id       INTEGER     NOT NULL REFERENCES public.matches(id)  ON DELETE CASCADE,
  pred_home      INTEGER     NOT NULL,
  pred_away      INTEGER     NOT NULL,
  points_won     INTEGER     NOT NULL DEFAULT 0,
  is_calculated  BOOLEAN     NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, match_id)
);

CREATE INDEX idx_predictions_user_id        ON public.predictions (user_id);
CREATE INDEX idx_predictions_match_id       ON public.predictions (match_id);
-- Partial index: the trigger only scans rows where is_calculated = false
CREATE INDEX idx_predictions_uncalculated   ON public.predictions (match_id)
  WHERE is_calculated = false;

-- ---------------------------------------------------------------------------
-- AUTO-PROFILE CREATION
-- Fires after every new Supabase Auth user (Discord OAuth signup).
-- Maps Discord provider metadata into public.profiles.
--
-- Expected raw_user_meta_data keys from Supabase Discord OAuth:
--   provider_id  → Discord user snowflake ID
--   full_name    → Discord global display name
--   avatar_url   → CDN avatar URL
-- Verify these against your actual Discord OAuth payload before deploying.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, discord_id, username, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'provider_id',
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      'Unknown'
    ),
    COALESCE(
      NEW.raw_user_meta_data ->> 'avatar_url',
      ''
    )
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
