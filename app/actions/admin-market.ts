"use server";

// =============================================================================
// Admin: create a market. Gated by ADMIN_USER_ID (same check the KPI page uses).
// Inserts a match (event metadata: teams, category, league) + a market (the
// parimutuel wrapper: denom, fee, lock time, 2- or 3-way). Writes go through the
// service role AFTER the caller is verified as the admin.
// =============================================================================

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { marketDenom, defaultFeeBps } from "@/lib/market/config";
import { revalidatePath } from "next/cache";

export type CreateMarketInput = {
  category: string;
  league: string;
  teamHome: string;
  teamAway: string;
  locksAt: string; // value from a datetime-local input
  hasDraw: boolean;
  feeBps?: number;
};

export type CreateMarketResult = { ok: true; marketId: number } | { ok: false; error: string };

async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminId = process.env.ADMIN_USER_ID;
  return !!user && !!adminId && user.id === adminId;
}

export async function createMarket(input: CreateMarketInput): Promise<CreateMarketResult> {
  if (!(await isAdmin())) return { ok: false, error: "Not authorized." };

  const teamHome = input.teamHome.trim();
  const teamAway = input.teamAway.trim();
  const category = input.category.trim() || "Football";
  const league = input.league.trim() || null;
  if (!teamHome || !teamAway) return { ok: false, error: "Both sides are required." };

  const locksAt = new Date(input.locksAt);
  if (Number.isNaN(locksAt.getTime())) return { ok: false, error: "Pick a valid lock time." };
  if (locksAt.getTime() <= Date.now()) return { ok: false, error: "Lock time must be in the future." };

  let feeBps = input.feeBps ?? defaultFeeBps();
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 2000) feeBps = defaultFeeBps();

  const admin = createAdminClient();

  // matches.id has no sequence default → take the next id.
  const { data: maxRow } = await admin
    .from("matches")
    .select("id")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextId = (maxRow?.id ?? 0) + 1;

  const { error: matchErr } = await admin.from("matches").insert({
    id: nextId,
    team_home: teamHome,
    team_away: teamAway,
    match_date: locksAt.toISOString(),
    status: "SCHEDULED",
    category,
    league,
  });
  if (matchErr) return { ok: false, error: matchErr.message };

  const { data: market, error: marketErr } = await admin
    .from("markets")
    .insert({
      match_id: nextId,
      denom: marketDenom().denom,
      fee_bps: feeBps,
      locks_at: locksAt.toISOString(),
      status: "open",
      has_draw: input.hasDraw,
    })
    .select("id")
    .single();

  if (marketErr) {
    // Roll back the orphan match so a retry doesn't pile up dead rows.
    await admin.from("matches").delete().eq("id", nextId);
    return { ok: false, error: marketErr.message };
  }

  revalidatePath("/market");
  revalidatePath("/admin/markets");
  return { ok: true, marketId: market.id };
}
