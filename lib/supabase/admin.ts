import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Service-role client — bypasses RLS. Never expose to the browser.
// Only import this from server-only files (Server Components, Route Handlers, Actions).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role env vars");
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}
