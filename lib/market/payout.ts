// =============================================================================
// Payout — sign and broadcast a bank transfer from the market wallet.
//
// This is the ONLY place funds leave custody. It keeps the SIGNER-AGNOSTIC
// engine concerns here and delegates the actual signing to a MarketSigner
// (lib/market/signer.ts), so the mainnet KMS/HSM signer drops in via env with
// no change to this file or its callers:
//   - validate destination + amount,
//   - assert the configured signer controls exactly MARKET_WALLET_ADDRESS
//     (never sign from an unexpected key),
//   - tag the send with the withdrawal memo,
//   - surface the exactly-once `submitted` flag for the caller's refund decision.
// =============================================================================

import { marketWallet } from "./config";
import { getMarketSigner } from "./signer";

export interface PayoutResult {
  ok: boolean;
  txHash?: string;
  error?: string;
  /**
   * Whether the tx may have reached the chain (exactly-once critical):
   *  - false → rejected before broadcast, or an on-chain atomic failure that
   *    moved no funds → safe to refund now.
   *  - true  → the broadcast was ambiguous (network/timeout); the payout might
   *    have landed → DO NOT refund; let the reconcile job resolve it by memo.
   */
  submitted: boolean;
}

const INJ_ADDRESS = /^inj1[0-9a-z]{38}$/;

/** The on-chain memo that tags a payout so it can be found again if the server
 *  loses track of it mid-flight. Deterministic in the withdrawal id. */
export function payoutMemo(withdrawalId: number | string): string {
  return `wd:${withdrawalId}`;
}

/**
 * Send `amount` (atomic units) of `denom` from the market wallet to `to`, tagged
 * with `memo`. Never throws — every failure is returned with a `submitted` flag
 * telling the caller whether a refund is safe (see PayoutResult.submitted).
 */
export async function broadcastPayout(
  to: string,
  denom: string,
  amount: string,
  memo?: string,
): Promise<PayoutResult> {
  // --- pre-submit validation: nothing can have reached the chain yet -------
  if (!INJ_ADDRESS.test(to)) return { ok: false, submitted: false, error: "Invalid destination address" };
  if (!/^\d+$/.test(amount) || amount === "0") {
    return { ok: false, submitted: false, error: "Invalid payout amount" };
  }

  let expectedWallet: string;
  try {
    expectedWallet = marketWallet();
  } catch (e) {
    return { ok: false, submitted: false, error: (e as Error).message };
  }

  const signer = getMarketSigner();

  // The configured signer must control exactly the custodial wallet — this
  // guard is signer-agnostic and protects env-key and KMS alike.
  let from: string;
  try {
    from = await signer.getAddress();
  } catch (e) {
    return { ok: false, submitted: false, error: (e as Error).message };
  }
  if (from !== expectedWallet) {
    return { ok: false, submitted: false, error: "Configured signer does not match MARKET_WALLET_ADDRESS" };
  }

  return signer.send(to, denom, amount, memo);
}
