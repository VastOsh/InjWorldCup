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
