'use server'

// =============================================================================
// Market server actions (custody side).
//
// claimDeposit — a player sends the market denom to the market wallet, then
// submits the tx hash here. We verify the transfer on-chain (sender must equal
// their own linked wallet, recipient the market wallet, denom + amount), then
// credit the append-only ledger via the service role. The unique index on
// (tx_hash) WHERE reason='deposit' (migration 019) makes re-submitting the same
// hash a no-op rather than a double credit.
// =============================================================================

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyDeposit } from "@/lib/market/deposits";
import { broadcastPayout, payoutMemo } from "@/lib/market/payout";
import { marketDenom } from "@/lib/market/config";
import { toAtomic } from "@/lib/market/format";
import type { MarketOutcome } from "@/lib/supabase/types";
import { revalidatePath } from "next/cache";

export interface PlaceStakeResult {
  ok: boolean;
  newBalance?: string;
  error?: string;
}

/** Place a parimutuel bet. Amount is human ("5" → 5 USDC); the RPC enforces
 *  market-open, lock time, and balance under the caller's own identity. */
export async function placeStake(
  marketId: number,
  outcome: MarketOutcome,
  amountHuman: string,
): Promise<PlaceStakeResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { decimals } = marketDenom();
  let atomic: string;
  try {
    atomic = toAtomic(amountHuman, decimals).toString();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const { data, error } = await supabase.rpc("place_stake", {
    p_market_id: marketId,
    p_outcome: outcome,
    p_amount: atomic,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/market");
  return { ok: true, newBalance: (data as { new_balance?: string } | null)?.new_balance };
}

export interface ClaimDepositResult {
  ok: boolean;
  /** Newly credited this call (false when the tx was already credited). */
  credited?: boolean;
  amount?: string;
  denom?: string;
  error?: string;
  /** True when the failure is on-chain/permanent (bad tx) vs. worth retrying. */
  rejected?: boolean;
}

export async function claimDeposit(txHash: string): Promise<ClaimDepositResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized", rejected: true };

  const { data: profile } = await supabase
    .from("profiles")
    .select("wallet_address")
    .eq("id", user.id)
    .single();

  const wallet = profile?.wallet_address ?? null;
  if (!wallet) {
    return { ok: false, error: "Link an Injective wallet before depositing", rejected: true };
  }

  // On-chain verification — sender is pinned to the caller's own wallet.
  const check = await verifyDeposit(txHash.trim(), wallet);
  if (!check.ok) {
    return { ok: false, error: check.error, rejected: check.rejected };
  }

  // Credit the ledger. The partial unique index turns a duplicate hash into a
  // 23505, which we treat as "already credited" (idempotent), not an error.
  const admin = createAdminClient();
  const { error } = await admin.from("wallet_ledger").insert({
    user_id: user.id,
    denom: check.denom,
    delta: check.amount,
    reason: "deposit",
    ref: null,
    tx_hash: check.txHash ?? txHash.trim(),
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: true, credited: false, amount: check.amount, denom: check.denom };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/market");
  return { ok: true, credited: true, amount: check.amount, denom: check.denom };
}

export interface WithdrawResult {
  ok: boolean;
  txHash?: string;
  amount?: string;
  denom?: string;
  error?: string;
  /** The reservation is held and a payout may be in flight; the reconcile job
   *  will confirm it on-chain or refund it. Funds are NOT lost. */
  pending?: boolean;
}

/**
 * Cash out `amountHuman` of the market denom to the caller's OWN linked wallet.
 *
 * Custodial withdrawals only ever pay back to the verified wallet the account is
 * bound to — never an arbitrary address — so this can't be used to move funds to
 * a third party. Flow: reserve (atomic debit) → broadcast → confirm or refund.
 */
export async function withdraw(amountHuman: string): Promise<WithdrawResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("wallet_address")
    .eq("id", user.id)
    .single();

  const wallet = profile?.wallet_address ?? null;
  if (!wallet) return { ok: false, error: "Link an Injective wallet before withdrawing" };

  const { denom, decimals } = marketDenom();
  let atomic: string;
  try {
    atomic = toAtomic(amountHuman, decimals).toString();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // 1) Reserve: atomic debit + pending withdrawal (auth.uid() inside the RPC).
  const { data: reserved, error: reserveErr } = await supabase.rpc("request_withdrawal", {
    p_denom: denom,
    p_amount: atomic,
    p_to_address: wallet,
  });
  if (reserveErr) return { ok: false, error: reserveErr.message };
  const withdrawalId = (reserved as { withdrawal_id?: number } | null)?.withdrawal_id;
  if (!withdrawalId) return { ok: false, error: "Failed to open withdrawal" };

  // 2) Broadcast from the market wallet, tagged with this withdrawal's memo so
  //    it can always be found again on-chain, then resolve via the service role.
  const admin = createAdminClient();
  const payout = await broadcastPayout(wallet, denom, atomic, payoutMemo(withdrawalId));

  if (payout.ok) {
    await admin.rpc("mark_withdrawal_sent", { p_id: withdrawalId, p_tx_hash: payout.txHash ?? "" });
    revalidatePath("/market");
    return { ok: true, txHash: payout.txHash, amount: atomic, denom };
  }

  // Refund NOW only if the send definitely never reached the chain. If the
  // broadcast was ambiguous (it may have landed), leave the reservation pending
  // — the reconcile job checks the chain by memo and resolves it exactly once.
  // Refunding here would risk paying the user twice.
  if (payout.submitted === false) {
    await admin.rpc("fail_withdrawal", { p_id: withdrawalId });
    revalidatePath("/market");
    return { ok: false, error: payout.error ?? "Broadcast failed" };
  }

  revalidatePath("/market");
  return {
    ok: false,
    pending: true,
    error: (payout.error ?? "Broadcast could not be confirmed") +
      " — your withdrawal is pending and will be confirmed or refunded automatically.",
  };
}
