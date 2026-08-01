import Link from "next/link";
import { cookies } from "next/headers";
import BetaGate from "@/app/components/BetaGate";
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
    <main className="min-h-full flex flex-col">
      {/* Top bar */}
      <header className="border-b-2 border-ink">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <span className="font-black text-sm tracking-[-0.02em] uppercase">
            INJ<span className="text-accent">CUP</span>
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
            on Injective
          </span>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl w-full px-4 py-14 sm:py-20 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent">
            Parimutuel prediction markets
          </p>
          <h1 className="mt-3 font-black text-4xl sm:text-5xl lg:text-6xl leading-[0.95] tracking-[-0.02em] text-balance">
            Back what you believe.
            <br />
            <span className="text-accent">Split the pot.</span>
          </h1>
          <p className="mt-5 max-w-md text-ink-muted text-base leading-relaxed">
            Deposit USDC, stake on an outcome, and share the pool with everyone who called it
            right. Custodial balances, on-chain payouts, settled on Injective.
          </p>
        </div>

        <div className="lg:justify-self-end w-full max-w-sm">
          {hasAccess ? (
            <div className="border-2 border-ink shadow-brutal-lg bg-surface p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-open">
                Access granted
              </p>
              <h2 className="font-black text-xl mt-1">You&apos;re on the list</h2>
              <Link
                href="/market"
                className="mt-4 inline-block border-2 border-ink bg-ink text-parchment px-5 py-2.5 font-bold text-sm uppercase tracking-wide shadow-brutal-sm hover:-translate-x-px hover:-translate-y-px transition-transform"
              >
                Enter app →
              </Link>
            </div>
          ) : (
            <BetaGate />
          )}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t-2 border-ink bg-surface">
        <div className="mx-auto max-w-5xl w-full px-4 py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink-muted">
            How it works
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="border-2 border-ink p-5 shadow-brutal-sm bg-parchment">
                <p className="font-mono text-2xl font-black text-accent tabular">{s.n}</p>
                <h3 className="mt-2 font-black text-lg leading-tight">{s.title}</h3>
                <p className="mt-1.5 text-sm text-ink-muted leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t-2 border-ink mt-auto">
        <div className="mx-auto max-w-5xl w-full px-4 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
            injcup — closed beta
          </span>
          <span className="font-mono text-[10px] text-ink-muted">
            Predictions involve risk. Only stake what you can afford to lose.
          </span>
        </div>
      </footer>
    </main>
  );
}
