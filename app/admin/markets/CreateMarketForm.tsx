"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMarket } from "@/app/actions/admin-market";

const CATEGORIES = ["Football", "Tennis", "Golf", "Basketball", "Cricket", "Baseball", "Esports"];
// Sports that are head-to-head by default (no draw). Football keeps the draw.
const DRAWLESS = new Set(["tennis", "golf", "basketball", "baseball", "esports"]);

export default function CreateMarketForm({ defaultFeeBps }: { defaultFeeBps: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [category, setCategory] = useState("Football");
  const [league, setLeague] = useState("");
  const [teamHome, setTeamHome] = useState("");
  const [teamAway, setTeamAway] = useState("");
  const [locksAt, setLocksAt] = useState("");
  const [hasDraw, setHasDraw] = useState(true);
  const [feeBps, setFeeBps] = useState(String(defaultFeeBps));
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function pickCategory(c: string) {
    setCategory(c);
    setHasDraw(!DRAWLESS.has(c.trim().toLowerCase()));
  }

  function submit() {
    setMsg(null);
    start(async () => {
      const r = await createMarket({
        category,
        league,
        teamHome,
        teamAway,
        locksAt,
        hasDraw,
        feeBps: Number(feeBps),
      });
      if (r.ok) {
        setMsg({ kind: "ok", text: `Market #${r.marketId} created.` });
        setTeamHome("");
        setTeamAway("");
        setLeague("");
        setLocksAt("");
        router.refresh();
      } else {
        setMsg({ kind: "err", text: r.error });
      }
    });
  }

  const field = "w-full rounded-xl border border-white/15 bg-white/5 text-white placeholder:text-white/40 px-3 py-2.5 text-sm focus:outline-none focus:border-inj focus:ring-2 focus:ring-inj/30 transition-colors";
  const labelCls = "font-mono text-[11px] uppercase tracking-widest text-white/50";

  return (
    <form
      className="glass-panel rounded-3xl p-6 flex flex-col gap-4"
      onSubmit={(e) => { e.preventDefault(); submit(); }}
    >
      {/* Category — quick-pick chips fill the field; free text is allowed too. */}
      <div className="flex flex-col gap-2">
        <label className={labelCls}>Category</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => pickCategory(c)}
              className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors ${
                category.trim().toLowerCase() === c.toLowerCase()
                  ? "border-inj bg-inj text-white"
                  : "border-white/15 text-white/70 hover:bg-white/10"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <input
          className={field}
          placeholder="Category (e.g. Politics, Awards…)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className={labelCls}>League / event</label>
        <input className={field} placeholder="e.g. FIFA World Cup 2026" value={league} onChange={(e) => setLeague(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <label className={labelCls}>Home / Player A</label>
          <input className={field} placeholder="Spain" value={teamHome} onChange={(e) => setTeamHome(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelCls}>Away / Player B</label>
          <input className={field} placeholder="Brazil" value={teamAway} onChange={(e) => setTeamAway(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <label className={labelCls}>Locks at</label>
          <input type="datetime-local" className={field} value={locksAt} onChange={(e) => setLocksAt(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelCls}>Fee (bps)</label>
          <input inputMode="numeric" className={field} value={feeBps} onChange={(e) => setFeeBps(e.target.value)} />
        </div>
      </div>

      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={hasDraw}
          onChange={(e) => setHasDraw(e.target.checked)}
          className="h-4 w-4 accent-inj"
        />
        <span className="text-sm text-white/80">
          Include a <span className="font-bold">Draw</span> outcome (3-way). Off = head-to-head (2-way).
        </span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-inj text-white px-5 py-3 font-bold text-sm uppercase tracking-wide shadow-lg shadow-inj/30 hover:bg-inj-soft disabled:opacity-40 transition-all"
      >
        {pending ? "Creating…" : "Create market"}
      </button>

      {msg && (
        <p className={`font-mono text-[12px] ${msg.kind === "ok" ? "text-open" : "text-red-400"}`}>{msg.text}</p>
      )}
    </form>
  );
}
