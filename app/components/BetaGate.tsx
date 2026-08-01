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

  // Landing-only: dark liquid-glass styling for the front door.
  return (
    <div className="glass-panel rounded-3xl p-5 sm:p-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-inj-soft">
        Closed beta — invite only
      </p>
      <h2 className="font-black text-xl mt-1 leading-tight text-white">Enter your invite code</h2>

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
          className="flex-1 rounded-full border border-white/15 bg-white/[0.06] text-white placeholder:text-white/40 px-4 py-2.5 font-mono text-sm tracking-wide focus:outline-none focus:border-inj focus:ring-2 focus:ring-inj/30 transition-colors"
        />
        <button
          type="submit"
          disabled={pending || !code.trim()}
          className="rounded-full bg-inj text-white px-5 py-2.5 font-bold text-sm uppercase tracking-wide shadow-lg shadow-inj/30 hover:bg-inj-soft hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0 transition-all"
        >
          {pending ? "Checking…" : "Enter"}
        </button>
      </form>

      {err && <p className="mt-2 font-mono text-[11px] text-red-400">{err}</p>}
    </div>
  );
}
