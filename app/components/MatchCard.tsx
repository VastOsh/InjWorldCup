"use client";

import { useEffect, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { savePrediction } from "@/app/actions/predictions";
import AIInsights from "@/app/components/AIInsights";
import { flagUrl } from "@/lib/teamFlags";
import type { Database } from "@/lib/supabase/types";

type Match = Database["public"]["Tables"]["matches"]["Row"];
type Prediction = Database["public"]["Tables"]["predictions"]["Row"] | null;

function TeamFlag({ name }: { name: string }) {
  const url = flagUrl(name);
  if (!url) return null;
  return (
    <Image
      src={url}
      alt={`${name} flag`}
      width={20}
      height={14}
      className="border border-ink-faint flex-shrink-0"
    />
  );
}

function StatusBadge({ status, locked }: { status: Match["status"]; locked: boolean }) {
  if (status === "FINISHED") {
    return (
      <span className="font-mono text-[10px] tracking-widest uppercase bg-ink text-parchment px-2 py-0.5">
        Finished
      </span>
    );
  }
  if (status === "LIVE") {
    return (
      <span className="font-mono text-[10px] tracking-widest uppercase bg-live text-white px-2 py-0.5 animate-pulse">
        Live
      </span>
    );
  }
  if (locked) {
    return (
      <span className="font-mono text-[10px] tracking-widest uppercase border border-ink-muted text-ink-muted px-2 py-0.5">
        Locked
      </span>
    );
  }
  return (
    <span className="font-mono text-[10px] tracking-widest uppercase bg-open text-white px-2 py-0.5">
      Open
    </span>
  );
}

function MultiplierBadge({ value, label }: { value: number; label?: string }) {
  const flat = Number(value) === 1.0;
  return (
    <span className={`inline-flex items-center font-mono text-[10px] font-bold px-1.5 py-0.5 border ${
      flat
        ? "border-ink-faint text-ink-muted"
        : "border-ink bg-ink text-parchment shadow-brutal-sm"
    }`}>
      ×{Number(value).toFixed(2)}{label && <span className="ml-0.5 opacity-60">{label}</span>}
    </span>
  );
}

function ScoreInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <motion.input
      type="number"
      min={0}
      max={20}
      value={value}
      onChange={(e) => onChange(Math.max(0, Math.min(20, Number(e.target.value))))}
      disabled={disabled}
      whileFocus={{ scale: 1.06 }}
      transition={{ duration: 0.12 }}
      className="w-12 h-12 border-2 border-ink bg-surface text-center font-mono text-xl font-bold text-ink shadow-brutal-sm focus:outline-none focus:border-accent disabled:border-ink-faint disabled:text-ink-faint disabled:shadow-none tabular"
    />
  );
}

