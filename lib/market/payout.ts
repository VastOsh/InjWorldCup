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
}

const INJ_ADDRESS = /^inj1[0-9a-z]{38}$/;

/**
 * Send `amount` (atomic units) of `denom` from the market wallet to `to`.
 * Returns the tx hash on success. All failure modes are returned, never thrown,
 * so the caller can refund the reservation.
 */
export async function broadcastPayout(
  to: string,
  denom: string,
  amount: string,
): Promise<PayoutResult> {
  if (!INJ_ADDRESS.test(to)) return { ok: false, error: "Invalid destination address" };
  if (!/^\d+$/.test(amount) || amount === "0") {
    return { ok: false, error: "Invalid payout amount" };
  }

  let expectedWallet: string;
  try {
    expectedWallet = marketWallet();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const mnemonic = process.env.MARKET_WALLET_MNEMONIC?.trim();
  const pkHex = process.env.MARKET_WALLET_PK?.trim();
  if (!mnemonic && !pkHex) {
    return { ok: false, error: "Market signer not configured (MARKET_WALLET_MNEMONIC or MARKET_WALLET_PK)" };
  }

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
      return { ok: false, error: "Configured signer does not match MARKET_WALLET_ADDRESS" };
    }

    const network = process.env.MARKET_NETWORK === "mainnet" ? Network.Mainnet : Network.Testnet;
    const msg = MsgSend.fromJSON({
      amount: { denom, amount },
      srcInjectiveAddress: from,
      dstInjectiveAddress: to,
    });

    const broadcaster = new MsgBroadcasterWithPk({ network, privateKey: key });
    const res = await broadcaster.broadcast({ msgs: msg });

    if (res.code !== 0) {
      return { ok: false, error: res.rawLog || `Transaction failed (code ${res.code})` };
    }
    return { ok: true, txHash: res.txHash };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
