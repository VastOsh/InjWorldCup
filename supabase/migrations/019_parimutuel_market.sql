-- =============================================================================
-- Migration 019: Parimutuel Prediction Market — engine + custodial ledger
--
-- Adds a per-match parimutuel betting market on top of the existing schema,
-- WITHOUT touching the live points game (migration 002 scoring trigger is left
-- exactly as-is). Everything here is additive.
--
-- Model (all amounts are ATOMIC on-chain units — NUMERIC(78,0) holds an 18-dp
-- INJ amount or a 6-dp USDC amount without precision loss):
--
--   wallet_ledger  append-only truth of every balance change (deposit, stake,
--                  payout, refund, withdraw). balance = SUM(delta) per (user,denom).
--                  Service-role write ONLY — users can read their own rows but can
--                  never mint balance. A stake debit and a payout credit are the
--                  only ways a stake ever moves money, both via SECURITY DEFINER
--                  functions below.
--   markets        one row per (match, denom). Outcomes are the 1X2 result:
--                  home / draw / away. locks_at = matches.match_date.
--   stakes         immutable bet rows; a user may stake any number of times on
--                  any outcome. Each links to its debit ledger row, and (once
--                  settled) to its payout/refund ledger row.
--   market_pools   maintained aggregate (pool total + count per outcome) so odds
--                  are an O(1) read and individual stakes are never exposed.
--
-- Custody is external and custodial: real testnet transfers land in a project
-- market wallet, a watcher credits `deposit` rows, withdrawals debit + send.
-- This migration is the pure engine and knows nothing about the chain.
--
-- SETTLEMENT is a SECURITY DEFINER function (settle_market) invoked by a
-- service-role job when a match reaches FINISHED — NOT a trigger, so it can
-- never fire off the live scoring path and is fully idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- LEDGER — append-only, service-role write only.
-- ---------------------------------------------------------------------------
CREATE TABLE public.wallet_ledger (
  id          BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  denom       TEXT          NOT NULL,                 -- on-chain denom (e.g. testnet USDC factory denom, or 'inj')
  delta       NUMERIC(78,0) NOT NULL,                 -- atomic units; +credit / -debit
  reason      TEXT          NOT NULL CHECK (reason IN
                              ('deposit','withdraw','stake','payout','refund')),
  ref         TEXT,                                    -- market id / withdrawal id / free-form
  tx_hash     TEXT,                                    -- on-chain tx for deposit / withdraw
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_user_denom ON public.wallet_ledger (user_id, denom);
CREATE INDEX idx_ledger_user_time  ON public.wallet_ledger (user_id, created_at DESC);

-- A deposit is credited exactly once per on-chain tx, no matter how many times
-- the watcher re-scans. (Partial unique index so other reasons ignore tx_hash.)
CREATE UNIQUE INDEX uq_ledger_deposit_tx
  ON public.wallet_ledger (tx_hash) WHERE reason = 'deposit';

COMMENT ON TABLE public.wallet_ledger IS
  'Append-only balance ledger. balance = SUM(delta) per (user_id, denom). Service-role write only.';

-- ---------------------------------------------------------------------------
-- MARKETS — one parimutuel pool per (match, denom).
-- ---------------------------------------------------------------------------
CREATE TABLE public.markets (
  id              BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  match_id        INTEGER      NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  denom           TEXT         NOT NULL,
  fee_bps         INTEGER      NOT NULL DEFAULT 0 CHECK (fee_bps BETWEEN 0 AND 2000),
  status          TEXT         NOT NULL DEFAULT 'open'
                               CHECK (status IN ('open','locked','settled','void')),
  locks_at        TIMESTAMPTZ  NOT NULL,              -- mirror of matches.match_date at creation
  winning_outcome TEXT         CHECK (winning_outcome IN ('home','draw','away')),
  settled_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, denom)
);

CREATE INDEX idx_markets_match  ON public.markets (match_id);
CREATE INDEX idx_markets_status ON public.markets (status);

