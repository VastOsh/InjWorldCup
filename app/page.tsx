import Link from "next/link";
import { cookies } from "next/headers";
import BetaGate from "@/app/components/BetaGate";
import MarketPulse from "@/app/components/MarketPulse";
import InjectiveMark from "@/app/components/InjectiveMark";
import { BETA_COOKIE, betaCookieValid } from "@/lib/beta";

export default async function Landing() {
  const jar = await cookies();
  const hasAccess = betaCookieValid(jar.get(BETA_COOKIE)?.value);

  const steps = [
    {
      n: "01",
      title: "Connect & deposit",
      body: "Sign in with your Injective wallet and deposit USDC into your balance.",
    },
    {
      n: "02",
      title: "Back an outcome",
      body: "Stake on the result you believe in. The odds move with the crowd.",
    },
    {
      n: "03",
      title: "Winners split the pot",
      body: "When the event settles, the pool is shared pro-rata — minus a small fee. Cash out anytime.",
    },
  ];

  return (
    <main className="grain relative min-h-screen overflow-hidden bg-nightfall text-white">
      {/* Indigo depth-glows behind the glass. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="aurora aurora-a" />
        <div className="aurora aurora-b" />
      </div>

      {/* Floating pill navbar — Apple liquid glass. */}
      <header className="sticky top-4 z-50 px-4">
        <div className="mx-auto max-w-5xl glass-nav rounded-full h-14 pl-6 pr-3 flex items-center justify-between">
          <span className="font-black text-sm tracking-[-0.02em] uppercase">
            INJ<span className="text-inj-soft">CUP</span>
          </span>
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/60">
              Injective Mainnet
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 border border-white/15">
              <InjectiveMark className="h-4 w-4 text-white" />
            </span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-5xl w-full px-4 pt-20 pb-20 sm:pt-28 sm:pb-28 grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <p className="reveal reveal-1 font-mono text-[11px] uppercase tracking-[0.3em] text-inj-soft">
            Parimutuel prediction markets
          </p>
          <h1 className="mt-4 font-black text-5xl sm:text-6xl lg:text-7xl leading-[0.92] tracking-[-0.03em] text-balance">
            <span className="reveal reveal-2 block">Back what</span>
            <span className="reveal reveal-3 block">you believe.</span>
            <span className="reveal reveal-4 block text-inj-soft">Split the pot.</span>
          </h1>
          <p className="reveal reveal-5 mt-6 max-w-md text-white/60 text-base leading-relaxed">
            Deposit USDC, stake on an outcome, and share the pool with everyone who called it
            right. Custodial balances, on-chain payouts, settled on Injective.
          </p>
          <div className="reveal reveal-6 mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-wider text-white/50">
            <span className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-inj-soft" /> On-chain payouts
            </span>
            <span className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-inj-soft" /> No gas to bet
            </span>
            <span className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-inj-soft" /> Non-custodial cash-out
            </span>
          </div>
        </div>

        <div className="reveal reveal-4 w-full max-w-sm lg:justify-self-end">
          <div className="float-slow">
            <MarketPulse />
          </div>
        </div>
      </section>

      {/* Access / gate */}
      <section className="relative z-10 border-t border-white/5">
        <div className="mx-auto max-w-5xl w-full px-4 py-14 grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-inj-soft">
              Closed beta
            </p>
            <h2 className="mt-2 font-black text-2xl sm:text-3xl tracking-tight text-balance">
              {hasAccess ? "You're on the list." : "Have an invite?"}
            </h2>
            <p className="mt-2 max-w-sm text-white/60 text-sm leading-relaxed">
              {hasAccess
                ? "Your access is active — step inside and start backing outcomes."
                : "injcup is invite-only while we run the beta. Enter your single-use code to get in."}
            </p>
          </div>
          <div className="w-full max-w-sm lg:justify-self-end">
            {hasAccess ? (
              <div className="glass-panel rounded-3xl p-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-inj-soft">
                  Access granted
                </p>
                <h3 className="font-black text-xl mt-1">You&apos;re on the list</h3>
                <Link
                  href="/market"
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-inj text-white px-5 py-2.5 font-bold text-sm uppercase tracking-wide shadow-lg shadow-inj/30 hover:bg-inj-soft hover:-translate-y-0.5 transition-all"
                >
                  Enter app →
                </Link>
              </div>
            ) : (
              <BetaGate />
            )}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 border-t border-white/5">
        <div className="mx-auto max-w-5xl w-full px-4 py-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-white/50">
            How it works
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {steps.map((s) => (
              <div
                key={s.n}
                className="glass-subtle rounded-3xl p-6 transition-all duration-200 hover:-translate-y-1 hover:bg-white/[0.07]"
              >
                <p className="font-mono text-2xl font-black text-inj-soft tabular">{s.n}</p>
                <h3 className="mt-3 font-black text-lg leading-tight">{s.title}</h3>
                <p className="mt-2 text-sm text-white/55 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5">
        <div className="mx-auto max-w-5xl w-full px-4 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">
            injcup — closed beta
          </span>
          <span className="font-mono text-[10px] text-white/35">
            Predictions involve risk. Only stake what you can afford to lose.
          </span>
        </div>
      </footer>
    </main>
  );
}
