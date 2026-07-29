// POST /auth/wallet   { signer, signature, pubKey }
//
// Wallet sign-in. Verifies an ADR-036 signature over the single-use challenge,
// resolves it to ONE canonical account (existing wallet-native profile, or a
// freshly admin-created one), and mints a real refreshable GoTrue session via a
// one-time OTP. Never splits balances: the wallet_address UNIQUE constraint
// guarantees a wallet maps to at most one account, and a wallet already linked
// to a Discord account is routed back to Discord (full merge is a v2 follow-up).
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verifyWalletSignature, buildLoginMessage } from "@/lib/auth/wallet-verify";

const INJ_ADDRESS = /^inj1[0-9a-z]{38}$/;

/** Non-deliverable synthesized OTP handle for a wallet-native account (RFC 2606
 *  reserved TLD). inj1 addresses are already lowercase; toLowerCase is a guard. */
function walletEmail(wallet: string): string {
  return `${wallet.toLowerCase()}@wallet.invalid`;
}

export async function POST(request: NextRequest) {
  let body: { signer?: string; signature?: string; pubKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { signer, signature, pubKey } = body;
  if (!signer || !signature || !pubKey || !INJ_ADDRESS.test(signer)) {
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Load + consume the single-use challenge (must exist and be unexpired).
  const { data: challenge } = await admin
    .from("wallet_auth_challenges")
    .select("nonce, expires_at")
    .eq("wallet", signer)
    .maybeSingle();

  if (!challenge) {
    return NextResponse.json({ error: "No active challenge — request a new one" }, { status: 400 });
  }
  const expired = new Date(challenge.expires_at).getTime() < Date.now();
  // Consume it now, whatever the outcome — a nonce is used at most once.
  await admin.from("wallet_auth_challenges").delete().eq("wallet", signer);
  if (expired) {
    return NextResponse.json({ error: "Challenge expired — try again" }, { status: 400 });
  }

  // 2. Verify the ADR-036 signature over the exact challenge message.
  const message = buildLoginMessage(signer, challenge.nonce);
  const verdict = verifyWalletSignature({ signer, signature, pubKey, message });
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.error ?? "Invalid signature" }, { status: 401 });
  }

  // 3. Resolve the account.
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("wallet_address", signer)
    .maybeSingle();

  let email: string;
  if (profile) {
    const { data: userRes } = await admin.auth.admin.getUserById(profile.id);
    const existingEmail = userRes?.user?.email ?? null;
    if (!existingEmail) {
      // Wallet is attached to a Discord-origin account (its email was nulled),
      // so there is no OTP handle to mint against. Route to Discord for v1.
      return NextResponse.json(
        { error: "This wallet is linked to a Discord account. Please sign in with Discord." },
        { status: 409 },
      );
    }
    email = existingEmail;
  } else {
    email = walletEmail(signer);
    const { error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { wallet_address: signer },
    });
    if (createErr) {
      return NextResponse.json({ error: "Could not create account" }, { status: 500 });
    }
  }

  // 4. Mint a real, refreshable session via a one-time magic-link OTP.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    return NextResponse.json({ error: "Could not start session" }, { status: 500 });
  }

  // The SSR client's cookie adapter writes the session cookies onto the response.
  const server = await createClient();
  const { error: otpErr } = await server.auth.verifyOtp({ type: "email", token_hash: tokenHash });
  if (otpErr) {
    return NextResponse.json({ error: "Could not establish session" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
