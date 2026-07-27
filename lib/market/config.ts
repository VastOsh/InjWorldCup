// =============================================================================
// Market denomination config.
//
// A market is denominated in one on-chain token. For the testnet phase this is
// testnet USDC (6 dp); the same code targets mainnet USDC or INJ by env alone,
// with no math changes (everything downstream is atomic bigint).
//
// COA note: perks like a reduced fee for Cult of Anons holders plug in later by
// reading profiles.holds_coa when a market is created — the engine already
// carries a per-market fee_bps for exactly that.
// =============================================================================

export interface MarketDenom {
  /** On-chain denom string used in transfers and the ledger. */
  denom: string;
  /** Decimal places for human display. */
  decimals: number;
  /** Ticker shown in the UI. */
  symbol: string;
}

// Testnet-first defaults; the real testnet USDC factory/peggy denom is wired in
// with the custody increment and overridable here without touching the engine.
const DEFAULT_DENOM = process.env.MARKET_DENOM || "usdc-testnet";
const DEFAULT_DECIMALS = Number(process.env.MARKET_DENOM_DECIMALS || "6");
const DEFAULT_SYMBOL = process.env.MARKET_SYMBOL || "USDC";

export function marketDenom(): MarketDenom {
  return { denom: DEFAULT_DENOM, decimals: DEFAULT_DECIMALS, symbol: DEFAULT_SYMBOL };
}

/** Default house fee in basis points (0 = no rake). Env-overridable per deploy. */
export function defaultFeeBps(): number {
  const v = Number(process.env.MARKET_FEE_BPS || "0");
  return Number.isInteger(v) && v >= 0 && v <= 2000 ? v : 0;
}

// --- Custody ----------------------------------------------------------------
// The market runs on TESTNET first, so its LCD is a testnet endpoint — distinct
// from the CoA holder check, which reads MAINNET (see lib/coa/config.ts). Don't
// cross the two: a deposit is verified on the chain the market settles on.
const DEFAULT_MARKET_LCD = "https://testnet.sentry.lcd.injective.network";

/** LCD/REST endpoint for the chain the market operates on (testnet by default). */
export function marketLcdUrl(): string {
  return (process.env.MARKET_LCD_URL || DEFAULT_MARKET_LCD).replace(/\/$/, "");
}

/**
 * The custodial market wallet: deposits are sent here, payouts/withdrawals go
 * out from here. No default — a missing address is a hard configuration error
 * rather than a silent wrong-address credit.
 */
export function marketWallet(): string {
  const addr = process.env.MARKET_WALLET_ADDRESS;
  if (!addr) throw new Error("MARKET_WALLET_ADDRESS is not configured");
  return addr;
}
