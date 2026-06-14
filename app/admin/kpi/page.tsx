import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { COUNTRIES, flagUrlByCode } from "@/lib/countries";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default async function KpiPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const adminId = process.env.ADMIN_USER_ID;
  if (!adminId) {
    console.warn(`[kpi] ADMIN_USER_ID not set. Current user: ${user.id}`);
    redirect("/");
  }
  if (user.id !== adminId) redirect("/");

  const admin = createAdminClient();

  const [
    { count: playerCount },
    { count: predCount },
    { data: podium },
    { data: matches },
    { data: allPlayersData },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    admin.from("predictions").select("*", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id, username, avatar_url, total_points, country")
      .order("total_points", { ascending: false })
      .limit(5),
    supabase.from("matches").select("status").eq("visible", true),
    supabase.from("profiles").select("country, total_points"),
  ]);

  const players = playerCount ?? 0;
  const preds = predCount ?? 0;
  const visibleMatches = matches?.length ?? 0;
  const finishedCount = matches?.filter((m) => m.status === "FINISHED").length ?? 0;

  const totalPoints =
    allPlayersData?.reduce((s, p) => s + (p.total_points ?? 0), 0) ?? 0;
  const avgPoints = players > 0 ? Math.round(totalPoints / players) : 0;

  const leader = podium?.[0]?.total_points ?? 0;
  const second = podium?.[1]?.total_points ?? 0;
  const gap = leader - second;

  const countryMap = new Map<string, { total_points: number; player_count: number }>();
  for (const p of allPlayersData ?? []) {
    if (!p.country) continue;
    const prev = countryMap.get(p.country) ?? { total_points: 0, player_count: 0 };
    countryMap.set(p.country, {
      total_points: prev.total_points + (p.total_points ?? 0),
      player_count: prev.player_count + 1,
    });
  }
  const countriesRepresented = countryMap.size;
  const topCountries = [...countryMap.entries()]
    .sort(([, a], [, b]) => b.total_points - a.total_points)
    .slice(0, 3)
    .map(([country, data]) => {
      const c = COUNTRIES.find((x) => x.name === country);
      return { country, code: c?.code ?? null, ...data };
    });

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: "#080B17" }}>
      <div className="mx-auto max-w-2xl flex flex-col gap-5">

        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <Image
            src="/Injective Logo - Lockup - White.svg"
            alt="Injective"
            width={140}
            height={32}
            className="opacity-90"
          />
          <div className="text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.35)" }}>
              KPI Snapshot
            </p>
            <p className="font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>
              {today}
            </p>
          </div>
        </div>

        {/* ── Divider ──────────────────────────────────────────────── */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

        {/* ── Top stat cards ───────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {([
            { label: "Players",     value: players.toLocaleString()  },
            { label: "Predictions", value: preds.toLocaleString()    },
            { label: "Countries",   value: countriesRepresented.toLocaleString() },
          ] as const).map(({ label, value }) => (
            <div
              key={label}
              className="flex flex-col gap-2 px-5 py-4"
              style={{
                background: "#0D1121",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <p
                className="font-mono text-[10px] uppercase tracking-[0.18em]"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                {label}
              </p>
              <p
                className="font-black text-3xl tabular leading-none"
                style={{ color: "#FFFFFF" }}
              >
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Podium ───────────────────────────────────────────────── */}
        <div
          className="px-5 py-5 flex flex-col gap-5"
          style={{
            background: "#0D1121",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <p
            className="font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            Podium
          </p>

          {(podium ?? []).slice(0, 3).map((player, i) => {
            const pct =
              leader > 0
                ? Math.round(((player.total_points ?? 0) / leader) * 100)
                : 0;
            const country = player.country
              ? COUNTRIES.find((x) => x.name === player.country)
              : null;
            const rank = ["01", "02", "03"][i];
            return (
              <div key={player.id} className="flex items-center gap-4">
                <span
                  className="font-mono text-xs w-5 flex-shrink-0 tabular"
                  style={{ color: "rgba(255,255,255,0.25)" }}
                >
                  {rank}
                </span>
                {player.avatar_url && (
                  <Image
                    src={player.avatar_url}
                    alt={player.username ?? ""}
                    width={26}
                    height={26}
                    className="rounded-full flex-shrink-0"
                    style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                  />
                )}
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-white truncate">
                      {player.username}
                    </span>
                    {country && (
                      <Image
                        src={flagUrlByCode(country.code)}
                        alt={country.name}
                        width={15}
                        height={10}
                        className="flex-shrink-0"
                        style={{ opacity: 0.65 }}
                      />
                    )}
                  </div>
                  <div
                    className="h-1 w-full"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  >
                    <div
                      className="h-full"
                      style={{
                        width: `${pct}%`,
                        background: i === 0 ? "#4D3DFF" : "rgba(255,255,255,0.2)",
                      }}
                    />
                  </div>
                </div>
                <span
                  className="font-mono font-bold text-sm tabular flex-shrink-0"
                  style={{ color: i === 0 ? "#fff" : "rgba(255,255,255,0.55)" }}
                >
                  {(player.total_points ?? 0).toLocaleString()} pts
                </span>
              </div>
            );
          })}
        </div>

        {/* ── Bottom row ───────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">

          {/* Country rankings */}
          <div
            className="px-5 py-5 flex flex-col gap-4"
            style={{
              background: "#0D1121",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <p
              className="font-mono text-[10px] uppercase tracking-[0.18em]"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              Top Countries
            </p>
            {topCountries.length === 0 ? (
              <p className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                No data yet
              </p>
            ) : (
              topCountries.map((c, i) => (
                <div key={c.country} className="flex items-center gap-2.5">
                  <span
                    className="font-mono text-[10px] w-4 flex-shrink-0 tabular"
                    style={{ color: "rgba(255,255,255,0.25)" }}
                  >
                    {i + 1}
                  </span>
                  {c.code && (
                    <Image
                      src={flagUrlByCode(c.code)}
                      alt={c.country}
                      width={16}
                      height={11}
                      className="flex-shrink-0"
                    />
                  )}
                  <span className="font-semibold text-xs text-white flex-1 truncate">
                    {c.country}
                  </span>
                  <span
                    className="font-mono text-[11px] tabular"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                  >
                    {c.total_points.toLocaleString()} pts
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Quick stats */}
          <div
            className="px-5 py-5 flex flex-col gap-4"
            style={{
              background: "#0D1121",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <p
              className="font-mono text-[10px] uppercase tracking-[0.18em]"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              Quick Stats
            </p>
            <div className="flex flex-col gap-3">
              {([
                { label: "Matches played",   value: `${finishedCount} / ${visibleMatches}` },
                { label: "Avg points",       value: `${avgPoints.toLocaleString()} pts`    },
                { label: "Leader gap",       value: `+${gap.toLocaleString()} pts`          },
                { label: "Total pts awarded", value: totalPoints.toLocaleString()           },
              ] as const).map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <span
                    className="font-mono text-[11px]"
                    style={{ color: "rgba(255,255,255,0.35)" }}
                  >
                    {label}
                  </span>
                  <span
                    className="font-mono font-bold text-[11px] tabular text-white"
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* ── Footer ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-1">
          <div style={{ height: 1, flex: 1, background: "rgba(255,255,255,0.04)" }} />
          <span
            className="font-mono text-[10px] px-4 uppercase tracking-[0.15em]"
            style={{ color: "rgba(255,255,255,0.2)" }}
          >
            injective.live
          </span>
          <div style={{ height: 1, flex: 1, background: "rgba(255,255,255,0.04)" }} />
        </div>

      </div>
    </main>
  );
}
