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
    // TEMP DIAGNOSTIC (gated behind ?diag=): surfaces the cause of a failed
    // upsert WITHOUT returning any secret material — only the key *category*
    // (and, for a JWT, the non-secret `role` claim). REMOVE after debugging.
    if (request.nextUrl.searchParams.get("diag")) {
      let host = "";
      try { host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").host; } catch {}
      const k = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      let keyKind = "unset";
      if (k.startsWith("sb_secret_")) keyKind = "sb_secret";
      else if (k.startsWith("sb_publishable_")) keyKind = "sb_publishable";
      else if (k.startsWith("eyJ")) {
        try {
          const payload = JSON.parse(Buffer.from(k.split(".")[1] ?? "", "base64").toString());
          keyKind = "jwt:" + (payload.role ?? "unknown");
        } catch { keyKind = "jwt:unparsed"; }
      } else if (k) keyKind = "other";
      return NextResponse.json({
        error: "Could not create challenge",
        _host: host,
        _keyKind: keyKind,
        _code: (error as { code?: string }).code ?? null,
        _msg: error.message ?? null,
        _details: (error as { details?: string }).details ?? null,
      }, { status: 500 });
    }
    return NextResponse.json({ error: "Could not create challenge" }, { status: 500 });
  }

  return NextResponse.json({ message: buildLoginMessage(wallet, nonce) });
}
