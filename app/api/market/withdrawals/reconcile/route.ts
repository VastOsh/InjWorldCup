// =============================================================================
// Withdrawal reconciliation job — resolve stuck 'pending' withdrawals exactly
// once by consulting the chain.
//
// For each withdrawal that has been pending longer than a short check age, we
// ask the chain (by the payout's deterministic memo) whether the send landed:
//   found on-chain         → mark_withdrawal_sent(id, txHash)   (it went)
//   absent AND old enough   → fail_withdrawal(id)               (it never went; refund)
//   absent but still recent → leave pending                     (give indexing time)
//   chain unreachable       → leave pending                     (retry next run)
//
// This never double-sends (we only ever confirm an existing tx) and never
// double-refunds (fail_withdrawal is idempotent + only touches a pending row).
//
// Auth — mirrors the settle job (Bearer MARKET_SETTLE_SECRET or ADMIN session).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findWithdrawalPayout } from "@/lib/market/withdrawals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A pending withdrawal is only refunded once it is BOTH absent from the chain
// AND older than this — so a slow-to-index payout is never wrongly refunded.
const REFUND_AFTER_MS = 30 * 60 * 1000; // 30 minutes

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.MARKET_SETTLE_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth === `Bearer ${secret}`) return true;

  const adminId = process.env.ADMIN_USER_ID;
  if (!adminId) return false;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return !!user && user.id === adminId;
}

type Row = { id: number; denom: string; amount: string; to_address: string; created_at: string };
type Outcome = { id: number; action: "sent" | "refunded" | "kept_pending" | "unreachable"; tx_hash?: string };

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("list_stuck_withdrawals", { p_min_age: "2 minutes" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Row[];
  const outcomes: Outcome[] = [];
  let sent = 0, refunded = 0, kept = 0, unreachable = 0;

  for (const w of rows) {
    const look = await findWithdrawalPayout(w.id, w.to_address, w.denom, w.amount);

    if (look.found) {
      await admin.rpc("mark_withdrawal_sent", { p_id: w.id, p_tx_hash: look.txHash ?? "" });
      sent++;
      outcomes.push({ id: w.id, action: "sent", tx_hash: look.txHash });
    } else if (!look.reachable) {
      unreachable++;
      outcomes.push({ id: w.id, action: "unreachable" });
    } else if (Date.now() - new Date(w.created_at).getTime() >= REFUND_AFTER_MS) {
      // Definitively absent on-chain and old enough → the payout never went out.
      await admin.rpc("fail_withdrawal", { p_id: w.id });
      refunded++;
      outcomes.push({ id: w.id, action: "refunded" });
    } else {
      kept++;
      outcomes.push({ id: w.id, action: "kept_pending" });
    }
  }

  return NextResponse.json({ checked: rows.length, sent, refunded, kept_pending: kept, unreachable, outcomes });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
