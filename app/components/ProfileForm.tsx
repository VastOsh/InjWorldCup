"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { saveProfile } from "@/app/actions/profile";
import { COUNTRIES, flagUrlByCode } from "@/lib/countries";

type Props = {
  currentUsername: string;
  currentCountry: string | null;
  avatarUrl: string | null;
  totalPoints: number;
};

export default function ProfileForm({ currentUsername, currentCountry, avatarUrl, totalPoints }: Props) {
  const [username, setUsername] = useState(currentUsername);
  const [country, setCountry] = useState(currentCountry ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedCountry = COUNTRIES.find(c => c.name === country) ?? null;

  const handleSave = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveProfile(username, country || null);
      if (result.error) setError(result.error);
      else setSaved(true);
    });
  };

  return (
    <div className="flex flex-col gap-8">

      {/* Avatar + stats */}
      <div className="flex items-center gap-6 border-2 border-ink bg-surface px-6 py-5 shadow-brutal">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={currentUsername}
            width={72}
            height={72}
            className="border-2 border-ink shadow-brutal-sm flex-shrink-0"
          />
        ) : (
          <div className="w-18 h-18 border-2 border-ink bg-parchment flex items-center justify-center text-2xl font-black">
            {currentUsername[0]?.toUpperCase()}
          </div>
        )}
        <div>
          <p className="font-black text-xl tracking-tight">{currentUsername}</p>
          <p className="font-mono text-sm text-ink-muted mt-0.5">{totalPoints.toLocaleString()} pts</p>
          <p className="font-mono text-[11px] text-ink-faint mt-1 tracking-wide">
            Avatar synced from Discord
          </p>
        </div>
      </div>

      {/* Edit form */}
      <div className="border-2 border-ink bg-surface shadow-brutal">

        <div className="border-b-2 border-ink bg-parchment px-4 py-2">
          <span className="font-black text-xs tracking-[0.2em] uppercase">Edit Profile</span>
        </div>

        <div className="px-6 py-6 flex flex-col gap-6">

          {/* Username */}
          <div className="flex flex-col gap-2">
            <label className="font-mono text-[11px] tracking-widest uppercase text-ink-muted">
              Display Name
            </label>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setSaved(false); }}
              maxLength={20}
              placeholder="Your display name"
              className="border-2 border-ink bg-surface px-3 py-2.5 font-semibold text-sm focus:outline-none focus:border-accent shadow-brutal-sm"
            />
            <p className="font-mono text-[10px] text-ink-muted">
              3–20 chars · letters, numbers, spaces, - _ .
            </p>
          </div>

          {/* Country */}
          <div className="flex flex-col gap-2">
            <label className="font-mono text-[11px] tracking-widest uppercase text-ink-muted">
              Country
            </label>
            <div className="flex items-center gap-3">
              {selectedCountry && (
                <Image
                  src={flagUrlByCode(selectedCountry.code)}
                  alt={selectedCountry.name}
                  width={28}
                  height={20}
                  className="border border-ink-faint flex-shrink-0"
                />
              )}
              <select
                value={country}
                onChange={e => { setCountry(e.target.value); setSaved(false); }}
                className="flex-1 border-2 border-ink bg-surface px-3 py-2.5 font-semibold text-sm focus:outline-none focus:border-accent shadow-brutal-sm appearance-none cursor-pointer"
              >
                <option value="">— Select country —</option>
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Save */}
          <motion.button
            onClick={handleSave}
            disabled={isPending || saved}
            whileTap={!isPending && !saved ? { x: 2, y: 2, boxShadow: "0px 0px 0px #0D0D0D" } : {}}
            className="border-2 border-ink bg-ink text-parchment py-3 text-xs font-bold tracking-widest uppercase shadow-brutal-sm transition-colors hover:bg-accent hover:border-accent disabled:bg-ink-faint disabled:border-ink-faint disabled:shadow-none disabled:cursor-not-allowed"
          >
            {isPending ? "Saving…" : saved ? "Saved ✓" : "Save Changes"}
          </motion.button>

          {error && (
            <p className="font-mono text-[11px] text-accent text-center">{error}</p>
          )}
        </div>
      </div>

    </div>
  );
}
