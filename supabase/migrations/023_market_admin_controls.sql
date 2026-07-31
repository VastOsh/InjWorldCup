-- =============================================================================
-- Migration 023: Market admin & lifecycle controls
--
-- Operator safety net for the custodial market. All service-role only — never
-- client-callable — and all idempotent so a retry is harmless:
--
--   pause_market / resume_market  — halt / resume NEW bets on a market without
--     settling it (a `paused_at` flag). Settlement is unaffected: a paused
--     market whose match finishes still settles normally.
--   cancel_market                 — operator-triggered VOID + full refund for a
--     bad/cancelled fixture. Refuses to touch an already-settled market (that
--     would double-pay); a no-op on an already-void one.
--
-- place_stake is re-created to also reject a paused market. Additive; the live
-- points game is untouched.
-- =============================================================================

ALTER TABLE public.markets
  ADD COLUMN paused_at TIMESTAMPTZ;    -- NULL = accepting bets

COMMENT ON COLUMN public.markets.paused_at IS
  'When betting was paused by an operator. NULL = open to bets. Does not affect settlement.';

-- ---------------------------------------------------------------------------
-- place_stake — re-created verbatim from migration 019 with ONE added guard:
-- a paused market rejects new stakes. Everything else is unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_stake(
  p_market_id BIGINT,
  p_outcome   TEXT,
  p_amount    NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     UUID := (SELECT auth.uid());
  v_market   RECORD;
  v_balance  NUMERIC(78,0);
  v_ledger   BIGINT;
  v_stake    BIGINT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_outcome NOT IN ('home','draw','away') THEN
    RAISE EXCEPTION 'Invalid outcome %', p_outcome USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> trunc(p_amount) THEN
    RAISE EXCEPTION 'Stake must be a positive whole number of atomic units'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_user::text)::bigint);

  SELECT * INTO v_market FROM public.markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_market.status <> 'open' THEN
    RAISE EXCEPTION 'Market is not open' USING ERRCODE = 'P0001';
  END IF;
  IF v_market.paused_at IS NOT NULL THEN
    RAISE EXCEPTION 'Market is paused' USING ERRCODE = 'P0001';
  END IF;
  IF NOW() >= v_market.locks_at THEN
    RAISE EXCEPTION 'Market is locked' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(delta), 0) INTO v_balance
  FROM public.wallet_ledger
  WHERE user_id = v_user AND denom = v_market.denom;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.wallet_ledger (user_id, denom, delta, reason, ref)
  VALUES (v_user, v_market.denom, -p_amount, 'stake', p_market_id::text)
  RETURNING id INTO v_ledger;

  INSERT INTO public.stakes (market_id, user_id, outcome, amount, ledger_id)
  VALUES (p_market_id, v_user, p_outcome, p_amount, v_ledger)
  RETURNING id INTO v_stake;

  INSERT INTO public.market_pools (market_id, outcome, pool, stake_count)
  VALUES (p_market_id, p_outcome, p_amount, 1)
  ON CONFLICT (market_id, outcome)
  DO UPDATE SET pool        = public.market_pools.pool + EXCLUDED.pool,
                stake_count = public.market_pools.stake_count + 1;

  RETURN jsonb_build_object(
    'stake_id',    v_stake,
    'new_balance', (v_balance - p_amount)::text,
    'denom',       v_market.denom
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.place_stake(BIGINT, TEXT, NUMERIC) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.place_stake(BIGINT, TEXT, NUMERIC) TO authenticated;

-- ---------------------------------------------------------------------------
-- pause_market / resume_market — toggle betting. Idempotent; refuse to touch a
-- market that is already resolved (settled/void).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pause_market(p_market_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_market RECORD;
BEGIN
  SELECT * INTO v_market FROM public.markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_market.status IN ('settled','void') THEN
    RAISE EXCEPTION 'Cannot pause a resolved market' USING ERRCODE = 'P0001';
  END IF;

  IF v_market.paused_at IS NULL THEN
    UPDATE public.markets SET paused_at = NOW() WHERE id = p_market_id;
  END IF;
  RETURN jsonb_build_object('market_id', p_market_id, 'paused', true,
                            'status', v_market.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_market(p_market_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_market RECORD;
BEGIN
  SELECT * INTO v_market FROM public.markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_market.status IN ('settled','void') THEN
    RAISE EXCEPTION 'Cannot resume a resolved market' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.markets SET paused_at = NULL WHERE id = p_market_id;
  RETURN jsonb_build_object('market_id', p_market_id, 'paused', false,
                            'status', v_market.status);
END;
$$;

-- ---------------------------------------------------------------------------
-- cancel_market — operator VOID + full refund (bad/cancelled fixture).
-- Idempotent: a no-op if already void; refuses a settled market (already paid).
-- Mirrors the no-winner void path in settle_market.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_market(p_market_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_market RECORD;
  v_stake  RECORD;
  v_ledger BIGINT;
  v_paid   NUMERIC(78,0) := 0;
  v_count  INTEGER := 0;
BEGIN
  SELECT * INTO v_market FROM public.markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_market.status = 'void' THEN
    RETURN jsonb_build_object('market_id', p_market_id, 'status', 'void', 'noop', true);
  END IF;
  IF v_market.status = 'settled' THEN
    RAISE EXCEPTION 'Cannot cancel a settled market (already paid out)' USING ERRCODE = 'P0001';
  END IF;

  -- Refund every stake in full (only those not already refunded — belt & braces).
  FOR v_stake IN
    SELECT * FROM public.stakes
    WHERE market_id = p_market_id AND payout_ledger_id IS NULL FOR UPDATE
  LOOP
    INSERT INTO public.wallet_ledger (user_id, denom, delta, reason, ref)
    VALUES (v_stake.user_id, v_market.denom, v_stake.amount, 'refund', p_market_id::text)
    RETURNING id INTO v_ledger;
    UPDATE public.stakes SET payout_ledger_id = v_ledger WHERE id = v_stake.id;
    v_paid := v_paid + v_stake.amount;
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.markets
    SET status = 'void', winning_outcome = NULL, settled_at = NOW(), paused_at = NULL
    WHERE id = p_market_id;

  RETURN jsonb_build_object('market_id', p_market_id, 'status', 'void',
                            'refunded', v_paid::text, 'stakes', v_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pause_market(BIGINT)  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resume_market(BIGINT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_market(BIGINT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.pause_market(BIGINT)  TO service_role;
GRANT  EXECUTE ON FUNCTION public.resume_market(BIGINT) TO service_role;
GRANT  EXECUTE ON FUNCTION public.cancel_market(BIGINT) TO service_role;
