"use client";

import Image from "next/image";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { placeStake } from "@/app/actions/market";
import { quotePayout, impliedProbabilities, decimalOdds } from "@/lib/market/math";
import { fromAtomic, toAtomic } from "@/lib/market/format";
import { COUNTRIES, flagUrlByCode } from "@/lib/countries";
import SportChip from "@/app/components/SportChip";
import type { MarketVM } from "@/lib/market/read";
import type { MarketDenom } from "@/lib/market/config";
import type { MarketOutcome } from "@/lib/supabase/types";

const OUTCOMES: readonly MarketOutcome[] = ["home", "draw", "away"];
const ZERO = BigInt(0);

const FLAG_CODE_BY_NAME = new Map(COUNTRIES.map((c) => [c.name, c.code] as const));
function flagFor(team: string): string | null {
  const code = FLAG_CODE_BY_NAME.get(team);
  return code ? flagUrlByCode(code, 160) : null; // hi-res for the 44px chip
}
function poolsOf(m: MarketVM): Record<MarketOutcome, bigint> {
  return { home: BigInt(m.pools.home), draw: BigInt(m.pools.draw), away: BigInt(m.pools.away) };
}

/* ---- tiny inline icons ---- */
const I = { cn: "shrink-0" };
const People = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={p.className} {...I}><path d="M9 11a3 3 0 100-6 3 3 0 000 6zm0 2c-2.7 0-6 1.34-6 4v2h12v-2c0-2.66-3.3-4-6-4zm7.5 0c-.4 0-.83.03-1.28.09 1.4.98 2.28 2.32 2.28 3.91v2H22v-2c0-2.32-2.9-3.9-5.5-4zM16 11a3 3 0 100-6 3 3 0 000 6z" /></svg>
);
const Bars = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={p.className} {...I}><path d="M4 13h3v7H4zM10.5 9h3v11h-3zM17 5h3v15h-3z" /></svg>
);
const Ticket = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={p.className} {...I}><path d="M3 7a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 000-4V7zm6 1v8h1.5V8H9z" /></svg>
);
const Drop = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={p.className} {...I}><path d="M12 3s6 6.5 6 10.5A6 6 0 016 13.5C6 9.5 12 3 12 3z" /></svg>
);
const Target = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={p.className} {...I}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></svg>
);
const Star = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={p.className} {...I}><path d="M12 2l2.9 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 7.1-1.01z" /></svg>
);
const Handshake = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={p.className} {...I}>
    <path d="m11 17 2 2a1 1 0 1 0 3-3" />
    <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
    <path d="m21 3 1 11h-2" />
    <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
    <path d="M3 4h8" />
  </svg>
);
// USDC coin mark (blue circle, white $ + arcs) — its own colours, not currentColor.
const UsdcIcon = (p: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={p.className} {...I}>
    <circle cx="16" cy="16" r="16" fill="#2775CA" />
    <path fill="#fff" d="M20.5 18.8c0-2.35-1.4-3.16-4.2-3.5-2-.27-2.4-.8-2.4-1.72 0-.92.66-1.5 1.98-1.5 1.19 0 1.85.4 2.17 1.4.06.18.24.3.42.3h.95c.24 0 .42-.18.42-.42v-.06c-.3-1.4-1.42-2.48-2.86-2.62V9.2c0-.24-.18-.42-.48-.48h-.89c-.24 0-.42.18-.48.48v1.2c-2 .27-3.27 1.6-3.27 3.28 0 2.23 1.36 3.1 4.16 3.44 1.87.3 2.47.72 2.47 1.75 0 1.03-.9 1.75-2.11 1.75-1.66 0-2.23-.72-2.42-1.7-.06-.24-.24-.36-.42-.36h-1.01c-.24 0-.42.18-.42.42v.06c.3 1.57 1.3 2.7 3.51 3.01v1.2c0 .24.18.42.48.48h.89c.24 0 .42-.18.48-.48v-1.2c2-.3 3.33-1.7 3.33-3.46z" />
    <path fill="#fff" d="M12.7 24.55c-3.27-1.2-5.4-4.35-5.4-7.85s2.13-6.65 5.4-7.85c.3-.12.42-.3.42-.6v-.83c0-.24-.12-.42-.42-.48-.06 0-.18 0-.24.06C8.4 8.15 5.7 11.85 5.7 16.7s2.7 8.55 6.76 9.86c.3.12.54 0 .54-.3v-.83c0-.18-.12-.42-.3-.48zm6.6-17.75c-.3-.12-.54 0-.54.3v.83c0 .24.12.42.3.54 3.27 1.2 5.4 4.35 5.4 7.85s-2.13 6.65-5.4 7.85c-.3.12-.42.3-.42.6v.83c0 .24.12.42.42.48.06 0 .18 0 .24-.06 4.06-1.3 6.76-5 6.76-9.85s-2.7-8.56-6.76-9.87z" />
  </svg>
);

