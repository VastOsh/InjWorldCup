-- Replace the own-only SELECT policy with one that allows any authenticated
-- user to read all prediction rows. Privacy (hiding pending picks) is enforced
-- at the API layer in /api/players/[id]/predictions, not at the DB layer.
DROP POLICY IF EXISTS predictions_select_own ON public.predictions;

CREATE POLICY predictions_select_authenticated
  ON public.predictions FOR SELECT
  TO authenticated
  USING (true);
