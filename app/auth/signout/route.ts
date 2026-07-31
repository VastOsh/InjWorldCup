import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303 See Other so the browser follows the redirect as a GET. The default
  // (307) preserves the POST method, which would re-POST to /auth/login — a
  // GET-only page — and 405. See node_modules/next/dist/docs redirecting.md.
  return NextResponse.redirect(new URL("/auth/login", request.url), 303);
}
