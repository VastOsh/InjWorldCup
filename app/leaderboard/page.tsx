import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NavBar from "@/app/components/NavBar";
import Leaderboard from "@/app/components/Leaderboard";

export default async function LeaderboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const [{ data: profile }, { data: players }, { data: actualConfig }, { data: visibleConfig }] = await Promise.all([
    supabase.from("profiles").select("wallet_address, avatar_url, username").eq("id", user.id).single(),
    supabase
      .from("profiles")
      .select("id, username, avatar_url, total_points, tie_breaker_answer, country")
      .order("total_points", { ascending: false })
      .limit(20),
    supabase.from("app_config").select("value_int").eq("key", "tiebreaker_actual").maybeSingle(),
    supabase.from("app_config").select("value_int").eq("key", "tiebreaker_visible").maybeSingle(),
  ]);

  const tiebreakerActual = actualConfig?.value_int ?? null;
  const tiebreakerVisible = (visibleConfig?.value_int ?? 0) === 1;

  return (
    <main className="min-h-screen bg-parchment">
      <NavBar userId={user.id} walletAddress={profile?.wallet_address ?? null} activePath="/leaderboard" avatarUrl={profile?.avatar_url} username={profile?.username} />

      <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-6">

        <div className="flex items-end justify-between">
          <h1 className="font-black text-2xl tracking-tight">Top 20</h1>
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
            />
          </div>
        )}
      </div>
    </main>
  );
}
