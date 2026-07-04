"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getMatchAnalysis, type FreeAnalysis } from "@/app/actions/analysis";

const short = (name: string) => name.split(" ")[0];
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** One outcome row: model bar (solid) with the market probability as a tick. */
function ProbRow({
  label,
  model,
  market,
  highlight,
}: {
  label: string;
  model: number;
  market: number;
  highlight: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 truncate font-mono text-[10px] uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      <div className="relative h-4 flex-1 border border-ink-faint bg-parchment">
        {/* model probability — solid fill */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(model, 1) * 100}%` }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className={`h-full ${highlight ? "bg-open" : "bg-ink"}`}
        />
        {/* market implied probability — vertical tick marker */}
        <div
          className="absolute top-[-2px] bottom-[-2px] w-px bg-accent"
          style={{ left: `${Math.min(market, 1) * 100}%` }}
          title={`Market ${pct(market)}`}
        />
      </div>
      <span className="w-9 shrink-0 text-right font-mono text-[11px] font-bold tabular text-ink">
        {pct(model)}
      </span>
    </div>
  );
}

export default function AIInsights({
  matchId,
  teamHome,
  teamAway,
}: {
  matchId: number;
  teamHome: string;
  teamAway: string;
}) {
  const [open, setOpen] = useState(false);
  const [analysis, setAnalysis] = useState<FreeAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !analysis && !isPending) {
      setError(null);
      startTransition(async () => {
        const res = await getMatchAnalysis(matchId);
        if (res.error) setError(res.error);
        else if (res.analysis) setAnalysis(res.analysis);
      });
    }
  };

  const valueLabel =
    analysis?.value &&
    (analysis.value.outcome === "home"
      ? short(teamHome)
      : analysis.value.outcome === "away"
        ? short(teamAway)
        : "Draw");

  return (
    <div className="border-t-2 border-ink-faint pt-3">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between font-mono text-[10px] font-bold uppercase tracking-widest text-ink-muted transition-colors hover:text-ink"
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden>🔮</span> AI Insights
        </span>
        <span className="text-ink-faint">{open ? "–" : "+"}</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 pt-3">
              {isPending && (
                <p className="font-mono text-[11px] text-ink-muted">Modelling…</p>
              )}
              {error && (
                <p className="font-mono text-[11px] text-accent">{error}</p>
              )}

              {analysis && (
                <>
                  {/* Predicted scoreline */}
                  <div className="flex items-center justify-center gap-3">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                      Model predicts
                    </span>
                    <span className="font-mono text-lg font-black tabular text-ink">
                      {analysis.predictedScore.home}–{analysis.predictedScore.away}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                      · {pct(analysis.confidence)} conf.
                    </span>
                  </div>

                  {/* Model vs market bars */}
                  <div className="flex flex-col gap-1.5">
                    <ProbRow
                      label={short(teamHome)}
                      model={analysis.modelProbs.home}
                      market={analysis.marketProbs.home}
                      highlight={analysis.value?.outcome === "home"}
                    />
                    <ProbRow
                      label="Draw"
                      model={analysis.modelProbs.draw}
                      market={analysis.marketProbs.draw}
                      highlight={analysis.value?.outcome === "draw"}
                    />
                    <ProbRow
                      label={short(teamAway)}
                      model={analysis.modelProbs.away}
                      market={analysis.marketProbs.away}
                      highlight={analysis.value?.outcome === "away"}
                    />
                    <p className="font-mono text-[9px] text-ink-faint">
                      bar = model · <span className="text-accent">|</span> = market (odds-implied)
                    </p>
                  </div>

                  {/* Value flag */}
                  {analysis.value ? (
                    <div className="flex items-center justify-center gap-1.5 border-2 border-open bg-open/10 px-2 py-1">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-open">
                        Value · {valueLabel} +{pct(analysis.value.edge)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-center font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                      Model in line with the market
                    </p>
                  )}

                  {/* Premium teaser — wired to x402 next */}
                  <div className="flex items-center justify-between border border-dashed border-ink-faint px-2 py-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">
                      🔒 Deep analysis · xG, scoreline map, stake
                    </span>
                    <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-ink-faint">
                      USDC soon
                    </span>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
