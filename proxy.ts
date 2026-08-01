import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { BETA_COOKIE, betaCookieValid } from "@/lib/beta";

export async function proxy(request: NextRequest) {
  // Closed-beta gate: only the public landing page ("/") is open; everything
  // else needs a redeemed invite cookie. Static assets are already excluded by
  // the matcher below. Constant token compare — no crypto, runtime-agnostic.
  const isLanding = request.nextUrl.pathname === "/";
  if (!isLanding && !betaCookieValid(request.cookies.get(BETA_COOKIE)?.value)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — must use getUser(), not getSession()
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
