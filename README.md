# InjWorldCup

World Cup 2026 score prediction game built on Injective. Predict exact match scorelines, earn points, and compete on a real-time leaderboard — with identity bridged from Discord and wallet verification on Injective.

## Stack

- **Next.js 16** (App Router, Server Actions)
- **Supabase** — Auth (Discord OAuth), Postgres, Edge Functions, Realtime
- **Tailwind CSS v4** — Neo-brutalist design system
- **Framer Motion** — Page transitions, staggered cards, leaderboard animations
- **Injective** — Wallet linkage via ADR-036 `signArbitrary` (Keplr / Ninji)

## Features

- **Predictions** — Bet exact scorelines per match, locked at kickoff via server-side enforcement + RLS
- **3-tier scoring** — Exact scoreline > correct outcome > wrong outcome, all multiplied by match odds
- **Group stage table** — Live W/D/L/GD/Pts standings computed from finished matches
- **Real-time leaderboard** — Supabase Realtime pushes point updates; rows animate into new positions
- **Wallet linkage** — Cryptographic signature verification (eth_secp256k1 / ADR-036)
- **Profile** — Custom display name and country flag

## Setup

```bash
cp .env.example .env.local
# Fill in your Supabase credentials

npm install
npm run dev
```

### Environment variables

See `.env.example` for all required variables.

### Database

Run the migrations in `supabase/migrations/` against your Supabase project, then deploy the edge functions:

```bash
npx supabase functions deploy link-wallet --project-ref <your-ref>
npx supabase functions deploy sync-matches --project-ref <your-ref>
```

Add `API_FOOTBALL_KEY` as a Supabase secret:

```bash
npx supabase secrets set API_FOOTBALL_KEY=your-key --project-ref <your-ref>
```
