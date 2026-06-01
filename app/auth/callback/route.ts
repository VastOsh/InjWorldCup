import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/?error=no_code", request.url));
  }

  const supabase = await createClient();

  let exchangeError = false;
  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) exchangeError = true;
  } catch {
    exchangeError = true;
  }

  if (exchangeError) {
    return NextResponse.redirect(new URL("/auth/login?error=signin_failed", request.url));
  }

  // Successful auth — send to home (middleware handles the session from here)
  return NextResponse.redirect(new URL("/", request.url));
}
