"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { BETA_COOKIE, BETA_COOKIE_MAX_AGE, betaToken } from "@/lib/beta";

export type RedeemResult = { ok: true } | { ok: false; error: string };

/**
 * Redeem a single-use beta invite code. The UPDATE ... WHERE code=$1 AND
 * redeemed_at IS NULL is atomic at the row level, so a code can win exactly once
 * even under concurrent attempts. On success we set the gate cookie.
 */
export async function redeemInvite(code: string): Promise<RedeemResult> {
  const c = code.trim();
  if (!c) return { ok: false, error: "Enter your invite code." };

  const token = betaToken();
  if (!token) return { ok: false, error: "Beta access is not configured yet." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("beta_invites")
    .update({ redeemed_at: new Date().toISOString() })
    .eq("code", c)
    .is("redeemed_at", null)
    .select("code")
    .maybeSingle();

  if (error) return { ok: false, error: "Something went wrong — try again." };
  if (!data) return { ok: false, error: "That code is invalid or already used." };

  const jar = await cookies();
  jar.set(BETA_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: BETA_COOKIE_MAX_AGE,
  });

  return { ok: true };
}
