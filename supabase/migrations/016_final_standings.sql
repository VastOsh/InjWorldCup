-- =============================================================================
-- Migration 016: Final standings snapshot + podium reveal
--
-- The leaderboard reads live from profiles and re-sorts on every realtime
-- UPDATE (app/components/Leaderboard.tsx). That is correct during the
-- tournament and wrong once it ends: a podium that can still reshuffle is not
-- a podium.
--
-- final_standings is a snapshot taken once the last match has been scored. The
-- podium and the shareable rank cards read from it, so the result cannot drift
-- if points are later recomputed, a profile is edited, or a score is corrected.
--
-- Ordering note: ties are broken by created_at (earliest signup first), NOT by
-- tie_breaker_answer. The tie-breaker was never used — 0 of 159 players
-- submitted one — so it would rank everybody as Infinity and decide nothing.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- FINAL_STANDINGS
-- Denormalised on purpose: username/avatar/country are copied, not joined, so
-- the podium keeps showing who won under the name they won with.
-- share_slug is a CSPRNG value rather than the rank so that a player's card is
-- only public once they choose to share it (rank URLs would be enumerable).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.final_standings (
  rank          INTEGER     PRIMARY KEY,
  user_id       UUID        NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  username      TEXT        NOT NULL,
  avatar_url    TEXT,
  country       TEXT,
  total_points  INTEGER     NOT NULL,
  exact_count   INTEGER     NOT NULL DEFAULT 0,   -- exact scorelines called
  played_count  INTEGER     NOT NULL DEFAULT 0,   -- scored predictions submitted
  -- Best single call, denormalised for the share card. best_label reads
  -- "Norway 1-2 England" and is frozen so it can't drift with a score edit.
  best_points   INTEGER     NOT NULL DEFAULT 0,
  best_match_id INTEGER     REFERENCES public.matches(id) ON DELETE SET NULL,
  best_label    TEXT,
  share_slug    TEXT        NOT NULL UNIQUE,
  frozen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_final_standings_slug ON public.final_standings (share_slug);

-- Readable by any logged-in player (the podium page). The public share card
-- route reads through the service-role client instead, so no anon policy is
-- needed here — consistent with migration 006 removing anon access.
ALTER TABLE public.final_standings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS final_standings_select_authenticated ON public.final_standings;
CREATE POLICY final_standings_select_authenticated
  ON public.final_standings FOR SELECT
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- FINAL_RECAP
-- Tournament-wide headline stats, frozen at the same moment as the standings.
-- Snapshotted rather than aggregated at request time: the podium page is
-- force-dynamic, and these aggregates scan every scored prediction (~16k rows)
-- which would otherwise run on every page load. Also avoids exposing them
-- through a security_invoker view — migration 006 made group_standings
-- invoker-only, which is why the MCP server can't read it as service_role.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.final_recap (
  stat       TEXT    PRIMARY KEY,   -- 'biggest_haul', 'trickiest_match', ...
  headline   TEXT    NOT NULL,      -- the number, pre-formatted
  subject    TEXT,                  -- who or what it refers to
  detail     TEXT,                  -- supporting sentence
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.final_recap ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS final_recap_select_authenticated ON public.final_recap;
CREATE POLICY final_recap_select_authenticated
  ON public.final_recap FOR SELECT
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- FREEZE
-- Re-runnable: wipes and rebuilds the snapshot. Safe to call again if you spot
-- a wrong score after freezing — fix the match, let the scoring trigger settle,
-- then call this a second time.
--
-- share_slug is regenerated on every freeze, which invalidates already-shared
-- links. Only re-freeze before you announce the podium.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.freeze_final_standings()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  frozen_count INTEGER;
BEGIN
  DELETE FROM public.final_standings;

  INSERT INTO public.final_standings (
    rank, user_id, username, avatar_url, country,
    total_points, exact_count, played_count,
    best_points, best_match_id, best_label, share_slug
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY p.total_points DESC, p.created_at ASC),
    p.id,
    p.username,
    NULLIF(p.avatar_url, ''),
    p.country,
    p.total_points,
    COALESCE(s.exact_count, 0),
    COALESCE(s.played_count, 0),
    COALESCE(b.points_won, 0),
    b.match_id,
    b.label,
    -- CSPRNG, 122 bits. NOT md5(random()) — random() is a seeded PRNG, and the
    -- slug is the only thing keeping an unshared card private, so a guessable
    -- slug would expose every player's name/country/score to anyone.
    -- gen_random_uuid() is core Postgres (pg_catalog), so it still resolves
    -- under this function's SET search_path = public; pgcrypto's
    -- gen_random_bytes() would NOT — it lives in the `extensions` schema.
    replace(gen_random_uuid()::text, '-', '')
  FROM public.profiles p
  LEFT JOIN (
    SELECT
      pr.user_id,
      COUNT(*) FILTER (
        WHERE pr.pred_home = m.score_home AND pr.pred_away = m.score_away
      )::INTEGER AS exact_count,
      COUNT(*)::INTEGER AS played_count
    FROM public.predictions pr
    JOIN public.matches m ON m.id = pr.match_id
    WHERE m.status = 'FINISHED'
      AND pr.is_calculated
    GROUP BY pr.user_id
  ) s ON s.user_id = p.id
  -- Highest-scoring single prediction per player. Ties resolve to the earliest
  -- fixture so the pick is deterministic across re-freezes.
  LEFT JOIN (
    SELECT DISTINCT ON (pr.user_id)
      pr.user_id,
      pr.points_won,
      m.id AS match_id,
      m.team_home || ' ' || m.score_home || '-' || m.score_away || ' ' || m.team_away AS label
    FROM public.predictions pr
    JOIN public.matches m ON m.id = pr.match_id
    WHERE m.status = 'FINISHED'
      AND pr.is_calculated
      AND pr.points_won > 0
    ORDER BY pr.user_id, pr.points_won DESC, m.match_date ASC
  ) b ON b.user_id = p.id;

  GET DIAGNOSTICS frozen_count = ROW_COUNT;

  -- ── Tournament recap ─────────────────────────────────────────────────────
  DELETE FROM public.final_recap;

  -- Biggest single-match haul. Ties resolve by username so a re-freeze is
  -- deterministic (two players tied on 1013 in the real data).
  INSERT INTO public.final_recap (stat, headline, subject, detail, sort_order)
  SELECT
    'biggest_haul',
    to_char(pr.points_won, 'FM999,999'),
    p.username,
    'on ' || m.team_home || ' ' || m.score_home || '-' || m.score_away || ' ' || m.team_away,
    1
  FROM public.predictions pr
  JOIN public.matches m  ON m.id = pr.match_id
  JOIN public.profiles p ON p.id = pr.user_id
  WHERE m.status = 'FINISHED' AND pr.is_calculated
  ORDER BY pr.points_won DESC, m.match_date ASC, p.username ASC
  LIMIT 1;

  -- Hardest match to call: lowest share of players who scored anything.
  -- The >= 20 floor stops a sparsely-predicted fixture from winning on noise.
  INSERT INTO public.final_recap (stat, headline, subject, detail, sort_order)
  SELECT
    'trickiest_match',
    ROUND(100.0 * COUNT(*) FILTER (WHERE pr.points_won > 0) / COUNT(*), 1)::text || '%',
    m.team_home || ' ' || m.score_home || '-' || m.score_away || ' ' || m.team_away,
    COUNT(*) FILTER (WHERE pr.points_won > 0)::text || ' of ' || COUNT(*)::text || ' players called it',
    2
  FROM public.predictions pr
  JOIN public.matches m ON m.id = pr.match_id
  WHERE m.status = 'FINISHED' AND pr.is_calculated
  GROUP BY m.id, m.team_home, m.score_home, m.score_away, m.team_away, m.match_date
  HAVING COUNT(*) >= 20
  ORDER BY
    (100.0 * COUNT(*) FILTER (WHERE pr.points_won > 0) / COUNT(*)) ASC,
    COUNT(*) DESC,
    m.match_date ASC
  LIMIT 1;

  -- Most exact scorelines, read back off the snapshot we just wrote.
  INSERT INTO public.final_recap (stat, headline, subject, detail, sort_order)
  SELECT
    'most_exact',
    fs.exact_count::text,
    fs.username,
    'exact scorelines from ' || fs.played_count::text || ' predictions',
    3
  FROM public.final_standings fs
  WHERE fs.played_count > 0
  ORDER BY fs.exact_count DESC, fs.rank ASC
  LIMIT 1;

  -- Best strike rate among players who actually played most of the tournament.
  INSERT INTO public.final_recap (stat, headline, subject, detail, sort_order)
  SELECT
    'sharpest',
    ROUND(100.0 * s.hits / s.played, 1)::text || '%',
    p.username,
    'hit rate over ' || s.played::text || ' predictions',
    4
  FROM (
    SELECT
      pr.user_id,
      COUNT(*)::int AS played,
      COUNT(*) FILTER (WHERE pr.points_won > 0)::int AS hits
    FROM public.predictions pr
    JOIN public.matches m ON m.id = pr.match_id
    WHERE m.status = 'FINISHED' AND pr.is_calculated
    GROUP BY pr.user_id
    HAVING COUNT(*) >= 50
  ) s
  JOIN public.profiles p ON p.id = s.user_id
  ORDER BY (1.0 * s.hits / s.played) DESC, s.played DESC, p.username ASC
  LIMIT 1;

  -- Scale of the whole thing.
  INSERT INTO public.final_recap (stat, headline, subject, detail, sort_order)
  SELECT
    'total_predictions',
    to_char(COUNT(*), 'FM999,999'),
    NULL,
    'predictions scored from ' || COUNT(DISTINCT pr.user_id)::text || ' players',
    5
  FROM public.predictions pr
  JOIN public.matches m ON m.id = pr.match_id
  WHERE m.status = 'FINISHED' AND pr.is_calculated;

  RETURN frozen_count;
END;
$$;

-- Trigger/admin-only, same hardening as migration 006: never callable through
-- the REST API by a logged-in player.
REVOKE EXECUTE ON FUNCTION public.freeze_final_standings() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- REVEAL FLAG
-- Deliberately NOT derived from "every match is FINISHED": points settle on the
-- scoring trigger a moment after a score is entered, so deriving it would flash
-- an incomplete podium during that window. Flip to 1 by hand once the final
-- numbers look right.
-- ---------------------------------------------------------------------------
INSERT INTO public.app_config (key, value_int)
VALUES ('event_finished', 0)
ON CONFLICT (key) DO NOTHING;
