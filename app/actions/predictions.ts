'use server'

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function savePrediction(
  matchId: number,
  predHome: number,
  predAway: number,
  predAdvance: "home" | "away" | null = null,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: match } = await supabase
    .from("matches")
    .select("match_date, round")
    .eq("id", matchId)
    .single();

  if (!match || new Date(match.match_date).getTime() <= Date.now()) {
    return { error: "Predictions are locked for this match." };
  }

  // The advance pick only applies to knockout matches; ignore it otherwise so a
  // stale client value can never land on a group-stage row.
  const isKnockout = match.round !== null;
  if (isKnockout && predAdvance === null) {
    return { error: "Pick which team advances." };
  }

  const { error } = await supabase
    .from("predictions")
    .upsert(
      {
        user_id: user.id,
        match_id: matchId,
        pred_home: predHome,
        pred_away: predAway,
        pred_advance: isKnockout ? predAdvance : null,
      },
      { onConflict: "user_id,match_id" },
    );

  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}
