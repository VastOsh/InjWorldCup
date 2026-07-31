// =============================================================================
// Parimutuel market math — pure, integer-exact, no DB/chain dependency.
//
// Every function here works in atomic units (bigint) and floor-truncates
// division exactly as Postgres `trunc()` does inside settle_market
// (migration 019). That parity is deliberate: the client can quote a payout and
// the on-chain settlement will agree to the atomic unit.
//
// Parimutuel primer: bettors stake into per-outcome pools. When a match ends the
// losing pools are redistributed to the winning pool pro-rata, minus a fee:
//     distributable = pot − floor(pot · fee_bps / 10000)
//     your share    = floor(distributable · yourStake / winningPool)
// Odds are therefore dynamic — every new stake shifts them.
//
// Runtime imports are avoided (only `import type`) so this module runs directly
// under `node --experimental-strip-types` for testing.
// =============================================================================

import type { MarketPools, Outcome } from "./types";

// Target is ES2017, so `1_000_000n` literal syntax is unavailable — construct
// bigints via BigInt(). The runtime type itself is fully supported.
const ZERO = BigInt(0);
/** Fixed-point scale for the human-facing ratios (probabilities, odds). */
const RATIO_SCALE = BigInt(1_000_000);
const FEE_DENOM = BigInt(10_000);

/** Sum of all outcome pools (the pot), atomic units. */
export function pot(pools: MarketPools): bigint {
  return pools.home + pools.draw + pools.away;
}

/** Floor fee cut on `amount`, matching the SQL `trunc(amount * fee_bps / 10000)`. */
function feeCut(amount: bigint, feeBps: number): bigint {
  return (amount * BigInt(feeBps)) / FEE_DENOM;
}

function ratio(numerator: bigint, denominator: bigint): number {
  if (denominator === ZERO) return 0;
  return Number((numerator * RATIO_SCALE) / denominator) / Number(RATIO_SCALE);
}

/**
 * Implied probability of each outcome = its share of the pot. In a parimutuel
 * the pool proportions ARE the crowd's probability estimate. Sums to ~1 (to
 * fixed-point rounding) whenever the pot is non-zero.
 */
export function impliedProbabilities(pools: MarketPools): Record<Outcome, number> {
  const total = pot(pools);
  return {
    home: ratio(pools.home, total),
    draw: ratio(pools.draw, total),
    away: ratio(pools.away, total),
  };
}

/**
 * Live decimal odds for `outcome`: what one unit staked returns (stake included)
 * if the outcome wins and the pools freeze right now. 0 when nobody has taken
 * that side yet (odds undefined — the UI shows "—").
 */
export function decimalOdds(pools: MarketPools, outcome: Outcome, feeBps: number): number {
  const winners = pools[outcome];
  if (winners === ZERO) return 0;
  const total = pot(pools);
  return ratio(total - feeCut(total, feeBps), winners);
}

export interface Quote {
  /** Total returned if the outcome wins (your stake back + winnings), atomic. */
  gross: bigint;
  /** Winnings on top of your stake, atomic. */
  profit: bigint;
  /** gross / stake, e.g. 2.5 means 2.5× your stake back. */
  effectiveOdds: number;
}

/**
 * Quote the payout for a *prospective* stake, before it's placed. Adds `stake`
 * to the winning pool and the pot (a parimutuel dilutes its own odds), so the
 * number shown is what the bettor would actually collect if their side wins and
 * the market froze at that instant.
 */
export function quotePayout(
  pools: MarketPools,
  outcome: Outcome,
  stake: bigint,
  feeBps: number,
): Quote {
  if (stake <= ZERO) return { gross: ZERO, profit: ZERO, effectiveOdds: 0 };
  const newWinners = pools[outcome] + stake;
  const newPot = pot(pools) + stake;
  const distributable = newPot - feeCut(newPot, feeBps);
  const gross = (distributable * stake) / newWinners; // floor — settle parity
  return { gross, profit: gross - stake, effectiveOdds: ratio(gross, stake) };
}

/**
 * The realised payout for a stake that IS already in the pools, when `winning`
 * is the actual result. This mirrors settle_market's per-stake arithmetic
 * exactly (pools here already include the stake), so it can be used to preview a
 * settlement or reconcile the ledger. Returns 0 if the outcome had no takers
 * (that market voids and refunds instead — see settle_market).
 */
export function settledShare(
  pools: MarketPools,
  winning: Outcome,
  stake: bigint,
  feeBps: number,
): bigint {
  const winners = pools[winning];
  if (winners === ZERO) return ZERO;
  const total = pot(pools);
  return ((total - feeCut(total, feeBps)) * stake) / winners; // floor
}
