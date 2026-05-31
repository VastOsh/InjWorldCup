'use client'

import { useState, useTransition } from "react";
import { saveTiebreaker } from "@/app/actions/profile";

export default function TiebreakerInput({ current }: { current: number | null }) {
  const [minute, setMinute] = useState(current ?? "");
  const [saved, setSaved] = useState(current !== null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    const val = Number(minute);
    setError(null);
    startTransition(async () => {
      const result = await saveTiebreaker(val);
      if (result.error) setError(result.error);
      else setSaved(true);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-gray-400 text-center">
        Tie-breaker: minute of 1st goal in the final
      </p>
      <div className="flex items-center gap-2 justify-center">
        <input
          type="number"
          min={1}
          max={120}
          placeholder="e.g. 34"
          value={minute}
          onChange={(e) => { setMinute(e.target.value); setSaved(false); }}
          disabled={isPending}
          className="w-20 rounded-lg border border-gray-600 bg-gray-800 px-2 py-1.5 text-center text-white text-sm disabled:opacity-40"
        />
        <button
          onClick={handleSave}
          disabled={isPending || saved || minute === ""}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? "…" : saved ? "Saved ✓" : current !== null ? "Update" : "Save"}
        </button>
      </div>
      {error && <p className="text-center text-xs text-red-400">{error}</p>}
    </div>
  );
}
