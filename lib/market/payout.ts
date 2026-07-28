// =============================================================================
// Payout broadcaster — sign and send a bank transfer from the market hot wallet.
//
// This is the ONLY place a private key is used. It signs a Cosmos bank MsgSend
// on Injective (ethsecp256k1, via @injectivelabs/sdk-ts) from the custodial
// market wallet to a player's inj1 address. Used for both withdrawal cash-outs
// and — later — automated payouts if desired.
//
// TESTNET ONLY for now: the signer key lives in env and the network defaults to
// testnet. Never point this at mainnet without a hardware/KMS signer.
//
// The heavy SDK is imported dynamically so it never enters the build graph of
// routes that don't broadcast. Types stay loose (inferred) for the same reason.
// =============================================================================

import { marketWallet } from "./config";

export interface PayoutResult {
  ok: boolean;
  txHash?: string;
  error?: string;
  /**
   * Whether the tx may have reached the chain. CRITICAL for exactly-once:
   *  - false → the send was rejected BEFORE broadcast (bad input, signer config,
   *    or an on-chain atomic failure that moved no funds). Safe to refund now.
   *  - true  → the broadcast threw AFTER submission was possible (network/timeout).
   *    The payout might have landed — DO NOT refund; let the reconcile job check
   *    the chain by memo and resolve it exactly once.
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

  const mnemonic = process.env.MARKET_WALLET_MNEMONIC?.trim();
  const pkHex = process.env.MARKET_WALLET_PK?.trim();
  if (!mnemonic && !pkHex) {
    return { ok: false, submitted: false, error: "Market signer not configured (MARKET_WALLET_MNEMONIC or MARKET_WALLET_PK)" };
  }

  let broadcasting = false;
  try {
    const { MsgSend, PrivateKey, MsgBroadcasterWithPk } = await import("@injectivelabs/sdk-ts");
    const { Network } = await import("@injectivelabs/networks");

    const key = mnemonic
      ? PrivateKey.fromMnemonic(mnemonic)
      : PrivateKey.fromHex(pkHex as string);
    const from = key.toBech32();

    // Never sign from an unexpected key: the derived signer must be exactly the
    // wallet deposits were sent to and balances are custodied in.
    if (from !== expectedWallet) {
      return { ok: false, submitted: false, error: "Configured signer does not match MARKET_WALLET_ADDRESS" };
    }

    const network = process.env.MARKET_NETWORK === "mainnet" ? Network.Mainnet : Network.Testnet;
    const msg = MsgSend.fromJSON({
      amount: { denom, amount },
      srcInjectiveAddress: from,
      dstInjectiveAddress: to,
    });

    const broadcaster = new MsgBroadcasterWithPk({ network, privateKey: key });
    // From here a throw is ambiguous — the tx may already be in the mempool.
    broadcasting = true;
    const res = await broadcaster.broadcast({ msgs: msg, memo });

    // A non-zero code = the tx was included but FAILED atomically → no funds
    // moved → safe to refund (submitted:false for the caller's purposes).
    if (res.code !== 0) {
      return { ok: false, submitted: false, error: res.rawLog || `Transaction failed (code ${res.code})` };
    }
    return { ok: true, submitted: true, txHash: res.txHash };
  } catch (e) {
    // Ambiguous once broadcasting started: might have landed. Leave it to the
    // reconcile job to check the chain by memo rather than risk a double-spend.
    return { ok: false, submitted: broadcasting, error: (e as Error).message };
  }
}
