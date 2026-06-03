'use server'

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function saveProfile(
  username: string,
  country: string | null,
): Promise<{ error?: string }> {
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 20) {
    return { error: "Username must be 3–20 characters." };
  }
  if (!/^[\w\-. ]+$/.test(trimmed)) {
    return { error: "Only letters, numbers, spaces, - _ . allowed." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("profiles")
    .update({ username: trimmed, country: country || null })
    .eq("id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/leaderboard");
  return {};
}

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
