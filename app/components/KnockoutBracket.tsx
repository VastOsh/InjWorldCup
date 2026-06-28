import { Bracket, KnockoutMatch } from "@/lib/knockoutData";

function isTBD(label: string) {
  return label.startsWith("Winner") || label.startsWith("Runner-up");
}

function BracketCard({ match }: { match: KnockoutMatch }) {
  return (
    <div className="border-2 border-ink bg-surface w-full">
      <div className="border-b-2 border-ink bg-parchment px-1.5 py-0.5">
        <span className="font-mono text-[9px] tracking-widest uppercase text-ink-muted">
          M{match.id}
        </span>
      </div>
      <div className="px-2 py-1.5 flex flex-col gap-1">
        {[match.home, match.away].map((label, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className={`w-0.5 h-2.5 flex-shrink-0 ${isTBD(label) ? "bg-ink-faint" : "bg-open"}`} />
            <span
              className={`text-[10px] font-medium leading-tight truncate ${
                isTBD(label) ? "text-ink-muted" : "text-ink"
              }`}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchColumn({ matches }: { matches: KnockoutMatch[] }) {
  return (
    <div className="flex flex-col w-36">
      {matches.map((match) => (
        <div key={match.id} className="flex-1 flex items-center py-1">
          <BracketCard match={match} />
        </div>
      ))}
    </div>
  );
}

function Connector({ numPairs, direction }: { numPairs: number; direction: "left" | "right" }) {
  const bar = direction === "right" ? "border-r-2" : "border-l-2";
  return (
    <div className="flex flex-col w-8">
      {Array.from({ length: numPairs }).map((_, i) => (
        <div key={i} className="flex-1 flex flex-col">
          <div className={`flex-1 ${bar} border-b-2 border-ink`} />
          <div className={`flex-1 ${bar} border-t-2 border-ink`} />
        </div>
      ))}
    </div>
  );
}

function BracketHalf({
  r32, r16, qf, sf,
}: {
  r32: KnockoutMatch[]; r16: KnockoutMatch[]; qf: KnockoutMatch[]; sf: KnockoutMatch;
}) {
  return (
    <div className="flex">
      <MatchColumn matches={r32} />
      <Connector numPairs={4} direction="right" />
      <MatchColumn matches={r16} />
      <Connector numPairs={2} direction="right" />
      <MatchColumn matches={qf} />
      <Connector numPairs={1} direction="right" />
      <MatchColumn matches={[sf]} />
    </div>
  );
}

export default function KnockoutBracket({ bracket }: { bracket: Bracket }) {
  const { left, right, final: finalMatch, bronze } = bracket;

  // Grid rows: [560px upper] [120px centre] [560px lower] = 1240px total
  // L-SF centre: y=280 · R-SF centre: y=960 · midpoint: y=620
  // Centre-row centre: 560+60=620 · Final centre (span all): 1240/2=620
  // Connector junction lands at y=620 — all four points align.
  //
  // The connector's junction horizontal touches the Bronze card on its left
  // and the Final card on its right, creating a T-junction:
  //   SF losers  → left  → Bronze
  //   SF winners → right → Final

  return (
    <div className="overflow-x-auto">
    <div className="flex flex-col gap-6 min-w-max">

      {/* Column labels */}
      <div className="flex">
        <div className="w-36 text-center">
          <span className="font-mono text-[9px] tracking-widest uppercase text-ink-muted">Round of 32</span>
        </div>
        <div className="w-8" />
        <div className="w-36 text-center">
          <span className="font-mono text-[9px] tracking-widest uppercase text-ink-muted">Round of 16</span>
        </div>
        <div className="w-8" />
        <div className="w-36 text-center">
          <span className="font-mono text-[9px] tracking-widest uppercase text-ink-muted">QF</span>
        </div>
        <div className="w-8" />
        <div className="w-36 text-center">
          <span className="font-mono text-[9px] tracking-widest uppercase text-ink-muted">SF</span>
        </div>
        <div className="w-8" />
        <div className="w-36 text-center">
          <span className="font-mono text-[9px] tracking-widest uppercase text-ink-muted">Final</span>
        </div>
      </div>

      {/* Main bracket */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 2rem 9rem",
          gridTemplateRows: "560px 120px 560px",
        }}
      >
        {/* Row 1: upper bracket half */}
        <div style={{ gridColumn: "1", gridRow: "1" }} className="flex">
          <BracketHalf {...left} />
        </div>

        {/* Row 2 (centre): Bronze Final — right-aligned to the SF column.
            Its right edge sits flush against the connector left edge, so the
            connector's junction horizontal creates a visual T-junction between
            Bronze (left) and Final (right). */}
        <div style={{ gridColumn: "1", gridRow: "2" }} className="flex items-center justify-end">
          <div className="w-36 flex flex-col gap-1">
            <span className="font-mono text-[9px] tracking-widest uppercase text-live text-center">
              Bronze
            </span>
            <BracketCard match={bronze} />
          </div>
        </div>

        {/* Col 2, rows 1–3: vertical connector joining both SF → Final (and Bronze).
            Two flex-1 arms each take 620px; junction lands at y=620. */}
        <div style={{ gridColumn: "2", gridRow: "1 / 4" }} className="flex flex-col">
          <div className="flex-1 border-r-2 border-b-2 border-ink" />
          <div className="flex-1 border-r-2 border-t-2 border-ink" />
        </div>

        {/* Col 3, rows 1–3: Final card centred at y=620 */}
        <div style={{ gridColumn: "3", gridRow: "1 / 4" }} className="flex flex-col justify-center gap-1">
          <span className="font-mono text-[9px] tracking-widest uppercase text-open text-center">
            Final
          </span>
          <BracketCard match={finalMatch} />
        </div>

        {/* Row 3: lower bracket half */}
        <div style={{ gridColumn: "1", gridRow: "3" }} className="flex">
          <BracketHalf {...right} />
        </div>
      </div>

    </div>
    </div>
  );
}
