export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type MatchStatus = "SCHEDULED" | "LIVE" | "FINISHED";

// ── Parimutuel market (migration 019) ──────────────────────────────────────
export type MarketOutcome = "home" | "draw" | "away";
export type MarketStatus = "open" | "locked" | "settled" | "void";
export type LedgerReason = "deposit" | "withdraw" | "stake" | "payout" | "refund";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          discord_id: string;
          username: string;
          avatar_url: string;
          wallet_address: string | null;
          holds_coa: boolean;
          coa_checked_at: string | null;
          country: string | null;
          total_points: number;
          tie_breaker_answer: number | null;
          created_at: string;
        };
        Insert: {
          id: string;
          discord_id: string;
          username: string;
          avatar_url: string;
          wallet_address?: string | null;
          holds_coa?: boolean;
          coa_checked_at?: string | null;
          country?: string | null;
          total_points?: number;
          tie_breaker_answer?: number | null;
          created_at?: string;
        };
        Update: {
          discord_id?: string;
          username?: string;
          avatar_url?: string;
          wallet_address?: string | null;
          holds_coa?: boolean;
          coa_checked_at?: string | null;
          country?: string | null;
          total_points?: number;
          tie_breaker_answer?: number | null;
        };
        Relationships: [];
      };
      matches: {
        Row: {
          id: number;
          team_home: string;
          team_away: string;
          status: MatchStatus;
          score_home: number | null;
          score_away: number | null;
          multiplier_home: number;
          multiplier_draw: number;
          multiplier_away: number;
          match_date: string;
          group_name: string | null;
          visible: boolean;
          round: string | null;
          advance_winner: "home" | "away" | null;
          pen_home: number | null;
          pen_away: number | null;
        };
        Insert: {
          id: number;
          team_home: string;
          team_away: string;
          status?: MatchStatus;
          score_home?: number | null;
          score_away?: number | null;
          multiplier_home?: number;
          multiplier_draw?: number;
          multiplier_away?: number;
          match_date: string;
          group_name?: string | null;
          visible?: boolean;
          round?: string | null;
          advance_winner?: "home" | "away" | null;
          pen_home?: number | null;
          pen_away?: number | null;
        };
        Update: {
          team_home?: string;
          team_away?: string;
          status?: MatchStatus;
          score_home?: number | null;
          score_away?: number | null;
          multiplier_home?: number;
          multiplier_draw?: number;
          multiplier_away?: number;
          match_date?: string;
          group_name?: string | null;
          visible?: boolean;
          round?: string | null;
          advance_winner?: "home" | "away" | null;
          pen_home?: number | null;
          pen_away?: number | null;
        };
        Relationships: [];
      };
      group_teams: {
        Row: { group_name: string; team_name: string };
        Insert: { group_name: string; team_name: string };
        Update: { group_name?: string; team_name?: string };
        Relationships: [];
      };
      app_config: {
        Row: { key: string; value_int: number | null };
        Insert: { key: string; value_int?: number | null };
        Update: { value_int?: number | null };
        Relationships: [];
      };
      final_standings: {
        Row: {
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
          frozen_at: string;
        };
        Insert: {
          rank: number;
          user_id: string;
          username: string;
          avatar_url?: string | null;
          country?: string | null;
          total_points: number;
          exact_count?: number;
          played_count?: number;
          best_points?: number;
          best_match_id?: number | null;
          best_label?: string | null;
          share_slug: string;
          frozen_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      final_recap: {
        Row: {
          stat: string;
          headline: string;
          subject: string | null;
          detail: string | null;
          sort_order: number;
        };
        Insert: {
          stat: string;
          headline: string;
          subject?: string | null;
          detail?: string | null;
          sort_order?: number;
        };
        Update: never;
        Relationships: [];
      };
      predictions: {
        Row: {
          id: string;
          user_id: string;
          match_id: number;
          pred_home: number;
          pred_away: number;
          pred_advance: "home" | "away" | null;
          points_won: number;
          is_calculated: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          match_id: number;
          pred_home: number;
          pred_away: number;
          pred_advance?: "home" | "away" | null;
          points_won?: number;
          is_calculated?: boolean;
          created_at?: string;
        };
        Update: {
          pred_home?: number;
          pred_away?: number;
          pred_advance?: "home" | "away" | null;
          points_won?: number;
          is_calculated?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "predictions_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      // ── Parimutuel market (migration 019) ────────────────────────────────
      // Atomic amount columns (NUMERIC(78,0)) are typed `string`: an 18-dp INJ
      // amount overflows JS number, so parse them with BigInt at the edge.
      wallet_ledger: {
        Row: {
          id: number;
          user_id: string;
          denom: string;
          delta: string;
          reason: LedgerReason;
          ref: string | null;
          tx_hash: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          denom: string;
          delta: string | number;
          reason: LedgerReason;
          ref?: string | null;
          tx_hash?: string | null;
          created_at?: string;
        };
        Update: {
          ref?: string | null;
          tx_hash?: string | null;
        };
        Relationships: [];
      };
      markets: {
        Row: {
          id: number;
          match_id: number;
          denom: string;
          fee_bps: number;
          status: MarketStatus;
          locks_at: string;
          winning_outcome: MarketOutcome | null;
          settled_at: string | null;
          paused_at: string | null;
          created_at: string;
        };
        Insert: {
          match_id: number;
          denom: string;
          fee_bps?: number;
          status?: MarketStatus;
          locks_at: string;
          winning_outcome?: MarketOutcome | null;
          settled_at?: string | null;
          paused_at?: string | null;
          created_at?: string;
        };
        Update: {
          denom?: string;
          fee_bps?: number;
          status?: MarketStatus;
          locks_at?: string;
          winning_outcome?: MarketOutcome | null;
          settled_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "markets_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      stakes: {
        Row: {
          id: number;
          market_id: number;
          user_id: string;
          outcome: MarketOutcome;
          amount: string;
          ledger_id: number;
          payout_ledger_id: number | null;
          created_at: string;
        };
        Insert: {
          market_id: number;
          user_id: string;
          outcome: MarketOutcome;
          amount: string | number;
          ledger_id: number;
          payout_ledger_id?: number | null;
          created_at?: string;
        };
        Update: {
          payout_ledger_id?: number | null;
        };
        Relationships: [];
      };
      market_pools: {
        Row: {
          market_id: number;
          outcome: MarketOutcome;
          pool: string;
          stake_count: number;
        };
        Insert: {
          market_id: number;
          outcome: MarketOutcome;
          pool?: string | number;
          stake_count?: number;
        };
        Update: {
          pool?: string | number;
          stake_count?: number;
        };
        Relationships: [];
      };
      withdrawals: {
        Row: {
          id: number;
          user_id: string;
          denom: string;
          amount: string;
          to_address: string;
          status: "pending" | "sent" | "failed";
          debit_ledger_id: number;
          refund_ledger_id: number | null;
          tx_hash: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          denom: string;
          amount: string | number;
          to_address: string;
          status?: "pending" | "sent" | "failed";
          debit_ledger_id: number;
          refund_ledger_id?: number | null;
          tx_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: "pending" | "sent" | "failed";
          refund_ledger_id?: number | null;
          tx_hash?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      reserve_snapshots: {
        Row: {
          id: number;
          denom: string;
          reserves: string;
          liabilities: string;
          surplus: string;
          solvent: boolean;
          checked_at: string;
        };
        Insert: {
          denom: string;
          reserves: string | number;
          liabilities: string | number;
          surplus: string | number;
          solvent: boolean;
          checked_at?: string;
        };
        Update: {
          solvent?: boolean;
        };
        Relationships: [];
      };
    };
    Views: {
      group_standings: {
        Row: {
          group_name: string;
          team_name: string;
          mp: number;
          w: number;
          d: number;
          l: number;
          gf: number;
          ga: number;
          gd: number;
          pts: number;
        };
        Relationships: [];
      };
      // Ops-only (service role): per-denom liabilities rollup for solvency.
      market_liabilities: {
        Row: {
          denom: string;
          liabilities: string;
          deposits: string;
          withdrawn: string;
          refunded: string;
          staked: string;
          paid_out: string;
          holders: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      // Client-callable: place a bet. Amount is atomic units passed as a string
      // (bigint isn't JSON-serialisable). Returns { stake_id, new_balance, denom }.
      place_stake: {
        Args: { p_market_id: number; p_outcome: MarketOutcome; p_amount: string | number };
        Returns: Json;
      };
      // Service-role only: settle/void a finished market. Returns a summary blob.
      settle_market: {
        Args: { p_market_id: number };
        Returns: Json;
      };
      // Client-callable: reserve funds for a cash-out. Returns { withdrawal_id, new_balance }.
      request_withdrawal: {
        Args: { p_denom: string; p_amount: string | number; p_to_address: string };
        Returns: Json;
      };
      // Service-role only: confirm a broadcast tx for a pending withdrawal.
      mark_withdrawal_sent: {
        Args: { p_id: number; p_tx_hash: string };
        Returns: Json;
      };
      // Service-role only: refund a failed withdrawal reservation.
      fail_withdrawal: {
        Args: { p_id: number };
        Returns: Json;
      };
      // Service-role only: record a solvency reconciliation from a fed-in on-chain
      // reserve. Returns { snapshot_id, denom, reserves, liabilities, surplus, solvent }.
      record_reserve_snapshot: {
        Args: { p_denom: string; p_reserves: string | number };
        Returns: Json;
      };
      // Service-role only: halt / resume new bets on a market (settlement unaffected).
      pause_market: {
        Args: { p_market_id: number };
        Returns: Json;
      };
      resume_market: {
        Args: { p_market_id: number };
        Returns: Json;
      };
      // Service-role only: void a market and refund every stake (idempotent).
      cancel_market: {
        Args: { p_market_id: number };
        Returns: Json;
      };
      // Service-role only: withdrawals pending longer than p_min_age (an INTERVAL
      // string, e.g. '2 minutes'), for the reconcile job to resolve on-chain.
      list_stuck_withdrawals: {
        Args: { p_min_age?: string };
        Returns: {
          id: number;
          user_id: string;
          denom: string;
          amount: string;
          to_address: string;
          created_at: string;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