function OutcomeIcon({ flag, isDraw }: { flag: string | null; isDraw: boolean }) {
  return (
    <span className="shrink-0 w-11 h-11 rounded-xl overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center">
      {flag ? (
        <Image src={flag} alt="" width={88} height={88} className="w-full h-full object-cover" />
      ) : isDraw ? (
        <Handshake className="w-6 h-6 text-white/55" />
      ) : (
        <span className="w-4 h-4 rounded-full bg-white/15" />
      )}
    </span>
  );
}

export default function MarketCard({
  market,
  denom,
  balance,
  connected = true,
}: {
  market: MarketVM;
  denom: MarketDenom;
  balance: string;
  connected?: boolean;
}) {
  const router = useRouter();
  const p = poolsOf(market);
  const prob = impliedProbabilities(p);
  const locked = market.locked;
  const settled = market.status === "settled";
  const bal = BigInt(balance);
  const fee = market.feeBps;

  const outcomes: readonly MarketOutcome[] = market.hasDraw ? OUTCOMES : ["home", "away"];
  const totalPool = outcomes.reduce((s, o) => s + p[o], ZERO);
  const totalBets = outcomes.reduce((s, o) => s + market.stakeCounts[o], 0);
  const favorite = outcomes.reduce((a, b) => (prob[b] > prob[a] ? b : a), outcomes[0]);
  const hasAction = totalPool > ZERO;

  const [pending, startTransition] = useTransition();
  const [pick, setPick] = useState<MarketOutcome>(favorite);
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const label: Record<MarketOutcome, string> = { home: market.teamHome, draw: "Draw", away: market.teamAway };
  const flagByOutcome: Record<MarketOutcome, string | null> = {
    home: flagFor(market.teamHome), draw: null, away: flagFor(market.teamAway),
  };

  // Payout quote for the current pick + amount.
  let quoteGross: bigint | null = null;
  let odds = decimalOdds(p, pick, fee);
  let amountErr: string | null = null;
  if (amount.trim()) {
    try {
      const atomic = toAtomic(amount.trim(), denom.decimals);
      if (atomic > bal) amountErr = "Exceeds balance";
      else if (atomic <= ZERO) amountErr = "Enter an amount";
      else {
        const q = quotePayout(p, pick, atomic, fee);
        quoteGross = q.gross;
        odds = q.effectiveOdds;
      }
    } catch {
      amountErr = `Max ${denom.decimals} decimals`;
    }
  }

  function submit() {
    if (!amount.trim() || amountErr) return;
    setMsg(null);
    startTransition(async () => {
      const res = await placeStake(market.id, pick, amount.trim());
      if (res.ok) {
        setMsg({ kind: "ok", text: "Bet placed." });
        setAmount("");
        router.refresh();
      } else {
        setMsg({ kind: "err", text: res.error ?? "Failed to place bet." });
      }
    });
  }

  const dt = new Date(market.locksAt);
  const when = `${dt.toLocaleDateString(undefined, { day: "numeric", month: "short" })} · ${dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  const statusText = settled ? `Full time ${market.scoreHome}–${market.scoreAway}` : locked ? "Locked" : when;
  const statusWord = settled ? "SETTLED" : locked ? "LOCKED" : "OPEN";
  const statusColor = settled ? "text-white/50" : locked ? "text-live" : "text-open";
  const statusDot = settled ? "bg-white/40" : locked ? "bg-live" : "bg-open";

  return (
    <div className="glass-card rounded-3xl p-5 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <SportChip category={market.category} size={34} />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-white/70 truncate">
            {market.category}
          </span>
          {market.matchStatus === "LIVE" && (
            <span className="shrink-0 flex items-center gap-1.5 rounded-full border border-open/40 bg-open/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-open">
              Live <span className="h-1.5 w-1.5 rounded-full bg-open" />
            </span>
          )}
        </div>
        {market.league && <span className="text-[12px] text-white/40 truncate shrink-0 max-w-[45%] text-right">{market.league}</span>}
      </div>

      {/* Title + status */}
      <div>
        <h3 className="font-black text-3xl sm:text-4xl leading-none tracking-tight">
          {market.teamHome} <span className="text-inj-soft">vs</span> {market.teamAway}
        </h3>
        <p className="mt-2.5 flex items-center gap-2 font-mono text-[12px]">
          <span className={`h-2 w-2 rounded-full ${statusDot}`} />
          <span className={`font-bold uppercase tracking-wider ${statusColor}`}>{statusWord}</span>
          <span className="text-white/30">·</span>
          <span className="text-white/50">{statusText}</span>
        </p>
      </div>

      {/* Outcomes */}
      <div className="flex flex-col gap-2.5">
        {outcomes.map((o) => {
          const isPick = pick === o && !locked;
          const isWinner = settled && market.winningOutcome === o;
          const isFav = hasAction && o === favorite && !settled;
          const pct = Math.round(prob[o] * 100);
          const backers = market.stakeCounts[o];
          // Raised glass layer for every row; selection gets a subtle indigo
          // border, the winner a green one. "Most backed" = badge only.
          const rowBorder = isWinner ? "border-open/45" : isPick ? "border-inj/55" : "border-white/12";
          return (
            <button
              key={o}
              type="button"
              disabled={locked}
              onClick={() => setPick(o)}
              className={`glass-raise text-left rounded-2xl border px-4 py-3.5 transition-[filter] ${locked ? "cursor-default" : "cursor-pointer hover:brightness-125"} ${rowBorder}`}
            >
              <div className="flex items-center gap-3">
                <OutcomeIcon flag={flagByOutcome[o]} isDraw={o === "draw"} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg truncate">{label[o]}</span>
                    {isWinner ? (
                      <span className="shrink-0 flex items-center gap-1 rounded-full border border-open/50 bg-open/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-open">Won</span>
                    ) : isFav ? (
                      <span className="shrink-0 flex items-center gap-1 rounded-full border border-inj/50 bg-inj/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-inj-soft">
                        <Star className="w-2.5 h-2.5" /> Most backed
                      </span>
                    ) : null}
                  </div>
                  {/* probability bar */}
                  <div className="mt-2 h-1.5 w-[70%] max-w-[240px] rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isWinner ? "bg-open" : "bg-inj"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-black text-2xl tabular leading-none">{pct}%</div>
                  <div className="mt-1.5 flex items-center justify-end gap-1 text-white/40">
                    <People className="w-3.5 h-3.5" />
                    <span className="font-mono text-[11px] tabular">{backers.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Stats */}
      <div className="glass-raise grid grid-cols-3 rounded-2xl border border-white/10 divide-x divide-white/10">
        <Stat icon={<Bars className="w-4 h-4" />} value={`${fromAtomic(totalPool, denom.decimals, 0)} ${denom.symbol}`} label="Volume" />
        <Stat icon={<Ticket className="w-4 h-4" />} value={totalBets.toLocaleString()} label="Total bets" />
        <Stat icon={<Drop className="w-4 h-4" />} value={`${(fee / 100).toFixed(fee % 100 === 0 ? 0 : 1)}%`} label="Fee" />
      </div>

      {/* Bet slip / CTA */}
      {settled ? null : locked ? (
        <p className="glass-raise rounded-2xl border border-white/10 px-4 py-3 font-mono text-[11px] text-white/50 text-center">
          Betting is closed — awaiting the result.
        </p>
      ) : !connected ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="rounded-2xl border border-inj/40 bg-inj/10 px-4 py-3.5 font-bold text-sm uppercase tracking-wide text-inj-soft hover:bg-inj/15 transition-colors"
        >
          Connect wallet to bet
        </button>
      ) : (
        <>
          <div className="glass-raise grid grid-cols-[1fr_auto_1fr] gap-4 items-center rounded-2xl border border-white/10 p-4">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">Amount ({denom.symbol})</p>
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 pl-2 pr-1.5 py-1.5">
                <UsdcIcon className="shrink-0 h-7 w-7" />
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="flex-1 min-w-0 bg-transparent font-bold text-lg text-white placeholder:text-white/30 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setAmount(fromAtomic(bal, denom.decimals))}
                  className="shrink-0 rounded-lg border border-white/15 px-2 py-1 font-mono text-[10px] font-bold uppercase text-white/70 hover:bg-white/10 transition-colors"
                >
                  Max
                </button>
              </div>
              <p className="mt-1.5 font-mono text-[10px] text-white/40">
                Balance: {fromAtomic(bal, denom.decimals, 2)} {denom.symbol}
              </p>
            </div>

            <div className="self-stretch w-px bg-white/10" />

            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">Potential payout</p>
              <p className={`mt-2 font-black text-2xl tabular leading-none ${amountErr ? "text-red-400" : ""}`}>
                {amountErr ? "—" : quoteGross !== null ? `${fromAtomic(quoteGross, denom.decimals, 2)} ${denom.symbol}` : "—"}
              </p>
              <p className="mt-1.5 font-mono text-[12px] font-bold text-inj-soft">
                {odds > 0 ? `${odds.toFixed(2)}x` : "—"}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={pending || !amount.trim() || !!amountErr}
            onClick={submit}
            className="group relative flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-inj-soft to-inj text-white px-5 py-4 font-black text-base uppercase tracking-wide shadow-[0_14px_36px_-8px_rgba(77,61,255,0.75),0_0_28px_-4px_rgba(110,95,255,0.55),inset_0_1px_0_rgba(255,255,255,0.35)] hover:brightness-110 hover:shadow-[0_18px_44px_-8px_rgba(110,95,255,0.9),0_0_36px_-2px_rgba(110,95,255,0.7),inset_0_1px_0_rgba(255,255,255,0.4)] disabled:opacity-40 disabled:shadow-none transition-all"
          >
            <span className="absolute left-4 h-8 w-8 rounded-full bg-white/15 border border-white/20 flex items-center justify-center">
              <Target className="w-4 h-4" />
            </span>
            {pending ? "Placing…" : `Bet on ${label[pick]}`}
            <span className="absolute right-5 text-white/80">›</span>
          </button>

          {(amountErr || msg) && (
            <p className={`-mt-2 font-mono text-[11px] text-center ${msg?.kind === "ok" ? "text-open" : "text-red-400"}`}>
              {amountErr ?? msg?.text}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="px-3 py-3 flex flex-col items-center text-center gap-1">
      <div className="flex items-center gap-1.5">
        <span className="text-inj-soft">{icon}</span>
        <span className="font-bold text-sm tabular">{value}</span>
      </div>
      <span className="font-mono text-[9px] uppercase tracking-widest text-white/40">{label}</span>
    </div>
  );
}
