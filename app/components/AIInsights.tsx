"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getMatchAnalysis, type FreeAnalysis } from "@/app/actions/analysis";
import { postWithX402 } from "@/lib/x402/client";
import type { PremiumAnalysis } from "@/lib/analytics/premium";

const short = (name: string) => name.split(" ")[0];
const pct = (x: number) => `${Math.round(x * 100)}%`;
const priceLabel = process.env.NEXT_PUBLIC_X402_PRICE_LABEL || "0.01 USDC";

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

/** The deep report unlocked after an x402 payment. */
function PremiumReport({
  premium,
  teamHome,
  teamAway,
}: {
  premium: PremiumAnalysis;
  teamHome: string;
  teamAway: string;
}) {
  const maxP = premium.scorelineMap[0]?.p || 1;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-2 border-2 border-open bg-open/5 px-3 py-2.5"
    >
      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-open">
        ✓ Deep analysis unlocked
      </span>

      {/* Expected goals + goals markets */}
      <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
        <div className="flex justify-between border border-ink-faint px-2 py-1">
          <span className="text-ink-muted">xG {short(teamHome)}</span>
          <span className="font-bold tabular">{premium.xg.home.toFixed(2)}</span>
        </div>
        <div className="flex justify-between border border-ink-faint px-2 py-1">
          <span className="text-ink-muted">xG {short(teamAway)}</span>
          <span className="font-bold tabular">{premium.xg.away.toFixed(2)}</span>
        </div>
        <div className="flex justify-between border border-ink-faint px-2 py-1">
          <span className="text-ink-muted">Over 2.5</span>
          <span className="font-bold tabular">{pct(premium.markets.over2_5)}</span>
        </div>
        <div className="flex justify-between border border-ink-faint px-2 py-1">
          <span className="text-ink-muted">BTTS</span>
          <span className="font-bold tabular">{pct(premium.markets.btts)}</span>
        </div>
      </div>

      {/* Scoreline probability map */}
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[9px] uppercase tracking-widest text-ink-muted">
          Most likely scorelines
        </span>
        {premium.scorelineMap.slice(0, 5).map((s) => (
          <div key={`${s.home}-${s.away}`} className="flex items-center gap-2">
            <span className="w-8 shrink-0 font-mono text-[11px] font-bold tabular">
              {s.home}–{s.away}
            </span>
            <div className="h-3 flex-1 border border-ink-faint bg-parchment">
              <div
                className="h-full bg-ink"
                style={{ width: `${(s.p / maxP) * 100}%` }}
              />
            </div>
            <span className="w-9 shrink-0 text-right font-mono text-[10px] tabular text-ink-muted">
              {pct(s.p)}
            </span>
          </div>
        ))}
      </div>

      {/* Suggested stake */}
      {premium.stake ? (
        <div className="border-t border-open/40 pt-1.5 font-mono text-[10px]">
          <span className="font-bold uppercase tracking-wide text-open">
            Stake · {premium.stake.outcome} @ {premium.stake.odds.toFixed(2)}
          </span>
          <p className="text-ink-muted">{premium.stake.note}</p>
        </div>
      ) : (
        <p className="border-t border-open/40 pt-1.5 font-mono text-[10px] text-ink-muted">
          No positive-edge bet — sit this one out.
        </p>
      )}
    </motion.div>
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

  // Premium (x402-gated) state.
  const [premium, setPremium] = useState<PremiumAnalysis | null>(null);
  const [premiumErr, setPremiumErr] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const unlockPremium = async () => {
    setPaying(true);
    setPremiumErr(null);
    const res = await postWithX402<{ premium: PremiumAnalysis }>(
      "/api/analysis/premium",
      { matchId },
    );
    if (res.error) setPremiumErr(res.error);
    else if (res.data) setPremium(res.data.premium);
    setPaying(false);
  };

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

                  {/* Premium — x402-gated deep analysis */}
                  {premium ? (
                    <PremiumReport premium={premium} teamHome={teamHome} teamAway={teamAway} />
                  ) : (
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={unlockPremium}
                        disabled={paying}
                        className="flex w-full items-center justify-between border-2 border-ink bg-parchment px-2 py-1.5 shadow-brutal-sm transition-colors hover:bg-ink hover:text-parchment disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wide">
                          {paying ? "Processing payment…" : "🔒 Unlock deep analysis"}
                        </span>
                        <span className="font-mono text-[9px] font-bold uppercase tracking-widest">
                          {paying ? "x402" : `Pay ${priceLabel}`}
                        </span>
                      </button>
                      {premiumErr && (
                        <p className="font-mono text-[10px] text-accent">{premiumErr}</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
