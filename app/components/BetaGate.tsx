"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { redeemInvite } from "@/app/actions/beta";

export default function BetaGate() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    const c = code.trim();
    if (!c || pending) return;
    setErr(null);
    start(async () => {
      const r = await redeemInvite(c);
      if (r.ok) router.push("/market");
      else setErr(r.error);
    });
  }

  return (
    <div className="border-2 border-ink shadow-brutal-lg bg-surface p-5 sm:p-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
        Closed beta — invite only
      </p>
      <h2 className="font-black text-xl mt-1 leading-tight">Enter your invite code</h2>

      <form
        className="mt-4 flex flex-col sm:flex-row gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="INJCUP-XXXX-XXXX"
          autoCapitalize="characters"
          spellCheck={false}
          className="flex-1 border-2 border-ink px-3 py-2.5 font-mono text-sm tracking-wide focus:outline-none focus:shadow-brutal-sm"
        />
        <button
          type="submit"
          disabled={pending || !code.trim()}
          className="border-2 border-ink bg-accent text-surface px-5 py-2.5 font-bold text-sm uppercase tracking-wide shadow-brutal-sm hover:-translate-x-px hover:-translate-y-px disabled:opacity-40 transition-transform"
        >
          {pending ? "Checking…" : "Enter"}
        </button>
      </form>

      {err && <p className="mt-2 font-mono text-[11px] text-accent">{err}</p>}
    </div>
  );
}
