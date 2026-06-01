-- =============================================================================
-- Migration 006: RLS Security Hardening
--
-- Problems fixed:
--   1. SECURITY DEFINER trigger functions callable by anyone via REST API
--   2. group_standings view running with owner privileges (bypassed RLS)
--   3. profiles UPDATE allowed writing to service-managed columns
--   4. anon role could read matches, profiles, group_teams (unused, app requires login)
--   5. app_config had no SELECT policy (tiebreaker_visible read was silently failing)
-- =============================================================================

-- ── 1. Revoke public EXECUTE on trigger-only SECURITY DEFINER functions
--    These are bound to triggers exclusively. Exposing them via REST API
--    (/rest/v1/rpc/...) is a privilege escalation vector.
REVOKE EXECUTE ON FUNCTION public.calculate_match_predictions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- ── 2. Fix group_standings view: SECURITY DEFINER → SECURITY INVOKER
--    SECURITY DEFINER views run as the owner (bypassing RLS on underlying tables).
--    SECURITY INVOKER enforces the querying user's own RLS context.
ALTER VIEW public.group_standings SET (security_invoker = true);

-- ── 3. Column-level write restriction on profiles
--    The row-level UPDATE policy (auth.uid() = id) restricts which ROW a user
--    can update. This restricts which COLUMNS they can write.
--    total_points, discord_id, username, avatar_url are service-role only.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT  UPDATE (wallet_address, tie_breaker_answer) ON public.profiles TO authenticated;

-- ── 4. Remove anon read access — all app content requires login
--    The proxy and every page redirect unauthenticated users to /auth/login,
--    so anon reads on these tables are unused attack surface.
DROP POLICY IF EXISTS matches_select_public     ON public.matches;
DROP POLICY IF EXISTS profiles_select_public    ON public.profiles;
DROP POLICY IF EXISTS group_teams_select_public ON public.group_teams;

CREATE POLICY matches_select_authenticated
  ON public.matches FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY profiles_select_authenticated
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY group_teams_select_authenticated
  ON public.group_teams FOR SELECT
  TO authenticated
  USING (true);

-- ── 5. app_config: add authenticated SELECT policy
--    The frontend reads tiebreaker_visible from app_config.
--    RLS was enabled with no policy, so all reads were silently returning null.
CREATE POLICY app_config_select_authenticated
  ON public.app_config FOR SELECT
  TO authenticated
  USING (true);
