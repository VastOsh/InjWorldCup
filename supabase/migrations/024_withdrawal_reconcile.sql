-- =============================================================================
-- Migration 024: Withdrawal reconciliation support
--
-- The step-2 functions (mark_withdrawal_sent / fail_withdrawal) already exist
-- and are idempotent (migration 020). This adds the query the reconcile job
-- needs: the withdrawals that have been 'pending' too long and must be resolved
-- against the chain (found on-chain → mark sent; genuinely absent → refund).
--
-- Service-role only. Additive.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_stuck_withdrawals(
  p_min_age INTERVAL DEFAULT INTERVAL '2 minutes'
)
RETURNS TABLE (
  id         BIGINT,
  user_id    UUID,
  denom      TEXT,
  amount     NUMERIC,
  to_address TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, user_id, denom, amount, to_address, created_at
  FROM public.withdrawals
  WHERE status = 'pending'
    AND created_at < NOW() - p_min_age
  ORDER BY created_at ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.list_stuck_withdrawals(INTERVAL) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_stuck_withdrawals(INTERVAL) TO service_role;
