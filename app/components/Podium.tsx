"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { COUNTRIES, flagUrlByCode } from "@/lib/countries";
import PlayerDrawer from "./PlayerDrawer";
import type { CountryStanding, FinalStanding, RecapStat } from "@/lib/podium";

// Medal colours match the RankBadge palette in Leaderboard.tsx.
const MEDALS = [
  { color: "#CA8A04", label: "1st", tag: "CHAMPION", height: 168 },
  { color: "#9CA3AF", label: "2nd", tag: "RUNNER-UP", height: 128 },
  { color: "#D97706", label: "3rd", tag: "THIRD", height: 100 },
] as const;

function CountryFlag({ country, size = 16 }: { country: string | null; size?: number }) {
  if (!country) return null;
  const c = COUNTRIES.find((x) => x.name === country);
  if (!c) return null;
  return (
    <Image
      src={flagUrlByCode(c.code)}
      alt={c.name}
      width={size}
      height={Math.round(size * 0.7)}
      className="border border-ink-faint flex-shrink-0"
      title={c.name}
    />
  );
}

function Avatar({
  player,
  size,
  isMe,
}: {
  player: FinalStanding;
  size: number;
  isMe: boolean;
}) {
  if (player.avatar_url) {
    return (
      <Image
        src={player.avatar_url}
        alt={player.username}
        width={size}
        height={size}
        className={`border-2 shadow-brutal flex-shrink-0 ${isMe ? "border-accent" : "border-ink"}`}
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className={`border-2 shadow-brutal bg-ink-faint flex items-center justify-center font-black flex-shrink-0 ${
        isMe ? "border-accent" : "border-ink"
      }`}
    >
      {player.username[0].toUpperCase()}
    </div>
  );
}

/** One podium block. `order` is the medal index (0 = gold). */
function PodiumBlock({
  player,
  order,
  currentUserId,
  onOpen,
}: {
  player: FinalStanding;
  order: 0 | 1 | 2;
  currentUserId: string | null;
  onOpen: (id: string, rank: number) => void;
}) {
  const medal = MEDALS[order];
  const isMe = player.user_id === currentUserId;

  // Gold rises last and highest — 3rd, then 2nd, then 1st.
  const delay = [0.45, 0.3, 0.15][order];

  return (
    <div className="flex flex-col items-center flex-1 min-w-0 max-w-[180px]">
      <motion.button
        type="button"
        onClick={() => onOpen(player.user_id, player.rank)}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: delay + 0.2, duration: 0.35 }}
        className="flex flex-col items-center gap-2 w-full cursor-pointer group"
      >
        <Avatar player={player} size={order === 0 ? 64 : 52} isMe={isMe} />

        <div className="flex items-center gap-1.5 max-w-full px-1">
          <span
            className={`font-bold truncate ${order === 0 ? "text-sm" : "text-xs"} ${
              isMe ? "text-accent" : "text-ink"
            } group-hover:underline`}
          >
            {player.username}
          </span>
          <CountryFlag country={player.country} size={order === 0 ? 16 : 14} />
        </div>

        <div className="flex items-baseline gap-1">
          <span className={`font-mono font-black tabular ${order === 0 ? "text-base" : "text-sm"}`}>
            {player.total_points.toLocaleString()}
          </span>
          <span className="font-mono text-[10px] text-ink-muted">pts</span>
        </div>
      </motion.button>

      {/* The block itself */}
      <motion.div
        initial={{ height: 0 }}
        animate={{ height: medal.height }}
        transition={{ delay, type: "spring", stiffness: 120, damping: 18 }}
        style={{ backgroundColor: medal.color }}
        className="w-full mt-2 border-2 border-ink shadow-brutal flex flex-col items-center justify-center overflow-hidden"
      >
        <span className="font-mono font-black text-2xl text-ink leading-none">
          {player.rank}
        </span>
        <span className="font-mono text-[9px] tracking-widest uppercase text-ink/70 mt-1 px-1 text-center">
          {medal.tag}
        </span>
      </motion.div>
    </div>
  );
}

const RECAP_LABELS: Record<string, string> = {
  biggest_haul: "Biggest single haul",
  trickiest_match: "Hardest match to call",
  most_exact: "Most exact scorelines",
  sharpest: "Best strike rate",
  total_predictions: "Predictions scored",
};

