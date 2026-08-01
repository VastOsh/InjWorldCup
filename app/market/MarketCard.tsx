"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { placeStake } from "@/app/actions/market";
import { quotePayout, impliedProbabilities } from "@/lib/market/math";
import { fromAtomic, toAtomic } from "@/lib/market/format";
import { COUNTRIES, flagUrlByCode } from "@/lib/countries";
import SportChip from "@/app/components/SportChip";
import type { MarketVM } from "@/lib/market/read";
import type { MarketDenom } from "@/lib/market/config";
import type { MarketOutcome } from "@/lib/supabase/types";

const OUTCOMES: readonly MarketOutcome[] = ["home", "draw", "away"];
const ZERO = BigInt(0);

// Team names on WC-style markets are countries → map to a flag (null otherwise).
const FLAG_CODE_BY_NAME = new Map(COUNTRIES.map((c) => [c.name, c.code] as const));
function flagFor(team: string): string | null {
  const code = FLAG_CODE_BY_NAME.get(team);
  return code ? flagUrlByCode(code) : null;
}

function pools(m: MarketVM): Record<MarketOutcome, bigint> {
  return { home: BigInt(m.pools.home), draw: BigInt(m.pools.draw), away: BigInt(m.pools.away) };
}

function Flag({ src, size = 20 }: { src: string; size?: number }) {
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={Math.round((size * 3) / 4)}
      className="shrink-0 border border-white/20 rounded-[2px]"
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

  // Head-to-head markets (tennis, golf, …) have no draw — show only home/away.
  const outcomes: readonly MarketOutcome[] = market.hasDraw ? OUTCOMES : ["home", "away"];
  const totalPool = outcomes.reduce((s, o) => s + p[o], ZERO);
  const totalBets = outcomes.reduce((s, o) => s + market.stakeCounts[o], 0);
  const favorite = outcomes.reduce((a, b) => (prob[b] > prob[a] ? b : a), outcomes[0]);
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

  const statusText = settled
    ? `Full time ${market.scoreHome}–${market.scoreAway}`
    : locked
      ? "Locked — awaiting result"
      : `${new Date(market.locksAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${new Date(
          market.locksAt,
        ).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  const statusDot = settled ? "bg-white/40" : locked ? "bg-live" : "bg-open";

  return (
    <div className="glass rounded-2xl p-4 flex flex-col gap-3">
      {/* Header: category chip + label · league */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <SportChip category={market.category} />
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-white/70 truncate">
            {market.category}
          </span>
        </div>
        {market.league && (
          <span className="text-[11px] text-white/40 truncate shrink-0 max-w-[45%] text-right">
            {market.league}
          </span>
        )}
      </div>

      {/* Title + status */}
      <div>
        <p className="font-black text-[15px] leading-tight truncate">
          {market.teamHome} <span className="text-white/40 font-bold">vs</span> {market.teamAway}
        </p>
        <p className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-white/50">
          <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
          {settled ? "" : locked ? "" : <span className="text-open font-bold uppercase tracking-wider">Open</span>}
          <span>{statusText}</span>
        </p>
      </div>

      {/* Outcome rows */}
      <div className="flex flex-col gap-0.5">
        {outcomes.map((o) => {
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
              className={`flex items-center gap-2.5 rounded-xl -mx-2 px-2 py-2 text-left transition-colors ${
                isPick ? "bg-inj/15" : locked ? "cursor-default" : "hover:bg-white/[0.05]"
              }`}
            >
              {flagByOutcome[o] ? (
                <Flag src={flagByOutcome[o]!} size={22} />
              ) : (
                <span className="shrink-0 w-[22px] h-[17px] rounded-[2px] bg-white/10 border border-white/15" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm truncate">{label[o]}</span>
                  {isWinner && (
                    <span className="shrink-0 font-mono text-[8px] font-bold uppercase tracking-wider text-open">
                      Won
                    </span>
                  )}
                  {mine > ZERO && (
                    <span className="shrink-0 font-mono text-[9px] text-white/50">
                      you {fromAtomic(mine, denom.decimals, 2)}
                    </span>
                  )}
                </div>
                {/* implied-probability underline */}
                <div className="mt-1.5 h-1 w-full rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${isWinner ? "bg-open" : isFav ? "bg-inj" : "bg-white/30"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full border px-3 py-1.5 font-mono text-sm font-bold tabular ${
                  isPick
                    ? "border-inj bg-inj text-white"
                    : isWinner
                      ? "border-open/40 bg-open/10 text-open"
                      : isFav
                        ? "border-inj/50 bg-inj/10 text-white"
                        : "border-white/15 text-white/70"
                }`}
              >
                {pct}%
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2.5 border-t border-white/10 font-mono text-[10px] text-white/50">
        <span className="tabular">
          {hasAction ? `${fromAtomic(totalPool, denom.decimals, 1)} ${denom.symbol} vol` : "No bets yet"}
        </span>
        <span className="tabular">
          {totalBets} {totalBets === 1 ? "bet" : "bets"}
        </span>
      </div>

      {/* Not connected: picking an outcome nudges the visitor to sign in. */}
      {!locked && pick && !connected && (
        <p className="border-t border-white/10 pt-2.5 font-mono text-[11px] text-white/50">
          Connect your wallet above to place a bet.
        </p>
      )}

      {/* Bet slip (open + connected + a pick). */}
      {!locked && pick && connected && (
        <div className="border-t border-white/10 pt-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Amount (${denom.symbol})`}
              className="flex-1 min-w-0 rounded-full border border-white/15 bg-white/5 px-4 py-2 font-mono text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-inj focus:ring-2 focus:ring-inj/30 transition-colors"
            />
            <button
              type="button"
              onClick={() => setAmount(fromAtomic(bal, denom.decimals))}
              className="rounded-full border border-white/15 px-3 py-2 font-mono text-[10px] font-bold uppercase text-white/80 hover:bg-white/10 transition-colors"
            >
              Max
            </button>
          </div>
          <button
            type="button"
            disabled={pending || !amount.trim() || !!amountErr}
            onClick={submit}
            className="rounded-full bg-inj text-white px-4 py-2.5 font-bold text-sm uppercase tracking-wide shadow-lg shadow-inj/30 hover:bg-inj-soft disabled:opacity-40 disabled:hover:bg-inj transition-all"
          >
            {pending ? "…" : `Bet ${label[pick]}`}
          </button>
          {(quoteText || amountErr) && (
            <p className={`font-mono text-[11px] ${amountErr ? "text-red-400" : "text-white/50"}`}>
              {amountErr ?? quoteText}
            </p>
          )}
        </div>
      )}

      {msg && (
        <p
          className={`border-t border-white/10 pt-2.5 font-mono text-[11px] ${
            msg.kind === "ok" ? "text-open" : "text-red-400"
          }`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
