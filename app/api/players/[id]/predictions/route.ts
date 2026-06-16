import { createClient } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: profile }, { data: predictions }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, avatar_url, country, total_points")
      .eq("id", id)
      .single(),
    supabase
      .from("predictions")
      .select(
        "match_id, pred_home, pred_away, points_won, is_calculated, matches(id, team_home, team_away, status, score_home, score_away, match_date)"
      )
      .eq("user_id", id),
  ]);

  type PredWithMatch = {
    match_id: number;
    pred_home: number | null;
    pred_away: number | null;
    points_won: number;
    is_calculated: boolean;
    matches: { id: number; team_home: string; team_away: string; status: string; score_home: number | null; score_away: number | null; match_date: string } | null;
  };

  const isSelf = user.id === id;
  const safe: PredWithMatch[] = (predictions ?? []).map((p) => {
    const row = p as PredWithMatch;
    const revealed =
      isSelf ||
      row.matches?.status === "FINISHED" ||
      row.matches?.status === "LIVE";
    return revealed
      ? row
      : { ...row, pred_home: null, pred_away: null };
  });

  return Response.json({ profile, predictions: safe });
}
