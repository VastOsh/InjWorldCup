import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NavBar from "@/app/components/NavBar";
import Podium from "@/app/components/Podium";
import {
  getCountryPodium,
  getFinalStandings,
  getRecap,
  getStandingByUserId,
  isEventFinished,
  totalPlayerCount,
} from "@/lib/podium";

export const metadata: Metadata = {
  title: "Podium — InjWorldCup",
  description: "Final standings of the InjWorldCup 2026 prediction league",
};

// Reads the live app_config flag on every request — the podium goes live the
// moment the flag is flipped, with no redeploy.
export const dynamic = "force-dynamic";

export default async function PodiumPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("wallet_address, avatar_url, username")
    .eq("id", user.id)
    .single();

  const finished = await isEventFinished();

  const nav = (
    <NavBar
      userId={user.id}
      walletAddress={profile?.wallet_address ?? null}
      activePath="/podium"
      avatarUrl={profile?.avatar_url}
      username={profile?.username}
    />
  );

  if (!finished) {
    return (
      <main className="min-h-screen bg-parchment">
        {nav}
        <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-6">
          <h1 className="font-black text-2xl tracking-tight">Podium</h1>
          <div className="border-2 border-ink shadow-brutal bg-surface px-6 py-10 text-center flex flex-col gap-3">
            <p className="font-mono text-[11px] tracking-widest uppercase text-ink-muted">
              Not final yet
            </p>
            <p className="text-sm text-ink">
              The podium unlocks once the last match is scored.
            </p>
            <Link
              href="/leaderboard"
              className="mx-auto mt-2 border-2 border-ink bg-ink text-parchment font-mono text-[11px] tracking-widest uppercase font-bold px-4 py-2.5 shadow-brutal-sm hover:brightness-125 transition-[filter]"
            >
              Live leaderboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const [standings, myStanding, playerCount, recap, countries] = await Promise.all([
    getFinalStandings(),
    getStandingByUserId(user.id),
    totalPlayerCount(),
    getRecap(),
    getCountryPodium(),
  ]);

  // Flag on but freeze never run — fail soft rather than render an empty podium.
  if (standings.length === 0) {
    return (
      <main className="min-h-screen bg-parchment">
        {nav}
        <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-6">
          <h1 className="font-black text-2xl tracking-tight">Podium</h1>
          <p className="font-mono text-sm text-ink-muted border-2 border-ink-faint px-4 py-6 text-center">
            Final standings are being compiled.
          </p>
        </div>
      </main>
    );
  }

  const shareBaseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://injcup.xyz").replace(/\/$/, "");

  return (
    <main className="min-h-screen bg-parchment">
      {nav}

      <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-6">
        <div className="flex items-end justify-between">
          <h1 className="font-black text-2xl tracking-tight">Podium</h1>
          <Link
            href="/leaderboard"
            className="font-mono text-[11px] text-ink-muted hover:text-ink underline underline-offset-2"
          >
            Full leaderboard
          </Link>
        </div>

        <Podium
          standings={standings}
          currentUserId={user.id}
          playerCount={playerCount}
          myStanding={myStanding}
          shareBaseUrl={shareBaseUrl}
          recap={recap}
          countries={countries}
        />
      </div>
    </main>
  );
}
