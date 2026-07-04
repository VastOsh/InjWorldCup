// =============================================================================
// Analytics engine — deterministic World Cup match model.
//
// Pure functions only: no DB, no network, no LLM. Given each team's form
// (from the group_standings view) and the market odds, it produces a Poisson
// scoreline model and compares the model's probabilities against the
// odds-implied ("market") probabilities to surface value.
//
// The model is intentionally INDEPENDENT of the odds — it is built from goals
// scored/conceded — so "model vs market" is an honest comparison, not a
// restatement of the same numbers.
// =============================================================================

export type Outcome = "home" | "draw" | "away";

/** A team's aggregated record, straight from the group_standings view. */
export interface TeamForm {
  team: string;
  mp: number; // matches played
  gf: number; // goals for
  ga: number; // goals against
}

/** League-wide baselines, derived once from every team's record. */
export interface LeagueAverages {
  /** Mean goals scored per team per game across the tournament so far. */
  goalsPerGame: number;
}

export interface MatchOdds {
  home: number;
  draw: number;
  away: number;
}

export interface Probs {
  home: number;
  draw: number;
  away: number;
}

export interface Scoreline {
  home: number;
  away: number;
  p: number;
}

export interface Analysis {
  home: string;
  away: string;
  /** Most likely 90-minute scoreline under the model. */
  predictedScore: { home: number; away: number };
  /** Expected goals (Poisson means) for each side. */
  lambda: { home: number; away: number };
  /** Outcome probabilities from the model. */
  modelProbs: Probs;
  /** Outcome probabilities implied by the odds (vig removed). */
  marketProbs: Probs;
  /** Top scorelines by probability. */
  topScorelines: Scoreline[];
  /** Model's decisiveness: probability of its single most likely outcome. */
  confidence: number;
  /**
   * Best positive edge of model over market, if any clears the threshold.
   * `edge` is (modelProb − marketProb) for that outcome, in [0, 1].
   */
  value: { outcome: Outcome; edge: number } | null;
}

// Neutral-venue tournament: home advantage is modest. Applied to the home λ.
const HOME_ADVANTAGE = 1.05;
// Truncate the Poisson grid here; P(≥9 goals) is negligible for football.
const MAX_GOALS = 8;
// A model edge must clear this to be flagged as "value".
const VALUE_THRESHOLD = 0.05;

/**
 * Convert decimal odds to probabilities, normalising away the bookmaker's
 * overround (vig) so the three outcomes sum to exactly 1.
 */
export function impliedProbs(odds: MatchOdds): Probs {
  const rawH = 1 / odds.home;
  const rawD = 1 / odds.draw;
  const rawA = 1 / odds.away;
  const total = rawH + rawD + rawA;
  return { home: rawH / total, draw: rawD / total, away: rawA / total };
}

/** Compute league baselines from every team's aggregated record. */
export function leagueAverages(forms: TeamForm[]): LeagueAverages {
  let goals = 0;
  let games = 0;
  for (const f of forms) {
    goals += f.gf;
    games += f.mp;
  }
  // Fall back to a sane football default before any games are played.
  const goalsPerGame = games > 0 ? goals / games : 1.35;
  return { goalsPerGame };
}

/** Poisson pmf: probability of exactly k events given mean λ. */
function poisson(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

/** Per-game scoring/conceding rates for a team, with a league-average fallback. */
function rates(form: TeamForm | null, league: LeagueAverages) {
  if (!form || form.mp <= 0) {
    return { attack: league.goalsPerGame, concede: league.goalsPerGame };
  }
  return { attack: form.gf / form.mp, concede: form.ga / form.mp };
}

/**
 * Expected goals for each side. A team's attack rate is scaled by the
 * opponent's conceding rate relative to the league mean (Dixon–Coles style),
 * then nudged by home advantage.
 */
export function expectedGoals(
  home: TeamForm | null,
  away: TeamForm | null,
  league: LeagueAverages,
): { home: number; away: number } {
  const avg = league.goalsPerGame || 1.35;
  const h = rates(home, league);
  const a = rates(away, league);
  const lambdaHome = (h.attack * a.concede) / avg * HOME_ADVANTAGE;
  const lambdaAway = (a.attack * h.concede) / avg;
  // Clamp to a plausible band so a freak group record can't produce nonsense.
  return {
    home: Math.min(Math.max(lambdaHome, 0.2), 5),
    away: Math.min(Math.max(lambdaAway, 0.2), 5),
  };
}

/**
 * Build the full scoreline grid from the two Poisson means and reduce it to
 * outcome probabilities, the most likely scorelines, and the modal score.
 */
function scorelineModel(lambdaHome: number, lambdaAway: number) {
  const pHome: number[] = [];
  const pAway: number[] = [];
  for (let g = 0; g <= MAX_GOALS; g++) {
    pHome[g] = poisson(g, lambdaHome);
    pAway[g] = poisson(g, lambdaAway);
  }

  let win = 0;
  let draw = 0;
  let loss = 0;
  const cells: Scoreline[] = [];
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = pHome[i] * pAway[j];
      cells.push({ home: i, away: j, p });
      if (i > j) win += p;
      else if (i === j) draw += p;
      else loss += p;
    }
  }

  cells.sort((a, b) => b.p - a.p);
  const modal = cells[0];
  // Normalise away the negligible truncated tail (P of ≥9 goals) so the three
  // outcome probabilities sum to exactly 1 for clean display.
  const mass = win + draw + loss || 1;
  return {
    probs: { home: win / mass, draw: draw / mass, away: loss / mass },
    predictedScore: { home: modal.home, away: modal.away },
    topScorelines: cells.slice(0, 5),
  };
}

/**
 * Full analysis for one match: model probabilities, market probabilities, the
 * predicted scoreline, and the biggest edge of model over market (if any).
 */
export function analyzeMatch(params: {
  home: string;
  away: string;
  odds: MatchOdds;
  homeForm: TeamForm | null;
  awayForm: TeamForm | null;
  league: LeagueAverages;
}): Analysis {
  const { home, away, odds, homeForm, awayForm, league } = params;

  const lambda = expectedGoals(homeForm, awayForm, league);
  const { probs: modelProbs, predictedScore, topScorelines } = scorelineModel(
    lambda.home,
    lambda.away,
  );
  const marketProbs = impliedProbs(odds);

  const edges: { outcome: Outcome; edge: number }[] = [
    { outcome: "home", edge: modelProbs.home - marketProbs.home },
    { outcome: "draw", edge: modelProbs.draw - marketProbs.draw },
    { outcome: "away", edge: modelProbs.away - marketProbs.away },
  ];
  edges.sort((a, b) => b.edge - a.edge);
  const best = edges[0];
  const value = best.edge >= VALUE_THRESHOLD ? best : null;

  const confidence = Math.max(modelProbs.home, modelProbs.draw, modelProbs.away);

  return {
    home,
    away,
    predictedScore,
    lambda,
    modelProbs,
    marketProbs,
    topScorelines,
    confidence,
    value,
  };
}
