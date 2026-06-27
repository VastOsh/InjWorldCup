-- Add a `round` column to classify knockout matches by stage.
--
-- Group-stage matches keep round = NULL (they are already grouped via
-- group_name). Knockout matches carry a stable code that the front-end maps to
-- a display label and orders into its own section:
--   R32   -> Round of 32
--   R16   -> Round of 16
--   QF    -> Quarter-finals
--   SF    -> Semi-finals
--   3RD   -> Third-place play-off
--   FINAL -> Final

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS round TEXT;

UPDATE public.matches SET round = 'R32' WHERE id BETWEEN 73 AND 88;
