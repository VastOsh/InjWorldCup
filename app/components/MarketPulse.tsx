"use client";

import { useEffect, useState } from "react";

// A gently "living" parimutuel snapshot for the landing hero: the odds drift the
// way a real crowd nudges them, so the front door demonstrates the product
// instead of just decorating it. Purely illustrative — no real data — and it
// freezes on the first frame under prefers-reduced-motion.
type Frame = { pool: number; odds: readonly number[] };
const FRAMES: readonly Frame[] = [
  { pool: 12480, odds: [45, 20, 35] },
  { pool: 12610, odds: [48, 19, 33] },
  { pool: 12735, odds: [43, 21, 36] },
  { pool: 12890, odds: [50, 18, 32] },
];

const ROWS = ["Spain", "Draw", "Brazil"] as const;

export default function MarketPulse() {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((v) => (v + 1) % FRAMES.length), 2600);
    return () => clearInterval(id);
  }, []);

  const frame = FRAMES[i];
  const favIdx = frame.odds.indexOf(Math.max(...frame.odds));

  return (
    <div className="glass rounded-3xl p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/50">
          Live market
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-open">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-open opacity-75 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-open" />
          </span>
          Open
        </span>
      </div>

      <p className="mt-3 font-black text-lg text-white">
        Spain <span className="text-white/40 font-bold">v</span> Brazil
      </p>
      <p className="font-mono text-[10px] text-white/50 tabular">
        {frame.pool.toLocaleString()} USDC pool · 27 bets
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {ROWS.map((label, r) => {
          const pct = frame.odds[r];
          const fav = r === favIdx;
          return (
            <div key={label} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white/90">{label}</span>
                <span
                  className={`font-mono text-sm tabular transition-colors duration-500 ${
                    fav ? "text-inj-soft" : "text-white/50"
                  }`}
                >
                  {pct}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width,background-color] duration-1000 ease-out ${
                    fav ? "bg-inj" : "bg-white/25"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 font-mono text-[10px] text-white/40 leading-relaxed">
        Odds move with the crowd. Winners split the pot pro-rata.
      </p>
    </div>
  );
}
