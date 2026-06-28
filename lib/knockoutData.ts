export type KnockoutMatch = {
  id: number;
  date: string; // YYYY-MM-DD
  home: string;
  away: string;
};

export type KnockoutRound = {
  key: string;
  label: string;
  matches: KnockoutMatch[];
};

export const KNOCKOUT_ROUNDS: KnockoutRound[] = [
  {
    key: "r32",
    label: "Round of 32",
    matches: [
      { id: 73, date: "2026-06-28", home: "South Africa",  away: "Canada" },
      { id: 74, date: "2026-06-29", home: "Brazil",        away: "Japan" },
      { id: 75, date: "2026-06-29", home: "Germany",       away: "Paraguay" },
      { id: 76, date: "2026-06-30", home: "Netherlands",   away: "Morocco" },
      { id: 77, date: "2026-06-30", home: "Ivory Coast",   away: "Norway" },
      { id: 78, date: "2026-06-30", home: "France",        away: "Sweden" },
      { id: 79, date: "2026-07-01", home: "Mexico",        away: "Ecuador" },
      { id: 80, date: "2026-07-01", home: "England",       away: "DR Congo" },
      { id: 81, date: "2026-07-01", home: "Belgium",       away: "Senegal" },
      { id: 82, date: "2026-07-02", home: "United States", away: "Bosnia and Herzegovina" },
      { id: 83, date: "2026-07-02", home: "Spain",         away: "Austria" },
      { id: 84, date: "2026-07-02", home: "Portugal",      away: "Croatia" },
      { id: 85, date: "2026-07-03", home: "Switzerland",   away: "Algeria" },
      { id: 86, date: "2026-07-03", home: "Australia",     away: "Egypt" },
      { id: 87, date: "2026-07-03", home: "Argentina",     away: "Cape Verde" },
      { id: 88, date: "2026-07-04", home: "Colombia",      away: "Ghana" },
    ],
  },
  {
    key: "r16",
    label: "Round of 16",
    matches: [
      { id: 89, date: "2026-07-04", home: "Winner match 75", away: "Winner match 78" },
      { id: 90, date: "2026-07-04", home: "Winner match 73", away: "Winner match 76" },
      { id: 91, date: "2026-07-06", home: "Winner match 84", away: "Winner match 83" },
      { id: 92, date: "2026-07-07", home: "Winner match 82", away: "Winner match 81" },
      { id: 93, date: "2026-07-05", home: "Winner match 74", away: "Winner match 77" },
      { id: 94, date: "2026-07-06", home: "Winner match 79", away: "Winner match 80" },
      { id: 95, date: "2026-07-07", home: "Winner match 87", away: "Winner match 86" },
      { id: 96, date: "2026-07-07", home: "Winner match 85", away: "Winner match 88" },
    ],
  },
  {
    key: "qf",
    label: "Quarter-finals",
    matches: [
      { id: 97,  date: "2026-07-09", home: "Winner match 89", away: "Winner match 90" },
      { id: 98,  date: "2026-07-10", home: "Winner match 91", away: "Winner match 92" },
      { id: 99,  date: "2026-07-11", home: "Winner match 93", away: "Winner match 94" },
      { id: 100, date: "2026-07-12", home: "Winner match 95", away: "Winner match 96" },
    ],
  },
  {
    key: "sf",
    label: "Semi-finals",
    matches: [
      { id: 101, date: "2026-07-14", home: "Winner match 97",  away: "Winner match 98" },
      { id: 102, date: "2026-07-15", home: "Winner match 99",  away: "Winner match 100" },
    ],
  },
  {
    key: "bronze",
    label: "Bronze Final",
    matches: [
      { id: 103, date: "2026-07-18", home: "Runner-up match 101", away: "Runner-up match 102" },
    ],
  },
  {
    key: "final",
    label: "Final",
    matches: [
      { id: 104, date: "2026-07-19", home: "Winner match 101", away: "Winner match 102" },
    ],
  },
];

// ─── Bracket tree (ordered for face-to-face display) ────────────────────────

function findMatch(id: number): KnockoutMatch {
  for (const round of KNOCKOUT_ROUNDS) {
    const m = round.matches.find((m) => m.id === id);
    if (m) return m;
  }
  throw new Error(`Match ${id} not found`);
}

export type BracketHalf = {
  r32: KnockoutMatch[]; // 8 matches, top-to-bottom in bracket order
  r16: KnockoutMatch[]; // 4 matches
  qf:  KnockoutMatch[]; // 2 matches
  sf:  KnockoutMatch;
};

