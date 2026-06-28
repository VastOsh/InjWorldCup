-- Reveal matches 24 hours before kickoff.
--
-- Replaces the chained reveal logic from migrations 008/009/011 (which revealed
-- a match only once its predecessor had been live for 2 hours). That coupling
-- was indirect and made the prediction window depend on the fixture spacing.
--
-- New rule: a match becomes visible (and thus open for predictions) as soon as
-- NOW() reaches 24 hours before its match_date. Predictions still lock at
-- kickoff (match_date <= now) — see app/page.tsx. This gives everyone a
-- consistent, predictable 24h window to place their predictions.

SELECT cron.unschedule('reveal-next-matches');

SELECT cron.schedule(
  'reveal-next-matches',
  '*/5 * * * *',
  $$
  UPDATE matches
  SET visible = true
  WHERE visible = false
    AND match_date - interval '24 hours' <= NOW()
  $$
);