-- ---------------------------------------------------------------------------
-- STAKES — immutable bet rows.
-- ---------------------------------------------------------------------------
CREATE TABLE public.stakes (
  id                BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  market_id         BIGINT        NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  user_id           UUID          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  outcome           TEXT          NOT NULL CHECK (outcome IN ('home','draw','away')),
  amount            NUMERIC(78,0) NOT NULL CHECK (amount > 0),
  ledger_id         BIGINT        NOT NULL REFERENCES public.wallet_ledger(id),  -- the stake debit
  payout_ledger_id  BIGINT        REFERENCES public.wallet_ledger(id),           -- payout/refund, set at settle
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stakes_market ON public.stakes (market_id);
CREATE INDEX idx_stakes_user   ON public.stakes (user_id);

-- ---------------------------------------------------------------------------
-- MARKET POOLS — maintained aggregate for O(1) odds; safe to expose publicly
-- because it holds only sums, never who staked what.
-- ---------------------------------------------------------------------------
CREATE TABLE public.market_pools (
  market_id   BIGINT        NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  outcome     TEXT          NOT NULL CHECK (outcome IN ('home','draw','away')),
  pool        NUMERIC(78,0) NOT NULL DEFAULT 0,
  stake_count INTEGER       NOT NULL DEFAULT 0,
  PRIMARY KEY (market_id, outcome)
);

-- =============================================================================
-- ROW-LEVEL SECURITY
-- =============================================================================
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.markets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stakes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_pools  ENABLE ROW LEVEL SECURITY;

-- Ledger: a user sees only their own rows. No INSERT/UPDATE/DELETE policy at
-- all → authenticated can never write it; only the service role (RLS-exempt)
-- and the SECURITY DEFINER functions below move money.
CREATE POLICY wallet_ledger_select_own
  ON public.wallet_ledger FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Markets & pools: readable by any logged-in user (odds are public to players);
-- never client-writable.
CREATE POLICY markets_select_authenticated
  ON public.markets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY market_pools_select_authenticated
  ON public.market_pools FOR SELECT
  TO authenticated
  USING (true);

-- Stakes: a user sees only their own bets. Pools (above) carry the public
-- aggregate. No client write policy → stakes only ever appear via place_stake.
CREATE POLICY stakes_select_own
  ON public.stakes FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- =============================================================================
-- place_stake — the ONLY way a player creates a bet.
--
-- Atomically, under a per-user advisory lock (serialises a user's concurrent
-- stakes so balance can't be double-spent):
--   1. validate the market is open and not past lock time,
--   2. validate the amount is a positive whole number of atomic units,
--   3. check the caller's balance in the market denom covers it,
--   4. write the stake debit to the ledger,
--   5. insert the immutable stake row,
--   6. bump the public pool aggregate.
--
-- SECURITY DEFINER so it can write the service-managed ledger, but it derives
-- the user from auth.uid() — a caller can only ever stake as themselves.
-- =============================================================================
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

  -- Serialise this user's balance-affecting operations.
  PERFORM pg_advisory_xact_lock(hashtext(v_user::text)::bigint);

  -- Lock the market row so status/lock checks are consistent with settlement.
  SELECT * INTO v_market FROM public.markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_market.status <> 'open' THEN
    RAISE EXCEPTION 'Market is not open' USING ERRCODE = 'P0001';
  END IF;
  IF NOW() >= v_market.locks_at THEN
    RAISE EXCEPTION 'Market is locked' USING ERRCODE = 'P0001';
  END IF;

  -- Balance in the market's denom (advisory lock held ⇒ no racing debit).
  SELECT COALESCE(SUM(delta), 0) INTO v_balance
  FROM public.wallet_ledger
  WHERE user_id = v_user AND denom = v_market.denom;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance' USING ERRCODE = 'P0001';
  END IF;

  -- 1) debit
  INSERT INTO public.wallet_ledger (user_id, denom, delta, reason, ref)
  VALUES (v_user, v_market.denom, -p_amount, 'stake', p_market_id::text)
  RETURNING id INTO v_ledger;

  -- 2) immutable stake
  INSERT INTO public.stakes (market_id, user_id, outcome, amount, ledger_id)
  VALUES (p_market_id, v_user, p_outcome, p_amount, v_ledger)
  RETURNING id INTO v_stake;

  -- 3) public pool aggregate
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

-- Client-callable; the function itself enforces identity + rules.
REVOKE EXECUTE ON FUNCTION public.place_stake(BIGINT, TEXT, NUMERIC) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.place_stake(BIGINT, TEXT, NUMERIC) TO authenticated;

-- =============================================================================
-- settle_market — pay out a finished market. Service-role only (called by the
-- settlement job); NOT bound to a trigger.
--
-- Reads the authoritative result straight from public.matches (the caller can
-- NOT inject a winning outcome). Idempotent: a market already settled/void is a
-- no-op. Parimutuel payout:
--     pot           = Σ all stakes
--     winners_pool  = Σ stakes on the actual outcome
--     distributable = pot − floor(pot · fee_bps / 10000)
--     payoutᵢ       = floor(distributable · amountᵢ / winners_pool)
-- No winners  → VOID: every stake fully refunded.
-- Empty market → settled with nothing to pay.
-- Floor-rounding dust (≤ #winners atomic units) is left in the market wallet.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.settle_market(p_market_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_market       RECORD;
  v_match        RECORD;
  v_outcome      TEXT;
  v_pot          NUMERIC(78,0);
  v_winners_pool NUMERIC(78,0);
  v_distributable NUMERIC(78,0);
  v_fee          NUMERIC(78,0);
  v_stake        RECORD;
  v_payout       NUMERIC(78,0);
  v_ledger       BIGINT;
  v_paid         NUMERIC(78,0) := 0;
  v_count        INTEGER := 0;
BEGIN
  SELECT * INTO v_market FROM public.markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market not found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency: nothing to do if already resolved.
  IF v_market.status IN ('settled','void') THEN
    RETURN jsonb_build_object('market_id', p_market_id, 'status', v_market.status,
                              'noop', true);
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = v_market.match_id;
  IF v_match.status <> 'FINISHED'
     OR v_match.score_home IS NULL OR v_match.score_away IS NULL THEN
    RAISE EXCEPTION 'Match % is not finished', v_market.match_id USING ERRCODE = 'P0001';
  END IF;

  -- Authoritative outcome from the match score.
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

  -- No one picked the winner: void → refund every stake in full.
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

  -- Normal payout.
  v_fee := trunc(v_pot * v_market.fee_bps / 10000);
  v_distributable := v_pot - v_fee;

  FOR v_stake IN
    SELECT * FROM public.stakes
    WHERE market_id = p_market_id AND outcome = v_outcome FOR UPDATE
  LOOP
    v_payout := trunc(v_distributable * v_stake.amount / v_winners_pool);
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

  RETURN jsonb_build_object('market_id', p_market_id, 'status', 'settled',
                            'winning_outcome', v_outcome, 'pot', v_pot::text,
                            'fee', v_fee::text, 'paid', v_paid::text, 'winners', v_count);
END;
$$;

-- Settlement is service-role only — never a client RPC, never a trigger.
REVOKE EXECUTE ON FUNCTION public.settle_market(BIGINT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.settle_market(BIGINT) TO service_role;
