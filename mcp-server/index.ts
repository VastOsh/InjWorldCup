// =============================================================================
// worldcup-mcp — MCP server exposing InjWorldCup as agent tools.
//
// Read-only tools over the live Supabase data (fixtures, odds, standings,
// bracket, leaderboard) plus the deterministic AI analytics engine — the same
// engine that powers the website, so agents and the UI share one brain.
//
// Run:  node --experimental-strip-types mcp-server/index.ts
// Env:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// =============================================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { db } from "./db.ts";
import {
  analyzeMatch,
  leagueAverages,
  type TeamForm,
} from "../lib/analytics/engine.ts";

/** Wrap any JSON-serialisable value as an MCP text result. */
function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}
function fail(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

interface StandingAgg {
  group_name: string; team_name: string;
  mp: number; w: number; d: number; l: number;
  gf: number; ga: number; gd: number; pts: number;
}

/**
 * Aggregate group-stage standings straight from finished group matches. Avoids
 * the group_standings view (security_invoker; not granted to service_role) so
 * the server stays self-contained.
 */
async function computeStandings(): Promise<StandingAgg[]> {
  const { data, error } = await db()
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

const server = new McpServer({ name: "worldcup-mcp", version: "0.1.0" });

// ── list_fixtures ────────────────────────────────────────────────────────────
server.registerTool(
  "list_fixtures",
  {
    description:
      "List visible World Cup matches with teams, kickoff (UTC), status, score and betting odds (multipliers). Optionally filter by round code (e.g. R16) or group (e.g. A), or to upcoming-only.",
    inputSchema: {
      round: z.string().optional().describe("Round code, e.g. R32, R16, QF"),
      group: z.string().optional().describe("Group letter, e.g. A"),
      upcomingOnly: z.boolean().optional().describe("Only matches not yet finished"),
    },
  },
  async ({ round, group, upcomingOnly }) => {
    let q = db().from("matches").select("*").eq("visible", true).order("match_date", { ascending: true });
    if (round) q = q.eq("round", round);
    if (group) q = q.eq("group_name", group);
    if (upcomingOnly) q = q.neq("status", "FINISHED");
    const { data, error } = await q;
    if (error) return fail(error.message);
    return json((data ?? []).map(summariseMatch));
  },
);

// ── get_match ────────────────────────────────────────────────────────────────
server.registerTool(
  "get_match",
  {
    description: "Get full detail for one match by its numeric id.",
    inputSchema: { matchId: z.number().int().describe("Match id") },
  },
  async ({ matchId }) => {
    const { data, error } = await db().from("matches").select("*").eq("id", matchId).single();
    if (error) return fail(error.message);
    return json(data);
  },
);

// ── get_standings ────────────────────────────────────────────────────────────
server.registerTool(
  "get_standings",
  {
    description: "Group-stage standings (played, W/D/L, goals for/against, goal diff, points). Optionally filter by group.",
    inputSchema: { group: z.string().optional().describe("Group letter, e.g. B") },
  },
  async ({ group }) => {
    let rows: StandingAgg[];
    try {
      rows = await computeStandings();
    } catch (e) {
      return fail((e as Error).message);
    }
    if (group) rows = rows.filter((r) => r.group_name === group);
    rows.sort((a, b) => a.group_name.localeCompare(b.group_name) || b.pts - a.pts || b.gd - a.gd);
    return json(rows);
  },
);

// ── get_bracket ──────────────────────────────────────────────────────────────
server.registerTool(
  "get_bracket",
  {
    description: "The knockout bracket: all visible knockout matches grouped by round, in tournament order.",
    inputSchema: {},
  },
  async () => {
    const { data, error } = await db()
      .from("matches")
      .select("*")
      .not("round", "is", null)
      .eq("visible", true)
      .order("match_date", { ascending: true });
    if (error) return fail(error.message);
    const byRound: Record<string, ReturnType<typeof summariseMatch>[]> = {};
    for (const m of data ?? []) (byRound[m.round ?? "?"] ??= []).push(summariseMatch(m));
    return json(byRound);
  },
);

// ── get_leaderboard ──────────────────────────────────────────────────────────
server.registerTool(
  "get_leaderboard",
  {
    description: "Top predictors by total points.",
    inputSchema: { limit: z.number().int().min(1).max(100).optional().describe("How many (default 10)") },
  },
  async ({ limit }) => {
    const { data, error } = await db()
      .from("profiles")
      .select("username, country, total_points")
      .order("total_points", { ascending: false })
      .limit(limit ?? 10);
    if (error) return fail(error.message);
    return json((data ?? []).map((p, i) => ({ rank: i + 1, ...p })));
  },
);

// ── get_analysis (free tier — same engine as the website) ────────────────────
server.registerTool(
  "get_analysis",
  {
    description:
      "AI analysis for a match: a deterministic Poisson model (built from live group form, independent of the odds) gives a predicted scoreline plus model-vs-market probabilities and any value edge over the bookmaker odds.",
    inputSchema: { matchId: z.number().int().describe("Match id") },
  },
  async ({ matchId }) => {
    let match, standings: StandingAgg[];
    try {
      const [{ data, error }] = [await db().from("matches").select("*").eq("id", matchId).single()];
      if (error) return fail(error.message);
      match = data;
      standings = await computeStandings();
    } catch (e) {
      return fail((e as Error).message);
    }
    if (!match) return fail("Match not found");

    const forms: TeamForm[] = standings.map((r) => ({
      team: r.team_name, mp: r.mp, gf: r.gf, ga: r.ga,
    }));
    const byTeam = new Map(forms.map((f) => [f.team, f]));
    const a = analyzeMatch({
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
    return json({
      match: `${a.home} vs ${a.away}`,
      predictedScore: `${a.predictedScore.home}-${a.predictedScore.away}`,
      modelProbs: a.modelProbs,
      marketProbs: a.marketProbs,
      confidence: a.confidence,
      value: a.value,
      note: "Premium deep analysis (xG, scoreline map, stake) is available via get_premium_analysis, which pays with USDC over x402.",
    });
  },
);

function summariseMatch(m: {
  id: number; team_home: string; team_away: string; status: string;
  score_home: number | null; score_away: number | null;
  multiplier_home: number; multiplier_draw: number; multiplier_away: number;
  match_date: string; round: string | null; group_name: string | null;
}) {
  return {
    id: m.id,
    match: `${m.team_home} vs ${m.team_away}`,
    kickoffUtc: m.match_date,
    status: m.status,
    score: m.score_home === null ? null : `${m.score_home}-${m.score_away}`,
    odds: { home: Number(m.multiplier_home), draw: Number(m.multiplier_draw), away: Number(m.multiplier_away) },
    round: m.round,
    group: m.group_name,
  };
}

const transport = new StdioServerTransport();
await server.connect(transport);
