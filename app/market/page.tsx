import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import WalletLink from "@/app/components/WalletLink";
import WalletSignIn from "@/app/auth/WalletSignIn";
import InjectiveMark from "@/app/components/InjectiveMark";
import { loadMarketBoard, type MarketVM } from "@/lib/market/read";
import { marketWallet, marketExplorerTxBase } from "@/lib/market/config";
import Cashier from "./Cashier";
import MarketCard from "./MarketCard";

export const dynamic = "force-dynamic";

export default async function MarketPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const connected = !!user;

  // The board (markets + pools) is public — read it via the service-role client
  // so a signed-out visitor still sees it (RLS would otherwise hide it). Balance
  // and personal stakes are only loaded when someone is signed in.
  const admin = createAdminClient();
  const board = await loadMarketBoard(admin, user?.id ?? null);

  let profile: { wallet_address: string | null; username: string | null } | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("wallet_address, username")
      .eq("id", user.id)
      .single();
    profile = data ?? null;
  }

  let wallet: string | null = null;
  try {
    wallet = marketWallet();
  } catch {
    wallet = null;
  }

  const open = board.markets.filter((m) => m.status === "open");
  const locked = board.markets.filter((m) => m.status === "locked");
  const settled = board.markets.filter((m) => m.status === "settled");

  const section = (title: string, list: MarketVM[]) =>
    list.length > 0 && (
      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">{title}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((m) => (
            <MarketCard
              key={m.id}
              market={m}
              denom={board.denom}
              balance={board.balance}
              connected={connected}
            />
          ))}
        </div>
      </section>
    );

  return (
    <main className="grain relative min-h-screen overflow-hidden bg-nightfall text-white">
      {/* Indigo depth-glow behind the glass. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="aurora aurora-a" />
      </div>

      {/* Floating pill navbar. */}
      <header className="sticky top-4 z-50 px-4">
        <div className="mx-auto max-w-5xl glass-nav rounded-full h-14 pl-6 pr-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="font-black text-sm tracking-[-0.02em] uppercase hover:text-inj-soft transition-colors"
            >
              INJ<span className="text-inj-soft">CUP</span>
            </Link>
            <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">Market</span>
          </div>
          <div className="flex items-center gap-2.5">
            {connected ? (
              <WalletLink userId={user.id} currentWallet={profile?.wallet_address ?? null} />
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/50 hidden sm:inline">
                Injective Mainnet
              </span>
            )}
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 border border-white/15">
              <InjectiveMark className="h-4 w-4 text-white" />
            </span>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-10 flex flex-col gap-8">
        <div className="flex flex-col gap-6 max-w-md">
          <div>
            <h1 className="font-black text-3xl tracking-tight">Parimutuel Market</h1>
            <p className="font-mono text-[11px] text-white/50 mt-1.5">
              Back an outcome — winners split the pot. {board.denom.symbol}.
            </p>
          </div>

          {connected ? (
            <Cashier
              denom={board.denom}
              balance={board.balance}
              marketWallet={wallet}
              walletLinked={!!profile?.wallet_address}
              explorerTxBase={marketExplorerTxBase()}
            />
          ) : (
            <div className="glass-panel rounded-3xl p-6 flex flex-col gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-inj-soft">
                  Get started
                </p>
                <h2 className="font-black text-lg mt-0.5">Connect your wallet to bet</h2>
                <p className="text-sm text-white/60 mt-1">
                  Sign in with your Injective wallet to deposit {board.denom.symbol}, back an outcome,
                  and cash out. No password, no gas.
                </p>
              </div>
              <WalletSignIn redirectTo="/market" />
            </div>
          )}
        </div>

        {board.markets.length === 0 ? (
          <div className="glass-subtle rounded-3xl px-4 py-12 text-center">
            <p className="font-mono text-xs text-white/50">No markets are open yet. Check back soon.</p>
          </div>
        ) : (
          <>
            {section("Open", open)}
            {section("Awaiting result", locked)}
            {section("Settled", settled)}
          </>
        )}
      </div>
    </main>
  );
}
