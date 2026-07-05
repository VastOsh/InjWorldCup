# InjWorldCup

**A World Cup 2026 prediction platform that both humans *and* AI agents can play — built for the Injective Global Cup with x402, USDC CCTP, an MCP Server, and an Agent Skill.**

Predict exact scorelines, earn points, and climb a real-time leaderboard; or point an AI agent at it to read live World Cup data, get transparent match analysis, and *pay per call* for a deep report in USDC — funded cross-chain.

---

## The problem it solves

World Cup fans want to test their instincts and get sharp, **data-driven** insight — but prediction apps are walled gardens:

- **Human-only.** There's no clean, machine-usable interface, so the fast-growing world of **AI agents** can't participate, analyze, or transact.
- **Opaque.** "Odds" are handed down with no model behind them — you can't see where the market might be wrong.
- **Payments don't fit micro-usage.** Charging a few cents for a single match report is impossible with cards/subscriptions, and onboarding funds is chain-locked.

InjWorldCup answers all three: a transparent analytics engine, an **agent-native** interface (MCP + Agent Skill), **pay-per-call** USDC micropayments over **x402**, and a **CCTP** on-ramp so funds can arrive from any chain.

## What it does

- **Humans (web app):** predict exact scorelines per match, earn 3-tier points multiplied by live odds, climb a real-time leaderboard, follow the group tables and knockout bracket, and read an **AI Insights** panel on every match — a model's predicted score and probabilities shown *against* the bookmaker odds, flagging **value**.
- **AI agents (MCP + Skill):** query live fixtures, odds, standings, bracket and leaderboard as tools; run the *same* analytics engine; and — when asked for the deep report — **autonomously pay a small USDC fee over x402**, settled on Injective. The agent's wallet can be topped up **cross-chain via CCTP**.

## How users interact — two front doors, one brain

```
                       ┌─────────────────────────────┐
   Human ──▶ Web app ─▶│  shared analytics engine    │◀─ MCP tools ◀── AI agent
                       │  (lib/analytics/engine.ts)  │                 + Agent Skill
                       └─────────────────────────────┘
                                     │ deep report (paid)
                                     ▼
   CCTP (fund wallet) ──▶ x402 pay-per-call (USDC on Injective) ──▶ premium analysis
```

The website and the agent surface are powered by the **same deterministic engine**, so there is no duplicated logic — the UI dogfoods exactly what agents consume.

## Injective Global Cup — how the four technologies are used

| Tech | Where | How it's used | Status |
|------|-------|---------------|--------|
| **MCP Server** | `mcp-server/` | A Model Context Protocol server exposes live fixtures, odds, standings, bracket, leaderboard and the AI analytics engine as **7 agent tools**. | ✅ verified live |
| **Agent Skills** | `skills/worldcup-analyst/` | A reusable **Agent Skill** that drives the MCP tools end-to-end — resolve a fixture, analyze value, pay for and read the deep report, and give a disciplined verdict. | ✅ |
| **x402** | `x402-gateway/`, `app/api/analysis/premium/` | HTTP-native **pay-per-call USDC micropayments** (EIP-3009, gasless payer) gate the deep analysis. The agent signs, an embedded facilitator settles on **Injective testnet**. | ✅ **real USDC settled on testnet** |
| **CCTP** | `cctp/` | **Circle CCTP V2** cross-chain on-ramp: burn USDC on Base/Avalanche/Ethereum testnet → attest → mint on **Injective (domain 29)** to fund the agent's payer wallet. | ✅ contracts verified on-chain |

Each links to a detailed section below: [x402](#ai-analytics--x402-injective) · [MCP Server](#mcp-server-agent-tools) · [Agent Skill](#agent-skill) · [CCTP](#cctp--cross-chain-usdc-on-ramp).

## How Injective is integrated

Injective is the settlement and execution layer for everything money-related:

- **x402 payments settle on Injective EVM** (testnet `eip155:1439`) using native **USDC** (`0x0C38…4C5d`) and EIP-3009 `transferWithAuthorization` — sub-second finality makes per-call micropayments practical.
- **CCTP mints native USDC on Injective** (CCTP domain `29`) via `MessageTransmitterV2`, so value can arrive from any CCTP chain.
- **Identity is bridged to Injective** in the web app: a Discord account is linked to an Injective wallet via **ADR-036 `signArbitrary`** (Keplr / Ninji), verified server-side.
- The **MCP server + Agent Skill** turn the whole platform into an Injective-native surface that autonomous agents can read and transact against.

On-chain functionality is real but scoped to testnet for the hackathon; the same code targets mainnet by changing env (`X402_NETWORK`, addresses).

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

1. `POST` with no payment → **`402 Payment Required`** carrying the payment requirements (Injective testnet `eip155:1439`, USDC asset, price in atomic units).
2. The caller pays and retries with an `X-PAYMENT` header.
3. The server verifies/settles and returns the report with an `X-PAYMENT-RESPONSE` receipt.

There are **two payer surfaces**:

| Surface | Mode | Behaviour |
|---------|------|-----------|
| **Website** button (`app/api/analysis/premium/`) | `mock` (default) | Gates on a shared dev secret — **no wallet or funds needed**, so anyone can try the UX instantly |
| **AI agent** (`x402-gateway/`, see below) | **real** | Agent signs EIP-3009, the gateway's embedded facilitator **settles real USDC on Injective testnet** |

x402 is fundamentally a *machine* payment protocol, so the real on-chain settlement is demonstrated through the **agent** flow ([below](#agent-pays-for-premium-analysis-real-testnet-x402)) — verified end-to-end on testnet (USDC moved payer → relayer). The website stays in `mock` so the human UX has zero friction. All x402 configuration lives in `.env.example`.

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
- [ ] Fund the **payer** with **testnet USDC** (`0x0C38…4C5d`) — [faucet.circle.com](https://faucet.circle.com) (select Injective), or bridge in via [CCTP](#cctp--cross-chain-usdc-on-ramp).
- [ ] Set `X402_RELAYER_PRIVATE_KEY`, `X402_PAYER_PRIVATE_KEY` (see `.env.example`); network/asset/RPC already default to testnet (the archival RPC, for reliable settlement).
- [ ] Start the gateway, then call `get_premium_analysis` — the agent pays and the report unlocks.

> Verified end-to-end on testnet: a `get_premium_analysis` call settled 0.01 USDC on-chain (payer → relayer) and returned the deep report.

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
