import Link from "next/link";
import Image from "next/image";
import { COUNTRIES, flagUrlByCode } from "@/lib/countries";
import type { FinalStanding } from "@/lib/podium";

// Homepage hero for a finished tournament. Once every match is played the
// fixture list below is just a wall of completed games, so the champion and the
// player's own final rank take the top slot instead.
//
// Server component on purpose: it's static content, so it costs no client JS on
// the most-visited page.

const MEDALS = [
  { color: "#CA8A04", emoji: "🥇" },
  { color: "#9CA3AF", emoji: "🥈" },
  { color: "#D97706", emoji: "🥉" },
] as const;

function Flag({ country }: { country: string | null }) {
  if (!country) return null;
  const c = COUNTRIES.find((x) => x.name === country);
  if (!c) return null;
  return (
    <Image
      src={flagUrlByCode(c.code)}
      alt={c.name}
      width={16}
      height={11}
      className="border border-ink-faint flex-shrink-0"
      title={c.name}
    />
  );
}

export default function ChampionBanner({
  top,
  myStanding,
  playerCount,
}: {
  top: FinalStanding[];
  myStanding: FinalStanding | null;
  playerCount: number;
}) {
  if (top.length === 0) return null;

  const champion = top[0];
  const runnersUp = top.slice(1, 3);

  return (
    <div className="border-2 border-ink shadow-brutal bg-surface overflow-hidden">
      <div className="bg-ink text-parchment px-4 py-2.5 flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] tracking-widest uppercase font-bold">
          World Cup 2026 — Final standings
        </span>
        <span className="font-mono text-[9px] tracking-widest uppercase text-parchment/60 hidden sm:inline">
          {playerCount} players
        </span>
      </div>

      {/* Champion */}
      <div className="px-5 py-5 flex items-center gap-4 border-b-2 border-ink">
        <span className="text-3xl flex-shrink-0" aria-hidden>
          {MEDALS[0].emoji}
        </span>

        {champion.avatar_url ? (
          <Image
            src={champion.avatar_url}
            alt={champion.username}
            width={52}
            height={52}
            className="border-2 shadow-brutal flex-shrink-0"
            style={{ borderColor: MEDALS[0].color }}
          />
        ) : (
          <div
            className="w-[52px] h-[52px] border-2 shadow-brutal bg-ink-faint flex items-center justify-center text-xl font-black flex-shrink-0"
            style={{ borderColor: MEDALS[0].color }}
          >
            {champion.username[0].toUpperCase()}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] tracking-widest uppercase text-ink-muted">
            Champion
          </p>
          <div className="flex items-center gap-2 min-w-0">
            <p className="font-black text-lg tracking-tight truncate">{champion.username}</p>
            <Flag country={champion.country} />
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <div className="font-mono font-black text-base tabular">
            {champion.total_points.toLocaleString()}
          </div>
          <div className="font-mono text-[10px] text-ink-muted">pts</div>
        </div>
      </div>

      {/* Runners-up */}
      {runnersUp.length > 0 && (
        <ul className="border-b-2 border-ink">
          {runnersUp.map((p, i) => (
            <li
              key={p.user_id}
              className={`flex items-center gap-3 px-5 py-2.5 ${
                i === 0 ? "bg-parchment" : "bg-surface"
              } ${i < runnersUp.length - 1 ? "border-b border-ink-faint" : ""}`}
            >
              <span className="text-base flex-shrink-0" aria-hidden>
                {MEDALS[i + 1].emoji}
              </span>
              <span className="font-semibold text-sm truncate flex-1 min-w-0">{p.username}</span>
              <Flag country={p.country} />
              <span className="font-mono font-black text-xs tabular flex-shrink-0">
                {p.total_points.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Your result — the reason most people will click through */}
      <Link
        href="/podium"
        className="flex items-center justify-between gap-3 px-5 py-3.5 bg-accent-soft hover:brightness-95 transition-[filter] group"
      >
        <div className="min-w-0">
          {myStanding ? (
            <>
              <p className="font-mono text-[10px] tracking-widest uppercase text-ink-muted">
                Your final rank
              </p>
              <p className="font-bold text-sm">
                #{myStanding.rank} of {playerCount}
                <span className="font-mono font-normal text-ink-muted">
                  {" · "}
                  {myStanding.total_points.toLocaleString()} pts
                </span>
              </p>
            </>
          ) : (
            <p className="font-bold text-sm">See the full podium</p>
          )}
        </div>
        <span className="font-mono text-[11px] tracking-widest uppercase font-bold text-accent flex items-center gap-1.5 flex-shrink-0">
          <span className="hidden sm:inline">Podium &amp; result card</span>
          <span className="text-base transition-transform group-hover:translate-x-0.5">→</span>
        </span>
      </Link>
    </div>
  );
}
