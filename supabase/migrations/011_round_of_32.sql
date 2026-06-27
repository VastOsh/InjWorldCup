-- Add Round of 32 (knockout) matches.
--
-- Knockout matches have group_name = NULL, so the front-end renders them under
-- the "Other Matches" section (see app/page.tsx). Several fixtures still carry
-- placeholder opponents (e.g. "3rd Group C/E/F/H/I") that only resolve once the
-- group stage final standings are known.
--
-- Reveal logic is generalised here so it covers both stages:
--   * group-stage match (group_name NOT NULL): revealed once the direct
--     predecessor *in the same group* (by date) has been live for 2 hours
--     — identical to migration 009.
--   * knockout match (group_name IS NULL): revealed once the direct
--     predecessor *overall* (by date) has been live for 2 hours. This gates the
--     first Round-of-32 match on the last group match, then chains each
--     knockout match to the previous one.

SELECT cron.unschedule('reveal-next-matches');

SELECT cron.schedule(
  'reveal-next-matches',
  '*/5 * * * *',
  $$
  UPDATE matches
  SET visible = true
  WHERE visible = false
    AND EXISTS (
      SELECT 1 FROM matches m2
      WHERE m2.visible = true
        AND m2.match_date + interval '2 hours' <= NOW()
        AND m2.match_date = (
          SELECT MAX(m3.match_date)
          FROM matches m3
          WHERE m3.match_date < matches.match_date
            AND (
              matches.group_name IS NULL              -- knockout: any earlier match
              OR m3.group_name = matches.group_name   -- group: same-group earlier match
            )
        )
    )
  $$
);

INSERT INTO matches (id, team_home, team_away, match_date, group_name, status, visible) VALUES
(73, 'South Africa',  'Canada',                  '2026-06-28 19:00:00+00', NULL, 'SCHEDULED', false),
(74, 'Brazil',        'Japan',                   '2026-06-29 17:00:00+00', NULL, 'SCHEDULED', false),
(75, 'Germany',       'Paraguay',                '2026-06-29 20:30:00+00', NULL, 'SCHEDULED', false),
(76, 'Netherlands',   'Morocco',                 '2026-06-30 01:00:00+00', NULL, 'SCHEDULED', false),
(77, 'Ivory Coast',   'Norway',                  '2026-06-30 17:00:00+00', NULL, 'SCHEDULED', false),
(78, 'France',        'Sweden',                  '2026-06-30 21:00:00+00', NULL, 'SCHEDULED', false),
(79, 'Mexico',        '3rd Group C/E/F/H/I',     '2026-07-01 01:00:00+00', NULL, 'SCHEDULED', false),
(80, '1st Group L',   '3rd Group E/H/I/J/K',     '2026-07-01 16:00:00+00', NULL, 'SCHEDULED', false),
(81, 'Belgium',       '3rd Group A/E/H/I/J',     '2026-07-01 20:00:00+00', NULL, 'SCHEDULED', false),
(82, 'United States', 'Bosnia and Herzegovina',  '2026-07-02 00:00:00+00', NULL, 'SCHEDULED', false),
(83, 'Spain',         '2nd Group J',             '2026-07-02 19:00:00+00', NULL, 'SCHEDULED', false),
(84, '2nd Group K',   '2nd Group L',             '2026-07-02 23:00:00+00', NULL, 'SCHEDULED', false),
(85, 'Switzerland',   '3rd Group E/F/G/I/J',     '2026-07-03 03:00:00+00', NULL, 'SCHEDULED', false),
(86, 'Australia',     'Egypt',                   '2026-07-03 18:00:00+00', NULL, 'SCHEDULED', false),
(87, 'Argentina',     'Cape Verde',              '2026-07-04 00:00:00+00', NULL, 'SCHEDULED', false),
(88, '1st Group K',   '3rd Group D/E/I/J/L',     '2026-07-04 01:30:00+00', NULL, 'SCHEDULED', false);
