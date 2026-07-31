// =============================================================================
// Parimutuel market — shared types.
//
// The 1X2 result space and a pools snapshot. Amounts are ALWAYS atomic on-chain
// units held as bigint (mirrors the NUMERIC(78,0) columns in migration 019); a
// float would silently lose precision on an 18-dp INJ amount.
// =============================================================================

export type Outcome = "home" | "draw" | "away";

/** Total staked per outcome, atomic units. */
export type MarketPools = Record<Outcome, bigint>;

export const OUTCOMES: readonly Outcome[] = ["home", "draw", "away"] as const;
