// =============================================================================
// One-click deposit — build + sign + broadcast a bank MsgSend to the market
// wallet straight from the user's connected Keplr/Ninji wallet, returning the
// tx hash. The server then verifies + credits it via the existing claimDeposit
// path (same on-chain check as a manually-pasted hash).
//
// BROWSER-ONLY. sdk-ts is heavy, so callers should code-split this module
// (dynamic import) so it only loads when someone actually deposits. Follows the
// official Injective "Transactions with Keplr" (signDirect) flow.
//
// NOTE: this needs a real chain + the real on-chain denom, so it works on
// testnet/mainnet only — not against the local Supabase stack (no chain).
// =============================================================================

import { Buffer } from "buffer";
// sdk-ts uses Buffer internally; ensure it exists in the browser.
if (typeof (globalThis as { Buffer?: unknown }).Buffer === "undefined") {
  (globalThis as { Buffer?: unknown }).Buffer = Buffer;
}

import {
  MsgSend,
  ChainRestAuthApi,
  ChainRestTendermintApi,
  BaseAccount,
  createTransaction,
  getTxRawFromTxRawOrDirectSignResponse,
  TxRestApi,
} from "@injectivelabs/sdk-ts";
import { Network, getNetworkEndpoints } from "@injectivelabs/networks";

export type MarketNetwork = "mainnet" | "testnet";

// Standard Injective fee: 0.0002 INJ at a 400k gas limit (a bank send needs far
// less; over-provisioning gas is harmless). The signer still needs a little INJ.
const STD_FEE = { amount: [{ denom: "inj", amount: "200000000000000" }], gas: "400000" };
const TIMEOUT_BLOCKS = 120;

interface KeplrLike {
  enable(chainId: string): Promise<void>;
  getKey(chainId: string): Promise<{ bech32Address: string; pubKey: Uint8Array }>;
  getOfflineSigner(chainId: string): {
    signDirect(address: string, signDoc: unknown): Promise<unknown>;
  };
}

export async function depositViaWallet(params: {
  network: MarketNetwork;
  chainDenom: string;
  atomicAmount: string;
  marketWallet: string;
}): Promise<string> {
  const { network, chainDenom, atomicAmount, marketWallet } = params;
  const isMainnet = network === "mainnet";
  const chainId = isMainnet ? "injective-1" : "injective-888";
  const rest = getNetworkEndpoints(isMainnet ? Network.Mainnet : Network.Testnet).rest;

  const w = window as unknown as { keplr?: KeplrLike; ninji?: KeplrLike };
  const wallet = w.keplr ?? w.ninji;
  if (!wallet) throw new Error("Keplr or Ninji wallet not found.");

  await wallet.enable(chainId);
  const offlineSigner = wallet.getOfflineSigner(chainId);
  const key = await wallet.getKey(chainId);
  const injectiveAddress = key.bech32Address;
  const pubKey = Buffer.from(key.pubKey).toString("base64");

  // Account number + sequence, and a timeout height so the tx can't linger.
  const account = BaseAccount.fromRestApi(
    await new ChainRestAuthApi(rest).fetchAccount(injectiveAddress),
  );
  const latestBlock = await new ChainRestTendermintApi(rest).fetchLatestBlock();
  const timeoutHeight = Number(latestBlock.header.height) + TIMEOUT_BLOCKS;

  const msg = MsgSend.fromJSON({
    amount: { denom: chainDenom, amount: atomicAmount },
    srcInjectiveAddress: injectiveAddress,
    dstInjectiveAddress: marketWallet,
  });

  const { signDoc } = createTransaction({
    pubKey,
    chainId,
    fee: STD_FEE,
    message: msg,
    sequence: account.sequence,
    accountNumber: account.accountNumber,
    timeoutHeight,
  });

  // Keplr/Ninji sign the exact bytes (direct mode); broadcast what was signed.
  const directSignResponse = await offlineSigner.signDirect(injectiveAddress, signDoc);
  const signedTxRaw = getTxRawFromTxRawOrDirectSignResponse(
    directSignResponse as Parameters<typeof getTxRawFromTxRawOrDirectSignResponse>[0],
  );

  const txResponse = await new TxRestApi(rest).broadcast(signedTxRaw);
  if (txResponse.code !== 0) {
    throw new Error(txResponse.rawLog || "Transaction rejected on-chain.");
  }
  return txResponse.txHash;
}
