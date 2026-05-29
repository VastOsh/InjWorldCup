"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

declare global {
  interface Window {
    keplr?: KeplrLike;
    ninji?: KeplrLike;
  }
}
interface KeplrLike {
  enable(chainId: string): Promise<void>;
  getKey(chainId: string): Promise<{ bech32Address: string }>;
  signArbitrary(chainId: string, signer: string, message: string): Promise<{ signature: string; pub_key: { value: string } }>;
}

const INJECTIVE_CHAIN_ID = "injective-1";
type Status = "idle" | "signing" | "linking" | "done" | "error";

export default function WalletLink({ userId, currentWallet }: { userId: string; currentWallet: string | null }) {
  const [status, setStatus] = useState<Status>("idle");
  const [linked, setLinked] = useState(currentWallet);
  const [error, setError] = useState<string | null>(null);

  async function handleLink() {
    const wallet = window.keplr ?? window.ninji ?? null;
    if (!wallet) {
      setError("Keplr or Ninji not found.");
      setStatus("error");
      return;
    }
    try {
      setError(null);
      setStatus("signing");
      await wallet.enable(INJECTIVE_CHAIN_ID);
      const { bech32Address: signer } = await wallet.getKey(INJECTIVE_CHAIN_ID);
      const message = `Link Injective wallet to InjWorldCup\nUser: ${userId}`;
      const { signature, pub_key } = await wallet.signArbitrary(INJECTIVE_CHAIN_ID, signer, message);
      setStatus("linking");
      const supabase = createClient();
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !session?.access_token) throw new Error("Session expired");
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/link-wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ signer, signature, pubKey: pub_key.value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Link failed");
      setLinked(data.wallet_address);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }

  if (linked) {
    return (
      <div className="flex items-center gap-2 border-2 border-open px-2.5 py-1 shadow-brutal-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-open flex-shrink-0" />
        <span className="font-mono text-[11px] text-ink">
          {linked.slice(0, 8)}…{linked.slice(-4)}
        </span>
      </div>
    );
  }

  const busy = status === "signing" || status === "linking";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleLink}
        disabled={busy}
        className="border-2 border-ink px-3 py-1 text-xs font-bold tracking-wide uppercase shadow-brutal-sm hover:bg-ink hover:text-parchment transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === "signing" ? "Signing…" : status === "linking" ? "Verifying…" : "Link Wallet"}
      </button>
      {error && <p className="font-mono text-[10px] text-accent max-w-[160px] text-right">{error}</p>}
    </div>
  );
}
