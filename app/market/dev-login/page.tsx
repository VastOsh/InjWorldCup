"use client";

// =============================================================================
// Dev-only login for the local market trial.
//
// The app authenticates with Discord OAuth, which isn't wired up on the local
// stack. This page signs in the seeded demo user with email/password so the
// market can be tried end-to-end locally. It is HARD-GATED to a local Supabase
// URL — against any hosted/prod Supabase it renders disabled and does nothing,
// so it can never become a production login bypass.
// =============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Enabled on a local stack, or on a hosted DEV deployment that explicitly opts
// in via NEXT_PUBLIC_ENABLE_DEV_LOGIN=true. Production never sets that flag and
// isn't localhost, so this page is always inert there — never a prod bypass.
const IS_LOCAL =
  /localhost|127\.0\.0\.1/.test(SUPABASE_URL) ||
  process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === "true";

export default function DevLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@local.test");
  const [password, setPassword] = useState("demo1234");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/market");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-parchment flex items-center justify-center px-4">
      <div className="w-full max-w-sm border-2 border-ink shadow-brutal bg-surface">
        <div className="px-5 py-4 border-b-2 border-ink">
          <h1 className="font-black text-lg">Local market trial</h1>
          <p className="font-mono text-[11px] text-ink-muted mt-1">Dev-only sign-in · demo trader</p>
        </div>

        {!IS_LOCAL ? (
          <p className="px-5 py-6 font-mono text-xs text-accent">
            Disabled — this page only works against a local Supabase instance.
          </p>
        ) : (
          <div className="px-5 py-5 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">Email</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-2 border-ink px-3 py-2 font-mono text-sm focus:outline-none focus:shadow-brutal-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-2 border-ink px-3 py-2 font-mono text-sm focus:outline-none focus:shadow-brutal-sm"
              />
            </label>
            {error && <p className="font-mono text-[11px] text-accent">{error}</p>}
            <button
              type="button"
              disabled={busy}
              onClick={signIn}
              className="border-2 border-ink bg-accent text-surface px-4 py-2 font-bold text-sm uppercase tracking-wide shadow-brutal-sm hover:-translate-x-px hover:-translate-y-px disabled:opacity-40 transition-transform"
            >
              {busy ? "Signing in…" : "Enter the market"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
