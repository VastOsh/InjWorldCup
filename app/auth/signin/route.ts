import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

function resolveOrigin(requestUrl: string): string {
  const production = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  try {
    const { hostname, origin } = new URL(requestUrl);
    // Allow production domain, any Vercel deployment, or local dev
    if (
      origin === production ||
      hostname.endsWith(".vercel.app") ||
      hostname === "localhost" ||
      hostname === "127.0.0.1"
    ) {
      return origin;
    }
  } catch { /* fall through */ }
  return production;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const origin = resolveOrigin(request.url);

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
