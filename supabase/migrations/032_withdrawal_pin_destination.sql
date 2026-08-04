-- =============================================================================
-- Migration 032: pin a withdrawal's destination to the caller's linked wallet
--
-- request_withdrawal (migration 020) took p_to_address as a client-supplied
-- parameter and only validated its FORMAT. The "withdrawals only ever pay back
-- to your own verified wallet" guarantee lived solely in the withdraw() server
-- action — but the RPC is GRANTed to `authenticated`, so it is directly callable
-- over PostgREST (/rest/v1/rpc/request_withdrawal) with ANY inj1 address, which
-- bypasses that action.
--
-- No funds could actually be stolen today (the on-chain send only happens inside
-- withdraw(), keyed to the linked wallet, and the reconcile job never
-- re-broadcasts — a directly-created row just self-debits, sits pending, and is
-- refunded). But the invariant was only accidentally true. This closes it at the
-- trust boundary: the destination is now derived/verified against the caller's
-- own profiles.wallet_address inside the definer function, so a direct RPC call
-- can never open a withdrawal to a third-party address.
--
-- Additive: same signature, so app callers are unchanged. The withdraw() action
-- keeps passing the linked wallet; it now simply must match.
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
  v_wallet   TEXT;
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

  -- The destination is NOT trusted from the client: a custodial withdrawal only
  -- ever pays back to the wallet this account is verifiably bound to. Enforced
  -- here so the guarantee holds even on a direct PostgREST call.
  SELECT wallet_address INTO v_wallet FROM public.profiles WHERE id = v_user;
  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'Link an Injective wallet before withdrawing' USING ERRCODE = 'P0001';
  END IF;
  IF v_wallet <> p_to_address THEN
    RAISE EXCEPTION 'Withdrawals must go to your linked wallet' USING ERRCODE = '22023';
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
  VALUES (v_user, p_denom, p_amount, v_wallet, v_ledger)
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
