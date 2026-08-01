"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { placeStake } from "@/app/actions/market";
import { quotePayout, impliedProbabilities } from "@/lib/market/math";
import { fromAtomic, toAtomic } from "@/lib/market/format";
import type { MarketVM } from "@/lib/market/read";
import type { MarketDenom } from "@/lib/market/config";
import type { MarketOutcome } from "@/lib/supabase/types";

const OUTCOMES: readonly MarketOutcome[] = ["home", "draw", "away"];

function pools(m: MarketVM): Record<MarketOutcome, bigint> {
  return { home: BigInt(m.pools.home), draw: BigInt(m.pools.draw), away: BigInt(m.pools.away) };
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

  const label: Record<MarketOutcome, string> = {
    home: market.teamHome,
    draw: "Draw",
    away: market.teamAway,
  };

  // Live payout quote for the current pick + amount.
  let quoteText: string | null = null;
  let amountErr: string | null = null;
  if (pick && amount.trim()) {
    try {
      const atomic = toAtomic(amount.trim(), denom.decimals);
      if (atomic > bal) amountErr = "Exceeds balance";
      else if (atomic <= BigInt(0)) amountErr = "Enter an amount";
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

  return (
    <div className="border-2 border-ink shadow-brutal bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b-2 border-ink">
        <div className="min-w-0">
          <p className="font-black text-sm truncate">
            {market.teamHome} <span className="text-ink-muted">v</span> {market.teamAway}
          </p>
          {settled ? (
            <p className="font-mono text-[11px] text-ink-muted mt-0.5">
              Full time {market.scoreHome}–{market.scoreAway}
            </p>
          ) : (
            <p className="font-mono text-[11px] text-ink-muted mt-0.5">
              {locked ? "Locked" : `Locks ${new Date(market.locksAt).toLocaleString()}`}
            </p>
          )}
        </div>
        <span
          className={`font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-1 border-2 border-ink whitespace-nowrap ${
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
          const mine = BigInt(market.myStakes[o]);
          return (
            <button
              key={o}
              type="button"
              disabled={locked}
              onClick={() => setPick(isPick ? null : o)}
              className={`flex flex-col gap-1 px-3 py-3 text-left transition-colors ${i < 2 ? "border-r-2 border-ink" : ""} ${
                isWinner
                  ? "bg-open/15"
                  : isPick
                    ? "bg-ink text-parchment"
                    : locked
                      ? "cursor-default"
                      : "hover:bg-accent-soft"
              }`}
            >
              <span className="font-bold text-xs truncate">{label[o]}</span>
              <span className={`font-mono text-lg font-black tabular leading-none ${isPick ? "text-parchment" : ""}`}>
                {Math.round(prob[o] * 100)}%
              </span>
              <span className={`font-mono text-[10px] ${isPick ? "text-parchment/70" : "text-ink-muted"}`}>
                {fromAtomic(BigInt(market.pools[o]), denom.decimals, 1)} {denom.symbol}
                {mine > BigInt(0) && (
                  <span className={isWinner ? "text-open font-bold" : ""}>
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
