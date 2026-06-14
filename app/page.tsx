import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Image from "next/image";
import NavBar from "@/app/components/NavBar";
import TiebreakerInput from "@/app/components/TiebreakerInput";
import MatchGrid from "@/app/components/MatchGrid";
import { COUNTRIES, flagUrlByCode } from "@/lib/countries";
import type { Database } from "@/lib/supabase/types";

type Match = Database["public"]["Tables"]["matches"]["Row"];
type Prediction = Database["public"]["Tables"]["predictions"]["Row"];

export default async function HomePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, avatar_url, total_points, wallet_address, tie_breaker_answer, country")
    .eq("id", user.id)
    .single();

  const [
    { data: matches },
    { data: predictions },
    { data: tbConfig },
    { count: aboveCount },
  ] = await Promise.all([
    supabase.from("matches").select("*").eq("visible", true).order("match_date", { ascending: true }),
    supabase.from("predictions").select("*").eq("user_id", user.id),
    supabase.from("app_config").select("value_int").eq("key", "tiebreaker_visible").maybeSingle(),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gt("total_points", profile?.total_points ?? 0),
  ]);

  const userRank = (aboveCount ?? 0) + 1;

  const predByMatchId = Object.fromEntries((predictions ?? []).map((p) => [p.match_id, p]));
  const tiebreakerVisible = (tbConfig?.value_int ?? 0) === 1;

  // Compute locked state server-side — Node.js parses dates reliably.
  const now = Date.now();
  const lockedIds = (matches ?? [])
    .filter(m => m.status === "FINISHED" || new Date(m.match_date).getTime() <= now)
    .map(m => m.id);

  // Split into group-stage sections (sorted A–L) + ungrouped (friendlies/knockout)
  const groupMap = new Map<string, Match[]>();
  const ungrouped: Match[] = [];

  for (const match of matches ?? []) {
    if (match.group_name) {
      if (!groupMap.has(match.group_name)) groupMap.set(match.group_name, []);
      groupMap.get(match.group_name)!.push(match);
    } else {
      ungrouped.push(match);
    }
  }

  const groupEntries = [...groupMap.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <main className="min-h-screen bg-parchment">

      <NavBar userId={user.id} walletAddress={profile?.wallet_address ?? null} activePath="/" avatarUrl={profile?.avatar_url} username={profile?.username} />

      <div className="mx-auto max-w-4xl px-4 py-8 flex flex-col gap-10">

        {/* ── Profile card ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-5 border-2 border-ink bg-surface px-6 py-5 shadow-brutal">
          {profile?.avatar_url && (
            <Image
              src={profile.avatar_url}
              alt={profile?.username ?? ""}
              width={56}
              height={56}
              priority
              className="border-2 border-ink shadow-brutal-sm flex-shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-black text-lg tracking-tight truncate">{profile?.username}</p>
              {profile?.country && (() => {
                const c = COUNTRIES.find(x => x.name === profile.country);
                return c ? (
                  <Image
                    src={flagUrlByCode(c.code)}
                    alt={c.name}
                    width={20}
                    height={14}
                    className="border border-ink-faint flex-shrink-0"
                    title={c.name}
                  />
                ) : null;
              })()}
              <span className="font-mono font-black text-lg text-ink-muted">#{userRank}</span>
            </div>
            <p className="font-mono text-sm text-ink-muted tabular">
              {(profile?.total_points ?? 0).toLocaleString()} pts
            </p>
          </div>
          {tiebreakerVisible && (
            <div className="border-l-2 border-ink-faint pl-5">
              <TiebreakerInput current={profile?.tie_breaker_answer ?? null} />
            </div>
          )}
        </div>

        {/* ── No matches at all ─────────────────────────────────────────── */}
        {!matches?.length && (
          <p className="font-mono text-sm text-ink-muted border-2 border-ink-faint px-4 py-6 text-center">
            No matches scheduled yet.
          </p>
        )}

        {/* ── Group-stage sections ──────────────────────────────────────── */}
        {groupEntries.map(([groupName, groupMatches]) => (
          <section key={groupName}>
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-ink px-3 py-1">
                <span className="font-black text-xs tracking-[0.2em] uppercase text-parchment">
                  Group {groupName}
                </span>
              </div>
              <div className="flex-1 h-px bg-ink-faint" />
              <span className="font-mono text-[11px] text-ink-muted">
                {groupMatches.length} match{groupMatches.length !== 1 ? "es" : ""}
              </span>
            </div>
            <MatchGrid
              matches={groupMatches}
              predByMatchId={predByMatchId as Record<number, Prediction>}
              lockedIds={lockedIds}
            />
          </section>
        ))}

        {/* ── Ungrouped matches (knockouts / friendlies) ────────────────── */}
        {ungrouped.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="border-2 border-ink px-3 py-1">
                <span className="font-black text-xs tracking-[0.2em] uppercase text-ink">
                  Other Matches
                </span>
              </div>
              <div className="flex-1 h-px bg-ink-faint" />
            </div>
            <MatchGrid
              matches={ungrouped}
              predByMatchId={predByMatchId as Record<number, Prediction>}
              lockedIds={lockedIds}
            />
          </section>
        )}

      </div>
    </main>
  );
}
