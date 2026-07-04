// =============================================================================
// x402-gated premium analysis endpoint.
//
// POST { matchId }.  Flow:
//   1. Authenticate the user (Server routes are publicly reachable).
//   2. If no valid X-PAYMENT header → respond 402 with payment requirements.
//   3. Verify/settle the payment (mock or Injective facilitator).
//   4. On success → return the deep analysis report.
//
// Read-only with respect to app data: it never writes to the DB.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeMatchById } from "@/lib/analytics/data";
import { buildPremium } from "@/lib/analytics/premium";
import { buildRequirements } from "@/lib/x402/config";
import { verifyPayment } from "@/lib/x402/verify";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const matchId = Number(body?.matchId);
  if (!Number.isInteger(matchId)) {
    return NextResponse.json({ error: "matchId required" }, { status: 400 });
  }

  const resource = new URL(req.url).toString();
  const requirements = buildRequirements(resource);

  // --- x402 gate ------------------------------------------------------------
  const paymentHeader = req.headers.get("x-payment");
  const payment = await verifyPayment(paymentHeader, requirements);
  if (!payment.ok) {
    // 402 Payment Required — advertise how to pay (x402 v1 shape).
    return NextResponse.json(
      { x402Version: 1, error: payment.error, accepts: [requirements] },
      { status: 402 },
    );
  }

  // --- paid: produce the deep report ---------------------------------------
  const analysis = await analyzeMatchById(supabase, matchId);
  if (!analysis) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  const res = NextResponse.json({ premium: buildPremium(analysis) });
  // Settlement receipt, per x402 convention.
  res.headers.set(
    "X-PAYMENT-RESPONSE",
    Buffer.from(
      JSON.stringify({ success: true, payer: payment.payer, txHash: payment.txHash }),
    ).toString("base64"),
  );
  return res;
}
