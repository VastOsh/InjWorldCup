import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FinalStanding } from "@/lib/podium";

// Shared OG card artwork for /r/[slug]/opengraph-image.
//
// Satori (which next/og renders with) supports flexbox only — no grid — and
// every node with more than one child needs an explicit display:flex.
// Colours are the globals.css tokens, inlined because Tailwind doesn't apply.
//
// Kept out of the route file so the artwork can be rendered with mock data
// without a database round-trip.

export const OG_SIZE = { width: 1200, height: 630 };

// Satori ships Geist Regular only, so fontWeight:700 was silently ignored,
// leaving the card flat against a site built on black weights.
//
// Both faces are vendored because supplying a `fonts` array REPLACES Satori's
// built-in font rather than adding to it — shipping bold alone would strip the
// regular text of its typeface. Geist is OFL-licensed; Next traces these files
// into the serverless bundle. ~146KB total, well under the 500KB limit.
//
// Cached at module scope so the files are read once per lambda, not per render.
let fontsPromise: Promise<
  { name: string; data: Buffer; weight: 400 | 700; style: "normal" }[]
> | null = null;

export function ogFonts() {
  fontsPromise ??= Promise.all([
    readFile(join(process.cwd(), "assets", "Geist-Regular.ttf")),
    readFile(join(process.cwd(), "assets", "Geist-Bold.ttf")),
  ]).then(([regular, bold]) => [
    { name: "Geist", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Geist", data: bold, weight: 700 as const, style: "normal" as const },
  ]);
  return fontsPromise;
}

const INK = "#0D0D0D";
const PARCHMENT = "#F2F0E8";
const SURFACE = "#FFFFFF";
const MUTED = "#6B6B6B";
const ACCENT = "#E8302A";

// Gold/silver/bronze for the podium; brand red for everyone else. Returning INK
// here would make the medal spine vanish into the card border, leaving the
// ~156 non-podium players with a colourless card.
function medalColor(rank: number) {
  if (rank === 1) return "#CA8A04";
  if (rank === 2) return "#9CA3AF";
  if (rank === 3) return "#D97706";
  return ACCENT;
}

export function fallbackCard() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: PARCHMENT,
        fontSize: 48,
        color: INK,
        fontFamily: "Geist",
      }}
    >
      InjWorldCup 2026
    </div>
  );
}

export function resultCard(standing: FinalStanding, playerCount: number) {
  const accent = medalColor(standing.rank);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: PARCHMENT,
        padding: 56,
        fontFamily: "Geist",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 32,
        }}
      >
        <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: INK }}>
          INJ<span style={{ color: ACCENT }}>WC</span>
        </div>
        <div style={{ display: "flex", fontSize: 22, color: MUTED, letterSpacing: 3 }}>
          WORLD CUP 2026 · FINAL RESULT
        </div>
      </div>

      {/* Card */}
      <div
        style={{
          display: "flex",
          flex: 1,
          background: SURFACE,
          border: `6px solid ${INK}`,
          boxShadow: `16px 16px 0px ${INK}`,
        }}
      >
        {/* Medal spine */}
        <div style={{ display: "flex", width: 28, background: accent }} />

        {/* Left: identity */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            padding: "0 48px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", marginBottom: 28 }}>
            {standing.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={standing.avatar_url}
                alt=""
                width={104}
                height={104}
                style={{ border: `5px solid ${INK}`, marginRight: 24 }}
              />
            ) : null}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 24, color: MUTED, letterSpacing: 3 }}>
                FINISHED
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 46,
                  fontWeight: 700,
                  color: INK,
                  maxWidth: 460,
                  overflow: "hidden",
                }}
              >
                {standing.username}
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex" }}>
            {[
              { label: "POINTS", value: standing.total_points.toLocaleString() },
              { label: "EXACT", value: String(standing.exact_count) },
              { label: "PLAYED", value: String(standing.played_count) },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{ display: "flex", flexDirection: "column", marginRight: 48 }}
              >
                <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: INK }}>
                  {stat.value}
                </div>
                <div style={{ display: "flex", fontSize: 20, color: MUTED, letterSpacing: 2 }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: rank */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: 330,
            borderLeft: `6px solid ${INK}`,
            background: PARCHMENT,
          }}
        >
          <div style={{ display: "flex", fontSize: 26, color: MUTED, letterSpacing: 3 }}>RANK</div>
          <div
            style={{
              display: "flex",
              fontSize: 150,
              fontWeight: 700,
              color: accent,
              lineHeight: 1.1,
            }}
          >
            #{standing.rank}
          </div>
          <div style={{ display: "flex", fontSize: 26, color: MUTED }}>
            of {playerCount} players
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 28,
          fontSize: 22,
          color: MUTED,
        }}
      >
        <div style={{ display: "flex" }}>injcup.xyz · prediction league on Injective</div>
        {standing.best_label ? (
          <div style={{ display: "flex", color: INK }}>
            Best call: {standing.best_label} (+{standing.best_points.toLocaleString()})
          </div>
        ) : null}
      </div>
    </div>
  );
}
