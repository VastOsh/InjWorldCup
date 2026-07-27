"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimDeposit, withdraw } from "@/app/actions/market";
import { fromAtomic } from "@/lib/market/format";
import type { MarketDenom } from "@/lib/market/config";

type Note = { kind: "ok" | "err"; text: string } | null;

export default function Cashier({
  denom,
  balance,
  marketWallet,
  walletLinked,
}: {
  denom: MarketDenom;
  balance: string;
  marketWallet: string | null;
  walletLinked: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [pending, start] = useTransition();
  const [txHash, setTxHash] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState<Note>(null);

  const bal = BigInt(balance);

  function doDeposit() {
    if (!txHash.trim()) return;
    setNote(null);
    start(async () => {
      const r = await claimDeposit(txHash.trim());
      if (r.ok) {
        setNote({
          kind: "ok",
          text: r.credited
            ? `Credited ${fromAtomic(BigInt(r.amount ?? "0"), denom.decimals, 4)} ${denom.symbol}.`
            : "Already credited.",
        });
        setTxHash("");
        router.refresh();
      } else {
        setNote({ kind: "err", text: r.error ?? "Could not verify deposit." });
      }
    });
  }

  function doWithdraw() {
    if (!amount.trim()) return;
    setNote(null);
    start(async () => {
      const r = await withdraw(amount.trim());
      if (r.ok) {
        setNote({ kind: "ok", text: `Sent. tx ${r.txHash?.slice(0, 10)}…` });
        setAmount("");
        router.refresh();
      } else {
        setNote({ kind: "err", text: r.error ?? "Withdrawal failed." });
      }
    });
  }

  return (
    <div className="border-2 border-ink shadow-brutal bg-surface">
      {/* Balance */}
      <div className="px-4 py-4 border-b-2 border-ink flex items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">Balance</p>
          <p className="font-black text-3xl tabular leading-none mt-1">
            {fromAtomic(bal, denom.decimals, 2)}{" "}
            <span className="text-base font-bold text-ink-muted">{denom.symbol}</span>
          </p>
        </div>
        <div className="flex">
          {(["deposit", "withdraw"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setNote(null); }}
              className={`border-2 border-ink px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wide ${
                tab === t ? "bg-ink text-parchment" : "hover:bg-accent-soft"
              } ${t === "withdraw" ? "border-l-0" : ""}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {!walletLinked ? (
        <p className="px-4 py-3 font-mono text-[11px] text-ink-muted">
          Link an Injective wallet to deposit or withdraw.
        </p>
      ) : tab === "deposit" ? (
        <div className="px-4 py-3 flex flex-col gap-2">
          <p className="font-mono text-[11px] text-ink-muted">
            Send {denom.symbol} to the market wallet, then paste the transaction hash to credit your balance.
          </p>
          {marketWallet && (
            <code className="block border-2 border-ink-faint bg-parchment px-2 py-1.5 font-mono text-[11px] break-all">
              {marketWallet}
            </code>
          )}
          <div className="flex items-center gap-2">
            <input
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              placeholder="Transaction hash"
              className="flex-1 border-2 border-ink px-3 py-2 font-mono text-xs focus:outline-none focus:shadow-brutal-sm"
            />
            <button
              type="button"
              disabled={pending || !txHash.trim()}
              onClick={doDeposit}
              className="border-2 border-ink bg-accent text-surface px-4 py-2 font-bold text-sm uppercase shadow-brutal-sm hover:-translate-x-px hover:-translate-y-px disabled:opacity-40 transition-transform"
            >
              {pending ? "…" : "Credit"}
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 flex flex-col gap-2">
          <p className="font-mono text-[11px] text-ink-muted">
            Cash out to your linked wallet. Only your verified address can receive.
          </p>
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
              disabled={pending || !amount.trim()}
              onClick={doWithdraw}
              className="border-2 border-ink bg-ink text-parchment px-4 py-2 font-bold text-sm uppercase shadow-brutal-sm hover:-translate-x-px hover:-translate-y-px disabled:opacity-40 transition-transform"
            >
              {pending ? "…" : "Withdraw"}
            </button>
          </div>
        </div>
      )}

      {note && (
        <p
          className={`px-4 py-2 border-t-2 border-ink font-mono text-[11px] ${
            note.kind === "ok" ? "text-open" : "text-accent"
          }`}
        >
          {note.text}
        </p>
      )}
    </div>
  );
}
