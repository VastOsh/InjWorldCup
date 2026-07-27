'use server'

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncCoaHolding } from "@/lib/coa/sync";
import { revalidatePath } from "next/cache";

/**
 * Re-check the signed-in user's Cult of Anons holding on-chain and persist it.
 * Called after a wallet is linked; safe to call again (idempotent re-check).
 *
 * Returns { holds } on a successful check, or { error } if the user has no
 * wallet or the chain query failed — callers must treat an error as "unknown",
 * never as "not a holder".
 */
export async function refreshCoaStatus(): Promise<{ holds?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: profile, error: readErr } = await supabase
    .from("profiles")
    .select("wallet_address")
    .eq("id", user.id)
    .single();
  if (readErr) return { error: readErr.message };
  if (!profile?.wallet_address) return { error: "No wallet linked" };

  const result = await syncCoaHolding(createAdminClient(), user.id, profile.wallet_address);
  if (!result.ok) return { error: result.error ?? "On-chain check failed" };

  revalidatePath("/profile");
  revalidatePath("/leaderboard");
  return { holds: result.holds };
}