export default function MatchCard({
  match,
  prediction,
  initialLocked,
}: {
  match: Match;
  prediction: Prediction;
  initialLocked: boolean;
}) {
  const isKnockout = match.round !== null;

  const [predHome, setPredHome] = useState(prediction?.pred_home ?? 0);
  const [predAway, setPredAway] = useState(prediction?.pred_away ?? 0);
  const [predAdvance, setPredAdvance] = useState<"home" | "away" | null>(
    prediction?.pred_advance ?? null,
  );
  const [saved, setSaved] = useState(!!prediction);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // initialLocked is computed server-side (reliable). The effect only schedules
  // the real-time flip when a match goes live while the page is open.
  const [locked, setLocked] = useState(initialLocked);

  useEffect(() => {
    if (initialLocked) return; // already locked, no timer needed
    const iso = match.match_date.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
    const kickoff = new Date(iso).getTime();
    if (!Number.isFinite(kickoff)) return;
    const msLeft = kickoff - Date.now();
    if (msLeft <= 0) { setLocked(true); return; }
    if (msLeft > 2_147_483_647) return; // beyond 32-bit setTimeout limit — stays open
    const t = setTimeout(() => setLocked(true), msLeft);
    return () => clearTimeout(t);
  }, [match.match_date, initialLocked]);

  const handleSave = () => {
    setError(null);
    if (isKnockout && predAdvance === null) {
      setError("Pick which team advances.");
      return;
    }
    startTransition(async () => {
      const result = await savePrediction(match.id, predHome, predAway, predAdvance);
      if (result.error) setError(result.error);
      else setSaved(true);
    });
  };

  const [kickoffLabel, setKickoffLabel] = useState('');
  useEffect(() => {
    const iso = match.match_date.replace(' ', 'T').replace(/\+(\d{2})$/, '+$1:00');
    const d = new Date(iso);
    setKickoffLabel(
      Number.isFinite(d.getTime())
        ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZoneName: "short" })
        : match.match_date
    );
  }, [match.match_date]);

  const isFinished = match.status === "FINISHED";

  // Knockout tiebreaker display helpers.
  const advanceName =
    match.advance_winner === "home" ? match.team_home
    : match.advance_winner === "away" ? match.team_away
    : null;
  const wasLevel =
    match.score_home !== null && match.score_home === match.score_away;
  const hasPens = match.pen_home !== null && match.pen_away !== null;
  // The advance pick only earns points on a level result; only judge it then.
  const advanceCorrect =
    isKnockout && wasLevel && prediction?.pred_advance != null &&
    prediction.pred_advance === match.advance_winner;

  // What outcome does the current prediction imply?
  let outcomeLabel = "";
  if (predHome > predAway) outcomeLabel = `${match.team_home} win`;
  else if (predAway > predHome) outcomeLabel = `${match.team_away} win`;
  else outcomeLabel = "Draw";

  // Did prediction match the result?
  const exactMatch =
    isFinished &&
    prediction &&
    prediction.pred_home === match.score_home &&
    prediction.pred_away === match.score_away;
  const correctOutcome =
    isFinished &&
    prediction &&
    !exactMatch &&
    prediction.points_won > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
      className="group border-2 border-ink bg-surface shadow-brutal hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-brutal-lg transition-[box-shadow,transform] duration-150"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b-2 border-ink px-4 py-2 bg-parchment">
        <StatusBadge status={match.status} locked={locked} />
        <span className="font-mono text-[11px] text-ink-muted tabular">{kickoffLabel}</span>
      </div>

      {/* Match body */}
      <div className="px-4 py-5 flex flex-col gap-4">

        {/* Teams + multipliers */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex flex-col gap-1.5 items-start">
            <div className="flex items-center gap-2">
              <TeamFlag name={match.team_home} />
              <p className="font-bold text-sm leading-tight tracking-tight">{match.team_home}</p>
            </div>
            <MultiplierBadge value={match.multiplier_home} />
          </div>
          <div className="flex flex-col items-center gap-1 px-1">
            <span className="font-mono text-xs text-ink-faint tracking-widest">VS</span>
            <MultiplierBadge value={match.multiplier_draw} label="D" />
          </div>
          <div className="flex flex-col gap-1.5 items-end">
            <div className="flex items-center gap-2">
              <p className="font-bold text-sm leading-tight tracking-tight">{match.team_away}</p>
              <TeamFlag name={match.team_away} />
            </div>
            <MultiplierBadge value={match.multiplier_away} />
          </div>
        </div>

        {/* Result or prediction input */}
        {isFinished && match.score_home !== null ? (
          <div className="flex flex-col gap-3">
            {/* Actual result */}
            <div className="flex items-center justify-center gap-3">
              <span className="font-mono text-3xl font-black text-ink tabular">{match.score_home}</span>
              <span className="font-mono text-ink-muted text-lg">—</span>
              <span className="font-mono text-3xl font-black text-ink tabular">{match.score_away}</span>
            </div>

            {/* Knockout: who advanced (+ penalty shootout score if any) */}
            {isKnockout && advanceName && (
              <p className="text-center font-mono text-[11px] tracking-wide text-ink-muted uppercase">
                ➜ {advanceName} advance
                {hasPens && wasLevel && (
                  <span className="ml-1 text-ink-faint">
                    ({match.pen_home}–{match.pen_away} pens)
                  </span>
                )}
              </p>
            )}

            {/* User's prediction outcome */}
            {prediction && (
              <div className="border-t-2 border-ink-faint pt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-muted">Your pick</span>
                  <span className="font-mono text-sm font-semibold tabular">
                    {prediction.pred_home}–{prediction.pred_away}
                  </span>
                  {exactMatch && (
                    <span className="font-mono text-[10px] tracking-widest uppercase bg-open text-white px-1.5 py-0.5">
                      Exact
                    </span>
                  )}
                  {correctOutcome && (
                    <span className="font-mono text-[10px] tracking-widest uppercase border border-open text-open px-1.5 py-0.5">
                      Correct
                    </span>
                  )}
                  {isKnockout && wasLevel && prediction.pred_advance != null && (
                    <span className={`font-mono text-[10px] tracking-widest uppercase px-1.5 py-0.5 ${
                      advanceCorrect ? "bg-open text-white" : "border border-ink-muted text-ink-muted"
                    }`}>
                      {advanceCorrect ? "Advance ✓" : "Advance ✗"}
                    </span>
                  )}
                </div>
                <span className="font-mono font-black text-sm">
                  {prediction.points_won > 0
                    ? <span className="text-open">+{prediction.points_won} pts</span>
                    : <span className="text-ink-muted">0 pts</span>}
                </span>
              </div>
            )}
          </div>
        ) : (
          <AnimatePresence>
            <motion.div
              className="flex flex-col gap-3"
              animate={{ opacity: locked ? 0.45 : 1 }}
              transition={{ duration: 0.35 }}
            >
              {/* Score inputs */}
              <div className="flex items-center justify-center gap-3">
                <div className="flex flex-col items-center gap-1">
                  <ScoreInput value={predHome} onChange={(v) => { setPredHome(v); setSaved(false); }} disabled={locked || isPending} />
                  <span className="text-[10px] text-ink-muted font-mono truncate max-w-[52px] text-center">{match.team_home.split(" ")[0]}</span>
                </div>
                <span className="font-mono text-xl text-ink-faint mb-4">—</span>
                <div className="flex flex-col items-center gap-1">
                  <ScoreInput value={predAway} onChange={(v) => { setPredAway(v); setSaved(false); }} disabled={locked || isPending} />
                  <span className="text-[10px] text-ink-muted font-mono truncate max-w-[52px] text-center">{match.team_away.split(" ")[0]}</span>
                </div>
              </div>

              {/* Knockout: who advances if it goes to extra time / penalties */}
              {isKnockout && (
                <div className="flex flex-col gap-1.5 border-t-2 border-ink-faint pt-3">
                  <span className="text-center font-mono text-[10px] tracking-widest uppercase text-ink-muted">
                    If level, who advances?
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(["home", "away"] as const).map((side) => {
                      const selected = predAdvance === side;
                      const name = side === "home" ? match.team_home : match.team_away;
                      return (
                        <button
                          key={side}
                          type="button"
                          disabled={locked || isPending}
                          onClick={() => { setPredAdvance(side); setSaved(false); }}
                          className={`flex items-center justify-center gap-1.5 border-2 py-1.5 px-1 text-[11px] font-bold tracking-wide uppercase transition-colors disabled:cursor-not-allowed ${
                            selected
                              ? "border-ink bg-ink text-parchment shadow-brutal-sm"
                              : "border-ink-faint text-ink-muted hover:border-ink disabled:hover:border-ink-faint"
                          }`}
                        >
                          <TeamFlag name={name} />
                          <span className="truncate">{name.split(" ")[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Outcome label */}
              {!locked && (
                <motion.p
                  key={outcomeLabel}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center font-mono text-[11px] tracking-wide text-ink-muted uppercase"
                >
                  {outcomeLabel}
                </motion.p>
              )}

              {/* Submit */}
              {!locked && (
                <motion.button
                  onClick={handleSave}
                  disabled={isPending || saved || (isKnockout && predAdvance === null)}
                  whileTap={!isPending && !saved ? { x: 2, y: 2, boxShadow: "0px 0px 0px #0D0D0D" } : {}}
                  className="w-full border-2 border-ink bg-ink text-parchment py-2.5 text-xs font-bold tracking-widest uppercase shadow-brutal-sm transition-colors hover:bg-accent hover:border-accent disabled:bg-ink-faint disabled:border-ink-faint disabled:text-white disabled:shadow-none disabled:cursor-not-allowed"
                >
                  {isPending ? "Saving…" : saved ? "Saved ✓" : prediction ? "Update" : "Save Prediction"}
                </motion.button>
              )}
            </motion.div>
          </AnimatePresence>
        )}

        {error && (
          <p className="font-mono text-[11px] text-accent text-center">{error}</p>
        )}

        {/* AI match analytics — deterministic model vs market odds */}
        <AIInsights matchId={match.id} teamHome={match.team_home} teamAway={match.team_away} />
      </div>
    </motion.div>
  );
}
