// =============================================================================
// x402 configuration — Injective.
//
// Builds the "payment requirements" advertised in a 402 response and selects
// the verification mode. Everything is env-driven so the same code runs against
// a local mock (for testing with no wallet/funds) or a real Injective
// facilitator once credentials exist.
//
// Injective x402 reference:
//   network (Injective EVM): eip155:1776
//   USDC asset:              0xa00C59fF5a080D2b954d0c75e46E22a0c371235a
//   amounts are atomic (USDC has 6 decimals) → "10000" = $0.01
// For TESTNET, override X402_NETWORK / X402_ASSET / X402_PAY_TO via env.
// =============================================================================

export type X402Mode = "mock" | "facilitator";

/** A single x402 v1 payment requirement (the shape carried in `accepts`). */
export interface PaymentRequirements {
  scheme: "exact";
  network: string;
  maxAmountRequired: string; // atomic units
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: { name: string; version: string };
}

// Documented Injective mainnet defaults; override in .env for testnet.
const DEFAULT_NETWORK = "eip155:1776";
const DEFAULT_ASSET = "0xa00C59fF5a080D2b954d0c75e46E22a0c371235a";
const DEFAULT_PRICE = "10000"; // $0.01

export function x402Mode(): X402Mode {
  return process.env.X402_MODE === "facilitator" ? "facilitator" : "mock";
}

/** Shared secret used only in mock mode to gate the endpoint without funds. */
export function x402DevSecret(): string {
  return process.env.X402_DEV_SECRET || "injworldcup-dev";
}

export function facilitatorUrl(): string | null {
  return process.env.X402_FACILITATOR_URL || null;
}

/** Build the payment requirements to advertise for the premium analysis. */
export function buildRequirements(resource: string): PaymentRequirements {
  return {
    scheme: "exact",
    network: process.env.X402_NETWORK || DEFAULT_NETWORK,
    maxAmountRequired: process.env.X402_PRICE_ATOMIC || DEFAULT_PRICE,
    resource,
    description: "InjWorldCup — deep AI match analysis (xG, scoreline map, stake)",
    mimeType: "application/json",
    payTo: process.env.X402_PAY_TO || "0x0000000000000000000000000000000000000000",
    maxTimeoutSeconds: 60,
    asset: process.env.X402_ASSET || DEFAULT_ASSET,
    extra: { name: "USDC", version: "2" },
  };
}

/** Human-readable price, e.g. "0.01 USDC", derived from the atomic amount. */
export function priceLabel(): string {
  const atomic = process.env.X402_PRICE_ATOMIC || DEFAULT_PRICE;
  const usdc = Number(atomic) / 1_000_000;
  return `${usdc} USDC`;
}
