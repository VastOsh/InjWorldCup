"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimDeposit, withdraw } from "@/app/actions/market";
import { fromAtomic, toAtomic } from "@/lib/market/format";
import type { MarketDenom } from "@/lib/market/config";

type Note = { kind: "ok" | "err"; text: string } | null;

export default function Cashier({
  denom,
  balance,
  marketWallet,
  walletLinked,
  explorerTxBase,
  network,
}: {
  denom: MarketDenom;
  balance: string;
  marketWallet: string | null;
  walletLinked: boolean;
  explorerTxBase: string;
  network: "mainnet" | "testnet";
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [pending, start] = useTransition();
  const [txHash, setTxHash] = useState("");
  const [amount, setAmount] = useState("");
  const [depAmount, setDepAmount] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);

  const bal = BigInt(balance);

  async function copyTx() {
    if (!lastTx) return;
    try {
      await navigator.clipboard.writeText(lastTx);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the hash stays visible to select manually */
    }
  }

  async function copyAddr() {
    if (!marketWallet) return;
    try {
      await navigator.clipboard.writeText(marketWallet);
      setCopiedAddr(true);
      setTimeout(() => setCopiedAddr(false), 1500);
    } catch {
      /* clipboard blocked — the address stays visible to select manually */
    }
  }

  // One-click: build + broadcast the transfer from the connected wallet, then
  // credit via the same verified path a pasted hash uses.
  function doWalletDeposit() {
    const amt = depAmount.trim();
    if (!amt || !marketWallet) return;
    setNote(null);
    setLastTx(null);
    let atomic: string;
    try {
      atomic = toAtomic(amt, denom.decimals).toString();
    } catch (e) {
      setNote({ kind: "err", text: (e as Error).message });
      return;
    }
    start(async () => {
      let hash: string;
      try {
        const { depositViaWallet } = await import("@/lib/market/wallet-deposit");
        hash = await depositViaWallet({
          network,
          chainDenom: denom.denom,
          atomicAmount: atomic,
          marketWallet,
        });
      } catch (e) {
        setNote({ kind: "err", text: (e as Error).message || "Deposit cancelled." });
        return;
      }
      setLastTx(hash);
      // The tx needs a moment to index; claimDeposit treats "not found yet" as
      // retriable, so poll a few times before falling back to the manual paste.
      for (let i = 0; i < 6; i++) {
        const r = await claimDeposit(hash);
        if (r.ok) {
          setNote(
            r.credited
              ? { kind: "ok", text: `Deposited ${fromAtomic(BigInt(r.amount ?? atomic), denom.decimals, 4)} ${denom.symbol}.` }
              : { kind: "err", text: "Already credited." },
          );
          setDepAmount("");
          router.refresh();
          return;
        }
        if (r.rejected) {
          setNote({ kind: "err", text: r.error ?? "Deposit could not be verified." });
          return;
        }
        await new Promise((res) => setTimeout(res, 2500));
      }
      setNote({ kind: "err", text: "Sent — still confirming. Paste the hash below in a moment to credit." });
      setShowManual(true);
    });
  }

  function doDeposit() {
    if (!txHash.trim()) return;
    setNote(null);
    setLastTx(null);
    start(async () => {
      const r = await claimDeposit(txHash.trim());
      if (r.ok) {
        // A fresh credit is a success (green); "already credited" is a no-op the
        // user should notice — show it in red like a warning.
        setNote(
          r.credited
            ? {
                kind: "ok",
                text: `Credited ${fromAtomic(BigInt(r.amount ?? "0"), denom.decimals, 4)} ${denom.symbol}.`,
              }
            : { kind: "err", text: "Already credited." },
        );
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
    setLastTx(null);
    start(async () => {
      const r = await withdraw(amount.trim());
      if (r.ok) {
        setNote({ kind: "ok", text: "Sent." });
        setLastTx(r.txHash ?? null);
        setAmount("");
        router.refresh();
      } else {
        setNote({ kind: "err", text: r.error ?? "Withdrawal failed." });
      }
    });
  }

  return (
    <div className="glass rounded-3xl overflow-hidden">
      {/* Balance */}
      <div className="px-4 py-4 border-b border-white/10 flex items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/50">Balance</p>
          <p className="font-black text-3xl tabular leading-none mt-1.5">
            {fromAtomic(bal, denom.decimals, 2)}{" "}
            <span className="text-base font-bold text-white/50">{denom.symbol}</span>
          </p>
        </div>
        <div className="flex rounded-full border border-white/15 p-0.5">
          {(["deposit", "withdraw"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setNote(null); setLastTx(null); }}
              className={`px-3.5 py-1 rounded-full font-mono text-[10px] font-bold uppercase tracking-wide transition-colors ${
                tab === t ? "bg-inj text-white" : "text-white/60 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {!walletLinked ? (
        <p className="px-4 py-3.5 font-mono text-[11px] text-white/50">
          Link an Injective wallet to deposit or withdraw.
        </p>
      ) : tab === "deposit" ? (
        <div className="px-4 py-3.5 flex flex-col gap-3">
          <p className="font-mono text-[11px] text-white/50 leading-relaxed">
            Deposit {denom.symbol} straight from your wallet — approve the transfer in the popup and it credits automatically.
          </p>
          <div className="flex items-center gap-2">
            <input
              inputMode="decimal"
              value={depAmount}
              onChange={(e) => setDepAmount(e.target.value)}
              placeholder={`Amount (${denom.symbol})`}
              className="flex-1 rounded-full border border-white/15 bg-white/5 px-4 py-2 font-mono text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-inj focus:ring-2 focus:ring-inj/30 transition-colors"
            />
            <button
              type="button"
              disabled={pending || !depAmount.trim()}
              onClick={doWalletDeposit}
              className="rounded-full bg-inj text-white px-5 py-2 font-bold text-sm uppercase tracking-wide shadow-lg shadow-inj/30 hover:bg-inj-soft disabled:opacity-40 disabled:hover:bg-inj transition-all"
            >
              {pending ? "…" : "Deposit"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowManual((s) => !s)}
            className="self-start font-mono text-[10px] uppercase tracking-wide text-white/40 hover:text-white/70 transition-colors"
          >
            {showManual ? "Hide manual option" : "Prefer to send manually?"}
          </button>

          {showManual && (
            <div className="flex flex-col gap-2.5 border-t border-white/10 pt-3">
              <p className="font-mono text-[11px] text-white/50 leading-relaxed">
                Send {denom.symbol} to the market wallet, then paste the transaction hash.
              </p>
              {marketWallet && (
                <div className="flex items-stretch gap-2">
                  <code className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-[11px] break-all text-white/80">
                    {marketWallet}
                  </code>
                  <button
                    type="button"
                    onClick={copyAddr}
                    className="shrink-0 rounded-full border border-white/15 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-white/80 hover:bg-white/10 transition-colors"
                  >
                    {copiedAddr ? "Copied" : "Copy"}
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  placeholder="Transaction hash"
                  className="flex-1 rounded-full border border-white/15 bg-white/5 px-4 py-2 font-mono text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-inj focus:ring-2 focus:ring-inj/30 transition-colors"
                />
                <button
                  type="button"
                  disabled={pending || !txHash.trim()}
                  onClick={doDeposit}
                  className="rounded-full border border-white/20 bg-white/10 text-white px-4 py-2 font-bold text-sm uppercase hover:bg-white/15 disabled:opacity-40 transition-colors"
                >
                  {pending ? "…" : "Credit"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-3.5 flex flex-col gap-2.5">
          <p className="font-mono text-[11px] text-white/50 leading-relaxed">
            Cash out to your linked wallet. Only your verified address can receive.
          </p>
          <div className="flex items-center gap-2">
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Amount (${denom.symbol})`}
              className="flex-1 rounded-full border border-white/15 bg-white/5 px-4 py-2 font-mono text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-inj focus:ring-2 focus:ring-inj/30 transition-colors"
            />
            <button
              type="button"
              onClick={() => setAmount(fromAtomic(bal, denom.decimals))}
              className="rounded-full border border-white/15 px-3 py-2 font-mono text-[10px] font-bold uppercase text-white/80 hover:bg-white/10 transition-colors"
            >
              Max
            </button>
            <button
              type="button"
              disabled={pending || !amount.trim()}
              onClick={doWithdraw}
              className="rounded-full border border-white/20 bg-white/10 text-white px-4 py-2 font-bold text-sm uppercase hover:bg-white/15 disabled:opacity-40 transition-colors"
            >
              {pending ? "…" : "Withdraw"}
            </button>
          </div>
        </div>
      )}

      {note && (
        <p
          className={`px-4 py-2.5 border-t border-white/10 font-mono text-[11px] ${
            note.kind === "ok" ? "text-open" : "text-red-400"
          }`}
        >
          {note.text}
        </p>
      )}

      {lastTx && (
        <div className="px-4 py-2.5 border-t border-white/10 flex items-center gap-2">
          <code
            className="flex-1 font-mono text-[11px] break-all text-white/50"
            title={lastTx}
          >
            {lastTx.slice(0, 10)}…{lastTx.slice(-8)}
          </code>
          <button
            type="button"
            onClick={copyTx}
            className="rounded-full border border-white/15 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide text-white/80 hover:bg-white/10 transition-colors"
          >
            {copied ? "Copied" : "Copy TX"}
          </button>
          <a
            href={`${explorerTxBase}/${lastTx}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-white/15 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide text-white/80 hover:bg-white/10 transition-colors"
          >
            View
          </a>
        </div>
      )}
    </div>
  );
}
