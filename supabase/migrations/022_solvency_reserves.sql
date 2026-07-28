-- =============================================================================
-- Migration 022: Solvency / reserve accounting
--
-- Custody is only legitimate if the operator can honour every balance. This
-- adds the accounting to prove it, and a guard to keep it true:
--
--   LIABILITIES(denom) = Σ wallet_ledger.delta        (what we owe all users)
--   RESERVES(denom)    = market wallet on-chain balance (fed in — the DB can't
--                        read the chain)
--   SURPLUS            = RESERVES − LIABILITIES        (house fees + dust; ≥ 0)
--   SOLVENT            = SURPLUS ≥ 0
--
-- Why the identity holds when every credit is backed:
--   deposit  → reserves +X, ledger +X                  (equal)
--   withdraw → ledger −Y first (reservation), then reserves −Y on broadcast, so
--              reserves ≥ liabilities is preserved even mid-flight; a failed
--              send refunds the ledger and never moved reserves.
--   stake/payout/refund → internal redistribution; ledger net falls by the fee,
--              reserves unchanged → surplus grows by exactly the retained fee.
--
-- The ONE way to break it is an unbacked credit (e.g. a seeded balance). The
-- CHECK below makes that impossible going forward: a 'deposit' row must carry a
-- real 64-hex on-chain tx hash (claimDeposit already verifies it on-chain).
--
-- Additive; ops-facing only (service role). Touches nothing in the live game.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- LIABILITIES — per-denom rollup of the append-only ledger.
-- NOTE: this view runs with definer rights (bypasses wallet_ledger RLS), so it
-- is granted to service_role ONLY — never to authenticated.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.market_liabilities AS
  SELECT
    denom,
    COALESCE(SUM(delta), 0)                                    AS liabilities,
    COALESCE(SUM(delta)  FILTER (WHERE reason = 'deposit'),  0) AS deposits,
    COALESCE(SUM(-delta) FILTER (WHERE reason = 'withdraw'), 0) AS withdrawn,
    COALESCE(SUM(delta)  FILTER (WHERE reason = 'refund'),   0) AS refunded,
    COALESCE(SUM(-delta) FILTER (WHERE reason = 'stake'),    0) AS staked,
    COALESCE(SUM(delta)  FILTER (WHERE reason = 'payout'),   0) AS paid_out,
    COUNT(DISTINCT user_id)                                    AS holders
  FROM public.wallet_ledger
  GROUP BY denom;

REVOKE ALL ON public.market_liabilities FROM PUBLIC;
GRANT SELECT ON public.market_liabilities TO service_role;

-- ---------------------------------------------------------------------------
-- RESERVE SNAPSHOTS — audit trail of every reconciliation.
-- ---------------------------------------------------------------------------
CREATE TABLE public.reserve_snapshots (
  id          BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  denom       TEXT          NOT NULL,
  reserves    NUMERIC(78,0) NOT NULL,   -- on-chain wallet balance at check time
  liabilities NUMERIC(78,0) NOT NULL,   -- Σ ledger at check time
  surplus     NUMERIC(78,0) NOT NULL,   -- reserves − liabilities
  solvent     BOOLEAN       NOT NULL,
  checked_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reserve_snapshots_denom_time
  ON public.reserve_snapshots (denom, checked_at DESC);

ALTER TABLE public.reserve_snapshots ENABLE ROW LEVEL SECURITY;  -- no policy → service role only

-- ---------------------------------------------------------------------------
-- record_reserve_snapshot — compute solvency from a fed-in on-chain reserve and
-- persist it. Service-role only (called by the reconciliation job).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_reserve_snapshot(
  p_denom    TEXT,
  p_reserves NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_liab    NUMERIC(78,0);
  v_surplus NUMERIC(78,0);
  v_id      BIGINT;
BEGIN
  IF p_reserves IS NULL OR p_reserves < 0 OR p_reserves <> trunc(p_reserves) THEN
    RAISE EXCEPTION 'Reserves must be a non-negative whole number of atomic units'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(liabilities, 0) INTO v_liab
    FROM public.market_liabilities WHERE denom = p_denom;
  v_liab := COALESCE(v_liab, 0);          -- no ledger rows yet ⇒ 0 liabilities
  v_surplus := p_reserves - v_liab;

  INSERT INTO public.reserve_snapshots (denom, reserves, liabilities, surplus, solvent)
  VALUES (p_denom, p_reserves, v_liab, v_surplus, v_surplus >= 0)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'snapshot_id', v_id,
    'denom',       p_denom,
    'reserves',    p_reserves::text,
    'liabilities', v_liab::text,
    'surplus',     v_surplus::text,
    'solvent',     v_surplus >= 0
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_reserve_snapshot(TEXT, NUMERIC) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_reserve_snapshot(TEXT, NUMERIC) TO service_role;

-- ---------------------------------------------------------------------------
-- BACKED-DEPOSIT GUARD — a 'deposit' credit must carry a real on-chain tx hash.
-- NOT VALID so it binds all FUTURE writes without failing on any legacy seed
-- rows; new phantom credits (no/!64-hex hash) are rejected outright.
--
-- The tx_hash IS NOT NULL is load-bearing: a CHECK only rejects on FALSE, and
-- `NULL ~ regex` is NULL — so without the explicit null-guard a null-hash
-- (i.e. wholly unbacked) deposit would slip straight through.
-- ---------------------------------------------------------------------------
ALTER TABLE public.wallet_ledger
  ADD CONSTRAINT ck_deposit_backed
  CHECK (reason <> 'deposit'
         OR (tx_hash IS NOT NULL AND tx_hash ~ '^[0-9A-Fa-f]{64}$'))
  NOT VALID;
