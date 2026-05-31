"use client";

import { motion, type Variants } from "framer-motion";
import MatchCard from "@/app/components/MatchCard";
import type { Database } from "@/lib/supabase/types";

type Match = Database["public"]["Tables"]["matches"]["Row"];
type Prediction = Database["public"]["Tables"]["predictions"]["Row"];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0 },
};

export default function MatchGrid({
  matches,
  predByMatchId,
  lockedIds,
}: {
  matches: Match[];
  predByMatchId: Record<number, Prediction>;
  lockedIds: number[];
}) {
  const lockedSet = new Set(lockedIds);
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid gap-4 sm:grid-cols-2"
    >
      {matches.map((match) => (
        <motion.div key={match.id} variants={item} transition={{ duration: 0.26, ease: "easeOut" }}>
          <MatchCard
            match={match}
            prediction={predByMatchId[match.id] ?? null}
            initialLocked={lockedSet.has(match.id)}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
