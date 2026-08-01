import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import WalletLink from "@/app/components/WalletLink";
import WalletSignIn from "@/app/auth/WalletSignIn";
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
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">{title}</h2>
        {list.map((m) => (
          <MarketCard
            key={m.id}
            market={m}
            denom={board.denom}
            balance={board.balance}
            connected={connected}
          />
        ))}
      </section>
    );

  return (
    <main className="min-h-screen bg-parchment">
      <header className="border-b-2 border-ink bg-surface sticky top-0 z-30">
        <div className="mx-auto max-w-2xl px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-black text-sm tracking-[-0.02em] uppercase hover:text-accent transition-colors">
              INJ<span className="text-accent">CUP</span>
            </Link>
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">Market</span>
          </div>
          {connected && (
            <WalletLink userId={user.id} currentWallet={profile?.wallet_address ?? null} />
          )}
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-6">
        <div>
          <h1 className="font-black text-2xl tracking-tight">Parimutuel Market</h1>
          <p className="font-mono text-[11px] text-ink-muted mt-1">
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
          <div className="border-2 border-ink shadow-brutal bg-surface p-5 flex flex-col gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
                Get started
              </p>
              <h2 className="font-black text-lg mt-0.5">Connect your wallet to bet</h2>
              <p className="text-sm text-ink-muted mt-1">
                Sign in with your Injective wallet to deposit {board.denom.symbol}, back an outcome,
                and cash out. No password, no gas.
              </p>
            </div>
            <WalletSignIn redirectTo="/market" />
          </div>
        )}

        {board.markets.length === 0 ? (
          <div className="border-2 border-dashed border-ink-faint px-4 py-10 text-center">
            <p className="font-mono text-xs text-ink-muted">No markets are open yet. Check back soon.</p>
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
