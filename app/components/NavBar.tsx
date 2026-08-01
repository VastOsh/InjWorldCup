import Link from "next/link";
import Image from "next/image";
import WalletLink from "@/app/components/WalletLink";
import MobileNav from "@/app/components/MobileNav";
import InjectiveMark from "@/app/components/InjectiveMark";

type Props = {
  userId: string;
  walletAddress: string | null;
  activePath: "/" | "/leaderboard" | "/groups" | "/knockout" | "/profile" | "/podium";
  avatarUrl?: string | null;
  username?: string | null;
};

export default function NavBar({ userId, walletAddress, activePath, avatarUrl, username }: Props) {
  // World-Cup tabs (Groups / Knockout / Leaderboard) are retired — injcup is a
  // prediction market now. Pages still exist but are unlinked.
  const links: { href: string; label: string }[] = [];

  return (
    <header className="sticky top-4 z-50 px-4">
      <div className="mx-auto max-w-4xl glass-nav rounded-full h-14 pl-6 pr-3 flex items-center justify-between gap-4">

        <Link
          href="/"
          className="font-black text-sm tracking-[-0.02em] uppercase hover:text-inj-soft transition-colors"
        >
          INJ<span className="text-inj-soft">CUP</span>
        </Link>

        <MobileNav
          userId={userId}
          walletAddress={walletAddress}
          activePath={activePath}
          username={username}
        />

        <nav className="hidden sm:flex items-center gap-2">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`rounded-full border px-3 py-1 text-xs font-bold tracking-wide uppercase transition-colors duration-100 ${
                activePath === href
                  ? "border-inj bg-inj text-white"
                  : "border-white/15 text-white/80 hover:bg-white/10"
              }`}
            >
              {label}
            </Link>
          ))}

          <WalletLink userId={userId} currentWallet={walletAddress} />

          {/* Profile avatar link */}
          <Link
            href="/profile"
            className={`rounded-full border h-8 min-w-8 flex items-center justify-center gap-2 px-2 transition-colors duration-100 ${
              activePath === "/profile"
                ? "border-inj bg-inj"
                : "border-white/15 hover:bg-white/10"
            }`}
            title="Profile"
          >
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={username ?? "Profile"}
                width={22}
                height={22}
                className="rounded-full"
              />
            ) : (
              <span className="font-mono text-xs font-bold text-white">
                {username?.[0]?.toUpperCase() ?? "P"}
              </span>
            )}
          </Link>

          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              className="rounded-full border border-white/15 px-3 py-1 text-xs font-bold tracking-wide uppercase text-white/60 hover:bg-white/10 hover:text-white transition-colors duration-100"
            >
              Sign out
            </button>
          </form>

          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 border border-white/15">
            <InjectiveMark className="h-4 w-4 text-white" />
          </span>
        </nav>

      </div>
    </header>
  );
}
