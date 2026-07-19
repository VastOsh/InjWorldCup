import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

// Server-only: createAdminClient uses the service-role key. Never import this
// module from a "use client" file.

// Final standings live in a snapshot table (migration 016), not in profiles, so
// the podium can't reshuffle after the event ends. See the migration header.

export type FinalStanding = {
  rank: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
  country: string | null;
  total_points: number;
  exact_count: number;
  played_count: number;
  best_points: number;
  best_match_id: number | null;
  best_label: string | null;
  share_slug: string;
};

export type RecapStat = {
  stat: string;
  headline: string;
  subject: string | null;
  detail: string | null;
};

export type CountryStanding = {
  country: string;
  total_points: number;
  player_count: number;
  best_rank: number;
};

const STANDING_COLUMNS =
  "rank, user_id, username, avatar_url, country, total_points, exact_count, played_count, best_points, best_match_id, best_label, share_slug";

// Postgres errors here are indistinguishable from "no such row" once the error
// is discarded, which is exactly how a missing table GRANT (42501) surfaced as a
// 404 on a perfectly valid share slug instead of something diagnosable.
// Log loudly and keep the null/[] fallback so a read failure degrades the page
// rather than crashing it.
function logIfError(where: string, error: { message: string; code?: string } | null) {
  if (error) console.error(`[podium] ${where} failed: ${error.code ?? "?"} ${error.message}`);
}

// Read through the service-role client: the share card route is public, so it
// has no authenticated session to satisfy the RLS policy with.
// cache() dedupes between generateMetadata and the page body on the same request.
export const getFinalStandings = cache(async (): Promise<FinalStanding[]> => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("final_standings")
    .select(STANDING_COLUMNS)
    .order("rank", { ascending: true });
  logIfError("getFinalStandings", error);
  return data ?? [];
});

export const getStandingBySlug = cache(async (slug: string): Promise<FinalStanding | null> => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("final_standings")
    .select(STANDING_COLUMNS)
    .eq("share_slug", slug)
    .maybeSingle();
  logIfError("getStandingBySlug", error);
  return data ?? null;
});

export const getStandingByUserId = cache(async (userId: string): Promise<FinalStanding | null> => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("final_standings")
    .select(STANDING_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  logIfError("getStandingByUserId", error);
  return data ?? null;
});

// The podium is revealed by an explicit flag rather than by "every match is
// FINISHED" — points settle a moment after a score is entered, and deriving it
// would flash an incomplete podium during that window.
export const isEventFinished = cache(async (): Promise<boolean> => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("app_config")
    .select("value_int")
    .eq("key", "event_finished")
    .maybeSingle();
  logIfError("isEventFinished", error);
  return (data?.value_int ?? 0) === 1;
});

export const getRecap = cache(async (): Promise<RecapStat[]> => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("final_recap")
    .select("stat, headline, subject, detail")
    .order("sort_order", { ascending: true });
  logIfError("getRecap", error);
  return data ?? [];
});

// Grouped in JS rather than SQL: it's ~159 rows already in memory, and it keeps
// the ranking rule (sum of points, matching the Countries tab on the
// leaderboard) in one place instead of split across a view.
export const getCountryPodium = cache(async (): Promise<CountryStanding[]> => {
  const standings = await getFinalStandings();
  const byCountry = new Map<string, CountryStanding>();

  for (const s of standings) {
    if (!s.country) continue;
    const prev = byCountry.get(s.country);
    if (prev) {
      prev.total_points += s.total_points;
      prev.player_count += 1;
      prev.best_rank = Math.min(prev.best_rank, s.rank);
    } else {
      byCountry.set(s.country, {
        country: s.country,
        total_points: s.total_points,
        player_count: 1,
        best_rank: s.rank,
      });
    }
  }

  return [...byCountry.values()].sort(
    (a, b) => b.total_points - a.total_points || a.best_rank - b.best_rank,
  );
});

export const totalPlayerCount = cache(async (): Promise<number> => {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from("final_standings")
    .select("rank", { count: "exact", head: true });
  return count ?? 0;
});
