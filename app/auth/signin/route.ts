import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

function resolveOrigin(requestUrl: string): string {
  const production = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";

  // Build allowlist from platform-provided env vars only (never from the request).
  // VERCEL_URL  = deployment-specific URL (set by Vercel, not spoofable via headers).
  // VERCEL_BRANCH_URL = stable branch URL (also set by Vercel).
  const trusted = new Set<string>([
    production,
    process.env.VERCEL_URL        ? `https://${process.env.VERCEL_URL}`        : "",
    process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : "",
    "http://localhost:3000",
  ].filter(Boolean));

  try {
    const { origin } = new URL(requestUrl);
    if (trusted.has(origin)) return origin;
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
