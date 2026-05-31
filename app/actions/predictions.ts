'use server'

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function savePrediction(
  matchId: number,
  predHome: number,
  predAway: number,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: match } = await supabase
    .from("matches")
    .select("match_date")
    .eq("id", matchId)
    .single();

  if (!match || new Date(match.match_date).getTime() <= Date.now()) {
    return { error: "Predictions are locked for this match." };
  }

  const { error } = await supabase
    .from("predictions")
    .upsert(
      { user_id: user.id, match_id: matchId, pred_home: predHome, pred_away: predAway },
      { onConflict: "user_id,match_id" },
    );

  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}
