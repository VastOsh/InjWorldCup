-- Add visibility flag to matches.
-- Matchday 1 matches are visible from the start.
-- Matchday 2 matches are hidden (visible = false) and revealed by the cron
-- below once the earlier match in the same group has kicked off.

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT false;

UPDATE matches SET visible = true WHERE id BETWEEN 1 AND 24;

INSERT INTO matches (id, team_home, team_away, match_date, group_name, status, visible) VALUES
-- Group A
(25, 'Mexico',                'South Korea',            '2026-06-17 20:30:00+00', 'A', 'SCHEDULED', false),
(26, 'South Africa',          'Czechia',                '2026-06-18 23:30:00+00', 'A', 'SCHEDULED', false),
-- Group B
(27, 'Canada',                'Qatar',                  '2026-06-18 19:30:00+00', 'B', 'SCHEDULED', false),
(28, 'Bosnia and Herzegovina','Switzerland',            '2026-06-19 00:30:00+00', 'B', 'SCHEDULED', false),
-- Group C
(29, 'Brazil',                'Haiti',                  '2026-06-19 21:30:00+00', 'C', 'SCHEDULED', false),
(30, 'Morocco',               'Scotland',               '2026-06-20 00:30:00+00', 'C', 'SCHEDULED', false),
-- Group D
(31, 'United States',         'Australia',              '2026-06-19 18:30:00+00', 'D', 'SCHEDULED', false),
(32, 'Paraguay',              'Türkiye',                '2026-06-20 03:30:00+00', 'D', 'SCHEDULED', false),
-- Group E
(33, 'Germany',               'Ivory Coast',            '2026-06-20 16:30:00+00', 'E', 'SCHEDULED', false),
(34, 'Curaçao',               'Ecuador',                '2026-06-20 22:30:00+00', 'E', 'SCHEDULED', false),
-- Group F
(35, 'Netherlands',           'Sweden',                 '2026-06-20 19:30:00+00', 'F', 'SCHEDULED', false),
(36, 'Japan',                 'Tunisia',                '2026-06-21 01:30:00+00', 'F', 'SCHEDULED', false),
-- Group G
(37, 'Belgium',               'Iran',                   '2026-06-21 19:30:00+00', 'G', 'SCHEDULED', false),
(38, 'Egypt',                 'New Zealand',            '2026-06-22 01:30:00+00', 'G', 'SCHEDULED', false),
-- Group H
(39, 'Spain',                 'Saudi Arabia',           '2026-06-21 16:30:00+00', 'H', 'SCHEDULED', false),
(40, 'Cape Verde',            'Uruguay',                '2026-06-21 22:30:00+00', 'H', 'SCHEDULED', false),
-- Group I
(41, 'France',                'Iraq',                   '2026-06-22 18:30:00+00', 'I', 'SCHEDULED', false),
(42, 'Senegal',               'Norway',                 '2026-06-22 21:30:00+00', 'I', 'SCHEDULED', false),
-- Group J
(43, 'Argentina',             'Austria',                '2026-06-23 00:30:00+00', 'J', 'SCHEDULED', false),
(44, 'Algeria',               'Jordan',                 '2026-06-23 03:30:00+00', 'J', 'SCHEDULED', false),
-- Group K
(45, 'Portugal',              'Uzbekistan',             '2026-06-23 16:30:00+00', 'K', 'SCHEDULED', false),
(46, 'DR Congo',              'Colombia',               '2026-06-24 01:30:00+00', 'K', 'SCHEDULED', false),
-- Group L
(47, 'England',               'Ghana',                  '2026-06-23 19:30:00+00', 'L', 'SCHEDULED', false),
(48, 'Croatia',               'Panama',                 '2026-06-23 22:30:00+00', 'L', 'SCHEDULED', false);

-- Reveal matchday-2 matches once the earlier match in the same group has kicked off
SELECT cron.schedule(
  'reveal-matchday2',
  '*/5 * * * *',
  $$
  UPDATE matches
  SET visible = true
  WHERE visible = false
    AND EXISTS (
      SELECT 1 FROM matches m2
      WHERE m2.group_name = matches.group_name
        AND m2.visible = true
        AND m2.match_date < matches.match_date
        AND m2.match_date + interval '2 hours' <= NOW()
    )
  $$
);
