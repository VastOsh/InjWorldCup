// =============================================================================
// worldcup-x402-gateway — the x402-protected resource server.
//
// POST /premium is paywalled with the official @injectivelabs/x402 middleware
// and an EMBEDDED facilitator: incoming payments are verified and settled
// on-chain (transferWithAuthorization) by a relayer wallet, moving USDC from
// the paying agent to X402_PAY_TO (defaults to the relayer wallet).
//
// Run:  node --experimental-strip-types x402-gateway/server.ts
// Env:  X402_RELAYER_PRIVATE_KEY  (funded with a little testnet INJ for gas)
//       SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//       X402_NETWORK (default eip155:1439 testnet), X402_ASSET (testnet USDC),
//       X402_PRICE_ATOMIC (default 10000 = $0.01), X402_PAY_TO (optional),
//       X402_RPC_URL, GATEWAY_PORT (default 4021)
// =============================================================================

import express from "express";
import { injectivePaymentMiddleware } from "@injectivelabs/x402/middleware";
import { db } from "../mcp-server/db.ts";
import { loadAnalysis } from "../mcp-server/analytics.ts";
import { buildPremium } from "../lib/analytics/premium.ts";

const NETWORK = process.env.X402_NETWORK || "eip155:1439"; // Injective EVM testnet
const ASSET = (process.env.X402_ASSET ||
  "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d") as `0x${string}`; // testnet USDC
const PRICE = process.env.X402_PRICE_ATOMIC || "10000"; // $0.01 (6 decimals)
// Archival gateway RPC (not round-robin load-balanced) so the facilitator's
// settle → wait-for-receipt is consistent; the k8s endpoint races the receipt.
const RPC_URL =
  process.env.X402_RPC_URL ||
  "https://testnet.evm.archival.chain.virtual.json-rpc.injective.network/";
const PORT = Number(process.env.GATEWAY_PORT || 4021);
const PAY_TO = process.env.X402_PAY_TO as `0x${string}` | undefined;

const rawRelayer = process.env.X402_RELAYER_PRIVATE_KEY?.trim();
if (!rawRelayer) {
  console.error(
    "X402_RELAYER_PRIVATE_KEY is required (a testnet wallet with a little INJ for gas). " +
      "It settles payments and, by default, receives the USDC.",
  );
  process.exit(1);
}
// Accept keys with or without the 0x prefix (viem requires it).
const relayerKey = (rawRelayer.startsWith("0x") ? rawRelayer : `0x${rawRelayer}`) as `0x${string}`;

const app = express();
app.use(express.json());

app.use(
  injectivePaymentMiddleware(
    {
      "POST /premium": {
        description: "InjWorldCup — deep AI match analysis (xG, scoreline map, stake)",
        mimeType: "application/json",
        accepts: [
          { network: NETWORK, asset: ASSET, amount: PRICE, ...(PAY_TO ? { payTo: PAY_TO } : {}) },
        ],
      },
    },
    { facilitator: { privateKey: relayerKey, rpcUrl: RPC_URL } },
  ),
);

app.post("/premium", async (req, res) => {
  const matchId = Number(req.body?.matchId);
  if (!Number.isInteger(matchId)) {
    res.status(400).json({ error: "matchId required" });
    return;
  }
  try {
    const analysis = await loadAnalysis(db(), matchId);
    if (!analysis) {
      res.status(404).json({ error: "Match not found" });
      return;
    }
    res.json({ premium: buildPremium(analysis) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true, network: NETWORK, price: PRICE }));

app.listen(PORT, () => {
  console.error(`x402 gateway listening on :${PORT} (network ${NETWORK}, price ${PRICE})`);
});
