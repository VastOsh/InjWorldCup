import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303 See Other so the browser follows the redirect as a GET (307 would
  // re-POST to a GET-only page → 405). Land on the public market board.
  return NextResponse.redirect(new URL("/market", request.url), 303);
}
