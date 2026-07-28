// =============================================================================
// Market admin job — operator lifecycle controls.
//
// Dispatches an admin action against a single market via the service role:
//   ?action=pause  &market_id=<id>   halt new bets (settlement still works)
//   ?action=resume &market_id=<id>   resume betting
//   ?action=cancel &market_id=<id>   void the market + refund every stake
//
// All three RPCs are idempotent and guarded (can't cancel a settled market,
// can't pause a resolved one), so this route is safe to re-hit.
//
// Auth — mirrors the settle job. Accepts either:
//   - Authorization: Bearer <MARKET_SETTLE_SECRET>   (automation)
//   - an authenticated session whose id === ADMIN_USER_ID   (manual trigger)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const marketId = Number(url.searchParams.get("market_id"));

  if (!Number.isInteger(marketId) || marketId <= 0) {
    return NextResponse.json({ error: "market_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  let result;
  switch (action) {
    case "pause":
      result = await admin.rpc("pause_market", { p_market_id: marketId });
      break;
    case "resume":
      result = await admin.rpc("resume_market", { p_market_id: marketId });
      break;
    case "cancel":
      result = await admin.rpc("cancel_market", { p_market_id: marketId });
      break;
    default:
      return NextResponse.json(
        { error: "action must be one of: pause, resume, cancel" },
        { status: 400 },
      );
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json(result.data as object);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
