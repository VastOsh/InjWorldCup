import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NavBar from "@/app/components/NavBar";
import { KNOCKOUT_ROUNDS } from "@/lib/knockoutData";

const ROUND_ACCENT: Record<string, string> = {
  r32:    "bg-ink",
  r16:    "bg-ink",
  qf:     "bg-accent",
  sf:     "bg-accent",
  bronze: "bg-live",
  final:  "bg-open",
};

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function isTBD(label: string): boolean {
  return label.startsWith("Winner") || label.startsWith("Runner-up");
}

export default async function KnockoutPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("wallet_address, avatar_url, username")
    .eq("id", user.id)
    .single();

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

        {KNOCKOUT_ROUNDS.map((round) => {
          // Group matches by date
          const byDate = new Map<string, typeof round.matches>();
          for (const m of round.matches) {
            if (!byDate.has(m.date)) byDate.set(m.date, []);
            byDate.get(m.date)!.push(m);
          }

          const accentClass = ROUND_ACCENT[round.key] ?? "bg-ink";

          return (
            <section key={round.key}>
              {/* Round header */}
              <div className="flex items-center gap-3 mb-5">
                <div className={`${accentClass} px-3 py-1`}>
                  <span className="font-black text-xs tracking-[0.2em] uppercase text-parchment">
                    {round.label}
                  </span>
                </div>
                <div className="flex-1 h-px bg-ink-faint" />
                <span className="font-mono text-[11px] text-ink-muted">
                  {round.matches.length} match{round.matches.length !== 1 ? "es" : ""}
                </span>
              </div>

              {/* Date groups */}
              <div className="flex flex-col gap-5">
                {[...byDate.entries()].map(([date, matches]) => (
                  <div key={date} className="flex flex-col gap-3">
                    {/* Date label */}
                    <p className="font-mono text-[11px] tracking-wide text-ink-muted border-b border-ink-faint pb-1.5">
                      {formatDate(date)}
                    </p>

                    {/* Match cards */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {matches.map((match) => (
                        <div
                          key={match.id}
                          className="border-2 border-ink bg-surface shadow-brutal-sm"
                        >
                          {/* Match ID strip */}
                          <div className="border-b-2 border-ink bg-parchment px-3 py-1.5 flex items-center justify-between">
                            <span className="font-mono text-[10px] tracking-widest uppercase text-ink-muted">
                              Match {match.id}
                            </span>
                            {round.key === "final" && (
                              <span className="font-mono text-[10px] tracking-widest uppercase bg-open text-white px-1.5 py-0.5">
                                Final
                              </span>
                            )}
                            {round.key === "bronze" && (
                              <span className="font-mono text-[10px] tracking-widest uppercase bg-live text-white px-1.5 py-0.5">
                                3rd Place
                              </span>
                            )}
                          </div>

                          {/* Teams */}
                          <div className="px-4 py-4 flex flex-col gap-3">
                            {[match.home, match.away].map((label, i) => (
                              <div key={i} className="flex items-center gap-3">
                                {/* TBD indicator */}
                                <div className={`w-1 self-stretch flex-shrink-0 ${isTBD(label) ? "bg-ink-faint" : "bg-open"}`} />
                                <span className={`text-sm font-semibold leading-tight ${isTBD(label) ? "text-ink-muted" : "text-ink"}`}>
                                  {label}
                                </span>
                              </div>
                            ))}

                            {/* VS divider */}
                            <div className="flex items-center gap-2 -my-1">
                              <div className="flex-1 h-px bg-ink-faint" />
                              <span className="font-mono text-[10px] text-ink-faint tracking-widest">VS</span>
                              <div className="flex-1 h-px bg-ink-faint" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

      </div>
    </main>
  );
}
