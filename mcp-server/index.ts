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
import { createInjectiveClient } from "@injectivelabs/x402/client";
import { z } from "zod";
import { db } from "./db.ts";
import { computeStandings, loadAnalysis, type StandingAgg } from "./analytics.ts";

/** Wrap any JSON-serialisable value as an MCP text result. */
function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}
function fail(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
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
      rows = await computeStandings(db());
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
    let a;
    try {
      a = await loadAnalysis(db(), matchId);
    } catch (e) {
      return fail((e as Error).message);
    }
    if (!a) return fail("Match not found");
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

// ── get_premium_analysis (paid — agent pays USDC over x402) ──────────────────
server.registerTool(
  "get_premium_analysis",
  {
    description:
      "Deep analysis (expected goals, Over 2.5 / BTTS, scoreline probability map, suggested stake). This tool PAYS for the data: it calls the x402-protected gateway and settles a small USDC payment on Injective automatically before returning the report.",
    inputSchema: { matchId: z.number().int().describe("Match id") },
  },
  async ({ matchId }) => {
    const key = process.env.X402_PAYER_PRIVATE_KEY as `0x${string}` | undefined;
    if (!key) {
      return fail(
        "Set X402_PAYER_PRIVATE_KEY to a funded testnet wallet (holds testnet USDC) to buy premium analysis.",
      );
    }
    const gateway = process.env.X402_GATEWAY_URL || "http://localhost:4021";
    try {
      const client = createInjectiveClient({ privateKey: key, rpcUrl: process.env.X402_RPC_URL });
      const resp = await client.fetch(`${gateway}/premium`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
      if (!resp.ok) {
        return fail(`Gateway responded ${resp.status}: ${await resp.text()}`);
      }
      const receipt = resp.headers.get("payment-response") || resp.headers.get("x-payment-response");
      const data = (await resp.json()) as Record<string, unknown>;
      return json({ ...data, paid: true, settlement: receipt ? "settled on Injective" : "unknown" });
    } catch (e) {
      return fail(`Payment/fetch failed: ${(e as Error).message}`);
    }
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
