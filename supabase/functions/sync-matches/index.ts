import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DAILY_LIMIT = 95; // leave 5 req buffer from the 100/day cap
const WC_LEAGUE_ID = 1;
const WC_SEASON = 2026;

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"]);
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── 1. Check daily request budget ──────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);

  const { data: log } = await adminClient
    .from("api_request_log")
    .select("count")
    .eq("date", today)
    .maybeSingle();

  const usedToday = log?.count ?? 0;
  if (usedToday >= DAILY_LIMIT) {
    return json({ skipped: true, reason: "daily_limit_reached", used: usedToday });
  }

  // ── 2. Skip if no active matches in our DB ─────────────────────────────────
  const { data: activeMatches } = await adminClient
    .from("matches")
    .select("id, round")
    .in("status", ["SCHEDULED", "LIVE"]);

  if (!activeMatches?.length) {
    return json({ skipped: true, reason: "no_active_matches" });
  }

  // ── 3. Fetch today + upcoming fixtures from API-Football ───────────────────
  const apiKey = Deno.env.get("API_FOOTBALL_KEY")!;
  const url = `https://v3.football.api-sports.io/fixtures?league=${WC_LEAGUE_ID}&season=${WC_SEASON}`;

  const apiRes = await fetch(url, {
    headers: {
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": "v3.football.api-sports.io",
    },
  });

  // ── 4. Increment daily counter (regardless of parse success) ───────────────
  await adminClient
    .from("api_request_log")
    .upsert({ date: today, count: usedToday + 1 }, { onConflict: "date" });

  if (!apiRes.ok) {
    return json({ error: "API-Football request failed", status: apiRes.status }, 502);
  }

  const payload = await apiRes.json();
  const fixtures: unknown[] = payload.response ?? [];

  if (!fixtures.length) {
    return json({ updated: 0, reason: "no_fixtures_returned" });
  }

  // ── 5. Map API fixture IDs to our DB IDs ───────────────────────────────────
  // round is non-null only for knockout matches; we use it to gate the
  // "who advances" capture below.
  const roundById = new Map<number, string | null>(
    activeMatches.map((m) => [m.id, m.round]),
  );
  let updated = 0;

  for (const fixture of fixtures) {
    const f = fixture as {
      fixture: { id: number; status: { short: string } };
      teams: { home: { winner: boolean | null }; away: { winner: boolean | null } };
      goals: { home: number | null; away: number | null };
      score: { penalty: { home: number | null; away: number | null } };
    };

    const fixtureId: number = f.fixture.id;
    if (!roundById.has(fixtureId)) continue;

    const shortStatus: string = f.fixture.status.short;
    let dbStatus: "SCHEDULED" | "LIVE" | "FINISHED";

    if (FINISHED_STATUSES.has(shortStatus)) {
      dbStatus = "FINISHED";
    } else if (LIVE_STATUSES.has(shortStatus)) {
      dbStatus = "LIVE";
    } else {
      dbStatus = "SCHEDULED";
    }

    const patch: Record<string, unknown> = { status: dbStatus };
    if (dbStatus === "FINISHED" || dbStatus === "LIVE") {
      patch.score_home = f.goals.home;
      patch.score_away = f.goals.away;
    }

    // Knockout matches: once finished, record who advanced and the shootout
    // score. goals.home/away already hold the 120' result (a draw when the tie
    // went to penalties); teams.*.winner reflects the overall qualifier even
    // when decided on penalties. Setting advance_winner in this same update is
    // required so the scoring trigger sees it on the FINISHED transition.
    if (dbStatus === "FINISHED" && roundById.get(fixtureId) !== null) {
      patch.advance_winner = f.teams.home.winner === true ? "home"
        : f.teams.away.winner === true ? "away"
        : null;
      patch.pen_home = f.score.penalty.home;
      patch.pen_away = f.score.penalty.away;
    }

    const { error } = await adminClient
      .from("matches")
      .update(patch)
      .eq("id", fixtureId);

    if (!error) updated++;
  }

  return json({ updated, used: usedToday + 1, remaining: DAILY_LIMIT - usedToday - 1 });
});