export default function Podium({
  standings,
  currentUserId,
  playerCount,
  myStanding,
  shareBaseUrl,
  recap,
  countries,
}: {
  standings: FinalStanding[];
  currentUserId: string | null;
  playerCount: number;
  myStanding: FinalStanding | null;
  shareBaseUrl: string;
  recap: RecapStat[];
  countries: CountryStanding[];
}) {
  const [selected, setSelected] = useState<{ id: string; rank: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const top3 = standings.slice(0, 3);
  const rest = standings.slice(3, 20);

  // Podium reads 2nd — 1st — 3rd left to right on desktop; stacked 1-2-3 on
  // mobile, where a staircase would just look broken.
  const desktopOrder: Array<{ player: FinalStanding; order: 0 | 1 | 2 }> = [];
  if (top3[1]) desktopOrder.push({ player: top3[1], order: 1 });
  if (top3[0]) desktopOrder.push({ player: top3[0], order: 0 });
  if (top3[2]) desktopOrder.push({ player: top3[2], order: 2 });

  const shareUrl = myStanding ? `${shareBaseUrl}/r/${myStanding.share_slug}` : null;

  // Two tags, no more: @injective for the mention and $INJ so the post surfaces
  // in cashtag search. Piling on hashtags reads as spam and gets throttled —
  // with ~159 players posting, the reach comes from volume, not tag count.
  const shareText = myStanding
    ? [
        `I finished #${myStanding.rank} of ${playerCount} in the InjWorldCup 2026 prediction league with ${myStanding.total_points.toLocaleString()} points ⚽`,
        myStanding.best_label
          ? `Best call: ${myStanding.best_label} (+${myStanding.best_points.toLocaleString()})`
          : null,
        "Built on @injective $INJ",
      ]
        .filter(Boolean)
        .join("\n\n")
    : "";

  const onCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context / permissions) — the X button and
      // the visible link below still work.
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Podium ─────────────────────────────────────────────── */}
      <div className="border-2 border-ink shadow-brutal bg-surface px-4 pt-8 pb-4">
        <div className="text-center mb-6">
          <p className="font-mono text-[11px] tracking-widest uppercase text-ink-muted">
            Final standings
          </p>
          <h2 className="font-black text-xl tracking-tight mt-1">World Cup 2026</h2>
        </div>

        {/* Desktop / tablet: staircase */}
        <div className="hidden sm:flex items-end justify-center gap-3">
          {desktopOrder.map(({ player, order }) => (
            <PodiumBlock
              key={player.user_id}
              player={player}
              order={order}
              currentUserId={currentUserId}
              onOpen={(id, rank) => setSelected({ id, rank })}
            />
          ))}
        </div>

        {/* Mobile: 1-2-3 stacked */}
        <div className="flex sm:hidden flex-col gap-4">
          {top3.map((player, idx) => (
            <PodiumBlock
              key={player.user_id}
              player={player}
              order={idx as 0 | 1 | 2}
              currentUserId={currentUserId}
              onOpen={(id, rank) => setSelected({ id, rank })}
            />
          ))}
        </div>
      </div>

      {/* ── Your result ────────────────────────────────────────── */}
      {myStanding && shareUrl && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.35 }}
          className="border-2 border-ink shadow-brutal bg-accent-soft"
        >
          <div className="flex items-center gap-3 px-4 py-4 border-b-2 border-ink">
            <Avatar player={myStanding} size={44} isMe />
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[10px] tracking-widest uppercase text-ink-muted">
                Your final rank
              </p>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="font-black text-lg">#{myStanding.rank}</span>
                <span className="font-mono text-xs text-ink-muted">of {playerCount}</span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-mono font-black text-base tabular">
                {myStanding.total_points.toLocaleString()}
              </div>
              <div className="font-mono text-[10px] text-ink-muted">
                {myStanding.exact_count} exact / {myStanding.played_count} played
              </div>
            </div>
          </div>

          {myStanding.best_label && (
            <div className="px-4 py-3 border-b-2 border-ink flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[10px] tracking-widest uppercase text-ink-muted">
                  Your best call
                </p>
                <p className="font-semibold text-sm truncate">{myStanding.best_label}</p>
              </div>
              <span className="font-mono font-black text-sm text-open flex-shrink-0">
                +{myStanding.best_points.toLocaleString()}
              </span>
            </div>
          )}

          <div className="px-4 py-3 flex flex-col gap-2">
            <p className="font-mono text-[11px] text-ink-muted">
              Share your result card — the link previews your rank.
            </p>
            <div className="flex gap-2">
              <a
                href={`https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center border-2 border-ink bg-ink text-parchment font-mono text-[11px] tracking-widest uppercase font-bold py-2.5 shadow-brutal-sm hover:brightness-125 transition-[filter]"
              >
                Post on X
              </a>
              <button
                type="button"
                onClick={onCopy}
                className="flex-1 border-2 border-ink bg-surface font-mono text-[11px] tracking-widest uppercase font-bold py-2.5 shadow-brutal-sm hover:bg-ink hover:text-parchment transition-colors"
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Tournament recap ───────────────────────────────────── */}
      {recap.length > 0 && (
        <div className="border-2 border-ink shadow-brutal overflow-hidden">
          <div className="bg-ink text-parchment px-4 py-2.5">
            <span className="font-mono text-[11px] tracking-widest uppercase font-bold">
              Tournament recap
            </span>
          </div>
          <ul>
            {recap.map((stat, idx) => (
              <li
                key={stat.stat}
                className={`px-4 py-3 border-b-2 border-ink last:border-b-0 flex items-center justify-between gap-3 ${
                  idx % 2 === 0 ? "bg-surface" : "bg-parchment"
                }`}
              >
                <div className="min-w-0">
                  <p className="font-mono text-[10px] tracking-widest uppercase text-ink-muted">
                    {RECAP_LABELS[stat.stat] ?? stat.stat}
                  </p>
                  {stat.subject && (
                    <p className="font-semibold text-sm truncate">{stat.subject}</p>
                  )}
                  {stat.detail && (
                    <p className="font-mono text-[10px] text-ink-muted truncate">{stat.detail}</p>
                  )}
                </div>
                <span className="font-mono font-black text-lg tabular flex-shrink-0">
                  {stat.headline}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Country podium ─────────────────────────────────────── */}
      {countries.length > 0 && (
        <div className="border-2 border-ink shadow-brutal overflow-hidden">
          <div className="bg-ink text-parchment px-4 py-2.5 flex items-center justify-between">
            <span className="font-mono text-[11px] tracking-widest uppercase font-bold">
              Country podium
            </span>
            <span className="font-mono text-[9px] tracking-widest uppercase text-parchment/60">
              by total points
            </span>
          </div>
          <ol>
            {countries.slice(0, 5).map((entry, idx) => (
              <li
                key={entry.country}
                className={`flex items-center gap-3 px-4 py-3 border-b-2 border-ink last:border-b-0 ${
                  idx % 2 === 0 ? "bg-surface" : "bg-parchment"
                }`}
              >
                <span
                  className="w-8 h-8 flex items-center justify-center font-mono text-xs font-black flex-shrink-0"
                  style={{ color: idx < 3 ? MEDALS[idx].color : undefined }}
                >
                  {idx + 1}
                </span>
                <CountryFlag country={entry.country} size={28} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{entry.country}</p>
                  <p className="font-mono text-[10px] text-ink-muted">
                    {entry.player_count} player{entry.player_count !== 1 ? "s" : ""} · best #
                    {entry.best_rank}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="font-mono font-black text-sm tabular">
                    {entry.total_points.toLocaleString()}
                  </span>
                  <span className="font-mono text-[10px] text-ink-muted">pts</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── Ranks 4-20 ─────────────────────────────────────────── */}
      {rest.length > 0 && (
        <div className="border-2 border-ink shadow-brutal overflow-hidden">
          <div className="bg-ink text-parchment px-4 py-2.5">
            <span className="font-mono text-[11px] tracking-widest uppercase font-bold">
              Top 20
            </span>
          </div>
          <ol>
            {rest.map((player, idx) => {
              const isMe = player.user_id === currentUserId;
              return (
                <li
                  key={player.user_id}
                  onClick={() => setSelected({ id: player.user_id, rank: player.rank })}
                  className={`flex items-center gap-3 px-4 py-3 border-b-2 border-ink last:border-b-0 cursor-pointer hover:brightness-95 active:brightness-90 transition-[filter] ${
                    isMe ? "bg-accent-soft" : idx % 2 === 0 ? "bg-surface" : "bg-parchment"
                  }`}
                >
                  <span className="w-8 font-mono text-xs text-ink-muted font-bold flex-shrink-0 text-center">
                    {player.rank}
                  </span>

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
                    <span
                      className={`font-semibold text-sm truncate ${isMe ? "text-accent" : "text-ink"}`}
                    >
                      {player.username}
                      {isMe && (
                        <span className="ml-1.5 font-mono text-[10px] text-accent-soft bg-accent px-1">
                          YOU
                        </span>
                      )}
                    </span>
                    <CountryFlag country={player.country} />
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="font-mono font-black text-sm tabular">
                      {player.total_points.toLocaleString()}
                    </span>
                    <span className="font-mono text-[10px] text-ink-muted">pts</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <PlayerDrawer
        playerId={selected?.id ?? null}
        rank={selected ? selected.rank - 1 : null}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
