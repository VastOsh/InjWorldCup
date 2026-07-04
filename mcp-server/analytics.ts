// Shared analytics helpers for the MCP server and the x402 gateway.
// Aggregates form from finished group matches and runs the deterministic engine.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types.ts";
import {
  analyzeMatch,
  leagueAverages,
  type Analysis,
  type TeamForm,
} from "../lib/analytics/engine.ts";

type DB = SupabaseClient<Database>;

export interface StandingAgg {
  group_name: string; team_name: string;
  mp: number; w: number; d: number; l: number;
  gf: number; ga: number; gd: number; pts: number;
}

/** Aggregate group-stage standings from finished group matches (view-free). */
export async function computeStandings(client: DB): Promise<StandingAgg[]> {
  const { data, error } = await client
    .from("matches")
    .select("team_home, team_away, score_home, score_away, group_name, status")
    .not("group_name", "is", null)
    .eq("status", "FINISHED");
  if (error) throw new Error(error.message);

  const table = new Map<string, StandingAgg>();
  const row = (group: string, team: string) => {
    const key = `${group}:${team}`;
    let r = table.get(key);
    if (!r) {
      r = { group_name: group, team_name: team, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
      table.set(key, r);
    }
    return r;
  };

  for (const m of data ?? []) {
    if (m.score_home === null || m.score_away === null || !m.group_name) continue;
    const h = row(m.group_name, m.team_home);
    const a = row(m.group_name, m.team_away);
    h.mp++; a.mp++;
    h.gf += m.score_home; h.ga += m.score_away;
    a.gf += m.score_away; a.ga += m.score_home;
    if (m.score_home > m.score_away) { h.w++; h.pts += 3; a.l++; }
    else if (m.score_home < m.score_away) { a.w++; a.pts += 3; h.l++; }
    else { h.d++; a.d++; h.pts++; a.pts++; }
  }
  for (const r of table.values()) r.gd = r.gf - r.ga;
  return [...table.values()];
}

/** Full engine analysis for a match (null if the match doesn't exist). */
export async function loadAnalysis(client: DB, matchId: number): Promise<Analysis | null> {
  const { data: match, error } = await client
    .from("matches").select("*").eq("id", matchId).single();
  if (error || !match) return null;

  const standings = await computeStandings(client);
  const forms: TeamForm[] = standings.map((r) => ({ team: r.team_name, mp: r.mp, gf: r.gf, ga: r.ga }));
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
