# InjWorldCup

World Cup 2026 score prediction game built on Injective. Predict exact match scorelines, earn points, and compete on a real-time leaderboard — with identity bridged from Discord and wallet verification on Injective.

## Injective Global Cup — technologies used

| Tech | Where | What it does |
|------|-------|--------------|
| **MCP Server** | `mcp-server/` | Exposes live fixtures, odds, standings, bracket, leaderboard and the AI analytics engine as agent tools |
| **Agent Skills** | `skills/worldcup-analyst/` | A reusable skill that drives the MCP tools to predict scorelines and find value bets |
| **x402** | `x402-gateway/`, `app/api/analysis/premium/` | Pay-per-call USDC micropayments (EIP-3009, gasless payer) gating the deep analysis report; agent-pays flow settles on Injective testnet |
| **CCTP** | `cctp/` | Cross-chain USDC on-ramp (CCTP V2) — bridges USDC from Base/Avalanche/Ethereum testnet into Injective to fund the agent/payer wallet |

See [AI Analytics + x402](#ai-analytics--x402-injective), [MCP Server](#mcp-server-agent-tools), and [Agent Skill](#agent-skill) below.

## Stack

- **Next.js 16** (App Router, Server Actions)
- **Supabase** — Auth (Discord OAuth), Postgres, Edge Functions, Realtime
- **Tailwind CSS v4** — Neo-brutalist design system
- **Framer Motion** — Page transitions, staggered cards, leaderboard animations
- **Injective** — Wallet linkage via ADR-036 `signArbitrary` (Keplr / Ninji)

## Features

- **AI match analytics** — A deterministic Poisson model (built from live group-stage form) predicts scorelines and compares its probabilities against the odds-implied market to surface **value** — shown inline on every match card
- **x402 premium analysis** — Deep report (xG, goals markets, scoreline map, Kelly-lite stake) gated behind an **x402** USDC micropayment on Injective
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

## AI Analytics + x402 (Injective)

### How it works

One deterministic engine (`lib/analytics/engine.ts`) powers both the in-app UI and any future MCP/agent surface. It is **odds-independent** — expected goals come from each team's `group_standings` record, run through a Poisson model — so "model vs market" is an honest comparison, not a restatement of the odds. It uses **no LLM**, so inference is free.

- **Free tier** (`getMatchAnalysis` server action, read-only): predicted scoreline, model-vs-market probabilities, value edge, confidence.
- **Premium tier** (`POST /api/analysis/premium`, **x402-gated**): expected goals, Over 2.5 / BTTS, scoreline probability map, and a fractional-Kelly suggested stake.

### x402 payment flow

The premium route implements the [x402](https://docs.injective.network/developers-ai/x402) HTTP handshake:

1. `POST` with no payment → **`402 Payment Required`** carrying the payment requirements (Injective network `eip155:1776`, USDC asset, price in atomic units).
2. The client pays and retries with an `X-PAYMENT` header.
3. The server verifies/settles and returns the report with an `X-PAYMENT-RESPONSE` receipt.

Verification is pluggable (`lib/x402/verify.ts`):

| `X402_MODE` | Behaviour | Use |
|-------------|-----------|-----|
| `mock` (default) | Gates on a shared dev secret — **no wallet or funds needed** | Local testing & demos |
| `facilitator` | Verifies + settles real USDC via an Injective x402 facilitator | Testnet / production |

### Setup checklist

- [x] `mock` mode works out of the box — copy `.env.example` and run. Click **🔮 AI Insights → 🔒 Unlock deep analysis** on any match.
- [ ] For real payments: obtain an Injective **x402 facilitator URL** and a **receiving address**, then set `X402_MODE=facilitator`, `X402_FACILITATOR_URL`, `X402_PAY_TO`, and (for testnet) `X402_NETWORK` / `X402_ASSET`.
- [ ] Wire wallet signing in `lib/x402/client.ts` (`buildPayment`, facilitator branch) via `@injectivelabs/x402`.

All x402 configuration lives in `.env.example`.

## MCP Server (agent tools)

`mcp-server/` is a [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the platform to AI agents. It reuses the **same analytics engine** as the website, so agents and the UI share one brain.

**Tools:** `list_fixtures`, `get_match`, `get_standings`, `get_bracket`, `get_leaderboard`, `get_analysis` (free AI analysis), and `get_premium_analysis` (pays with USDC over x402).

Run it (no build step — Node 24 strips types):

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node --experimental-strip-types mcp-server/index.ts
```

Register it with an MCP client (e.g. Claude Desktop / Claude Code):

```json
{
  "mcpServers": {
    "worldcup": {
      "command": "node",
      "args": ["--experimental-strip-types", "mcp-server/index.ts"],
      "cwd": "/absolute/path/to/InjWorldCup",
      "env": {
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key"
      }
    }
  }
}
```

Now an agent can ask *"analyze the Brazil match and tell me if there's value"* and it runs against live World Cup data.

### Agent pays for premium analysis (real testnet x402)

This is x402's native use case — a machine paying per call. The flow:

```
MCP get_premium_analysis  ──POST──▶  x402-gateway (/premium)
   (createInjectiveClient,              (injectivePaymentMiddleware
    payer key + testnet USDC)            + embedded facilitator/relayer key)
        ▲                                        │
        └──────── 402 → sign EIP-3009 ───────────┘
                  → settle USDC on Injective → report
```

The **agent** (`get_premium_analysis`) signs an EIP-3009 authorization (gasless); the **gateway** verifies and settles it on-chain via a relayer wallet, moving testnet USDC to `X402_PAY_TO`, then returns the deep report. No accounts, no API keys — payment *is* the authorization.

**Run both:**

```bash
# 1) the paid resource server
node --experimental-strip-types x402-gateway/server.ts
# 2) point the MCP server's payer + gateway env at it, then call get_premium_analysis
```

**Testnet setup checklist (all free):**

- [ ] Two Injective EVM **testnet** wallets: a **relayer** (gateway) and a **payer** (agent).
- [ ] Fund the **relayer** with a little **testnet INJ** (gas) — [Injective testnet faucet](https://testnet.faucet.injective.network).
- [ ] Fund the **payer** with **testnet USDC** (`0x0C38…4C5d`).
- [ ] Set `X402_RELAYER_PRIVATE_KEY`, `X402_PAYER_PRIVATE_KEY` (see `.env.example`); network/asset/RPC already default to testnet.
- [ ] Start the gateway, then call `get_premium_analysis` — the agent pays and the report unlocks.

> The website's Unlock button stays in **mock** mode (frictionless demo for humans); real on-chain settlement is demonstrated through the agent flow above.

## Agent Skill

`skills/worldcup-analyst/` is a reusable **Agent Skill**. It teaches an agent to
drive the `worldcup` MCP tools end-to-end: resolve a fixture, run the free
analysis, read model-vs-market value honestly, optionally **pay via x402** for
the deep report, and produce a disciplined betting verdict. `SKILL.md` holds the
workflow and guardrails; `references/methodology.md` documents the model so the
agent can explain its reasoning. Drop the folder into any skills-aware agent
(e.g. Claude Code / Claude Desktop) alongside the MCP server.

## CCTP — cross-chain USDC on-ramp

`cctp/bridge.ts` funds the agent's payer wallet from another chain using
**Circle's CCTP V2**. It closes the loop: *CCTP funds the wallet → x402 pays per
call → MCP + Skill drive it.*

Flow (source chain → **Injective testnet**, domain `29`):

1. `approve` USDC → `TokenMessengerV2` on the source chain
2. `depositForBurn(…, destinationDomain=29, …)` — burns USDC on the source
3. poll Circle's IRIS attestation service until the message is `complete`
4. `receiveMessage(message, attestation)` on Injective — mints native USDC

```bash
CCTP_SOURCE=baseSepolia \
CCTP_SOURCE_PRIVATE_KEY=0x... \
CCTP_AMOUNT=1 \
  node --experimental-strip-types cctp/bridge.ts
```

**Testnet setup checklist:**

- [ ] A **source-chain** wallet (Base Sepolia / Avalanche Fuji / Ethereum Sepolia)
      with **testnet USDC** ([faucet.circle.com](https://faucet.circle.com)) and a
      little native gas (chain faucet).
- [ ] Set `CCTP_SOURCE`, `CCTP_SOURCE_PRIVATE_KEY`, `CCTP_AMOUNT`. The mint target
      defaults to the x402 payer wallet, so bridged USDC lands where the agent spends it.
- [ ] Run the bridge — attestation can take a few minutes; the script polls and
      then mints on Injective automatically.

Supported source domains: Ethereum Sepolia `0`, Avalanche Fuji `1`, Base Sepolia `6`.
CCTP V2 contracts (`TokenMessengerV2` / `MessageTransmitterV2`) are deployed at the
same addresses on every chain; the addresses and Injective's domain (`29`) are in
`cctp/bridge.ts`.
