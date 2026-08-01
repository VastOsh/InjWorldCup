// GET /auth/wallet/challenge?wallet=inj1…
// Issues a single-use, short-lived nonce for wallet sign-in. The wallet signs
// the returned message; /auth/wallet then verifies it and mints a session.
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildLoginMessage } from "@/lib/auth/wallet-verify";

const INJ_ADDRESS = /^inj1[0-9a-z]{38}$/;
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet")?.trim() ?? "";
  if (!INJ_ADDRESS.test(wallet)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  const nonce = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();

  const admin = createAdminClient();
  const { error } = await admin
    .from("wallet_auth_challenges")
    .upsert({ wallet, nonce, expires_at: expiresAt }, { onConflict: "wallet" });

  if (error) {
    // Log the real cause server-side (visible in Vercel logs) but never return
    // it to the client.
    console.error("wallet challenge upsert failed:", error.code, error.message);
    return NextResponse.json({ error: "Could not create challenge" }, { status: 500 });
  }

  return NextResponse.json({ message: buildLoginMessage(wallet, nonce) });
}
