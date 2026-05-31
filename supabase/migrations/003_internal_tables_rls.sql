-- =============================================================================
-- Migration 003: Enable RLS on internal server-only tables
-- These tables are written exclusively by Edge Functions (Service Role key),
-- which bypasses RLS. Enabling RLS + no policies = anon/authenticated denied.
-- =============================================================================

ALTER TABLE public.api_request_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_teams      ENABLE ROW LEVEL SECURITY;

-- group_teams is read by the frontend to display group brackets
CREATE POLICY group_teams_select_public
  ON public.group_teams FOR SELECT USING (true);

-- app_config and api_request_log are internal only — no client reads needed
