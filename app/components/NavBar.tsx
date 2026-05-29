import Link from "next/link";
import Image from "next/image";
import WalletLink from "@/app/components/WalletLink";

type Props = {
  userId: string;
  walletAddress: string | null;
  activePath: "/" | "/leaderboard" | "/groups" | "/knockout" | "/profile";
  avatarUrl?: string | null;
  username?: string | null;
};

export default function NavBar({ userId, walletAddress, activePath, avatarUrl, username }: Props) {
  const links = [
    { href: "/groups",    label: "Groups" },
    { href: "/knockout",  label: "Knockout" },
    { href: "/leaderboard", label: "Leaderboard" },
  ] as const;

  return (
    <header className="border-b-2 border-ink bg-surface sticky top-0 z-30">
      <div className="mx-auto max-w-4xl px-4 h-14 flex items-center justify-between gap-4">

        <Link
          href="/"
          className="font-black text-sm tracking-[-0.02em] uppercase hover:text-accent transition-colors"
        >
          INJ<span className="text-accent">WC</span>
        </Link>

        <nav className="flex items-center gap-2">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`border-2 px-3 py-1 text-xs font-bold tracking-wide uppercase transition-[box-shadow,transform,background-color] duration-100 ${
                activePath === href
                  ? "border-ink bg-ink text-parchment"
                  : "border-ink shadow-brutal-sm hover:-translate-x-px hover:-translate-y-px hover:shadow-brutal"
              }`}
            >
              {label}
            </Link>
          ))}

          <WalletLink userId={userId} currentWallet={walletAddress} />

          {/* Profile avatar link */}
          <Link
            href="/profile"
            className={`border-2 flex items-center gap-2 px-2 py-1 transition-[box-shadow,transform,background-color] duration-100 ${
              activePath === "/profile"
                ? "border-ink bg-ink"
                : "border-ink shadow-brutal-sm hover:-translate-x-px hover:-translate-y-px hover:shadow-brutal"
            }`}
            title="Profile"
          >
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={username ?? "Profile"}
                width={22}
                height={22}
                className={activePath === "/profile" ? "brightness-0 invert" : ""}
              />
            ) : (
              <span className={`font-mono text-xs font-bold ${activePath === "/profile" ? "text-parchment" : ""}`}>
                {username?.[0]?.toUpperCase() ?? "P"}
              </span>
            )}
          </Link>

          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              className="border-2 border-ink-faint px-3 py-1 text-xs font-bold tracking-wide uppercase text-ink-muted hover:border-ink hover:text-ink transition-colors duration-100"
            >
              Sign out
            </button>
          </form>
        </nav>

      </div>
    </header>
  );
}
