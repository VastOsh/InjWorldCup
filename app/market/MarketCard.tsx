"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { placeStake } from "@/app/actions/market";
import { quotePayout, impliedProbabilities } from "@/lib/market/math";
import { fromAtomic, toAtomic } from "@/lib/market/format";
import { COUNTRIES, flagUrlByCode } from "@/lib/countries";
import type { MarketVM } from "@/lib/market/read";
import type { MarketDenom } from "@/lib/market/config";
import type { MarketOutcome } from "@/lib/supabase/types";

const OUTCOMES: readonly MarketOutcome[] = ["home", "draw", "away"];
const ZERO = BigInt(0);

// Team names on WC-style markets are countries → map to a flag (null otherwise,
// so non-country markets simply render without one).
const FLAG_CODE_BY_NAME = new Map(COUNTRIES.map((c) => [c.name, c.code] as const));
function flagFor(team: string): string | null {
  const code = FLAG_CODE_BY_NAME.get(team);
  return code ? flagUrlByCode(code) : null;
}

function pools(m: MarketVM): Record<MarketOutcome, bigint> {
  return { home: BigInt(m.pools.home), draw: BigInt(m.pools.draw), away: BigInt(m.pools.away) };
}

function Flag({ src, size = 18 }: { src: string; size?: number }) {
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={Math.round((size * 3) / 4)}
      className="shrink-0 border border-ink-faint"
    />
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
  const [pending, startTransition] = useTransition();
  const [pick, setPick] = useState<MarketOutcome | null>(null);
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const p = pools(market);
  const prob = impliedProbabilities(p);
  const locked = market.locked;
  const settled = market.status === "settled";
  const bal = BigInt(balance);

  const totalPool = p.home + p.draw + p.away;
  const totalBets = market.stakeCounts.home + market.stakeCounts.draw + market.stakeCounts.away;
  const favorite = OUTCOMES.reduce((a, b) => (prob[b] > prob[a] ? b : a), "home" as MarketOutcome);
  const hasAction = totalPool > ZERO;

  const label: Record<MarketOutcome, string> = {
    home: market.teamHome,
    draw: "Draw",
    away: market.teamAway,
  };
  const flagByOutcome: Record<MarketOutcome, string | null> = {
    home: flagFor(market.teamHome),
    draw: null,
    away: flagFor(market.teamAway),
  };

  // Live payout quote for the current pick + amount.
  let quoteText: string | null = null;
  let amountErr: string | null = null;
  if (pick && amount.trim()) {
    try {
      const atomic = toAtomic(amount.trim(), denom.decimals);
      if (atomic > bal) amountErr = "Exceeds balance";
      else if (atomic <= ZERO) amountErr = "Enter an amount";
      else {
        const q = quotePayout(p, pick, atomic, market.feeBps);
        quoteText = `Win ≈ ${fromAtomic(q.gross, denom.decimals, 2)} ${denom.symbol}  ·  +${fromAtomic(q.profit, denom.decimals, 2)}`;
      }
    } catch {
      amountErr = `Max ${denom.decimals} decimals`;
    }
  }

  function submit() {
    if (!pick || !amount.trim() || amountErr) return;
    setMsg(null);
    startTransition(async () => {
      const res = await placeStake(market.id, pick, amount.trim());
      if (res.ok) {
        setMsg({ kind: "ok", text: "Bet placed." });
        setAmount("");
        setPick(null);
        router.refresh();
      } else {
        setMsg({ kind: "err", text: res.error ?? "Failed to place bet." });
      }
    });
  }

  const locksLabel = settled
    ? `Full time ${market.scoreHome}–${market.scoreAway}`
    : locked
      ? "Locked — awaiting result"
      : `Locks ${new Date(market.locksAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${new Date(
          market.locksAt,
        ).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <div className="border-2 border-ink shadow-brutal bg-surface">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b-2 border-ink">
        <div className="min-w-0">
          <p className="font-black text-base leading-tight flex items-center gap-1.5 min-w-0">
            {flagByOutcome.home && <Flag src={flagByOutcome.home} size={20} />}
            <span className="truncate">{market.teamHome}</span>
            <span className="text-ink-muted font-bold shrink-0">v</span>
            {flagByOutcome.away && <Flag src={flagByOutcome.away} size={20} />}
            <span className="truncate">{market.teamAway}</span>
          </p>
          <p className="font-mono text-[10px] text-ink-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>{locksLabel}</span>
            <span aria-hidden className="text-ink-faint">•</span>
            <span className="tabular">
              {hasAction
                ? `${fromAtomic(totalPool, denom.decimals, 1)} ${denom.symbol} pool · ${totalBets} ${totalBets === 1 ? "bet" : "bets"}`
                : "No bets yet — be first"}
            </span>
          </p>
        </div>
        <span
          className={`shrink-0 font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-1 border-2 border-ink whitespace-nowrap ${
            settled ? "bg-ink text-parchment" : locked ? "bg-live text-parchment" : "bg-open text-parchment"
          }`}
        >
          {settled ? "Settled" : locked ? "Locked" : "Open"}
        </span>
      </div>

      {/* Outcomes */}
      <div className="grid grid-cols-3">
        {OUTCOMES.map((o, i) => {
          const isPick = pick === o;
          const isWinner = settled && market.winningOutcome === o;
          const isFav = hasAction && o === favorite;
          const mine = BigInt(market.myStakes[o]);
          const pct = Math.round(prob[o] * 100);
          return (
            <button
              key={o}
              type="button"
              disabled={locked}
              onClick={() => setPick(isPick ? null : o)}
              className={`flex flex-col gap-2 px-3 py-3 text-left transition-colors ${i < 2 ? "border-r-2 border-ink" : ""} ${
                isWinner
                  ? "bg-open/10"
                  : isPick
                    ? "bg-ink text-parchment"
                    : locked
                      ? "cursor-default"
                      : "hover:bg-accent-soft"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold text-xs flex items-center gap-1.5 min-w-0">
                  {flagByOutcome[o] && <Flag src={flagByOutcome[o]!} size={16} />}
                  <span className="truncate">{label[o]}</span>
                </span>
                {isWinner ? (
                  <span className="shrink-0 font-mono text-[8px] font-bold uppercase tracking-wider text-open">Won</span>
                ) : isFav && !isPick ? (
                  <span className="shrink-0 font-mono text-[8px] font-bold uppercase tracking-wider text-accent">Fav</span>
                ) : null}
              </div>

              <span className={`font-mono text-2xl font-black tabular leading-none ${isPick ? "text-parchment" : ""}`}>
                {pct}
                <span className="text-sm font-bold align-top">%</span>
              </span>

              {/* implied-probability bar */}
              <div className={`h-1.5 w-full ${isPick ? "bg-parchment/25" : "bg-ink-faint"}`}>
                <div
                  className={`h-full ${isPick ? "bg-parchment" : isWinner ? "bg-open" : isFav ? "bg-accent" : "bg-ink"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <span className={`font-mono text-[10px] leading-tight ${isPick ? "text-parchment/70" : "text-ink-muted"}`}>
                {fromAtomic(BigInt(market.pools[o]), denom.decimals, 1)} {denom.symbol}
                {mine > ZERO && (
                  <span className={isWinner ? "text-open font-bold" : isPick ? "text-parchment" : "text-ink font-bold"}>
                    {" · you "}
                    {fromAtomic(mine, denom.decimals, 2)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Not connected: picking an outcome nudges the visitor to sign in. */}
      {!locked && pick && !connected && (
        <p className="px-4 py-3 border-t-2 border-ink font-mono text-[11px] text-ink-muted">
          Connect your wallet above to place a bet.
        </p>
      )}

      {/* Bet slip (only when open + connected + an outcome is picked) */}
      {!locked && pick && connected && (
        <div className="px-4 py-3 border-t-2 border-ink flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Amount (${denom.symbol})`}
              className="flex-1 border-2 border-ink px-3 py-2 font-mono text-sm focus:outline-none focus:shadow-brutal-sm"
            />
            <button
              type="button"
              onClick={() => setAmount(fromAtomic(bal, denom.decimals))}
              className="border-2 border-ink px-2 py-2 font-mono text-[10px] font-bold uppercase hover:bg-ink hover:text-parchment transition-colors"
            >
              Max
            </button>
            <button
              type="button"
              disabled={pending || !amount.trim() || !!amountErr}
              onClick={submit}
              className="border-2 border-ink bg-accent text-surface px-4 py-2 font-bold text-sm uppercase tracking-wide shadow-brutal-sm hover:-translate-x-px hover:-translate-y-px disabled:opacity-40 disabled:hover:translate-x-0 disabled:hover:translate-y-0 transition-transform"
            >
              {pending ? "…" : `Bet ${label[pick]}`}
            </button>
          </div>
          {(quoteText || amountErr) && (
            <p className={`font-mono text-[11px] ${amountErr ? "text-accent" : "text-ink-muted"}`}>
              {amountErr ?? quoteText}
            </p>
          )}
        </div>
      )}

      {msg && (
        <p
          className={`px-4 py-2 border-t-2 border-ink font-mono text-[11px] ${
            msg.kind === "ok" ? "text-open" : "text-accent"
          }`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
