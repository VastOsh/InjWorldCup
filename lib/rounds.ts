// Knockout round codes in tournament order, with their display labels.
// `matches.round` stores the code; the homepage renders one section per round
// in this order. Group-stage matches have round = null and are sectioned by
// group_name instead.
export const KNOCKOUT_ROUNDS = [
  { code: "R32", label: "Round of 32" },
  { code: "R16", label: "Round of 16" },
  { code: "QF", label: "Quarter-finals" },
  { code: "SF", label: "Semi-finals" },
  { code: "3RD", label: "Third-place play-off" },
  { code: "FINAL", label: "Final" },
] as const;

export const ROUND_LABEL: Record<string, string> = Object.fromEntries(
  KNOCKOUT_ROUNDS.map((r) => [r.code, r.label]),
);
