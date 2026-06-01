import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function GET() {
  const supabase = await createClient();

  let oauthUrl: string | null = null;
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        scopes: "identify",
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "")}/auth/callback`,
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
