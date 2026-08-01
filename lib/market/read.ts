// =============================================================================
// Market board loader — assembles the player-facing view model for /market.
//
// Server-only: takes an authenticated SSR client (RLS applies — a user sees the
// public markets + pools, but only their OWN ledger and stakes). Returns plain
// view models (atomic amounts as strings) so they cross the server→client
// boundary cleanly; the client re-parses to BigInt for math.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MarketOutcome, MarketStatus, MatchStatus } from "@/lib/supabase/types";
import { marketDenom, type MarketDenom } from "./config";

type Client = SupabaseClient<Database>;

const OUTCOMES: readonly MarketOutcome[] = ["home", "draw", "away"];

function zeroBy<T>(fill: T): Record<MarketOutcome, T> {
  return { home: fill, draw: fill, away: fill };
}

export interface MarketVM {
  id: number;
  status: MarketStatus;
  feeBps: number;
  locksAt: string;
  /** Server-computed: no more betting (past lock time or not open). */
  locked: boolean;
  winningOutcome: MarketOutcome | null;
  /** False for head-to-head markets (no draw) — the UI hides the draw outcome. */
  hasDraw: boolean;
  teamHome: string;
  teamAway: string;
  category: string;
  league: string | null;
  matchStatus: MatchStatus;
  scoreHome: number | null;
  scoreAway: number | null;
  /** Atomic pool totals per outcome. */
  pools: Record<MarketOutcome, string>;
  stakeCounts: Record<MarketOutcome, number>;
  /** This user's atomic stake per outcome. */
  myStakes: Record<MarketOutcome, string>;
}

export interface MarketBoard {
  denom: MarketDenom;
  /** This user's atomic balance in the market denom. */
  balance: string;
  markets: MarketVM[];
}

export async function loadMarketBoard(supabase: Client, userId: string | null): Promise<MarketBoard> {
  const denom = marketDenom();

  // Active + resolved markets (skip void), soonest lock first. Markets + pools
  // are public; pass an admin client for a signed-out visitor so RLS doesn't
  // hide the board. Balance + stakes are only fetched when a user is present.
  const { data: markets } = await supabase
    .from("markets")
    .select(
      "id, fee_bps, status, locks_at, winning_outcome, has_draw, matches!inner(team_home, team_away, status, score_home, score_away, category, league)",
    )
    .eq("denom", denom.denom)
    .in("status", ["open", "locked", "settled"])
    .order("locks_at", { ascending: true });

  const rows = markets ?? [];
  const ids = rows.map((m) => m.id);

  // Pools (public aggregate), this user's balance, and this user's stakes.
  const [{ data: pools }, { data: ledger }, { data: myStakes }] = await Promise.all([
    ids.length
      ? supabase.from("market_pools").select("market_id, outcome, pool, stake_count").in("market_id", ids)
      : Promise.resolve({ data: [] as { market_id: number; outcome: MarketOutcome; pool: string; stake_count: number }[] }),
    userId
      ? supabase.from("wallet_ledger").select("delta").eq("user_id", userId).eq("denom", denom.denom)
      : Promise.resolve({ data: [] as { delta: string }[] }),
    userId && ids.length
      ? supabase.from("stakes").select("market_id, outcome, amount").eq("user_id", userId).in("market_id", ids)
      : Promise.resolve({ data: [] as { market_id: number; outcome: MarketOutcome; amount: string }[] }),
  ]);

  const balance = (ledger ?? []).reduce((sum, r) => sum + BigInt(r.delta), BigInt(0)).toString();

  const poolByMarket = new Map<number, Record<MarketOutcome, string>>();
  const countByMarket = new Map<number, Record<MarketOutcome, number>>();
  for (const p of pools ?? []) {
    const pm = poolByMarket.get(p.market_id) ?? zeroBy("0");
    const cm = countByMarket.get(p.market_id) ?? zeroBy(0);
    pm[p.outcome] = p.pool;
    cm[p.outcome] = p.stake_count;
    poolByMarket.set(p.market_id, pm);
    countByMarket.set(p.market_id, cm);
  }

  const mineByMarket = new Map<number, Record<MarketOutcome, bigint>>();
  for (const s of myStakes ?? []) {
    const mm = mineByMarket.get(s.market_id) ?? zeroBy(BigInt(0));
    mm[s.outcome] = mm[s.outcome] + BigInt(s.amount);
    mineByMarket.set(s.market_id, mm);
  }

  const vms: MarketVM[] = rows.map((m) => {
    const match = m.matches as unknown as {
      team_home: string; team_away: string; status: MatchStatus;
      score_home: number | null; score_away: number | null;
      category: string; league: string | null;
    };
    const mine = mineByMarket.get(m.id) ?? zeroBy(BigInt(0));
    const myStakesStr = zeroBy("0");
    for (const o of OUTCOMES) myStakesStr[o] = mine[o].toString();
    return {
      id: m.id,
      status: m.status,
      feeBps: m.fee_bps,
      locksAt: m.locks_at,
      locked: m.status !== "open" || Date.now() >= new Date(m.locks_at).getTime(),
      winningOutcome: m.winning_outcome,
      hasDraw: m.has_draw,
      teamHome: match.team_home,
      teamAway: match.team_away,
      category: match.category,
      league: match.league,
      matchStatus: match.status,
      scoreHome: match.score_home,
      scoreAway: match.score_away,
      pools: poolByMarket.get(m.id) ?? zeroBy("0"),
      stakeCounts: countByMarket.get(m.id) ?? zeroBy(0),
      myStakes: myStakesStr,
    };
  });

  return { denom, balance, markets: vms };
}
