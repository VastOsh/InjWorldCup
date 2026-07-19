import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStandingBySlug, totalPlayerCount } from "@/lib/podium";

// PUBLIC ROUTE — deliberately no auth redirect. A share link that bounces to
// /auth/login is not shareable: X's crawler would never see the card, and a
// visitor would land on a login form with no idea what they were sent.
// Reads go through the service-role client (lib/podium.ts), so no anon RLS
// grant was needed.

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://injcup.xyz").replace(/\/$/, "");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const standing = await getStandingBySlug(slug);

  if (!standing) {
    return { title: "Result not found — InjWorldCup" };
  }

  const playerCount = await totalPlayerCount();
  const title = `#${standing.rank} — ${standing.username} · InjWorldCup 2026`;
  const description = [
    `${standing.total_points.toLocaleString()} points across ${standing.played_count} predictions, ${standing.exact_count} exact scorelines. Finished #${standing.rank} of ${playerCount}.`,
    standing.best_label ? `Best call: ${standing.best_label} (+${standing.best_points}).` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const url = `${siteUrl()}/r/${standing.share_slug}`;

  return {
    title,
    description,
    openGraph: { title, description, url, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ShareCardPage({ params }: Props) {
  const { slug } = await params;
  const standing = await getStandingBySlug(slug);
  if (!standing) notFound();

  const playerCount = await totalPlayerCount();
  const medal = standing.rank === 1 ? "🥇" : standing.rank === 2 ? "🥈" : standing.rank === 3 ? "🥉" : null;

  return (
    <main className="min-h-screen bg-parchment flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm flex flex-col gap-5">
        <Link
          href="/"
          className="font-black text-sm tracking-[-0.02em] uppercase text-center hover:text-accent transition-colors"
        >
          INJ<span className="text-accent">WC</span>
        </Link>

        <div className="border-2 border-ink shadow-brutal-lg bg-surface">
          <div className="bg-ink text-parchment px-4 py-2.5 flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-widest uppercase font-bold">
              Final result
            </span>
            <span className="font-mono text-[10px] tracking-widest uppercase text-parchment/60">
              World Cup 2026
            </span>
          </div>

          <div className="px-6 py-8 flex flex-col items-center gap-3 border-b-2 border-ink">
            {standing.avatar_url ? (
              <Image
                src={standing.avatar_url}
                alt={standing.username}
                width={72}
                height={72}
                className="border-2 border-ink shadow-brutal"
              />
            ) : (
              <div className="w-[72px] h-[72px] border-2 border-ink shadow-brutal bg-ink-faint flex items-center justify-center text-2xl font-black">
                {standing.username[0].toUpperCase()}
              </div>
            )}

            <p className="font-bold text-lg text-center break-words">{standing.username}</p>

            <div className="flex items-baseline gap-2">
              {medal && <span className="text-2xl">{medal}</span>}
              <span className="font-black text-4xl tracking-tight">#{standing.rank}</span>
              <span className="font-mono text-xs text-ink-muted">of {playerCount}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x-2 divide-ink">
            {[
              { label: "Points", value: standing.total_points.toLocaleString() },
              { label: "Exact", value: standing.exact_count },
              { label: "Played", value: standing.played_count },
            ].map((stat) => (
              <div key={stat.label} className="px-2 py-3 text-center">
                <div className="font-mono font-black text-base tabular">{stat.value}</div>
                <div className="font-mono text-[9px] tracking-widest uppercase text-ink-muted mt-0.5">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {standing.best_label && (
            <div className="border-t-2 border-ink px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[9px] tracking-widest uppercase text-ink-muted">
                  Best call
                </p>
                <p className="font-semibold text-sm truncate">{standing.best_label}</p>
              </div>
              <span className="font-mono font-black text-sm text-open flex-shrink-0">
                +{standing.best_points.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <Link
          href="/"
          className="text-center border-2 border-ink bg-ink text-parchment font-mono text-[11px] tracking-widest uppercase font-bold py-3 shadow-brutal hover:brightness-125 transition-[filter]"
        >
          Play the next one
        </Link>
      </div>
    </main>
  );
}
