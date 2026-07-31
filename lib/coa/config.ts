// =============================================================================
// Cult of Anons (CoA) — collection configuration.
//
// CoA is our launch NFT partner: holding a token unlocks the "season pass"
// perks (free premium analytics, a leaderboard multiplier, the holders-only
// league). Membership is proven by a READ-ONLY on-chain query — we never take
// custody of the NFT and never ask for a transfer approval.
//
// The collection is a CosmWasm CW721 on Injective MAINNET (Talis CW721,
// code_id 796). Verified on-chain 26 July 2026:
//   name "Cult of Anons", symbol "ANON", supply 5000.
//
// Everything is env-overridable so a dev/staging deployment can point at a test
// collection without a code change. Reads run server-side only — the contract
// address is never shipped to the browser.
// =============================================================================

/** CW721 contract address of the Cult of Anons collection on Injective mainnet. */
const DEFAULT_COA_CONTRACT = "inj1mp8r8jy4cefgw4l0wtw9ahdnu9yv7nl6mqqkju";

/** Public Injective mainnet LCD (REST). CosmWasm smart queries go through here. */
const DEFAULT_LCD_URL = "https://sentry.lcd.injective.network";

/** Static collection metadata, for labels/copy. Not authoritative — chain is. */
export const COA_COLLECTION = {
  name: "Cult of Anons",
  symbol: "ANON",
  supply: 5000,
} as const;

export function coaContract(): string {
  return process.env.COA_CONTRACT_ADDRESS || DEFAULT_COA_CONTRACT;
}

export function injectiveLcdUrl(): string {
  return (process.env.INJECTIVE_LCD_URL || DEFAULT_LCD_URL).replace(/\/$/, "");
}
