-- =============================================================================
-- Market categories — the platform isn't football-only. A match now carries a
-- CATEGORY (Football, Tennis, Golf, Basketball, … or a general topic) and an
-- optional LEAGUE / event label (e.g. "FIFA World Cup 2026", "ATP Masters").
-- These are display metadata only; the parimutuel engine is unchanged. Existing
-- rows default to Football so nothing breaks.
-- =============================================================================

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Football',
  ADD COLUMN IF NOT EXISTS league   TEXT;
