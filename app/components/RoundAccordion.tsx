"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import MatchGrid from "@/app/components/MatchGrid";
import type { Database } from "@/lib/supabase/types";

type Match = Database["public"]["Tables"]["matches"]["Row"];
type Prediction = Database["public"]["Tables"]["predictions"]["Row"];

type Round = { label: string; matches: Match[] };

const STORAGE_KEY = "roundOpen";

function Chevron({ open }: { open: boolean }) {
  return (
    <motion.svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      animate={{ rotate: open ? 0 : -90 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex-shrink-0"
      aria-hidden
    >
      <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
    </motion.svg>
  );
}

export default function RoundAccordion({
  rounds,
  predByMatchId,
  lockedIds,
}: {
  rounds: Round[];
  predByMatchId: Record<number, Prediction>;
  lockedIds: number[];
}) {
  // Default: every round collapsed. With the tournament finished there are 100+
  // played fixtures, so opening them all buries everything below the fold.
  // A player's own toggles still win — saved state is merged in below.
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rounds.map((r) => [r.label, false])),
  );

  // Hydrate from localStorage after mount. Reading storage during render (or in
  // a lazy initializer) would diverge from the server's all-closed render and
  // cause a hydration mismatch, so it has to happen in an effect.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved && typeof saved === "object") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client store hydration
        setOpenMap((prev) => ({ ...prev, ...saved }));
      }
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  const persist = (next: Record<string, boolean>) => {
    setOpenMap(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — keep in-memory state */
    }
  };

  const toggle = (label: string) =>
    persist({ ...openMap, [label]: !openMap[label] });

  return (
    <div className="flex flex-col gap-10">
      {rounds.map(({ label, matches }) => {
        const open = openMap[label] ?? false;
        return (
          <section key={label}>
            <button
              type="button"
              onClick={() => toggle(label)}
              aria-expanded={open}
              className="group flex w-full items-center gap-3 mb-4 text-left"
            >
              <span className="border-2 border-ink px-3 py-1 flex items-center gap-2 text-ink">
                <Chevron open={open} />
                <span className="font-black text-xs tracking-[0.2em] uppercase">
                  {label}
                </span>
              </span>
              <span className="flex-1 h-px bg-ink-faint group-hover:bg-ink transition-colors" />
              <span className="font-mono text-[11px] text-ink-muted">
                {matches.length} match{matches.length !== 1 ? "es" : ""}
              </span>
            </button>

            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  key="content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  style={{ overflow: "hidden" }}
                >
                  <MatchGrid
                    matches={matches}
                    predByMatchId={predByMatchId}
                    lockedIds={lockedIds}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        );
      })}
    </div>
  );
}
