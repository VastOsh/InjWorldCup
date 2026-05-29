import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as secp from "https://esm.sh/@noble/secp256k1@2";
import { keccak_256 } from "https://esm.sh/@noble/hashes@1.3.3/sha3";
import { sha256 } from "https://esm.sh/@noble/hashes@1.3.3/sha2";
import { bech32 } from "https://esm.sh/@scure/base@1.1.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// Keplr insertion-order sign doc
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

// @cosmjs/amino canonical order (sorted keys at every level)
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

function pubKeyToInjAddress(compressed: Uint8Array): string {
  const point = secp.ProjectivePoint.fromHex(compressed);
  const uncompressed = point.toRawBytes(false);
  const ethAddr = keccak_256(uncompressed.slice(1)).slice(12);
  return bech32.encode("inj", bech32.toWords(ethAddr));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await anonClient.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  let body: { signer?: string; signature?: string; pubKey?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }

  const { signer, signature, pubKey } = body;
  if (!signer || !signature || !pubKey) return json({ error: "Missing fields" }, 400);

  let pubKeyBytes: Uint8Array;
  try {
    pubKeyBytes = b64ToBytes(pubKey);
    const derived = pubKeyToInjAddress(pubKeyBytes);
    if (derived !== signer) return json({ error: "pubKey does not match signer" }, 400);
  } catch {
    return json({ error: "Invalid pubKey" }, 400);
  }

  const message = `Link Injective wallet to InjWorldCup\nUser: ${user.id}`;
  const messageData = btoa(String.fromCharCode(...new TextEncoder().encode(message)));
  const enc = (s: string) => new TextEncoder().encode(s);

  const signDocInsertion = buildAdr036SignDoc(signer, messageData);
  const signDocSorted = buildSortedAdr036SignDoc(signer, messageData);

  const candidates: Array<{ name: string; hash: Uint8Array }> = [
    { name: "sha256_insertion", hash: sha256(enc(signDocInsertion)) },
    { name: "keccak256_insertion", hash: keccak_256(enc(signDocInsertion)) },
    { name: "sha256_sorted", hash: sha256(enc(signDocSorted)) },
    { name: "keccak256_sorted", hash: keccak_256(enc(signDocSorted)) },
  ];

  let sigBytes: Uint8Array;
  let matchedName: string | null = null;

  try {
    sigBytes = b64ToBytes(signature);
    const sig64 = sigBytes.length === 65 ? sigBytes.slice(0, 64) : sigBytes;
    const sigObj = secp.Signature.fromCompact(sig64);

    for (const { name, hash } of candidates) {
      if (secp.verify(sigObj, hash, pubKeyBytes, { lowS: false })) {
        matchedName = name;
        break;
      }
    }
  } catch (e) {
    return json({ error: "Signature verification error", detail: String(e) }, 400);
  }

  if (!matchedName) {
    // Use ECDSA recovery to find which hash was actually signed
    const sig64 = sigBytes!.length === 65 ? sigBytes!.slice(0, 64) : sigBytes!;
    const sigObj = secp.Signature.fromCompact(sig64);
    const recovery: Record<string, string> = {};
    for (const { name, hash } of candidates) {
      for (const bit of [0, 1]) {
        try {
          const recovered = sigObj.addRecoveryBit(bit).recoverPublicKey(hash);
          const recovBytes = recovered.toRawBytes(true);
          const matches = recovBytes.length === pubKeyBytes.length &&
            recovBytes.every((b, i) => b === pubKeyBytes[i]);
          recovery[`${name}_bit${bit}`] = matches ? "MATCH" : "no";
        } catch {
          recovery[`${name}_bit${bit}`] = "error";
        }
      }
    }
    return json({
      error: "Invalid signature",
      _debug: { signDocInsertion, signDocSorted, recovery },
    }, 400);
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error: dbErr } = await adminClient
    .from("profiles")
    .update({ wallet_address: signer })
    .eq("id", user.id);

  if (dbErr) return json({ error: "Failed to save wallet", detail: dbErr.message, code: dbErr.code }, 500);

  return json({ ok: true, wallet_address: signer, matched: matchedName });
});
