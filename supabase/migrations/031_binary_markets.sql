-- =============================================================================
-- Binary (2-outcome) markets — head-to-head events with no draw (tennis, golf,
-- most 1-v-1 sports). A market carries HAS_DRAW; when false the "draw" outcome
-- is not offered and a DB trigger rejects any draw stake, so the parimutuel math
-- (which sums home+draw+away) stays exact — draw simply never accrues a pool.
-- Existing markets default to true (3-way football), so nothing changes.
-- =============================================================================

ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS has_draw BOOLEAN NOT NULL DEFAULT true;

-- Hard guard: a draw stake can never land on a 2-way market, whatever the path
-- (place_stake RPC, admin, backfill). Runs inside the staking transaction.
CREATE OR REPLACE FUNCTION public.reject_draw_on_binary_market()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.outcome = 'draw'
     AND NOT (SELECT has_draw FROM public.markets WHERE id = NEW.market_id) THEN
    RAISE EXCEPTION 'draw is not a valid outcome for market %', NEW.market_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_draw_on_binary ON public.stakes;
CREATE TRIGGER trg_reject_draw_on_binary
  BEFORE INSERT ON public.stakes
  FOR EACH ROW EXECUTE FUNCTION public.reject_draw_on_binary_market();
