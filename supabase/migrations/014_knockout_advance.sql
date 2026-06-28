-- =============================================================================
-- Migration 014: Knockout "who advances" tiebreaker
--
-- Knockout matches can end level on the pitch and be decided in extra time or
-- on penalties. The 90'/120' scoreline is still scored exactly like a group
-- match (draw tiers), but we add a separate prediction — "who advances?" — that
-- pays a flat bonus ONLY when the match ends level (a true tiebreaker).
--
--   matches.advance_winner  'home' | 'away'  — set by sync-matches when a
--                                              knockout match finishes.
--   matches.pen_home/away   shootout score, for display ("4-2 on penalties").
--   predictions.pred_advance 'home' | 'away' — the user's pick of who goes through.
--
-- Scoring (see trigger below): for a knockout match whose on-pitch result is a
-- draw, anyone whose pred_advance matches advance_winner gets +c_advance_bonus,
-- on top of whatever the scoreline tiers awarded. Decisive knockout games and
-- all group games ignore the advance pick entirely.
-- =============================================================================

-- ── 1. Schema ───────────────────────────────────────────────────────────────
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS advance_winner TEXT
    CHECK (advance_winner IN ('home', 'away')),
  ADD COLUMN IF NOT EXISTS pen_home SMALLINT,
  ADD COLUMN IF NOT EXISTS pen_away SMALLINT;

ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS pred_advance TEXT
    CHECK (pred_advance IN ('home', 'away'));

-- ── 2. Column-level grants ──────────────────────────────────────────────────
-- Both tables use column-level grants (see migration 006). New columns are
-- invisible/unwritable until granted explicitly.
--   * matches: clients read the result columns; only the service role (sync)
--     writes them, so no INSERT/UPDATE grant here.
--   * predictions: clients read AND write their own advance pick.
GRANT SELECT (advance_winner, pen_home, pen_away) ON public.matches TO authenticated;
GRANT SELECT (pred_advance), INSERT (pred_advance), UPDATE (pred_advance)
  ON public.predictions TO authenticated;

-- ── 3. Scoring trigger: add the knockout advance bonus ──────────────────────
CREATE OR REPLACE FUNCTION public.calculate_match_predictions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- ── Scoring constants ──────────────────────────────────────────────────────
  c_base_outcome      CONSTANT INTEGER := 100;
  c_exactitude_bonus  CONSTANT INTEGER := 50;
  c_advance_bonus     CONSTANT INTEGER := 50;   -- knockout tiebreaker, flat (no multiplier)
  -- ──────────────────────────────────────────────────────────────────────────

  v_pred            RECORD;
  v_actual_outcome  TEXT;
  v_pred_outcome    TEXT;
  v_multiplier      NUMERIC;
  v_points          INTEGER;
  v_is_draw         BOOLEAN;
  v_is_knockout     BOOLEAN;
BEGIN
  -- Guard: only act on a fresh FINISHED transition
  IF NEW.status <> 'FINISHED' OR OLD.status = 'FINISHED' THEN
    RETURN NEW;
  END IF;

  -- Guard: scores must be present before we can calculate
  IF NEW.score_home IS NULL OR NEW.score_away IS NULL THEN
    RETURN NEW;
  END IF;

  -- ── Determine actual outcome and its multiplier ───────────────────────────
  IF NEW.score_home > NEW.score_away THEN
    v_actual_outcome := 'home';
    v_multiplier     := NEW.multiplier_home;
  ELSIF NEW.score_away > NEW.score_home THEN
    v_actual_outcome := 'away';
    v_multiplier     := NEW.multiplier_away;
  ELSE
    v_actual_outcome := 'draw';
    v_multiplier     := NEW.multiplier_draw;
  END IF;

  v_is_draw     := (NEW.score_home = NEW.score_away);
  v_is_knockout := (NEW.round IS NOT NULL);

  -- ── Process every unresolved prediction for this match ────────────────────
  FOR v_pred IN
    SELECT *
    FROM   public.predictions
    WHERE  match_id      = NEW.id
    AND    is_calculated = false
    FOR UPDATE
  LOOP
    -- Determine what the user predicted for the 1N2
    IF v_pred.pred_home > v_pred.pred_away THEN
      v_pred_outcome := 'home';
    ELSIF v_pred.pred_away > v_pred.pred_home THEN
      v_pred_outcome := 'away';
    ELSE
      v_pred_outcome := 'draw';
    END IF;

    -- ── 3-tier scoreline scoring ───────────────────────────────────────────
    IF v_pred_outcome <> v_actual_outcome THEN
      v_points := 0;
    ELSIF v_pred.pred_home = NEW.score_home
      AND v_pred.pred_away = NEW.score_away THEN
      v_points := ROUND((c_base_outcome + c_exactitude_bonus) * v_multiplier);
    ELSE
      v_points := ROUND(c_base_outcome * v_multiplier);
    END IF;

    -- ── Knockout tiebreaker bonus ──────────────────────────────────────────
    -- Only when the match ends level on the pitch (decided by ET / penalties)
    -- and the user correctly picked who advanced. Flat, independent of the
    -- scoreline tiers above and of the multipliers.
    IF v_is_knockout
       AND v_is_draw
       AND NEW.advance_winner IS NOT NULL
       AND v_pred.pred_advance = NEW.advance_winner THEN
      v_points := v_points + c_advance_bonus;
    END IF;

    -- ── Commit the result atomically ──────────────────────────────────────
    UPDATE public.predictions
    SET    points_won    = v_points,
           is_calculated = true
    WHERE  id = v_pred.id;

    UPDATE public.profiles
    SET    total_points = total_points + v_points
    WHERE  id = v_pred.user_id;

  END LOOP;

  RETURN NEW;
END;
$$;

-- REVOKE from migration 006 persists across CREATE OR REPLACE, but re-assert it
-- to be safe: this function is trigger-only and must not be REST-callable.
REVOKE EXECUTE ON FUNCTION public.calculate_match_predictions() FROM PUBLIC;

-- ── 4. Backfill existing knockout predictions ───────────────────────────────
-- Users who already predicted a decisive scoreline on a knockout match clearly
-- imply who they think advances — seed pred_advance from it so they aren't
-- penalised for predicting before this feature existed. Draw predictions are
-- left NULL: those users must pick an advancer explicitly.
UPDATE public.predictions p
SET    pred_advance = CASE
         WHEN p.pred_home > p.pred_away THEN 'home'
         WHEN p.pred_away > p.pred_home THEN 'away'
       END
FROM   public.matches m
WHERE  p.match_id     = m.id
  AND  m.round       IS NOT NULL
  AND  p.pred_advance IS NULL
  AND  p.pred_home   <> p.pred_away;
