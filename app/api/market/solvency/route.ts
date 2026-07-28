// =============================================================================
// Solvency reconciliation job.
//
// Reads the market wallet's real on-chain reserve for the market denom, computes
// liabilities (Σ ledger) via record_reserve_snapshot, records an audit snapshot,
// and returns the report { reserves, liabilities, surplus, solvent }.
//
// Safe + read-mostly: the only write is an append to reserve_snapshots. Run it
// on a schedule to alert if the custodial wallet ever drifts under-reserved.
//
// Auth — mirrors the settle job. Accepts either:
//   - Authorization: Bearer <MARKET_SETTLE_SECRET>   (cron / automation)
//   - an authenticated session whose id === ADMIN_USER_ID   (manual trigger)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchReserve } from "@/lib/market/solvency";
import { marketDenom } from "@/lib/market/config";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { denom, decimals, symbol } = marketDenom();

  const reserve = await fetchReserve(denom);
  if (!reserve.ok) {
    return NextResponse.json({ error: reserve.error ?? "Reserve lookup failed" }, { status: 502 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("record_reserve_snapshot", {
    p_denom: denom,
    p_reserves: reserve.amount,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ...(data as object), wallet: reserve.wallet, symbol, decimals });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
