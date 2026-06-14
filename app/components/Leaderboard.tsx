"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { COUNTRIES, flagUrlByCode } from "@/lib/countries";

type Player = {
  id: string;
  username: string;
  avatar_url: string | null;
  total_points: number;
  tie_breaker_answer: number | null;
  country: string | null;
};

type CountryEntry = {
  country: string;
  code: string | null;
  total_points: number;
  player_count: number;
};

type AllPlayer = {
  id: string;
  username: string;
  avatar_url: string | null;
  country: string | null;
  total_points: number;
};

function sortPlayers(players: Player[], tiebreakerActual: number | null): Player[] {
  return [...players].sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    if (tiebreakerActual === null) return 0;
    const dA = a.tie_breaker_answer !== null ? Math.abs(a.tie_breaker_answer - tiebreakerActual) : Infinity;
    const dB = b.tie_breaker_answer !== null ? Math.abs(b.tie_breaker_answer - tiebreakerActual) : Infinity;
    return dA - dB;
  });
}

const rankColors = ["#CA8A04", "#9CA3AF", "#D97706"];
const rankLabels = ["1st", "2nd", "3rd"];

function RankBadge({ rank }: { rank: number }) {
  if (rank < 3) {
    return (
      <span
        className="w-8 h-8 flex items-center justify-center border-2 border-ink font-mono text-xs font-black shadow-brutal-sm flex-shrink-0"
        style={{ color: rankColors[rank], borderColor: rankColors[rank] }}
      >
        {rankLabels[rank]}
      </span>
    );
  }
  return (
    <span className="w-8 h-8 flex items-center justify-center font-mono text-xs text-ink-muted font-bold flex-shrink-0">
      {rank + 1}
    </span>
  );
}

