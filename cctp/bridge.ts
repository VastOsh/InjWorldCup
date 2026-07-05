// =============================================================================
// worldcup-cctp — CCTP V2 inbound bridge.
//
// Moves testnet USDC from a source chain (Base Sepolia / Avalanche Fuji /
// Ethereum Sepolia) into **Injective testnet** and mints it to the agent's
// payer wallet — the cross-chain on-ramp that funds x402 payments.
//
// Flow (CCTP V2):
//   1. approve USDC → TokenMessengerV2 on the source chain
//   2. depositForBurn(..., destinationDomain=29 Injective, ...) — burns USDC
//   3. poll Circle's IRIS attestation service until the message is "complete"
//   4. receiveMessage(message, attestation) on Injective — mints USDC
//
// Run:  node --experimental-strip-types cctp/bridge.ts
// Env:  CCTP_SOURCE (baseSepolia|avalancheFuji|sepolia, default baseSepolia)
//       CCTP_SOURCE_PRIVATE_KEY   (source wallet: holds testnet USDC + gas)
//       CCTP_DEST_PRIVATE_KEY     (pays INJ gas to mint; defaults to payer key)
//       CCTP_AMOUNT               (USDC, human units, default "1")
//       CCTP_MINT_RECIPIENT       (defaults to the dest wallet address)
//       X402_RPC_URL              (Injective testnet RPC; archival recommended)
// =============================================================================

import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  parseUnits,
  formatUnits,
  pad,
  getAddress,
  erc20Abi,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, avalancheFuji, sepolia } from "viem/chains";

const IRIS_API = "https://iris-api-sandbox.circle.com"; // testnet/sandbox
const ZERO_BYTES32 = `0x${"00".repeat(32)}` as Hex;
const STANDARD_FINALITY = 2000; // 1000 = fast (needs a fee); 2000 = standard
const POLL_INTERVAL_MS = 5000;

// CCTP V2 contracts are deployed at the same addresses on every chain.
const TOKEN_MESSENGER_V2 = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as Address;
const MESSAGE_TRANSMITTER_V2 = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as Address;

// Injective EVM testnet (not in viem/chains).
const injectiveTestnet = defineChain({
  id: 1439,
  name: "Injective EVM Testnet",
  nativeCurrency: { name: "Injective", symbol: "INJ", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.X402_RPC_URL ||
          "https://testnet.evm.archival.chain.virtual.json-rpc.injective.network/",
      ],
    },
  },
});

const INJECTIVE_DOMAIN = 29;
const INJECTIVE_USDC = "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d" as Address;

