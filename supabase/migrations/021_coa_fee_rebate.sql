-- =============================================================================
-- Migration 021: CoA holder fee rebate on settlement
--
-- Replaces settle_market so a winning bettor who holds a Cult of Anons NFT
-- (profiles.holds_coa, migration 018) pays NO fee: their payout is computed
-- from the FULL pot instead of the fee'd remainder. Non-holders are unchanged.
--
-- The rebate is funded entirely from the rake the house already took, so the
-- market wallet can never go negative:
--   - a non-holder winner's slice comes from (pot - fee)
--   - a holder winner's slice comes from pot
--   - the sum of all winner slices is still <= pot (floor division), so total
--     paid never exceeds what was staked. Worst case (every winner a holder)
--     the house simply retains 0 fee — never less.
--
-- Depends on migration 018 (profiles.holds_coa). Additive; does not touch the
-- live points game.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.settle_market(p_market_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_market        RECORD;
  v_match         RECORD;
  v_outcome       TEXT;
  v_pot           NUMERIC(78,0);
  v_winners_pool  NUMERIC(78,0);
  v_distributable NUMERIC(78,0);
  v_fee           NUMERIC(78,0);
  v_stake         RECORD;
  v_holder        BOOLEAN;
  v_payout        NUMERIC(78,0);
  v_ledger        BIGINT;
  v_paid          NUMERIC(78,0) := 0;
  v_count         INTEGER := 0;
BEGIN
  SELECT * INTO v_market FROM public.markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_market.status IN ('settled','void') THEN
    RETURN jsonb_build_object('market_id', p_market_id, 'status', v_market.status, 'noop', true);
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = v_market.match_id;
  IF v_match.status <> 'FINISHED'
     OR v_match.score_home IS NULL OR v_match.score_away IS NULL THEN
    RAISE EXCEPTION 'Match % is not finished', v_market.match_id USING ERRCODE = 'P0001';
  END IF;

  IF v_match.score_home > v_match.score_away THEN
    v_outcome := 'home';
  ELSIF v_match.score_away > v_match.score_home THEN
    v_outcome := 'away';
  ELSE
    v_outcome := 'draw';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_pot
    FROM public.stakes WHERE market_id = p_market_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_winners_pool
    FROM public.stakes WHERE market_id = p_market_id AND outcome = v_outcome;

  -- Empty market: resolve, pay nothing.
  IF v_pot = 0 THEN
    UPDATE public.markets
      SET status = 'settled', winning_outcome = v_outcome, settled_at = NOW()
      WHERE id = p_market_id;
    RETURN jsonb_build_object('market_id', p_market_id, 'status', 'settled',
                              'winning_outcome', v_outcome, 'paid', '0', 'winners', 0);
  END IF;

  -- No winner: void and refund every stake in full.
  IF v_winners_pool = 0 THEN
    FOR v_stake IN
      SELECT * FROM public.stakes WHERE market_id = p_market_id FOR UPDATE
    LOOP
      INSERT INTO public.wallet_ledger (user_id, denom, delta, reason, ref)
      VALUES (v_stake.user_id, v_market.denom, v_stake.amount, 'refund', p_market_id::text)
      RETURNING id INTO v_ledger;
      UPDATE public.stakes SET payout_ledger_id = v_ledger WHERE id = v_stake.id;
      v_paid := v_paid + v_stake.amount;
      v_count := v_count + 1;
    END LOOP;

    UPDATE public.markets
      SET status = 'void', winning_outcome = v_outcome, settled_at = NOW()
      WHERE id = p_market_id;
    RETURN jsonb_build_object('market_id', p_market_id, 'status', 'void',
                              'winning_outcome', v_outcome, 'paid', v_paid::text,
                              'winners', v_count);
  END IF;

  -- Normal payout, with the CoA holder fee rebate.
  v_fee := trunc(v_pot * v_market.fee_bps / 10000);
  v_distributable := v_pot - v_fee;

  FOR v_stake IN
    SELECT * FROM public.stakes
    WHERE market_id = p_market_id AND outcome = v_outcome FOR UPDATE
  LOOP
    -- CoA holders pay no fee: their slice is drawn from the full pot.
    SELECT COALESCE(holds_coa, false) INTO v_holder
      FROM public.profiles WHERE id = v_stake.user_id;

    IF v_holder THEN
      v_payout := trunc(v_pot * v_stake.amount / v_winners_pool);
    ELSE
      v_payout := trunc(v_distributable * v_stake.amount / v_winners_pool);
    END IF;

    IF v_payout > 0 THEN
      INSERT INTO public.wallet_ledger (user_id, denom, delta, reason, ref)
      VALUES (v_stake.user_id, v_market.denom, v_payout, 'payout', p_market_id::text)
      RETURNING id INTO v_ledger;
      UPDATE public.stakes SET payout_ledger_id = v_ledger WHERE id = v_stake.id;
      v_paid := v_paid + v_payout;
    END IF;
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.markets
    SET status = 'settled', winning_outcome = v_outcome, settled_at = NOW()
    WHERE id = p_market_id;

  -- 'retained' is what the house actually keeps: the non-holders' share of the
  -- fee plus floor dust (pot minus everything paid out). Always >= 0.
  RETURN jsonb_build_object('market_id', p_market_id, 'status', 'settled',
                            'winning_outcome', v_outcome, 'pot', v_pot::text,
                            'fee_nominal', v_fee::text, 'paid', v_paid::text,
                            'retained', (v_pot - v_paid)::text, 'winners', v_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_market(BIGINT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.settle_market(BIGINT) TO service_role;
