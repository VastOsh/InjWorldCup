export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type MatchStatus = "SCHEDULED" | "LIVE" | "FINISHED";

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
      predictions: {
        Row: {
          id: string;
          user_id: string;
          match_id: number;
          pred_home: number;
          pred_away: number;
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
          points_won?: number;
          is_calculated?: boolean;
          created_at?: string;
        };
        Update: {
          pred_home?: number;
          pred_away?: number;
          points_won?: number;
          is_calculated?: boolean;
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
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
