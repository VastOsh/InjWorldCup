// =============================================================================
// Persist a CoA ownership check onto a profile.
//
// Reusable by both trigger points:
//   - link time      (app/actions/coa.ts, right after a wallet is linked)
//   - round boundary (the periodic re-check job — a later increment)
//
// Writes go through the SERVICE-ROLE client only: holds_coa / coa_checked_at
// carry no column grant to `authenticated`, so a user can never set their own
// (migration 018). A failed on-chain check (ok:false) is left UNwritten — we
// never overwrite a known state with "couldn't reach the chain".
// =============================================================================

import type { createAdminClient } from "@/lib/supabase/admin";
import { holdsCoa, type CoaHolding } from "./verify";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Check whether `wallet` holds a CoA and, if the check succeeds, persist the
 * result on the profile. Returns the check outcome (ok:false ⇒ nothing written).
 */
export async function syncCoaHolding(
  admin: AdminClient,
  userId: string,
  wallet: string | null,
): Promise<CoaHolding> {
  // No wallet ⇒ definitionally not a holder; nothing to verify or write.
  if (!wallet) return { ok: true, holds: false, count: 0 };

  const result = await holdsCoa(wallet);
  if (!result.ok) return result; // couldn't check — leave the stored flag as-is

  const { error } = await admin
    .from("profiles")
    .update({ holds_coa: result.holds, coa_checked_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) return { ok: false, holds: false, count: 0, error: error.message };
  return result;
}
