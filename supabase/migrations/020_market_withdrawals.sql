-- =============================================================================
-- Migration 020: Market withdrawals (custodial cash-out) — reservation ledger
--
-- Withdrawing is a two-step dance because the second step (an on-chain send from
-- the hot wallet) happens OUTSIDE the database and can fail:
--
--   1. request_withdrawal — RESERVE: atomically debit the ledger and open a
--      'pending' withdrawal row. The debit is the reservation, so the balance
--      can never be spent twice while a payout is in flight.
--   2. the server broadcasts the send, then calls exactly one of:
--        mark_withdrawal_sent  — record the tx hash, status → 'sent'
--        fail_withdrawal       — credit the money back (reason 'refund'),
--                                status → 'failed'
--
-- Both step-2 functions are idempotent and act only on a 'pending' row, so a
-- retry or a double-callback can never double-refund or double-send.
--
-- Additive to migration 019; touches nothing in the live points game.
-- =============================================================================

CREATE TABLE public.withdrawals (
  id                BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           UUID          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  denom             TEXT          NOT NULL,
  amount            NUMERIC(78,0) NOT NULL CHECK (amount > 0),
  to_address        TEXT          NOT NULL,
  status            TEXT          NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','sent','failed')),
  debit_ledger_id   BIGINT        NOT NULL REFERENCES public.wallet_ledger(id),
  refund_ledger_id  BIGINT        REFERENCES public.wallet_ledger(id),
  tx_hash           TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_withdrawals_user   ON public.withdrawals (user_id, created_at DESC);
CREATE INDEX idx_withdrawals_status ON public.withdrawals (status);

ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

-- A user sees only their own withdrawals; no client write policy (RPC only).
CREATE POLICY withdrawals_select_own
  ON public.withdrawals FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- =============================================================================
-- request_withdrawal — reserve funds and open a pending withdrawal.
-- Client-callable; derives the user from auth.uid().
-- =============================================================================
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_denom      TEXT,
  p_amount     NUMERIC,
  p_to_address TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     UUID := (SELECT auth.uid());
  v_balance  NUMERIC(78,0);
  v_ledger   BIGINT;
  v_wid      BIGINT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> trunc(p_amount) THEN
    RAISE EXCEPTION 'Amount must be a positive whole number of atomic units'
      USING ERRCODE = '22023';
  END IF;

  IF p_to_address !~ '^inj1[0-9a-z]{38}$' THEN
    RAISE EXCEPTION 'Invalid Injective address' USING ERRCODE = '22023';
  END IF;

  -- Serialise this user's balance-affecting operations (same lock domain as
  -- place_stake) so a stake and a withdrawal can't race the same funds.
  PERFORM pg_advisory_xact_lock(hashtext(v_user::text)::bigint);

  SELECT COALESCE(SUM(delta), 0) INTO v_balance
  FROM public.wallet_ledger
  WHERE user_id = v_user AND denom = p_denom;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance' USING ERRCODE = 'P0001';
  END IF;

  -- Reserve: the debit itself holds the funds until the payout resolves.
  INSERT INTO public.wallet_ledger (user_id, denom, delta, reason, ref)
  VALUES (v_user, p_denom, -p_amount, 'withdraw', NULL)
  RETURNING id INTO v_ledger;

  INSERT INTO public.withdrawals (user_id, denom, amount, to_address, debit_ledger_id)
  VALUES (v_user, p_denom, p_amount, p_to_address, v_ledger)
  RETURNING id INTO v_wid;

  -- Tie the ledger row back to its withdrawal for auditability.
  UPDATE public.wallet_ledger SET ref = v_wid::text WHERE id = v_ledger;

  RETURN jsonb_build_object(
    'withdrawal_id', v_wid,
    'new_balance',   (v_balance - p_amount)::text,
    'denom',         p_denom
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_withdrawal(TEXT, NUMERIC, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.request_withdrawal(TEXT, NUMERIC, TEXT) TO authenticated;

-- =============================================================================
-- mark_withdrawal_sent — record a successful broadcast. Service-role only.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.mark_withdrawal_sent(
  p_id      BIGINT,
  p_tx_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_w RECORD;
BEGIN
  SELECT * INTO v_w FROM public.withdrawals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_w.status <> 'pending' THEN
    RETURN jsonb_build_object('withdrawal_id', p_id, 'status', v_w.status, 'noop', true);
  END IF;

  UPDATE public.withdrawals
    SET status = 'sent', tx_hash = p_tx_hash, updated_at = NOW()
    WHERE id = p_id;
  UPDATE public.wallet_ledger
    SET tx_hash = p_tx_hash
    WHERE id = v_w.debit_ledger_id;

  RETURN jsonb_build_object('withdrawal_id', p_id, 'status', 'sent', 'tx_hash', p_tx_hash);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_withdrawal_sent(BIGINT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mark_withdrawal_sent(BIGINT, TEXT) TO service_role;

-- =============================================================================
-- fail_withdrawal — broadcast failed: refund the reservation. Service-role only.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fail_withdrawal(p_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_w      RECORD;
  v_ledger BIGINT;
BEGIN
  SELECT * INTO v_w FROM public.withdrawals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_w.status <> 'pending' THEN
    RETURN jsonb_build_object('withdrawal_id', p_id, 'status', v_w.status, 'noop', true);
  END IF;

  -- Credit the reserved amount back to the user.
  INSERT INTO public.wallet_ledger (user_id, denom, delta, reason, ref)
  VALUES (v_w.user_id, v_w.denom, v_w.amount, 'refund', p_id::text)
  RETURNING id INTO v_ledger;

  UPDATE public.withdrawals
    SET status = 'failed', refund_ledger_id = v_ledger, updated_at = NOW()
    WHERE id = p_id;

  RETURN jsonb_build_object('withdrawal_id', p_id, 'status', 'failed', 'refunded', v_w.amount::text);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fail_withdrawal(BIGINT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fail_withdrawal(BIGINT) TO service_role;
