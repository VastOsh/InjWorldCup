// =============================================================================
// Withdrawal reconciliation lookup — did a memo'd payout actually land?
//
// The exactly-once safety net. When a withdrawal is stuck 'pending' (the server
// died, or the broadcast threw ambiguously), we must not blindly refund (the
// payout may have gone out) or blindly retry (it may double-send). Instead we
// ask the chain: is there a SUCCESSFUL bank send from the market wallet carrying
// this withdrawal's deterministic memo (`wd:<id>`)?
//
//   found  → mark_withdrawal_sent(id, txHash)     (it went; no double-send)
//   absent → after a grace period, fail_withdrawal(id) refunds (it never went)
//
// Pure read (LCD), like the deposit verifier: no key, no signing. A lookup that
// can't reach the chain returns reachable:false so the caller retries rather
// than treating "couldn't check" as "didn't send".
// =============================================================================

import { marketLcdUrl, marketWallet } from "./config";
import { payoutMemo } from "./payout";

const TIMEOUT_MS = 8000;
const MSG_SEND = "/cosmos.bank.v1beta1.MsgSend";

export interface PayoutLookup {
  /** Did the chain lookup complete (regardless of whether a payout was found)? */
  reachable: boolean;
  /** A matching successful payout exists on-chain. */
  found: boolean;
  txHash?: string;
  error?: string;
}

interface Coin { denom: string; amount: string }
interface SendMsg { "@type": string; from_address?: string; to_address?: string; amount?: Coin[] }

/**
 * Look for a successful payout from the market wallet to `to` of `amount`/`denom`
 * tagged with this withdrawal's memo. Match is keyed on the memo (unique per
 * withdrawal); recipient + amount are verified as a belt-and-braces check.
 */
export async function findWithdrawalPayout(
  withdrawalId: number | string,
  to: string,
  denom: string,
  amount: string,
): Promise<PayoutLookup> {
  let market: string;
  try {
    market = marketWallet();
  } catch (e) {
    return { reachable: false, found: false, error: (e as Error).message };
  }

  const memo = payoutMemo(withdrawalId);
  // Query on a SINGLE indexed event — recipient received coins. This LCD returns
  // nothing for an AND across two event types, so we scope to the recipient here
  // and confirm sender / memo / amount client-side below (all present in the tx).
  const query = `coin_received.receiver='${to}'`;
  const url =
    `${marketLcdUrl()}/cosmos/tx/v1beta1/txs` +
    `?query=${encodeURIComponent(query)}&order_by=ORDER_BY_DESC&pagination.limit=50`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let body: unknown;
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    body = await res.json().catch(() => null);
    if (!res.ok) return { reachable: false, found: false, error: `LCD error (HTTP ${res.status})` };
  } catch (e) {
    const err = e as Error;
    return { reachable: false, found: false, error: err.name === "AbortError" ? "Chain lookup timed out" : err.message };
  } finally {
    clearTimeout(timer);
  }

  const root = body as {
    tx_responses?: Array<{ code?: number; txhash?: string; tx?: { body?: { memo?: string; messages?: SendMsg[] } } }>;
  } | null;
  const responses = root?.tx_responses ?? [];

  for (const r of responses) {
    if (r.code !== 0) continue;                       // only a successful send moved funds
    if ((r.tx?.body?.memo ?? "") !== memo) continue;  // must be THIS withdrawal
    for (const msg of r.tx?.body?.messages ?? []) {
      if (msg["@type"] !== MSG_SEND) continue;
      if (msg.from_address !== market || msg.to_address !== to) continue;
      for (const coin of msg.amount ?? []) {
        if (coin.denom === denom && coin.amount === amount) {
          return { reachable: true, found: true, txHash: r.txhash };
        }
      }
    }
  }

  return { reachable: true, found: false };
}
