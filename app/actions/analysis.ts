'use server'

import { createClient } from "@/lib/supabase/server";
import { analyzeMatchById } from "@/lib/analytics/data";
import type { Outcome, Probs } from "@/lib/analytics/engine";

/**
 * Free-tier AI analysis for a match. Read-only: never writes to the DB.
 *
 * Returns only the free subset — predicted scoreline, model vs market
 * probabilities, value edge, confidence. Premium fields (expected goals,
 * scoreline distribution, form breakdown) are withheld here and served by the
 * x402-gated endpoint instead.
 */
export interface FreeAnalysis {
  home: string;
  away: string;
  predictedScore: { home: number; away: number };
  modelProbs: Probs;
  marketProbs: Probs;
  confidence: number;
  value: { outcome: Outcome; edge: number } | null;
}

export async function getMatchAnalysis(
  matchId: number,
): Promise<{ analysis?: FreeAnalysis; error?: string }> {
  // Server Actions are reachable via direct POST — always verify auth here.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const full = await analyzeMatchById(supabase, matchId);
  if (!full) return { error: "Match not found." };

  return {
    analysis: {
      home: full.home,
      away: full.away,
      predictedScore: full.predictedScore,
      modelProbs: full.modelProbs,
      marketProbs: full.marketProbs,
      confidence: full.confidence,
      value: full.value,
    },
  };
}
