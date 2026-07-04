// Supabase access for the MCP server. Uses the service-role key (trusted,
// local process) so every read works regardless of RLS. Read-only helpers.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types.ts";

let cached: SupabaseClient<Database> | null = null;

export function db(): SupabaseClient<Database> {
  if (cached) return cached;
  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  if (!url || !key) {
    throw new Error(
      "Missing Supabase env: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  cached = createClient<Database>(url, key, {
    auth: { persistSession: false },
  });
  return cached;
}

export type MatchRow = Database["public"]["Tables"]["matches"]["Row"];
export type StandingRow = Database["public"]["Views"]["group_standings"]["Row"];
