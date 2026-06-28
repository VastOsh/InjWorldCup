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
      { id: 89, date: "2026-07-04", home: "Winner match 74", away: "Winner match 77" },
      { id: 90, date: "2026-07-04", home: "Winner match 73", away: "Winner match 75" },
      { id: 91, date: "2026-07-05", home: "Winner match 76", away: "Winner match 78" },
      { id: 92, date: "2026-07-05", home: "Winner match 79", away: "Winner match 80" },
      { id: 93, date: "2026-07-06", home: "Winner match 83", away: "Winner match 84" },
      { id: 94, date: "2026-07-06", home: "Winner match 81", away: "Winner match 82" },
      { id: 95, date: "2026-07-07", home: "Winner match 86", away: "Winner match 88" },
      { id: 96, date: "2026-07-07", home: "Winner match 85", away: "Winner match 87" },
    ],
  },
  {
    key: "qf",
    label: "Quarter-finals",
    matches: [
      { id: 97,  date: "2026-07-09", home: "Winner match 89", away: "Winner match 90" },
      { id: 98,  date: "2026-07-10", home: "Winner match 93", away: "Winner match 94" },
      { id: 99,  date: "2026-07-11", home: "Winner match 91", away: "Winner match 92" },
      { id: 100, date: "2026-07-11", home: "Winner match 95", away: "Winner match 96" },
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

export const BRACKET: {
  left:   BracketHalf;
  final:  KnockoutMatch;
  right:  BracketHalf;
  bronze: KnockoutMatch;
} = {
  left: {
    // R32 pairs: [74,77]→R16-89  [73,75]→R16-90  [83,84]→R16-93  [81,82]→R16-94
    r32: [74, 77, 73, 75, 83, 84, 81, 82].map(findMatch),
    // R16 pairs: [89,90]→QF-97  [93,94]→QF-98
    r16: [89, 90, 93, 94].map(findMatch),
    // QF pair: [97,98]→SF-101
    qf:  [97, 98].map(findMatch),
    sf:  findMatch(101),
  },
  final: findMatch(104),
  right: {
    sf:  findMatch(102),
    // QF pair: [99,100]←SF-102
    qf:  [99, 100].map(findMatch),
    // R16 pairs: [91,92]←QF-99  [95,96]←QF-100
    r16: [91, 92, 95, 96].map(findMatch),
    // R32 pairs: [76,78]←R16-91  [79,80]←R16-92  [86,88]←R16-95  [85,87]←R16-96
    r32: [76, 78, 79, 80, 86, 88, 85, 87].map(findMatch),
  },
  bronze: findMatch(103),
};
