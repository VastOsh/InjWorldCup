"use client";

import { useState } from "react";

// Injective wallet browser extensions expose a Keplr-compatible surface.
declare global {
  interface Window {
    keplr?: KeplrLike;
    ninji?: KeplrLike;
  }
}
interface KeplrLike {
  enable(chainId: string): Promise<void>;
  getKey(chainId: string): Promise<{ bech32Address: string }>;
  signArbitrary(
    chainId: string,
    signer: string,
    message: string,
  ): Promise<{ signature: string; pub_key: { value: string } }>;
}

const INJECTIVE_CHAIN_ID = "injective-1";
type Status = "idle" | "connecting" | "signing" | "verifying" | "error";

export default function WalletSignIn({ redirectTo = "/market" }: { redirectTo?: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    const wallet = window.keplr ?? window.ninji ?? null;
    if (!wallet) {
      setError("Keplr or Ninji wallet not found.");
      setStatus("error");
      return;
    }
    try {
      setError(null);
      setStatus("connecting");
      await wallet.enable(INJECTIVE_CHAIN_ID);
      const { bech32Address: signer } = await wallet.getKey(INJECTIVE_CHAIN_ID);

      // 1. Fetch a fresh single-use challenge for this wallet.
      const chRes = await fetch(`/auth/wallet/challenge?wallet=${encodeURIComponent(signer)}`);
      const chData = await chRes.json();
      if (!chRes.ok) throw new Error(chData.error ?? "Could not start sign-in");

      // 2. Sign the challenge (ADR-036 — no transaction, no gas).
      setStatus("signing");
      const { signature, pub_key } = await wallet.signArbitrary(
        INJECTIVE_CHAIN_ID,
        signer,
        chData.message,
      );

      // 3. Verify server-side and mint the session.
      setStatus("verifying");
      const res = await fetch("/auth/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signer, signature, pubKey: pub_key.value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sign-in failed");

      // Full reload so middleware picks up the fresh session cookies.
      window.location.assign(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }

  const busy = status === "connecting" || status === "signing" || status === "verifying";
  const label =
    status === "connecting" ? "Connecting…"
    : status === "signing" ? "Sign in your wallet…"
    : status === "verifying" ? "Verifying…"
    : "Sign in with Wallet";

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleSignIn}
        disabled={busy}
        className="flex items-center justify-center gap-3 border-2 border-ink bg-ink text-parchment px-6 py-3 font-bold text-sm uppercase tracking-wide shadow-brutal-sm hover:-translate-x-px hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 transition-transform"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
          <circle cx="17" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
        </svg>
        {label}
      </button>
      {error && (
        <p className="font-mono text-[11px] text-accent">{error}</p>
      )}
    </div>
  );
}
