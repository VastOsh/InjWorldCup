"use client";

import { useState } from "react";
import Link from "next/link";
import WalletLink from "@/app/components/WalletLink";

const NAV_LINKS = [
  { href: "/groups",      label: "Groups" },
  { href: "/knockout",    label: "Knockout" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/profile",     label: "Profile" },
] as const;

type ActivePath = "/" | "/leaderboard" | "/groups" | "/knockout" | "/profile";

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
        className="border-2 border-ink w-9 h-9 flex items-center justify-center font-mono text-base font-black shadow-brutal-sm"
      >
        {open ? "✕" : "≡"}
      </button>

      {open && (
        <div className="fixed top-14 left-0 right-0 bg-surface border-b-2 border-ink z-40">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center px-6 py-4 text-sm font-bold tracking-widest uppercase border-b border-ink-faint transition-colors ${
                activePath === href
                  ? "bg-ink text-parchment"
                  : "hover:bg-parchment"
              }`}
            >
              {label}
            </Link>
          ))}

          <div className="px-6 py-4 border-b border-ink-faint">
            <WalletLink userId={userId} currentWallet={walletAddress} />
          </div>

          <form action="/auth/signout" method="POST" className="px-6 py-4">
            <button
              type="submit"
              className="text-sm font-bold tracking-widest uppercase text-ink-muted hover:text-ink transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
