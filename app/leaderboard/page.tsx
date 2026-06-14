import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NavBar from "@/app/components/NavBar";
import Leaderboard from "@/app/components/Leaderboard";
import { COUNTRIES } from "@/lib/countries";

export default async function LeaderboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const [{ data: profile }, { data: players }, { data: actualConfig }, { data: visibleConfig }, { data: allForCountries }] = await Promise.all([
    supabase.from("profiles").select("wallet_address, avatar_url, username").eq("id", user.id).single(),
    supabase
      .from("profiles")
      .select("id, username, avatar_url, total_points, tie_breaker_answer, country")
      .order("total_points", { ascending: false })
      .limit(20),
    supabase.from("app_config").select("value_int").eq("key", "tiebreaker_actual").maybeSingle(),
    supabase.from("app_config").select("value_int").eq("key", "tiebreaker_visible").maybeSingle(),
    supabase.from("profiles").select("id, username, avatar_url, country, total_points").not("country", "is", null),
  ]);

  const tiebreakerActual = actualConfig?.value_int ?? null;
  const tiebreakerVisible = (visibleConfig?.value_int ?? 0) === 1;

  const countryMap = new Map<string, { total_points: number; player_count: number }>();
  for (const p of allForCountries ?? []) {
    if (!p.country) continue;
    const prev = countryMap.get(p.country) ?? { total_points: 0, player_count: 0 };
    countryMap.set(p.country, {
      total_points: prev.total_points + (p.total_points ?? 0),
      player_count: prev.player_count + 1,
    });
  }
  const countryEntries = [...countryMap.entries()]
    .map(([country, data]) => {
      const c = COUNTRIES.find(x => x.name === country);
      return { country, code: c?.code ?? null, ...data };
    })
    .sort((a, b) => b.total_points - a.total_points);

  return (
    <main className="min-h-screen bg-parchment">
      <NavBar userId={user.id} walletAddress={profile?.wallet_address ?? null} activePath="/leaderboard" avatarUrl={profile?.avatar_url} username={profile?.username} />

      <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-6">

        <div className="flex items-end justify-between">
          <h1 className="font-black text-2xl tracking-tight">Leaderboard</h1>
          {tiebreakerVisible && tiebreakerActual !== null && (
            <p className="font-mono text-[11px] text-ink-muted">
              TB: first goal at {tiebreakerActual}′
            </p>
          )}
        </div>

        {!players?.length ? (
          <p className="font-mono text-sm text-ink-muted border-2 border-ink-faint px-4 py-6 text-center">
            No players yet.
          </p>
        ) : (
          <div className="border-2 border-ink shadow-brutal overflow-hidden">
            <Leaderboard
              initialPlayers={players}
              tiebreakerActual={tiebreakerVisible ? tiebreakerActual : null}
              currentUserId={user.id}
              countryEntries={countryEntries}
              allPlayers={allForCountries ?? []}
            />
          </div>
        )}
      </div>
    </main>
  );
}
