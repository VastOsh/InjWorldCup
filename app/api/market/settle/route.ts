// =============================================================================
// Market settlement job.
//
// Finds every un-resolved parimutuel market whose match has FINISHED and calls
// settle_market() for each via the service role. settle_market reads the result
// straight from public.matches, pays winners pro-rata (or voids + refunds when
// nobody backed the winner), and is idempotent — so this route is safe to run
// on a schedule and safe to re-run.
//
// It does NOT touch the live points game: settlement is a service-role RPC, not
// a trigger, and reads matches without writing them.
//
// Auth — writes money via the service role, so it is NOT public. Accepts either:
//   - Authorization: Bearer <MARKET_SETTLE_SECRET>   (cron / automation)
//   - an authenticated session whose id === ADMIN_USER_ID   (manual trigger)
//
// Scope: settles all eligible markets, or a single one via ?market_id=<id>.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

type SettleResult = { market_id: number; status?: string; noop?: boolean; error?: string };

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const url = new URL(req.url);
  const marketIdParam = Number(url.searchParams.get("market_id"));

  // Which markets to settle: a single one if asked, else every open/locked
  // market whose match has finished with a score on the board.
  let marketIds: number[];
  if (Number.isInteger(marketIdParam) && marketIdParam > 0) {
    marketIds = [marketIdParam];
  } else {
    const { data, error } = await admin
      .from("markets")
      .select("id, matches!inner(status, score_home, score_away)")
      .in("status", ["open", "locked"])
      .eq("matches.status", "FINISHED")
      .not("matches.score_home", "is", null)
      .not("matches.score_away", "is", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    marketIds = (data ?? []).map((m) => m.id);
  }

  const started = Date.now();
  const results: SettleResult[] = [];
  let settled = 0;
  let voided = 0;
  let noop = 0;
  let failed = 0;

  // Sequential on purpose: each settle_market takes row locks; there's no
  // volume pressure and serialising avoids needless lock contention.
  for (const id of marketIds) {
    const { data, error } = await admin.rpc("settle_market", { p_market_id: id });
    if (error) {
      failed++;
      results.push({ market_id: id, error: error.message });
      continue;
    }
    const r = (data ?? {}) as SettleResult;
    if (r.noop) noop++;
    else if (r.status === "void") voided++;
    else if (r.status === "settled") settled++;
    results.push({ ...r, market_id: id });
  }

  return NextResponse.json({
    total: marketIds.length,
    settled,
    voided,
    noop,
    failed,
    ms: Date.now() - started,
    results,
  });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

// GET alias so GET-only schedulers (e.g. Vercel Cron) can drive it.
export async function GET(req: NextRequest) {
  return handle(req);
}
