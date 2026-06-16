"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { COUNTRIES, flagUrlByCode } from "@/lib/countries";
import { flagUrl } from "@/lib/teamFlags";

type MatchData = {
  id: number;
  team_home: string;
  team_away: string;
  status: string;
  score_home: number | null;
  score_away: number | null;
  match_date: string;
};

type PredRow = {
  match_id: number;
  pred_home: number | null;
  pred_away: number | null;
  points_won: number;
  is_calculated: boolean;
  matches: MatchData;
};

type PlayerData = {
  profile: {
    id: string;
    username: string;
    avatar_url: string | null;
    country: string | null;
    total_points: number;
  } | null;
  predictions: PredRow[];
};

function TeamFlag({ name }: { name: string }) {
  const url = flagUrl(name);
  if (!url) return null;
  return (
    <Image
      src={url}
      alt={`${name} flag`}
      width={16}
      height={11}
      className="border border-ink-faint flex-shrink-0"
    />
  );
}

function PredCard({ pred }: { pred: PredRow }) {
  const m = pred.matches;
  const isFinished = m.status === "FINISHED";
  const isLive = m.status === "LIVE";
  const revealPick = isFinished || isLive;

  const kickoffIso = m.match_date.replace(" ", "T").replace(/\+(\d{2})$/, "+$1:00");
  const kickoffDate = new Date(kickoffIso);
  const dateLabel = Number.isFinite(kickoffDate.getTime())
    ? kickoffDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";

  const exactMatch =
    isFinished &&
    pred.pred_home !== null &&
    m.score_home !== null &&
    pred.pred_home === m.score_home &&
    pred.pred_away === m.score_away;
  const correctOutcome = isFinished && !exactMatch && pred.points_won > 0;

  return (
    <li className="border-b border-ink-faint last:border-b-0 px-4 py-3">
      {/* Date + status */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] text-ink-muted">{dateLabel}</span>
        {isFinished ? (
          <span className="font-mono text-[10px] tracking-widest uppercase bg-ink text-parchment px-1.5 py-0.5">
            FT
          </span>
        ) : isLive ? (
          <span className="font-mono text-[10px] tracking-widest uppercase bg-live text-white px-1.5 py-0.5 animate-pulse">
            Live
          </span>
        ) : (
          <span className="font-mono text-[10px] tracking-widest uppercase border border-ink-faint text-ink-muted px-1.5 py-0.5">
            Locked
          </span>
        )}
      </div>

      {/* Teams + score */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <TeamFlag name={m.team_home} />
          <span className="font-semibold text-xs text-ink truncate">{m.team_home}</span>
        </div>

        <div className="flex-shrink-0 font-mono font-black text-sm tabular text-center">
          {isFinished && m.score_home !== null
            ? `${m.score_home} — ${m.score_away}`
            : <span className="text-ink-faint text-xs font-normal">vs</span>}
        </div>

        <div className="flex items-center gap-1.5 justify-end min-w-0">
          <span className="font-semibold text-xs text-ink truncate text-right">{m.team_away}</span>
          <TeamFlag name={m.team_away} />
        </div>
      </div>

      {/* Prediction row */}
      <div className="mt-2 pt-2 border-t border-ink-faint/60 flex items-center justify-between min-h-[20px]">
        {revealPick && pred.pred_home !== null ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] text-ink-muted">pick</span>
              <span className="font-mono text-xs font-semibold tabular">
                {pred.pred_home} — {pred.pred_away}
              </span>
              {exactMatch && (
                <span className="font-mono text-[9px] tracking-widest uppercase bg-open text-white px-1 py-0.5">
                  Exact
                </span>
              )}
              {correctOutcome && (
                <span className="font-mono text-[9px] tracking-widest uppercase border border-open text-open px-1 py-0.5">
                  Correct
                </span>
              )}
            </div>
            {isFinished && (
              <span
                className={`font-mono font-black text-xs ${
                  pred.points_won > 0 ? "text-open" : "text-ink-muted"
                }`}
              >
                {pred.points_won > 0 ? `+${pred.points_won}` : "0"} pts
              </span>
            )}
          </>
        ) : (
          <span className="font-mono text-[10px] text-ink-faint italic">
            hidden until kick-off
          </span>
        )}
      </div>
    </li>
  );
}

