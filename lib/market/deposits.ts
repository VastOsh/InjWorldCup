// =============================================================================
// Deposit verification — read a testnet transfer off-chain and confirm it.
//
// Custodial flow: a player sends the market denom from their linked inj1 wallet
// to the market wallet, then hands us the tx hash. We look the tx up on the LCD
// and confirm it is a successful bank MsgSend of the expected denom, from the
// expected sender, to the market wallet — returning the exact atomic amount so
// the ledger can be credited.
//
// This is a read, exactly like the CoA holder check: no key, no signing. The
// binding of "which account gets the credit" happens by requiring the on-chain
// sender to equal the caller's stored wallet_address (enforced by the caller).
//
// IMPORTANT: as with CoA, keep "verified not a valid deposit" (ok:false) apart
// from "couldn't reach the chain" — a lookup failure must NOT be cached as a
// rejection; the tx may simply not be indexed yet and should be retried.
// =============================================================================

import { marketLcdUrl, marketWallet, marketDenom } from "./config";

const LOOKUP_TIMEOUT_MS = 8000;
const MSG_SEND = "/cosmos.bank.v1beta1.MsgSend";

export interface DepositCheck {
  /** Did the lookup complete AND match a valid deposit? */
  ok: boolean;
  /** Atomic amount received in the market denom (only meaningful when ok). */
  amount: string;
  denom: string;
  sender?: string;
  txHash?: string;
  /** Set when ok is false. */
  error?: string;
  /** True when the chain was reached but the tx isn't a valid deposit (vs. a
   *  transient lookup failure). Lets the caller decide retry vs. reject. */
  rejected?: boolean;
}

function isInjAddress(addr: string): boolean {
  return /^inj1[0-9a-z]{38}$/.test(addr);
}

interface Coin { denom: string; amount: string }
interface SendMsg { "@type": string; from_address?: string; to_address?: string; amount?: Coin[] }

/**
 * Verify a deposit tx by hash. `expectedSender` is the caller's linked wallet;
 * the deposit only counts if the on-chain sender matches it exactly.
 */
export async function verifyDeposit(
  txHash: string,
  expectedSender: string,
): Promise<DepositCheck> {
  const denom = marketDenom().denom;
  const fail = (error: string, rejected = false): DepositCheck =>
    ({ ok: false, amount: "0", denom, error, rejected });

  if (!txHash || !/^[0-9A-Fa-f]{64}$/.test(txHash)) {
    return fail("Invalid transaction hash", true);
  }
  if (!expectedSender || !isInjAddress(expectedSender)) {
    return fail("Link an Injective wallet before depositing", true);
  }

  let recipient: string;
  try {
    recipient = marketWallet();
  } catch {
    return fail("Market wallet not configured"); // config error — retriable
  }

  const url = `${marketLcdUrl()}/cosmos/tx/v1beta1/txs/${txHash}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  let body: unknown;
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (res.status === 404) return fail("Transaction not found yet", false); // maybe not indexed — retry
    body = await res.json().catch(() => null);
    if (!res.ok) return fail(`LCD error (HTTP ${res.status})`);
  } catch (e) {
    const err = e as Error;
    return fail(err.name === "AbortError" ? "Chain lookup timed out" : err.message);
  } finally {
    clearTimeout(timer);
  }

  const root = body as { tx_response?: { code?: number; txhash?: string }; tx?: { body?: { messages?: SendMsg[] } } } | null;
  const resp = root?.tx_response;
  if (!resp) return fail("Malformed LCD response");
  if (resp.code !== 0) return fail("Transaction failed on-chain", true);

  const messages = root?.tx?.body?.messages ?? [];
  let received = BigInt(0);
  let matchedSender: string | undefined;

  for (const msg of messages) {
    if (msg["@type"] !== MSG_SEND) continue;
    if (msg.to_address !== recipient) continue;
    if (msg.from_address !== expectedSender) continue;
    for (const coin of msg.amount ?? []) {
      if (coin.denom !== denom) continue;
      received += BigInt(coin.amount);
      matchedSender = msg.from_address;
    }
  }

  if (received <= BigInt(0)) {
    return fail("No matching transfer to the market wallet in this transaction", true);
  }

  return {
    ok: true,
    amount: received.toString(),
    denom,
    sender: matchedSender,
    txHash: resp.txhash ?? txHash,
  };
}