// Source chains: domain id + Circle testnet USDC address + viem chain.
const SOURCES = {
  baseSepolia: { domain: 6, usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", chain: baseSepolia },
  avalancheFuji: { domain: 1, usdc: "0x5425890298aed601595a70AB815c96711a31Bc65", chain: avalancheFuji },
  sepolia: { domain: 0, usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", chain: sepolia },
} as const;

const TOKEN_MESSENGER_ABI = [
  {
    type: "function",
    name: "depositForBurn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
    ],
    outputs: [],
  },
] as const;

const MESSAGE_TRANSMITTER_ABI = [
  {
    type: "function",
    name: "receiveMessage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

function normKey(k: string): Hex {
  const t = k.trim();
  return (t.startsWith("0x") ? t : `0x${t}`) as Hex;
}

async function main() {
  const sourceName = (process.env.CCTP_SOURCE || "baseSepolia") as keyof typeof SOURCES;
  const source = SOURCES[sourceName];
  if (!source) throw new Error(`Unknown CCTP_SOURCE "${sourceName}". Use: ${Object.keys(SOURCES).join(", ")}`);

  const srcKey = process.env.CCTP_SOURCE_PRIVATE_KEY;
  if (!srcKey) throw new Error("CCTP_SOURCE_PRIVATE_KEY is required (source wallet with testnet USDC + gas).");
  const destKey = process.env.CCTP_DEST_PRIVATE_KEY || process.env.X402_PAYER_PRIVATE_KEY;
  if (!destKey) throw new Error("CCTP_DEST_PRIVATE_KEY (or X402_PAYER_PRIVATE_KEY) is required to pay INJ gas for minting.");

  const srcAccount = privateKeyToAccount(normKey(srcKey));
  const destAccount = privateKeyToAccount(normKey(destKey));
  const mintRecipient = getAddress(process.env.CCTP_MINT_RECIPIENT || destAccount.address);
  const amount = parseUnits(process.env.CCTP_AMOUNT || "1", 6);

  console.log(`CCTP bridge — ${sourceName} (domain ${source.domain}) → Injective testnet (domain ${INJECTIVE_DOMAIN})`);
  console.log(`  amount:        ${formatUnits(amount, 6)} USDC`);
  console.log(`  source wallet: ${srcAccount.address}`);
  console.log(`  mint to:       ${mintRecipient}\n`);

  const srcPublic = createPublicClient({ chain: source.chain, transport: http() });
  const srcWallet = createWalletClient({ account: srcAccount, chain: source.chain, transport: http() });
  const injPublic = createPublicClient({ chain: injectiveTestnet, transport: http() });
  const injWallet = createWalletClient({ account: destAccount, chain: injectiveTestnet, transport: http() });

  // Pre-flight: source USDC balance.
  const srcBal = await srcPublic.readContract({
    address: source.usdc as Address, abi: erc20Abi, functionName: "balanceOf", args: [srcAccount.address],
  });
  console.log(`Source USDC balance: ${formatUnits(srcBal, 6)}`);
  if (srcBal < amount) throw new Error("Insufficient source USDC. Fund the source wallet via faucet.circle.com.");

  const injBefore = await injPublic.readContract({
    address: INJECTIVE_USDC, abi: erc20Abi, functionName: "balanceOf", args: [mintRecipient],
  });

  // Step 1 — approve
  console.log("\n[1/4] Approving USDC to TokenMessengerV2…");
  const approveTx = await srcWallet.writeContract({
    address: source.usdc as Address, abi: erc20Abi, functionName: "approve",
    args: [TOKEN_MESSENGER_V2, amount],
  });
  await srcPublic.waitForTransactionReceipt({ hash: approveTx });
  console.log(`      approve tx: ${approveTx}`);

  // Step 2 — burn
  console.log("[2/4] depositForBurn (burning USDC on source)…");
  const burnTx = await srcWallet.writeContract({
    address: TOKEN_MESSENGER_V2, abi: TOKEN_MESSENGER_ABI, functionName: "depositForBurn",
    args: [
      amount,
      INJECTIVE_DOMAIN,
      pad(mintRecipient, { size: 32 }),
      source.usdc as Address,
      ZERO_BYTES32,
      0n,
      STANDARD_FINALITY,
    ],
  });
  await srcPublic.waitForTransactionReceipt({ hash: burnTx });
  console.log(`      burn tx: ${burnTx}`);

  // Step 3 — attestation
  console.log("[3/4] Waiting for Circle attestation (can take a few minutes)…");
  const url = `${IRIS_API}/v2/messages/${source.domain}?transactionHash=${burnTx}`;
  let message: Hex | undefined, attestation: Hex | undefined;
  for (;;) {
    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as {
        messages?: { status?: string; message?: Hex; attestation?: string }[];
      };
      const m = data?.messages?.[0];
      if (m && m.status === "complete" && m.attestation && m.attestation !== "PENDING") {
        message = m.message; attestation = m.attestation as Hex; break;
      }
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  console.log("\n      attestation ready.");

  // Step 4 — mint on Injective
  console.log("[4/4] receiveMessage on Injective (minting USDC)…");
  const mintTx = await injWallet.writeContract({
    address: MESSAGE_TRANSMITTER_V2, abi: MESSAGE_TRANSMITTER_ABI, functionName: "receiveMessage",
    args: [message!, attestation!],
  });
  await injPublic.waitForTransactionReceipt({ hash: mintTx });
  console.log(`      mint tx: ${mintTx}`);

  const injAfter = await injPublic.readContract({
    address: INJECTIVE_USDC, abi: erc20Abi, functionName: "balanceOf", args: [mintRecipient],
  });
  console.log(`\n✅ Bridged. Injective USDC ${formatUnits(injBefore, 6)} → ${formatUnits(injAfter, 6)} for ${mintRecipient}`);
}

main().catch((e) => {
  console.error("\nBridge failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
