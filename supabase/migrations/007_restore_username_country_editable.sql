-- Restore user-editability of username and country on profiles.
-- Migration 006 locked these to service-role only; reverting that decision.
GRANT UPDATE (username, country) ON public.profiles TO authenticated;
