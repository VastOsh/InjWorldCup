// =============================================================================
// Premium analysis — the deep report unlocked via x402.
//
// Built from the same deterministic Analysis as the free tier, but exposes the
// richer detail withheld from the free endpoint: expected goals, goals markets
// (over 2.5, both teams to score), a scoreline probability map, and a
// Kelly-lite suggested stake derived from the model's edge over the market.
// =============================================================================

import type { Analysis, Outcome } from "./engine";

// Local copy of the Poisson pmf (kept type-only on the engine import so this
// module is importable from standalone Node services without path aliases).
function poisson(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

export interface StakeSuggestion {
  outcome: Outcome;
  odds: number;
  modelProb: number;
  /** Fractional-Kelly bankroll fraction, capped, in [0, 0.25]. */
  bankrollFraction: number;
  note: string;
}

export interface PremiumAnalysis {
  home: string;
  away: string;
  xg: { home: number; away: number };
  markets: { over2_5: number; btts: number };
  scorelineMap: { home: number; away: number; p: number }[];
  stake: StakeSuggestion | null;
}

/** P(total goals ≥ 3) from two independent Poisson scorers. */
function overProbability(lh: number, la: number, line = 2): number {
  let under = 0;
  for (let i = 0; i <= line; i++) {
    for (let j = 0; j <= line - i; j++) {
      under += poisson(i, lh) * poisson(j, la);
    }
  }
  return 1 - under;
}

/** P(both teams score ≥ 1). */
function bttsProbability(lh: number, la: number): number {
  return (1 - poisson(0, lh)) * (1 - poisson(0, la));
}

/**
 * Fractional-Kelly stake for the model's best value outcome.
 * Kelly f* = (p·o − 1) / (o − 1); we take a quarter of it and cap at 25%.
 */
function suggestStake(analysis: Analysis): StakeSuggestion | null {
  if (!analysis.value) return null;
  const { outcome } = analysis.value;
  const modelProb = analysis.modelProbs[outcome];
  // Kelly uses the actual payout odds (the raw multiplier), not de-vigged odds.
  const odds = analysis.odds[outcome];

  const kelly = (modelProb * odds - 1) / (odds - 1);
  if (kelly <= 0) return null;
  const bankrollFraction = Math.min(kelly * 0.25, 0.25);

  return {
    outcome,
    odds,
    modelProb,
    bankrollFraction,
    note: `Model edge on ${outcome}. Quarter-Kelly ≈ ${(bankrollFraction * 100).toFixed(1)}% of bankroll.`,
  };
}

export function buildPremium(analysis: Analysis): PremiumAnalysis {
  const { home: lh, away: la } = analysis.lambda;
  return {
    home: analysis.home,
    away: analysis.away,
    xg: { home: lh, away: la },
    markets: {
      over2_5: overProbability(lh, la, 2),
      btts: bttsProbability(lh, la),
    },
    scorelineMap: analysis.topScorelines,
    stake: suggestStake(analysis),
  };
}
