-- Add matchday 3 matches (hidden until matchday 2 finishes for each group).
--
-- Cron updated to use direct-predecessor logic: a match is revealed only when
-- the match immediately before it in the same group (by date) has been running
-- for 2 hours. This prevents matchday 3 from being revealed at the same time
-- as matchday 2 (which would happen with the old "any earlier match" condition).

SELECT cron.unschedule('reveal-matchday2');

SELECT cron.schedule(
  'reveal-next-matches',
  '*/5 * * * *',
  $$
  UPDATE matches
  SET visible = true
  WHERE visible = false
    AND EXISTS (
      SELECT 1 FROM matches m2
      WHERE m2.group_name = matches.group_name
        AND m2.match_date = (
          SELECT MAX(m3.match_date)
          FROM matches m3
          WHERE m3.group_name = matches.group_name
            AND m3.match_date < matches.match_date
        )
        AND m2.visible = true
        AND m2.match_date + interval '2 hours' <= NOW()
    )
  $$
);

INSERT INTO matches (id, team_home, team_away, match_date, group_name, status, visible) VALUES
-- Group A
(53, 'Czechia',               'Mexico',                 '2026-06-24 23:00:00+00', 'A', 'SCHEDULED', false),
(54, 'South Africa',          'South Korea',            '2026-06-24 23:00:00+00', 'A', 'SCHEDULED', false),
-- Group B
(51, 'Canada',                'Switzerland',            '2026-06-24 23:00:00+00', 'B', 'SCHEDULED', false),
(52, 'Bosnia and Herzegovina','Qatar',                  '2026-06-24 23:00:00+00', 'B', 'SCHEDULED', false),
-- Group C
(49, 'Scotland',              'Brazil',                 '2026-06-24 20:00:00+00', 'C', 'SCHEDULED', false),
(50, 'Morocco',               'Haiti',                  '2026-06-24 20:00:00+00', 'C', 'SCHEDULED', false),
-- Group D
(59, 'Türkiye',               'United States',          '2026-06-25 23:00:00+00', 'D', 'SCHEDULED', false),
(60, 'Paraguay',              'Australia',              '2026-06-25 23:00:00+00', 'D', 'SCHEDULED', false),
-- Group E
(55, 'Curaçao',               'Ivory Coast',            '2026-06-25 19:00:00+00', 'E', 'SCHEDULED', false),
(56, 'Ecuador',               'Germany',                '2026-06-25 19:00:00+00', 'E', 'SCHEDULED', false),
-- Group F
(57, 'Japan',                 'Sweden',                 '2026-06-25 19:00:00+00', 'F', 'SCHEDULED', false),
(58, 'Tunisia',               'Netherlands',            '2026-06-25 19:00:00+00', 'F', 'SCHEDULED', false),
-- Group G
(63, 'Egypt',                 'Iran',                   '2026-06-26 23:00:00+00', 'G', 'SCHEDULED', false),
(64, 'New Zealand',           'Belgium',                '2026-06-26 23:00:00+00', 'G', 'SCHEDULED', false),
-- Group H
(65, 'Uruguay',               'Spain',                  '2026-06-26 23:00:00+00', 'H', 'SCHEDULED', false),
(66, 'Cape Verde',            'Saudi Arabia',           '2026-06-26 23:00:00+00', 'H', 'SCHEDULED', false),
-- Group I
(61, 'Norway',                'France',                 '2026-06-26 20:00:00+00', 'I', 'SCHEDULED', false),
(62, 'Senegal',               'Iraq',                   '2026-06-26 20:00:00+00', 'I', 'SCHEDULED', false),
-- Group J
(69, 'Jordan',                'Argentina',              '2026-06-27 19:00:00+00', 'J', 'SCHEDULED', false),
(70, 'Algeria',               'Austria',                '2026-06-27 19:00:00+00', 'J', 'SCHEDULED', false),
-- Group K
(71, 'Colombia',              'Portugal',               '2026-06-27 23:00:00+00', 'K', 'SCHEDULED', false),
(72, 'DR Congo',              'Uzbekistan',             '2026-06-27 23:00:00+00', 'K', 'SCHEDULED', false),
-- Group L
(67, 'Croatia',               'England',                '2026-06-27 19:00:00+00', 'L', 'SCHEDULED', false),
(68, 'Panama',                'Ghana',                  '2026-06-27 19:00:00+00', 'L', 'SCHEDULED', false);
