'use server'

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function saveTiebreaker(minute: number): Promise<{ error?: string }> {
  if (!Number.isInteger(minute) || minute < 1 || minute > 120) {
    return { error: "Enter a valid minute (1–120)" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("profiles")
    .update({ tie_breaker_answer: minute })
    .eq("id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}
