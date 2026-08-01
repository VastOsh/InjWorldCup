import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import { defaultFeeBps } from "@/lib/market/config";
import CreateMarketForm from "./CreateMarketForm";

export const dynamic = "force-dynamic";

export default async function AdminMarketsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const adminId = process.env.ADMIN_USER_ID;
  if (!adminId || user.id !== adminId) redirect("/market");

  const admin = createAdminClient();
  const { data: markets } = await admin
    .from("markets")
    .select("id, status, has_draw, locks_at, matches!inner(team_home, team_away, category, league)")
    .order("id", { ascending: false })
    .limit(30);

  type Row = {
    id: number;
    status: string;
    has_draw: boolean;
    locks_at: string;
    matches: { team_home: string; team_away: string; category: string; league: string | null };
  };
  const rows = (markets ?? []) as unknown as Row[];

  return (
    <main className="grain relative min-h-screen overflow-hidden bg-nightfall text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="aurora aurora-a" />
      </div>

      <header className="sticky top-4 z-50 px-4">
        <div className="mx-auto max-w-4xl glass-nav rounded-full h-14 pl-6 pr-6 flex items-center justify-between">
          <Link href="/" className="font-black text-sm tracking-[-0.02em] uppercase hover:text-inj-soft transition-colors">
            INJ<span className="text-inj-soft">CUP</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">Admin · Markets</span>
            <Link href="/market" className="font-mono text-[10px] uppercase tracking-wide text-inj-soft hover:text-white transition-colors">
              View board →
            </Link>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-4xl px-4 py-10 grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-start">
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="font-black text-2xl tracking-tight">Create a market</h1>
            <p className="font-mono text-[11px] text-white/50 mt-1.5">
              Football is 3-way; head-to-head sports default to 2-way (no draw).
            </p>
          </div>
          <CreateMarketForm defaultFeeBps={defaultFeeBps()} />
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">Recent markets</h2>
          <div className="glass rounded-3xl overflow-hidden divide-y divide-white/10">
            {rows.length === 0 ? (
              <p className="px-4 py-6 font-mono text-xs text-white/50">No markets yet.</p>
            ) : (
              rows.map((m) => (
                <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">
                      {m.matches.team_home} <span className="text-white/40">vs</span> {m.matches.team_away}
                    </p>
                    <p className="font-mono text-[10px] text-white/50 mt-0.5 truncate">
                      #{m.id} · {m.matches.category}
                      {m.matches.league ? ` · ${m.matches.league}` : ""} · {m.has_draw ? "3-way" : "2-way"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-mono text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                      m.status === "settled"
                        ? "bg-white/10 border-white/15 text-white/60"
                        : m.status === "locked"
                          ? "bg-live/15 border-live/25 text-live"
                          : m.status === "void"
                            ? "bg-white/10 border-white/15 text-white/40"
                            : "bg-open/15 border-open/25 text-open"
                    }`}
                  >
                    {m.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
