-- =============================================================================
-- Migration 017: Table grants for the podium snapshot tables
--
-- Migration 016 created final_standings/final_recap with RLS enabled and a
-- SELECT policy for `authenticated` — but no table-level GRANT. In Postgres
-- those are two independent layers: RLS filters WHICH ROWS a role may see, the
-- GRANT decides whether the role may touch the table at all. A policy without a
-- grant denies everything.
--
-- Symptom: PostgREST returned 42501 "permission denied for table
-- final_standings" for service_role, so /r/[slug] 404'd on valid slugs and the
-- OG image silently fell back to the generic card.
--
-- This is the same class of bug as migration 006's group_standings, which is
-- invoker-only and ungranted to service_role — the reason the MCP server
-- computes standings from `matches` by hand instead of reading the view.
--
-- Not caught by the local Postgres test because that ran as superuser with no
-- PostgREST layer, where role grants never apply.
-- =============================================================================

-- service_role: every read in lib/podium.ts goes through the admin client,
-- including the public share card (which has no session to satisfy RLS with).
-- SELECT only — writes happen inside freeze_final_standings(), which is
-- SECURITY DEFINER and runs as the owner.
GRANT SELECT ON public.final_standings TO service_role;
GRANT SELECT ON public.final_recap     TO service_role;

-- authenticated: makes the SELECT policies from 016 actually reachable, and
-- matches how profiles/matches/app_config are granted.
GRANT SELECT ON public.final_standings TO authenticated;
GRANT SELECT ON public.final_recap     TO authenticated;

-- anon is deliberately NOT granted: migration 006 removed anonymous access to
-- app content, and the public share card reads via service_role instead.
