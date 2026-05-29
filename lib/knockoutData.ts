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
      { id: 73, date: "2026-06-28", home: "Group A runners-up",             away: "Group B runners-up" },
      { id: 74, date: "2026-06-29", home: "Group E winners",                away: "Group A/B/C/D/F 3rd place" },
      { id: 75, date: "2026-06-29", home: "Group F winners",                away: "Group C runners-up" },
      { id: 76, date: "2026-06-29", home: "Group C winners",                away: "Group F runners-up" },
      { id: 77, date: "2026-06-30", home: "Group I winners",                away: "Group C/D/F/G/H 3rd place" },
      { id: 78, date: "2026-06-30", home: "Group E runners-up",             away: "Group I runners-up" },
      { id: 79, date: "2026-06-30", home: "Group A winners",                away: "Group C/E/F/H/I 3rd place" },
      { id: 80, date: "2026-07-01", home: "Group L winners",                away: "Group E/H/I/J/K 3rd place" },
      { id: 81, date: "2026-07-01", home: "Group D winners",                away: "Group B/E/F/I/J 3rd place" },
      { id: 82, date: "2026-07-01", home: "Group G winners",                away: "Group A/E/H/I/J 3rd place" },
      { id: 83, date: "2026-07-02", home: "Group K runners-up",             away: "Group L runners-up" },
      { id: 84, date: "2026-07-02", home: "Group H winners",                away: "Group J runners-up" },
      { id: 85, date: "2026-07-02", home: "Group B winners",                away: "Group E/F/G/I/J 3rd place" },
      { id: 86, date: "2026-07-03", home: "Group J winners",                away: "Group H runners-up" },
      { id: 87, date: "2026-07-03", home: "Group K winners",                away: "Group D/E/I/J/L 3rd place" },
      { id: 88, date: "2026-07-03", home: "Group D runners-up",             away: "Group G runners-up" },
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