export default function PlayerDrawer({
  playerId,
  rank,
  onClose,
}: {
  playerId: string | null;
  rank: number | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!playerId) { setData(null); return; }
    setLoading(true);
    setData(null);
    fetch(`/api/players/${playerId}/predictions`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [playerId]);

  useEffect(() => {
    if (!playerId) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [playerId, onClose]);

  const profile = data?.profile ?? null;
  const predictions = [...(data?.predictions ?? [])].sort((a, b) => {
    return new Date(a.matches.match_date).getTime() - new Date(b.matches.match_date).getTime();
  });

  const countryMeta = profile?.country
    ? COUNTRIES.find((c) => c.name === profile.country) ?? null
    : null;

  const scored = predictions.filter((p) => p.matches.status === "FINISHED" && p.is_calculated);
  const totalPts = profile?.total_points ?? 0;
  const exactCount = scored.filter(
    (p) =>
      p.pred_home !== null &&
      p.pred_home === p.matches.score_home &&
      p.pred_away === p.matches.score_away
  ).length;

  return (
    <AnimatePresence>
      {!!playerId && (
        <>
          {/* Backdrop */}
          <motion.div
            key="bd"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.45 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-ink cursor-pointer"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.aside
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-sm bg-parchment border-l-2 border-ink flex flex-col"
          >
            {/* Top bar */}
            <div className="flex items-center justify-between border-b-2 border-ink px-4 py-3 bg-surface flex-shrink-0">
              <span className="font-mono text-[11px] tracking-widest uppercase text-ink-muted">
                Predictions
              </span>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center border-2 border-ink font-bold text-base leading-none hover:bg-ink hover:text-parchment transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Player header */}
            <div className="border-b-2 border-ink px-4 py-4 flex-shrink-0">
              {!profile ? (
                <div className="h-11 flex items-center">
                  <span className="font-mono text-xs text-ink-muted animate-pulse">Loading…</span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {rank !== null && (
                    <span className="font-mono font-black text-xl text-ink-faint flex-shrink-0 w-8 text-center">
                      #{rank + 1}
                    </span>
                  )}

                  {profile.avatar_url ? (
                    <Image
                      src={profile.avatar_url}
                      alt={profile.username}
                      width={44}
                      height={44}
                      className="border-2 border-ink shadow-brutal-sm flex-shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 border-2 border-ink bg-ink-faint flex items-center justify-center font-bold text-lg flex-shrink-0">
                      {profile.username[0].toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-sm text-ink">{profile.username}</span>
                      {countryMeta && (
                        <Image
                          src={flagUrlByCode(countryMeta.code)}
                          alt={countryMeta.name}
                          width={16}
                          height={11}
                          className="border border-ink-faint flex-shrink-0"
                          title={countryMeta.name}
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono font-black text-base tabular">
                        {totalPts.toLocaleString()}
                      </span>
                      <span className="font-mono text-[10px] text-ink-muted">pts</span>
                      {scored.length > 0 && (
                        <span className="font-mono text-[10px] text-ink-muted border border-ink-faint px-1.5 py-0.5">
                          {exactCount} exact / {scored.length} played
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Predictions list */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center font-mono text-xs text-ink-muted animate-pulse">
                  Loading predictions…
                </div>
              ) : predictions.length === 0 ? (
                <div className="p-8 text-center font-mono text-xs text-ink-muted">
                  No predictions submitted yet.
                </div>
              ) : (
                <ol>
                  {predictions.map((pred) => (
                    <PredCard key={pred.match_id} pred={pred} />
                  ))}
                </ol>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
