import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const origin = new URL(request.url).origin;

  let oauthUrl: string | null = null;
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        scopes: "identify",
        redirectTo: `${origin}/auth/callback`,
      },
    });
    if (!error && data.url) oauthUrl = data.url;
  } catch {
    // network error reaching Supabase
  }

  if (!oauthUrl) {
    redirect("/auth/login?error=signin_failed");
  }

  redirect(oauthUrl);
}
