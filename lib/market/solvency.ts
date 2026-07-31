// =============================================================================
// Reserve fetch — read the market wallet's real on-chain balance for a denom.
//
// The DB can compute LIABILITIES (Σ ledger) on its own, but it cannot know the
// on-chain RESERVES. This reads them off the LCD so the reconciliation job can
// feed them to record_reserve_snapshot and prove solvency (reserves ≥ liabilities).
//
// Pure read, like the deposit verifier: no key, no signing.
// =============================================================================

import { marketLcdUrl, marketWallet } from "./config";

const TIMEOUT_MS = 8000;

export interface ReserveFetch {
  ok: boolean;
  /** Atomic on-chain balance of the market wallet in `denom` (0 when ok is false). */
  amount: string;
  denom: string;
  wallet?: string;
  error?: string;
}

/** Read the market wallet's atomic balance in `denom` from the chain (LCD). */
export async function fetchReserve(denom: string): Promise<ReserveFetch> {
  let wallet: string;
  try {
    wallet = marketWallet();
  } catch (e) {
    return { ok: false, amount: "0", denom, error: (e as Error).message };
  }

  const url =
    `${marketLcdUrl()}/cosmos/bank/v1beta1/balances/${wallet}/by_denom` +
    `?denom=${encodeURIComponent(denom)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false, amount: "0", denom, wallet, error: `LCD error (HTTP ${res.status})` };
    const body = (await res.json().catch(() => null)) as { balance?: { denom: string; amount: string } } | null;
    // by_denom returns { balance: { denom, amount } }; a zero balance may omit it.
    const amount = body?.balance?.amount ?? "0";
    return { ok: true, amount, denom, wallet };
  } catch (e) {
    const err = e as Error;
    return {
      ok: false,
      amount: "0",
      denom,
      wallet,
      error: err.name === "AbortError" ? "Chain lookup timed out" : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}
