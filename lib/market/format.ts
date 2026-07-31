// =============================================================================
// Atomic ⇄ human amount conversion for market denoms.
//
// On-chain amounts are integers in the token's smallest unit (USDC 6 dp, INJ
// 18 dp). The ledger and math work in that atomic bigint; only the UI edge
// converts to/from a human decimal string. Kept string-based (never float) so
// an 18-dp amount survives the round trip intact.
// =============================================================================

/** Parse a human decimal string (e.g. "12.5") into atomic units. */
// ES2017 target ⇒ no `10n` literals; BigInt() constructs them at runtime.
const TEN = BigInt(10);

export function toAtomic(human: string, decimals: number): bigint {
  const trimmed = human.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid amount: ${human}`);
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > decimals) {
    throw new Error(`Too many decimal places (max ${decimals})`);
  }
  const padded = frac.padEnd(decimals, "0");
  return BigInt(whole) * TEN ** BigInt(decimals) + BigInt(padded || "0");
}

/**
 * Render atomic units as a human decimal string. Trailing zeros are trimmed;
 * `maxFractionDigits` optionally caps displayed precision (truncating, not
 * rounding, to stay honest about the underlying amount).
 */
export function fromAtomic(atomic: bigint, decimals: number, maxFractionDigits?: number): string {
  const negative = atomic < BigInt(0);
  const abs = negative ? -atomic : atomic;
  const base = TEN ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0");
  if (maxFractionDigits !== undefined && maxFractionDigits < frac.length) {
    frac = frac.slice(0, maxFractionDigits);
  }
  frac = frac.replace(/0+$/, "");
  const body = frac.length > 0 ? `${whole}.${frac}` : `${whole}`;
  return negative ? `-${body}` : body;
}
