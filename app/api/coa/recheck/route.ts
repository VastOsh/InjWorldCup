// =============================================================================
// CoA holder re-check / backfill.
//
// Re-verifies on-chain CoA ownership for every linked wallet and persists the
// result (holds_coa / coa_checked_at). Two jobs in one:
//   - BACKFILL: the first run flags every wallet linked before the feature
//     existed (holds_coa defaults to false until checked).
//   - ROUND BOUNDARY: called each round so a sold/bought NFT flips the flag.
//
// Auth — this iterates all users and writes via the service role, so it is NOT
// public. Accepts either:
//   - Authorization: Bearer <COA_RECHECK_SECRET>   (cron / automation)
//   - an authenticated session whose id === ADMIN_USER_ID   (manual trigger)
//
// Never-checked wallets are processed first (nulls-first), so a large set is
// backfilled before older re-checks, and repeated calls chip through it via
// ?limit. A failed on-chain check leaves the stored flag untouched (see
// lib/coa/sync.ts) — it is counted as `failed` and retried next run.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncCoaHolding } from "@/lib/coa/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // room for many wallets within the platform limit

const CONCURRENCY = 5; // parallel LCD queries per batch — gentle on the endpoint
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.COA_RECHECK_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth === `Bearer ${secret}`) return true;

  // Fallback: an authenticated admin browser session.
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

  const limitParam = Number(new URL(req.url).searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0
    ? Math.min(limitParam, MAX_LIMIT)
    : DEFAULT_LIMIT;

  const admin = createAdminClient();
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, wallet_address")
    .not("wallet_address", "is", null)
    .order("coa_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = profiles ?? [];
  const started = Date.now();
  let checked = 0;
  let holders = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((p) => syncCoaHolding(admin, p.id, p.wallet_address)),
    );
    for (const r of results) {
      if (!r.ok) failed++;
      else {
        checked++;
        if (r.holds) holders++;
      }
    }
  }

  return NextResponse.json({
    total: rows.length,
    checked,
    holders,
    failed,
    ms: Date.now() - started,
  });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

// GET alias so schedulers that only issue GET (e.g. Vercel Cron) can drive it.
export async function GET(req: NextRequest) {
  return handle(req);
}
