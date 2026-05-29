-- =============================================================================
-- Trigger Test: Asymmetric Scoring Engine
--
-- Run this in the Supabase SQL Editor (service role).
-- The editor auto-commits DDL, so we CANNOT drop/restore the FK constraint
-- inside a transaction. Instead we seed auth.users directly (service role
-- has permission) so the profiles FK is naturally satisfied.
--
-- Everything is wrapped in BEGIN/ROLLBACK — all test data is discarded at the
-- end. RAISE NOTICE output is still visible in the editor after rollback.
--
-- Test matrix (constants: base=100, exactitude_bonus=50):
--
--  Match 1001 — Brazil vs Haiti  (×home=1.0, ×draw=2.0, ×away=3.0)
--  Actual: 2-1 (Brazil wins, home)
--   Alice  pred 2-1 → Tier 3 exact   → (100+50)*1.0 = 150 pts
--   Bob    pred 1-0 → Tier 2 outcome → 100*1.0      = 100 pts
--   Carol  pred 0-2 → Tier 1 wrong   → 0 pts
--   Dave   pred 1-1 → Tier 1 wrong   → 0 pts
--
--  Match 1002 — Germany vs Japan  (×home=1.0, ×draw=2.0, ×away=2.5)
--  Actual: 1-2 (Japan wins, away)
--   Alice  pred 0-1 → Tier 2 outcome → 100*2.5      = 250 pts
--   Bob    pred 1-2 → Tier 3 exact   → (100+50)*2.5 = 375 pts
--   Carol  pred 2-0 → Tier 1 wrong   → 0 pts
--   Dave   pred 1-1 → Tier 1 wrong   → 0 pts
--
--  Expected final total_points:
--   Alice : 150 + 250 = 400
--   Bob   : 100 + 375 = 475
--   Carol : 0
--   Dave  : 0
-- =============================================================================

BEGIN;

-- ── 1. Seed auth.users (satisfies the profiles FK without touching schema) ───
INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  raw_user_meta_data,
  raw_app_meta_data,
  created_at,
  updated_at,
  is_sso_user
) VALUES
  ('00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'alice@test.local',
   '{"provider_id":"111111111","full_name":"Alice","avatar_url":""}', '{}', NOW(), NOW(), false),
  ('00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bob@test.local',
   '{"provider_id":"222222222","full_name":"Bob","avatar_url":""}',   '{}', NOW(), NOW(), false),
  ('00000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carol@test.local',
   '{"provider_id":"333333333","full_name":"Carol","avatar_url":""}', '{}', NOW(), NOW(), false),
  ('00000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'dave@test.local',
   '{"provider_id":"444444444","full_name":"Dave","avatar_url":""}',  '{}', NOW(), NOW(), false);

-- ── 2. Seed profiles (handle_new_user trigger fires from step 1, but we
--       insert explicitly here to set total_points = 0 cleanly) ───────────
-- The ON CONFLICT DO NOTHING in handle_new_user means the trigger row won't
-- double-insert; we upsert with explicit values to be safe.
INSERT INTO public.profiles (id, discord_id, username, avatar_url, total_points)
VALUES
  ('00000000-0000-0000-0000-000000000001', '111111111', 'Alice', '', 0),
  ('00000000-0000-0000-0000-000000000002', '222222222', 'Bob',   '', 0),
  ('00000000-0000-0000-0000-000000000003', '333333333', 'Carol', '', 0),
  ('00000000-0000-0000-0000-000000000004', '444444444', 'Dave',  '', 0)
ON CONFLICT (id) DO UPDATE SET total_points = 0;

-- ── 3. Seed matches ──────────────────────────────────────────────────────────
INSERT INTO public.matches (id, team_home, team_away, status, match_date,
                            multiplier_home, multiplier_draw, multiplier_away)
VALUES
  (1001, 'Brazil',  'Haiti',  'SCHEDULED', NOW() - INTERVAL '2 hours', 1.0, 2.0, 3.0),
  (1002, 'Germany', 'Japan',  'SCHEDULED', NOW() - INTERVAL '2 hours', 1.0, 2.0, 2.5);

-- ── 4. Seed predictions ──────────────────────────────────────────────────────
INSERT INTO public.predictions (user_id, match_id, pred_home, pred_away) VALUES
  ('00000000-0000-0000-0000-000000000001', 1001, 2, 1),
  ('00000000-0000-0000-0000-000000000002', 1001, 1, 0),
  ('00000000-0000-0000-0000-000000000003', 1001, 0, 2),
  ('00000000-0000-0000-0000-000000000004', 1001, 1, 1),

  ('00000000-0000-0000-0000-000000000001', 1002, 0, 1),
  ('00000000-0000-0000-0000-000000000002', 1002, 1, 2),
  ('00000000-0000-0000-0000-000000000003', 1002, 2, 0),
  ('00000000-0000-0000-0000-000000000004', 1002, 1, 1);

