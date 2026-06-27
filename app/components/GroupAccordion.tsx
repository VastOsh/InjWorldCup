"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import MatchGrid from "@/app/components/MatchGrid";
import type { Database } from "@/lib/supabase/types";

type Match = Database["public"]["Tables"]["matches"]["Row"];
type Prediction = Database["public"]["Tables"]["predictions"]["Row"];

type Group = { groupName: string; matches: Match[] };

const STORAGE_KEY = "groupOpen";

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

export default function GroupAccordion({
  groups,
  predByMatchId,
  lockedIds,
}: {
  groups: Group[];
  predByMatchId: Record<number, Prediction>;
  lockedIds: number[];
}) {
  // Default: every group expanded. Hydrated from localStorage after mount so
  // server and client first render agree (avoids hydration mismatch).
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.groupName, true])),
  );

  // Hydrate from localStorage after mount. Reading storage during render (or in
  // a lazy initializer) would diverge from the server's all-open render and
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

  const toggle = (name: string) =>
    persist({ ...openMap, [name]: !openMap[name] });

  const setAll = (open: boolean) =>
    persist(Object.fromEntries(groups.map((g) => [g.groupName, open])));

  const allOpen = groups.every((g) => openMap[g.groupName]);

  return (
    <div className="flex flex-col gap-10">
      {/* ── Expand / collapse all ──────────────────────────────────────── */}
      <div className="flex justify-end -mb-6">
        <button
          type="button"
          onClick={() => setAll(!allOpen)}
          className="font-mono text-[11px] tracking-widest uppercase text-ink-muted hover:text-ink border-2 border-ink-faint hover:border-ink px-3 py-1 transition-colors"
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>

      {groups.map(({ groupName, matches }) => {
        const open = openMap[groupName] ?? true;
        const predicted = matches.filter((m) => predByMatchId[m.id]).length;
        return (
          <section key={groupName}>
            <button
              type="button"
              onClick={() => toggle(groupName)}
              aria-expanded={open}
              className="group flex w-full items-center gap-3 mb-4 text-left"
            >
              <span className="bg-ink px-3 py-1 flex items-center gap-2 text-parchment">
                <Chevron open={open} />
                <span className="font-black text-xs tracking-[0.2em] uppercase">
                  Group {groupName}
                </span>
              </span>
              <span className="flex-1 h-px bg-ink-faint group-hover:bg-ink transition-colors" />
              <span className="font-mono text-[11px] text-ink-muted">
                {predicted}/{matches.length} predicted
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
