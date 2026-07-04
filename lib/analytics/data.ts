// =============================================================================
// Server-only data loader for the analytics engine.
//
// Pulls a match's odds/teams plus both sides' form from the group_standings
// view, and the league-wide baseline, then hands them to the pure engine.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  analyzeMatch,
  leagueAverages,
  type Analysis,
  type TeamForm,
} from "@/lib/analytics/engine";

type DB = SupabaseClient<Database>;

/**
 * Load inputs and run the model for one match.
 * Returns null when the match doesn't exist. Missing group form for a team is
 * tolerated — the engine falls back to league-average rates.
 */
export async function analyzeMatchById(
  supabase: DB,
  matchId: number,
): Promise<Analysis | null> {
  const [{ data: match }, { data: standings }] = await Promise.all([
    supabase
      .from("matches")
      .select("team_home, team_away, multiplier_home, multiplier_draw, multiplier_away")
      .eq("id", matchId)
      .single(),
    supabase.from("group_standings").select("team_name, mp, gf, ga"),
  ]);

  if (!match) return null;

  const rows = standings ?? [];
  const forms: TeamForm[] = rows.map((r) => ({
    team: r.team_name,
    mp: r.mp,
    gf: r.gf,
    ga: r.ga,
  }));
  const byTeam = new Map(forms.map((f) => [f.team, f]));

  return analyzeMatch({
    home: match.team_home,
    away: match.team_away,
    odds: {
      home: Number(match.multiplier_home),
      draw: Number(match.multiplier_draw),
      away: Number(match.multiplier_away),
    },
    homeForm: byTeam.get(match.team_home) ?? null,
    awayForm: byTeam.get(match.team_away) ?? null,
    league: leagueAverages(forms),
  });
}
