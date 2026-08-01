"use client";

import { useState } from "react";
import Link from "next/link";
import WalletLink from "@/app/components/WalletLink";

// World-Cup tabs retired (injcup is a prediction market now); keep Profile.
const NAV_LINKS = [
  { href: "/profile",     label: "Profile" },
] as const;

type ActivePath = "/" | "/leaderboard" | "/groups" | "/knockout" | "/profile" | "/podium";

export default function MobileNav({
  userId,
  walletAddress,
  activePath,
  username,
}: {
  userId: string;
  walletAddress: string | null;
  activePath: ActivePath;
  username?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="sm:hidden">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? "Close menu" : "Open menu"}
        className="rounded-full border border-white/15 w-9 h-9 flex items-center justify-center font-mono text-base font-black text-white hover:bg-white/10 transition-colors"
      >
        {open ? "✕" : "≡"}
      </button>

      {open && (
        <div className="fixed top-20 left-4 right-4 rounded-2xl glass-panel z-40 overflow-hidden">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center px-6 py-4 text-sm font-bold tracking-widest uppercase border-b border-white/10 transition-colors ${
                activePath === href
                  ? "bg-inj text-white"
                  : "text-white/80 hover:bg-white/5"
              }`}
            >
              {label}
            </Link>
          ))}

          <div className="px-6 py-4 border-b border-white/10">
            <WalletLink userId={userId} currentWallet={walletAddress} />
          </div>

          <form action="/auth/signout" method="POST" className="px-6 py-4">
            <button
              type="submit"
              className="text-sm font-bold tracking-widest uppercase text-white/60 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
