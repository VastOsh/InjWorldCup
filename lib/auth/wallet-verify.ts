// =============================================================================
// ADR-036 wallet signature verification (server-only).
//
// Injective wallets (Keplr / Ninji) sign arbitrary messages with ADR-036
// (`MsgSignData`). This module is the single trusted verifier shared by BOTH
// wallet sign-in (app/auth/wallet) and wallet linking (the link-wallet edge
// function's logic), so the two never drift.
//
// A signature is accepted iff:
//   1. the supplied compressed pubKey derives to exactly `signer` (inj1…), and
//   2. the signature verifies against the ADR-036 sign-doc for `message` under
//      one of the four encodings wallets are known to use
//      (insertion-order | amino-sorted) × (sha256 | keccak256).
//
// ethsecp256k1: the inj1 address is the last 20 bytes of keccak256(uncompressed
// pubkey) — the Ethereum derivation, bech32-encoded with the "inj" HRP.
// =============================================================================

import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { sha256 } from "@noble/hashes/sha2";
import { bech32 } from "@scure/base";

const INJ_ADDRESS = /^inj1[0-9a-z]{38}$/;

function b64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}
function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
function b64Utf8(s: string): string {
  return Buffer.from(utf8(s)).toString("base64");
}

/** The exact human-readable challenge a wallet signs to prove ownership for
 *  sign-in. Deterministic in (wallet, nonce) so the challenge and verify
 *  endpoints reconstruct byte-identical text. */
export function buildLoginMessage(wallet: string, nonce: string): string {
  return [
    "Sign in to InjWorldCup",
    "",
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    "",
    "Signing proves you control this wallet. It is not a transaction and costs no gas.",
  ].join("\n");
}

/** The message the link-wallet flow signs (a logged-in user attaching a wallet). */
export function buildLinkMessage(userId: string): string {
  return `Link Injective wallet to InjWorldCup\nUser: ${userId}`;
}

// Keplr insertion-order ADR-036 sign doc.
function buildAdr036SignDoc(signer: string, dataB64: string): string {
  return JSON.stringify({
    chain_id: "",
    account_number: "0",
    sequence: "0",
    fee: { gas: "0", amount: [] },
    msgs: [{ type: "sign/MsgSignData", value: { signer, data: dataB64 } }],
    memo: "",
  });
}

// @cosmjs/amino canonical order (sorted keys at every level).
function buildSortedAdr036SignDoc(signer: string, dataB64: string): string {
  return JSON.stringify({
    account_number: "0",
    chain_id: "",
    fee: { amount: [], gas: "0" },
    memo: "",
    msgs: [{ type: "sign/MsgSignData", value: { data: dataB64, signer } }],
    sequence: "0",
  });
}

/** Derive the inj1 bech32 address from a compressed secp256k1 pubkey. */
export function pubKeyToInjAddress(compressed: Uint8Array): string {
  const point = secp256k1.ProjectivePoint.fromHex(compressed);
  const uncompressed = point.toRawBytes(false); // 65 bytes, 0x04-prefixed
  const ethAddr = keccak_256(uncompressed.slice(1)).slice(12); // last 20 bytes
  return bech32.encode("inj", bech32.toWords(ethAddr));
}

export interface WalletSigInput {
  /** Claimed inj1 signer address. */
  signer: string;
  /** Base64 signature from signArbitrary (64 or 65 bytes). */
  signature: string;
  /** Base64 compressed pubkey (pub_key.value from signArbitrary). */
  pubKey: string;
  /** The plaintext message that was signed. */
  message: string;
}

export interface WalletSigResult {
  ok: boolean;
  error?: string;
  /** The encoding that verified (diagnostics only). */
  matched?: string;
}

/**
 * Verify an ADR-036 arbitrary-message signature. Pure + synchronous; never
 * throws — malformed input returns { ok: false }.
 */
export function verifyWalletSignature(input: WalletSigInput): WalletSigResult {
  const { signer, signature, pubKey, message } = input;

  if (!signer || !signature || !pubKey || !message) {
    return { ok: false, error: "Missing fields" };
  }
  if (!INJ_ADDRESS.test(signer)) {
    return { ok: false, error: "Invalid signer address" };
  }

  // 1. pubKey must derive to the claimed signer.
  let pubKeyBytes: Uint8Array;
  try {
    pubKeyBytes = b64ToBytes(pubKey);
    if (pubKeyToInjAddress(pubKeyBytes) !== signer) {
      return { ok: false, error: "pubKey does not match signer" };
    }
  } catch {
    return { ok: false, error: "Invalid pubKey" };
  }

  // 2. signature must verify against one of the four sign-doc encodings.
  const dataB64 = b64Utf8(message);
  const docInsertion = buildAdr036SignDoc(signer, dataB64);
  const docSorted = buildSortedAdr036SignDoc(signer, dataB64);
  const candidates: Array<{ name: string; hash: Uint8Array }> = [
    { name: "sha256_insertion", hash: sha256(utf8(docInsertion)) },
    { name: "keccak256_insertion", hash: keccak_256(utf8(docInsertion)) },
    { name: "sha256_sorted", hash: sha256(utf8(docSorted)) },
    { name: "keccak256_sorted", hash: keccak_256(utf8(docSorted)) },
  ];

  try {
    const sigBytes = b64ToBytes(signature);
    const sig64 = sigBytes.length === 65 ? sigBytes.slice(0, 64) : sigBytes;
    const sig = secp256k1.Signature.fromCompact(sig64);
    for (const { name, hash } of candidates) {
      // lowS:false — wallet signatures are not canonicalised to low-S.
      if (secp256k1.verify(sig, hash, pubKeyBytes, { lowS: false })) {
        return { ok: true, matched: name };
      }
    }
  } catch (e) {
    return { ok: false, error: `Signature verification error: ${(e as Error).message}` };
  }

  return { ok: false, error: "Invalid signature" };
}