export default function Leaderboard({
  initialPlayers,
  tiebreakerActual,
  currentUserId,
  countryEntries,
  allPlayers,
}: {
  initialPlayers: Player[];
  tiebreakerActual: number | null;
  currentUserId: string;
  countryEntries: CountryEntry[];
  allPlayers: AllPlayer[];
}) {
  const [tab, setTab] = useState<"players" | "countries">("players");
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);
  const [players, setPlayers] = useState(() => sortPlayers(initialPlayers, tiebreakerActual));
  const prevPointsRef = useRef<Map<string, number>>(new Map(initialPlayers.map(p => [p.id, p.total_points])));

  const myCountry = initialPlayers.find(p => p.id === currentUserId)?.country ?? null;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("leaderboard-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          setPlayers((prev) => {
            const updated = prev.map((p) =>
              p.id === payload.new.id ? { ...p, ...(payload.new as Player) } : p
            );
            return sortPlayers(updated, tiebreakerActual);
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tiebreakerActual]);

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b-2 border-ink">
        {(["players", "countries"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 font-mono text-[11px] tracking-widest uppercase font-bold transition-colors ${
              tab === t
                ? "bg-ink text-parchment"
                : "bg-surface text-ink-muted hover:text-ink"
            }`}
          >
            {t === "players" ? "Players" : "Countries"}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === "players" ? (
          <motion.ol
            key="players"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-0"
          >
            <AnimatePresence>
              {players.slice(0, 20).map((player, idx) => {
                const prevPoints = prevPointsRef.current.get(player.id) ?? player.total_points;
                const gained = player.total_points - prevPoints;
                prevPointsRef.current.set(player.id, player.total_points);

                const delta =
                  tiebreakerActual !== null && player.tie_breaker_answer !== null
                    ? Math.abs(player.tie_breaker_answer - tiebreakerActual)
                    : null;

                const isMe = player.id === currentUserId;

                return (
                  <motion.li
                    key={player.id}
                    layout
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{
                      layout: { type: "spring", stiffness: 320, damping: 32 },
                      opacity: { duration: 0.2 },
                    }}
                    className={`flex items-center gap-3 px-4 py-3 border-b-2 border-ink last:border-b-0 ${
                      isMe ? "bg-accent-soft" : idx % 2 === 0 ? "bg-surface" : "bg-parchment"
                    }`}
                  >
                    <RankBadge rank={idx} />

                    {player.avatar_url ? (
                      <Image
                        src={player.avatar_url}
                        alt={player.username}
                        width={32}
                        height={32}
                        className="border-2 border-ink shadow-brutal-sm flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 border-2 border-ink bg-ink-faint flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {player.username[0].toUpperCase()}
                      </div>
                    )}

                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <span className={`font-semibold text-sm truncate ${isMe ? "text-accent" : "text-ink"}`}>
                        {player.username}
                        {isMe && <span className="ml-1.5 font-mono text-[10px] text-accent-soft bg-accent px-1">YOU</span>}
                      </span>
                      {player.country && (() => {
                        const c = COUNTRIES.find(x => x.name === player.country);
                        return c ? (
                          <Image
                            src={flagUrlByCode(c.code)}
                            alt={c.name}
                            width={16}
                            height={11}
                            className="border border-ink-faint flex-shrink-0"
                            title={c.name}
                          />
                        ) : null;
                      })()}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <AnimatePresence>
                        {gained > 0 && (
                          <motion.span
                            key={`gain-${player.total_points}`}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.35 }}
                            className="font-mono text-[11px] text-open font-bold"
                          >
                            +{gained}
                          </motion.span>
                        )}
                      </AnimatePresence>

                      <span className="font-mono font-black text-sm tabular">
                        {player.total_points.toLocaleString()}
                      </span>
                      <span className="font-mono text-[10px] text-ink-muted">pts</span>

                      {delta !== null && (
                        <span className="font-mono text-[10px] text-ink-muted border border-ink-faint px-1">
                          Δ{delta}′
                        </span>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </motion.ol>
        ) : (
          <motion.ol
            key="countries"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-0"
          >
            {countryEntries.map((entry, idx) => {
              const isMyCountry = entry.country === myCountry;
              const isExpanded = expandedCountry === entry.country;
              const countryPlayers = allPlayers
                .filter(p => p.country === entry.country)
                .sort((a, b) => b.total_points - a.total_points);

              return (
                <li key={entry.country} className="border-b-2 border-ink last:border-b-0">
                  {/* Country row */}
                  <button
                    onClick={() => setExpandedCountry(isExpanded ? null : entry.country)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      isMyCountry ? "bg-accent-soft" : idx % 2 === 0 ? "bg-surface" : "bg-parchment"
                    }`}
                  >
                    <RankBadge rank={idx} />

                    {entry.code ? (
                      <Image
                        src={flagUrlByCode(entry.code)}
                        alt={entry.country}
                        width={28}
                        height={20}
                        className="border border-ink-faint flex-shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-5 border border-ink-faint bg-ink-faint flex-shrink-0" />
                    )}

                    <div className="flex-1 min-w-0">
                      <span className={`font-semibold text-sm truncate block ${isMyCountry ? "text-accent" : "text-ink"}`}>
                        {entry.country}
                        {isMyCountry && <span className="ml-1.5 font-mono text-[10px] text-accent-soft bg-accent px-1">YOU</span>}
                      </span>
                      <span className="font-mono text-[10px] text-ink-muted">
                        {entry.player_count} player{entry.player_count !== 1 ? "s" : ""}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-mono font-black text-sm tabular">
                        {entry.total_points.toLocaleString()}
                      </span>
                      <span className="font-mono text-[10px] text-ink-muted">pts</span>
                      <span className={`font-mono text-[10px] text-ink-muted transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
                        ▾
                      </span>
                    </div>
                  </button>

                  {/* Breakdown */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.ul
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden border-t-2 border-ink-faint"
                      >
                        {countryPlayers.map((p, pIdx) => {
                          const isMe = p.id === currentUserId;
                          return (
                            <li
                              key={p.id}
                              className={`flex items-center gap-3 pl-14 pr-4 py-2 border-b border-ink-faint last:border-b-0 ${
                                isMe ? "bg-accent-soft" : "bg-ink-faint/30"
                              }`}
                            >
                              <span className="font-mono text-[10px] text-ink-muted w-4 text-right flex-shrink-0">
                                {pIdx + 1}
                              </span>

                              {p.avatar_url ? (
                                <Image
                                  src={p.avatar_url}
                                  alt={p.username}
                                  width={20}
                                  height={20}
                                  className="border border-ink shadow-brutal-sm flex-shrink-0"
                                />
                              ) : (
                                <div className="w-5 h-5 border border-ink bg-ink-faint flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                                  {p.username[0].toUpperCase()}
                                </div>
                              )}

                              <span className={`flex-1 font-semibold text-xs truncate ${isMe ? "text-accent" : "text-ink"}`}>
                                {p.username}
                                {isMe && <span className="ml-1.5 font-mono text-[9px] text-accent-soft bg-accent px-1">YOU</span>}
                              </span>

                              <div className="flex items-center gap-1 flex-shrink-0">
                                <span className="font-mono font-black text-xs tabular">
                                  {p.total_points.toLocaleString()}
                                </span>
                                <span className="font-mono text-[10px] text-ink-muted">pts</span>
                              </div>
                            </li>
                          );
                        })}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  );
}
