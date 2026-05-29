import Image from "next/image";
import { flagUrl } from "@/lib/teamFlags";

type StandingRow = {
  group_name: string;
  team_name: string;
  mp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
};

function Flag({ team }: { team: string }) {
  const url = flagUrl(team);
  if (!url) return <span className="w-5 h-3.5 inline-block bg-ink-faint border border-ink-faint" />;
  return (
    <Image
      src={url}
      alt={`${team} flag`}
      width={20}
      height={14}
      className="border border-ink-faint flex-shrink-0"
    />
  );
}

export default function GroupTable({
  groupName,
  rows,
}: {
  groupName: string;
  rows: StandingRow[];
}) {
  return (
    <div className="border-2 border-ink shadow-brutal bg-surface">

      {/* Group header */}
      <div className="border-b-2 border-ink bg-ink px-4 py-2 flex items-center justify-between">
        <span className="font-black text-xs tracking-[0.2em] uppercase text-parchment">
          Group {groupName}
        </span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_repeat(7,auto)] items-center px-3 py-1.5 border-b-2 border-ink-faint bg-parchment gap-x-3">
        <span className="font-mono text-[10px] tracking-widest uppercase text-ink-muted">Team</span>
        {["MP","W","D","L","GD","GF","Pts"].map((h) => (
          <span key={h} className="font-mono text-[10px] tracking-widest uppercase text-ink-muted text-right w-6">
            {h}
          </span>
        ))}
      </div>

      {/* Rows */}
      {rows.map((row, idx) => {
        const qualified = idx < 2 && row.pts > 0;
        return (
          <div
            key={row.team_name}
            className={`grid grid-cols-[1fr_repeat(7,auto)] items-center px-3 py-2.5 gap-x-3 border-b border-ink-faint last:border-b-0 ${
              idx % 2 === 0 ? "bg-surface" : "bg-parchment"
            }`}
          >
            {/* Position indicator + flag + name */}
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-1 h-5 flex-shrink-0 ${qualified ? "bg-open" : "bg-transparent"}`}
              />
              <Flag team={row.team_name} />
              <span className="font-semibold text-xs truncate">{row.team_name}</span>
            </div>

            {[row.mp, row.w, row.d, row.l].map((val, i) => (
              <span key={i} className="font-mono text-xs tabular text-right w-6 text-ink-muted">
                {val}
              </span>
            ))}

            {/* GD with sign */}
            <span className={`font-mono text-xs tabular text-right w-6 font-semibold ${
              row.gd > 0 ? "text-open" : row.gd < 0 ? "text-accent" : "text-ink-muted"
            }`}>
              {row.gd > 0 ? `+${row.gd}` : row.gd}
            </span>

            {/* GF */}
            <span className="font-mono text-xs tabular text-right w-6 text-ink-muted">{row.gf}</span>

            {/* Points */}
            <span className="font-mono text-xs tabular text-right w-6 font-black">{row.pts}</span>
          </div>
        );
      })}

    </div>
  );
}