-- ── 5. Pre-condition: nothing calculated yet ─────────────────────────────────
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM public.predictions WHERE is_calculated = true) = 0,
    'PRE-CONDITION FAIL: predictions should all be uncalculated';
  RAISE NOTICE 'PRE-CONDITION PASS: all predictions uncalculated';
END;
$$;

-- ── 6. Finalize match 1001 — fires the trigger ───────────────────────────────
UPDATE public.matches
SET status = 'FINISHED', score_home = 2, score_away = 1
WHERE id = 1001;

-- ── 7. Assert match 1001 prediction points ───────────────────────────────────
DO $$
DECLARE
  v_alice INTEGER; v_bob INTEGER; v_carol INTEGER; v_dave INTEGER;
BEGIN
  SELECT points_won INTO v_alice FROM public.predictions WHERE user_id = '00000000-0000-0000-0000-000000000001' AND match_id = 1001;
  SELECT points_won INTO v_bob   FROM public.predictions WHERE user_id = '00000000-0000-0000-0000-000000000002' AND match_id = 1001;
  SELECT points_won INTO v_carol FROM public.predictions WHERE user_id = '00000000-0000-0000-0000-000000000003' AND match_id = 1001;
  SELECT points_won INTO v_dave  FROM public.predictions WHERE user_id = '00000000-0000-0000-0000-000000000004' AND match_id = 1001;

  ASSERT v_alice = 150, FORMAT('FAIL 1001 Alice: expected 150, got %s', v_alice);
  ASSERT v_bob   = 100, FORMAT('FAIL 1001 Bob:   expected 100, got %s', v_bob);
  ASSERT v_carol = 0,   FORMAT('FAIL 1001 Carol: expected 0,   got %s', v_carol);
  ASSERT v_dave  = 0,   FORMAT('FAIL 1001 Dave:  expected 0,   got %s', v_dave);

  RAISE NOTICE 'PASS match 1001 points — Alice=%, Bob=%, Carol=%, Dave=%',
    v_alice, v_bob, v_carol, v_dave;
END;
$$;

-- ── 8. Assert is_calculated lock for match 1001 ──────────────────────────────
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM public.predictions WHERE match_id = 1001 AND is_calculated = false) = 0,
    'FAIL: match 1001 rows should all be locked';
  RAISE NOTICE 'PASS match 1001 — is_calculated lock verified';
END;
$$;

-- ── 9. Idempotency: re-fire on already-FINISHED match ────────────────────────
-- Simulates a duplicate cron job update; points must not change.
UPDATE public.matches SET score_home = 2, score_away = 1 WHERE id = 1001;

DO $$
BEGIN
  ASSERT (SELECT total_points FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001') = 150,
    'FAIL: idempotency broken — Alice points changed on re-fire';
  RAISE NOTICE 'PASS idempotency — re-fire had no effect';
END;
$$;

-- ── 10. Finalize match 1002 — Germany 1-2 Japan ──────────────────────────────
UPDATE public.matches
SET status = 'FINISHED', score_home = 1, score_away = 2
WHERE id = 1002;

-- ── 11. Assert final total_points (both matches combined) ────────────────────
DO $$
DECLARE
  v_alice INTEGER; v_bob INTEGER; v_carol INTEGER; v_dave INTEGER;
BEGIN
  SELECT total_points INTO v_alice FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001';
  SELECT total_points INTO v_bob   FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000002';
  SELECT total_points INTO v_carol FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000003';
  SELECT total_points INTO v_dave  FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000004';

  ASSERT v_alice = 400, FORMAT('FAIL Alice total: expected 400, got %s', v_alice);
  ASSERT v_bob   = 475, FORMAT('FAIL Bob total:   expected 475, got %s', v_bob);
  ASSERT v_carol = 0,   FORMAT('FAIL Carol total: expected 0,   got %s', v_carol);
  ASSERT v_dave  = 0,   FORMAT('FAIL Dave total:  expected 0,   got %s', v_dave);

  RAISE NOTICE 'PASS final totals — Alice=%, Bob=%, Carol=%, Dave=%',
    v_alice, v_bob, v_carol, v_dave;
END;
$$;

-- ── 12. Roll back all test data (auth.users cascade-deletes profiles) ─────────
ROLLBACK;