export type Bracket = {
  left:   BracketHalf;
  final:  KnockoutMatch;
  right:  BracketHalf;
  bronze: KnockoutMatch;
};

export const BRACKET: Bracket = {
  left: {
    // R32 pairs: [75,78]→R16-89  [73,76]→R16-90  [84,83]→R16-91  [82,81]→R16-92
    r32: [75, 78, 73, 76, 84, 83, 82, 81].map(findMatch),
    // R16 pairs: [89,90]→QF-97  [91,92]→QF-98
    r16: [89, 90, 91, 92].map(findMatch),
    // QF pair: [97,98]→SF-101
    qf:  [97, 98].map(findMatch),
    sf:  findMatch(101),
  },
  final: findMatch(104),
  right: {
    sf:  findMatch(102),
    // QF pair: [99,100]→SF-102
    qf:  [99, 100].map(findMatch),
    // R16 pairs: [93,94]→QF-99  [95,96]→QF-100
    r16: [93, 94, 95, 96].map(findMatch),
    // R32 pairs: [74,77]→R16-93  [79,80]→R16-94  [87,86]→R16-95  [85,88]→R16-96
    r32: [74, 77, 79, 80, 87, 86, 85, 88].map(findMatch),
  },
  bronze: findMatch(103),
};

// ─── Live resolution ────────────────────────────────────────────────────────
// The bracket above is static topology: R16+ slots reference a feeder match as
// "Winner match N" / "Runner-up match N". Given live results from the DB, we
// swap those placeholders for the actual qualifier so the bracket fills itself
// forward each time a score is saved. A slot whose feeder isn't FINISHED stays
// a placeholder (rendered greyed-out by isTBD).

export type MatchResult = {
  team_home: string;
  team_away: string;
  score_home: number | null;
  score_away: number | null;
  advance_winner: "home" | "away" | null;
  status: string;
};

export type ResultMap = Map<number, MatchResult>;

// Who goes through. Knockout ties decided in ET/penalties end level on the
// pitch, so advance_winner is authoritative when present; otherwise fall back
// to the on-pitch scoreline. Returns null while the feeder is undecided.
function winnerOf(r: MatchResult): string | null {
  if (r.status !== "FINISHED") return null;
  if (r.advance_winner) return r.advance_winner === "home" ? r.team_home : r.team_away;
  if (r.score_home == null || r.score_away == null) return null;
  if (r.score_home > r.score_away) return r.team_home;
  if (r.score_away > r.score_home) return r.team_away;
  return null; // level on the pitch but no advance_winner recorded yet
}

function loserOf(r: MatchResult): string | null {
  if (r.status !== "FINISHED") return null;
  if (r.advance_winner) return r.advance_winner === "home" ? r.team_away : r.team_home;
  if (r.score_home == null || r.score_away == null) return null;
  if (r.score_home > r.score_away) return r.team_away;
  if (r.score_away > r.score_home) return r.team_home;
  return null;
}

const WINNER_RE = /^Winner match (\d+)$/;
const RUNNERUP_RE = /^Runner-up match (\d+)$/;

function resolveLabel(label: string, results: ResultMap): string {
  const w = WINNER_RE.exec(label);
  if (w) {
    const r = results.get(Number(w[1]));
    return (r && winnerOf(r)) ?? label;
  }
  const l = RUNNERUP_RE.exec(label);
  if (l) {
    const r = results.get(Number(l[1]));
    return (r && loserOf(r)) ?? label;
  }
  return label; // already a concrete team (Round of 32)
}

function resolveMatch(m: KnockoutMatch, results: ResultMap): KnockoutMatch {
  return { ...m, home: resolveLabel(m.home, results), away: resolveLabel(m.away, results) };
}

function resolveHalf(h: BracketHalf, results: ResultMap): BracketHalf {
  return {
    r32: h.r32.map((m) => resolveMatch(m, results)),
    r16: h.r16.map((m) => resolveMatch(m, results)),
    qf:  h.qf.map((m) => resolveMatch(m, results)),
    sf:  resolveMatch(h.sf, results),
  };
}

export function resolveBracket(results: ResultMap): Bracket {
  return {
    left:   resolveHalf(BRACKET.left, results),
    final:  resolveMatch(BRACKET.final, results),
    right:  resolveHalf(BRACKET.right, results),
    bronze: resolveMatch(BRACKET.bronze, results),
  };
}
