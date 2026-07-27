// =============================================================================
// Cult of Anons holder verification — read-only CW721 ownership check.
//
// The whole "season pass" gate hinges on one question: does this wallet
// currently own a CoA token? We answer it with a CosmWasm smart query against
// the collection's CW721 contract:
//
//   { "tokens": { "owner": "<inj1…>", "limit": 1 } }
//       → { "data": { "ids": ["…"] } }   (non-empty ⇒ holder)
//
// This is a public state read: no signature, no custody, no approval. If the
// wallet disconnects we know nothing about it.
//
// IMPORTANT: distinguish "verified not a holder" (ok:true, holds:false) from
// "couldn't check" (ok:false, error set). Callers MUST NOT grant perks on an
// ok:false result, and MUST NOT cache it as a negative — the check simply
// failed and should be retried.
//
// Stored wallets are always inj1 bech32 (the link-wallet edge function derives
// the address from the pubkey and rejects mismatches), so only that form is
// supported here. A 0x EVM address returns ok:false with a clear reason rather
// than silently missing a real holder.
// =============================================================================

import { coaContract, injectiveLcdUrl } from "./config";

export interface CoaHolding {
  /** Did the on-chain check complete? false ⇒ unknown, do not gate on it. */
  ok: boolean;
  /** True only when ok and the wallet owns ≥1 token. */
  holds: boolean;
  /** Number of tokens found (best-effort, may be capped — see countCoa). */
  count: number;
  /** Present only when ok is false. */
  error?: string;
}

const QUERY_TIMEOUT_MS = 8000;

function isInjAddress(addr: string): boolean {
  // Light sanity check; the LCD is the real validator. inj1 + 38 bech32 chars.
  return /^inj1[0-9a-z]{38}$/.test(addr);
}

/** base64-encode a CosmWasm smart-query message for the LCD URL path. */
function encodeQuery(msg: unknown): string {
  return Buffer.from(JSON.stringify(msg), "utf8").toString("base64");
}

/** Run one CW721 smart query against the CoA contract. */
async function smartQuery(msg: unknown): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const url = `${injectiveLcdUrl()}/cosmwasm/wasm/v1/contract/${coaContract()}/smart/${encodeQuery(msg)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = body && typeof body === "object" && "message" in body ? String(body.message) : `HTTP ${res.status}`;
      return { ok: false, error: detail };
    }
    if (!body || typeof body !== "object" || !("data" in body)) {
      return { ok: false, error: "Malformed LCD response" };
    }
    return { ok: true, data: (body as { data: unknown }).data };
  } catch (e) {
    const err = e as Error;
    return { ok: false, error: err.name === "AbortError" ? "LCD query timed out" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

function idsOf(data: unknown): string[] | null {
  if (data && typeof data === "object" && "ids" in data && Array.isArray((data as { ids: unknown }).ids)) {
    return (data as { ids: string[] }).ids;
  }
  return null;
}

/**
 * Does `address` currently hold at least one Cult of Anons token?
 *
 * Fast path: queries with limit 1, so `count` here is 0 or 1. Use countCoa when
 * the exact holding size matters (e.g. tiered perks).
 */
export async function holdsCoa(address: string): Promise<CoaHolding> {
  if (!address || !isInjAddress(address)) {
    return { ok: false, holds: false, count: 0, error: "Not an inj1 address" };
  }

  const result = await smartQuery({ tokens: { owner: address, limit: 1 } });
  if (!result.ok) return { ok: false, holds: false, count: 0, error: result.error };

  const ids = idsOf(result.data);
  if (ids === null) return { ok: false, holds: false, count: 0, error: "Unexpected query shape" };

  return { ok: true, holds: ids.length > 0, count: ids.length };
}

/**
 * Exact number of CoA tokens held by `address`, paginating through the CW721
 * `tokens` query. Bounded so a bug or a whale can never loop unboundedly.
 */
export async function countCoa(address: string): Promise<CoaHolding> {
  if (!address || !isInjAddress(address)) {
    return { ok: false, holds: false, count: 0, error: "Not an inj1 address" };
  }

  const PAGE = 100;
  const MAX_PAGES = 20; // hard ceiling: 2000 tokens — far above any real holding
  let total = 0;
  let startAfter: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const msg = { tokens: { owner: address, limit: PAGE, ...(startAfter ? { start_after: startAfter } : {}) } };
    const result = await smartQuery(msg);
    if (!result.ok) return { ok: false, holds: false, count: 0, error: result.error };

    const ids = idsOf(result.data);
    if (ids === null) return { ok: false, holds: false, count: 0, error: "Unexpected query shape" };

    total += ids.length;
    if (ids.length < PAGE) break; // last page
    startAfter = ids[ids.length - 1];
  }

  return { ok: true, holds: total > 0, count: total };
}
