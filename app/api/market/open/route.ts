// =============================================================================
// Open markets — seed one parimutuel market per eligible match.
//
// Creates a market (denom + default fee + locks_at = match_date) for every
// VISIBLE match that hasn't kicked off yet and doesn't already have a market in
// this denom. Idempotent: the unique (match_id, denom) constraint plus
// ignoreDuplicates means re-running only fills gaps, never duplicates.
//
// Auth — writes markets via the service role, so NOT public. Accepts either:
//   - Authorization: Bearer <MARKET_SETTLE_SECRET>   (cron / automation)
//   - an authenticated session whose id === ADMIN_USER_ID   (manual trigger)
//
// Does not touch the live points game — markets are a separate additive table.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { marketDenom, defaultFeeBps } from "@/lib/market/config";

export const dynamic = "force-dynamic";

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

  const admin = createAdminClient();
  const { denom } = marketDenom();
  const feeBps = defaultFeeBps();
  const nowIso = new Date().toISOString();

  // Eligible matches: visible and not yet started.
  const { data: matches, error: matchErr } = await admin
    .from("matches")
    .select("id, match_date")
    .eq("visible", true)
    .gt("match_date", nowIso);
  if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 });

  const rows = (matches ?? []).map((m) => ({
    match_id: m.id,
    denom,
    fee_bps: feeBps,
    locks_at: m.match_date,
  }));

  if (rows.length === 0) {
    return NextResponse.json({ eligible: 0, created: 0 });
  }

  // ignoreDuplicates so existing markets are skipped, not overwritten (which
  // would reset a market mid-life). Returns only the rows actually inserted.
  const { data: created, error: insErr } = await admin
    .from("markets")
    .upsert(rows, { onConflict: "match_id,denom", ignoreDuplicates: true })
    .select("id");
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({
    eligible: rows.length,
    created: created?.length ?? 0,
  });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
