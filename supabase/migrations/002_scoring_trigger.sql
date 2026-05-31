-- =============================================================================
-- Migration 002: Asymmetric Scoring Trigger
--
-- Fires AFTER UPDATE on matches when status transitions to 'FINISHED'.
-- Applies 3-tier scoring logic to every unresolved prediction for that match,
-- then increments each user's total_points atomically within the same transaction.
--
-- Scoring constants (tune these to adjust the platform economy):
--   c_base_outcome     Points awarded for correctly predicting the 1N2 outcome
--   c_exactitude_bonus Additional points for predicting the exact scoreline
--
-- Final points per prediction:
--   Tier 1 (wrong outcome)          : 0
--   Tier 2 (correct outcome)        : ROUND(c_base_outcome * multiplier)
--   Tier 3 (correct outcome + score): ROUND((c_base_outcome + c_exactitude_bonus) * multiplier)
-- =============================================================================

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
  -- ──────────────────────────────────────────────────────────────────────────

  v_pred            RECORD;
  v_actual_outcome  TEXT;
  v_pred_outcome    TEXT;
  v_multiplier      NUMERIC;
  v_points          INTEGER;
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

  -- ── Process every unresolved prediction for this match ────────────────────
  -- FOR UPDATE locks each row, preventing a concurrent trigger misfire from
  -- processing the same prediction twice (idempotency backstop alongside
  -- the is_calculated flag).
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

    -- ── 3-tier scoring gate ────────────────────────────────────────────────
    IF v_pred_outcome <> v_actual_outcome THEN
      -- Tier 1: wrong outcome — no points
      v_points := 0;

    ELSIF v_pred.pred_home = NEW.score_home
      AND v_pred.pred_away = NEW.score_away THEN
      -- Tier 3: exact scoreline — base + exactitude premium, amplified by multiplier
      v_points := ROUND((c_base_outcome + c_exactitude_bonus) * v_multiplier);

    ELSE
      -- Tier 2: correct outcome, wrong score — base only, amplified by multiplier
      v_points := ROUND(c_base_outcome * v_multiplier);

    END IF;

    -- ── Commit the result atomically ──────────────────────────────────────
    -- Flip is_calculated = true in the same statement that writes points_won.
    -- This single UPDATE is the idempotency lock: if this transaction retries,
    -- the FOR UPDATE scan will find is_calculated = true and skip this row.
    UPDATE public.predictions
    SET    points_won    = v_points,
           is_calculated = true
    WHERE  id = v_pred.id;

    -- Increment total_points with a delta (not an overwrite) to survive
    -- concurrent matches finishing at the same timestamp.
    UPDATE public.profiles
    SET    total_points = total_points + v_points
    WHERE  id = v_pred.user_id;

  END LOOP;

  RETURN NEW;
END;
$$;

-- Bind the trigger to matches; fires once per updated row, after the UPDATE
-- commits to the row — so NEW.score_home / NEW.score_away are guaranteed present.
CREATE OR REPLACE TRIGGER on_match_finished
  AFTER UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_match_predictions();
