// =============================================================================
// Browser-side x402 client.
//
// Performs the 402 handshake: POST → if 402, construct a payment for the
// advertised requirements and retry with the X-PAYMENT header.
//
//   - mock mode (NEXT_PUBLIC_X402_MODE !== "facilitator"): present a dev token.
//     Lets the unlock flow be demoed with no wallet or funds.
//   - facilitator mode: sign a USDC transfer with the user's Injective wallet
//     (Keplr/Ninji) via @injectivelabs/x402 and present the receipt. TODO below.
// =============================================================================

const isMock = () =>
  (process.env.NEXT_PUBLIC_X402_MODE || "mock") !== "facilitator";
const devSecret = () =>
  process.env.NEXT_PUBLIC_X402_DEV_SECRET || "injworldcup-dev";

function encode(obj: unknown): string {
  return btoa(JSON.stringify(obj));
}

interface Requirements {
  network: string;
  asset: string;
  maxAmountRequired: string;
  payTo: string;
}

/** Build the X-PAYMENT header value for the given requirements. */
async function buildPayment(reqs: Requirements): Promise<string> {
  if (isMock()) {
    return encode({ scheme: "dev", secret: devSecret() });
  }
  // TODO(facilitator): use the user's Injective wallet to sign an exact USDC
  // transfer of reqs.maxAmountRequired of reqs.asset to reqs.payTo on
  // reqs.network, then base64-encode the x402 PaymentPayload here.
  throw new Error(
    `Wallet payment not configured (would pay ${reqs.maxAmountRequired} of ${reqs.asset} to ${reqs.payTo}). ` +
      "Set NEXT_PUBLIC_X402_MODE=mock to test, or wire @injectivelabs/x402.",
  );
}

export interface X402Result<T> {
  data?: T;
  error?: string;
  paid?: boolean;
}

/** POST `body` to `url`, paying via x402 if the server asks for payment. */
export async function postWithX402<T>(
  url: string,
  body: unknown,
): Promise<X402Result<T>> {
  const first = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (first.status !== 402) {
    if (!first.ok) {
      const err = await first.json().catch(() => ({}));
      return { error: err?.error || `Request failed (${first.status})` };
    }
    return { data: (await first.json()) as T };
  }

  // Payment required — read requirements and pay.
  const quote = await first.json().catch(() => ({}));
  const reqs: Requirements | undefined = quote?.accepts?.[0];
  if (!reqs) return { error: "Malformed payment quote" };

  let header: string;
  try {
    header = await buildPayment(reqs);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const paid = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "X-PAYMENT": header },
    body: JSON.stringify(body),
  });
  if (!paid.ok) {
    const err = await paid.json().catch(() => ({}));
    return { error: err?.error || `Payment rejected (${paid.status})`, paid: false };
  }
  return { data: (await paid.json()) as T, paid: true };
}
