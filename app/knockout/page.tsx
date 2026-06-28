import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NavBar from "@/app/components/NavBar";
import KnockoutBracket from "@/app/components/KnockoutBracket";
import { resolveBracket, type MatchResult, type ResultMap } from "@/lib/knockoutData";

export default async function KnockoutPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("wallet_address, avatar_url, username")
    .eq("id", user.id)
    .single();

  // Live bracket: resolve "Winner match N" placeholders from finished knockout
  // results, so saving a score advances the qualifier to the next round.
  const { data: koMatches } = await supabase
    .from("matches")
    .select("id, team_home, team_away, score_home, score_away, advance_winner, status")
    .not("round", "is", null);

  const results: ResultMap = new Map(
    (koMatches ?? []).map((m) => [m.id, m as MatchResult]),
  );
  const bracket = resolveBracket(results);

  return (
    <main className="min-h-screen bg-parchment">
      <NavBar
        userId={user.id}
        walletAddress={profile?.wallet_address ?? null}
        activePath="/knockout"
        avatarUrl={profile?.avatar_url}
        username={profile?.username}
      />

      <div className="mx-auto max-w-4xl px-4 py-8 flex flex-col gap-10">

        <div className="flex items-end justify-between">
          <h1 className="font-black text-2xl tracking-tight">Knockout Stage</h1>
          <p className="font-mono text-[11px] text-ink-muted uppercase tracking-widest">
            FIFA World Cup 2026
          </p>
        </div>

        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-accent px-3 py-1">
              <span className="font-black text-xs tracking-[0.2em] uppercase text-parchment">
                Knockout Bracket
              </span>
            </div>
            <div className="flex-1 h-px bg-ink-faint" />
          </div>
          <KnockoutBracket bracket={bracket} />
        </section>

      </div>
    </main>
  );
}
