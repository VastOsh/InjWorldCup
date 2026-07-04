// =============================================================================
// x402 payment verification.
//
// Two modes (see lib/x402/config.ts):
//   - "mock":        decode the X-PAYMENT header and check a shared dev secret.
//                    Lets the full unlock flow be tested locally with no wallet
//                    or funds. NEVER use in production.
//   - "facilitator": forward the payment to an Injective x402 facilitator which
//                    verifies the signature and settles the USDC transfer.
//
// The X-PAYMENT header is base64-encoded JSON (x402 convention).
// =============================================================================

import {
  x402Mode,
  x402DevSecret,
  facilitatorUrl,
  type PaymentRequirements,
} from "@/lib/x402/config";

export interface VerifyResult {
  ok: boolean;
  payer?: string;
  txHash?: string;
  error?: string;
}

function decodeHeader(header: string): Record<string, unknown> | null {
  try {
    const json = Buffer.from(header, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function verifyPayment(
  paymentHeader: string | null,
  requirements: PaymentRequirements,
): Promise<VerifyResult> {
  if (!paymentHeader) return { ok: false, error: "X-PAYMENT header is required" };

  const payload = decodeHeader(paymentHeader);
  if (!payload) return { ok: false, error: "Malformed X-PAYMENT header" };

  if (x402Mode() === "mock") {
    // Dev gate: the client presents { scheme: "dev", secret }.
    const ok = payload.scheme === "dev" && payload.secret === x402DevSecret();
    return ok
      ? { ok: true, payer: "mock", txHash: "0xmock" }
      : { ok: false, error: "Invalid dev payment" };
  }

  // --- facilitator mode -----------------------------------------------------
  const url = facilitatorUrl();
  if (!url) return { ok: false, error: "X402_FACILITATOR_URL not configured" };

  try {
    // x402 facilitators expose /verify and /settle. Field names below follow
    // the x402 v1 convention; adjust to @injectivelabs/x402 if it differs.
    const body = JSON.stringify({
      x402Version: 1,
      paymentPayload: payload,
      paymentRequirements: requirements,
    });
    const verifyRes = await fetch(`${url.replace(/\/$/, "")}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const verified = await verifyRes.json().catch(() => ({}));
    if (!verifyRes.ok || verified?.isValid === false) {
      return { ok: false, error: verified?.invalidReason || "Payment not valid" };
    }

    const settleRes = await fetch(`${url.replace(/\/$/, "")}/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const settled = await settleRes.json().catch(() => ({}));
    if (!settleRes.ok || settled?.success === false) {
      return { ok: false, error: settled?.errorReason || "Settlement failed" };
    }

    return {
      ok: true,
      payer: settled?.payer ?? verified?.payer,
      txHash: settled?.txHash ?? settled?.transaction,
    };
  } catch (e) {
    return { ok: false, error: `Facilitator error: ${(e as Error).message}` };
  }
}
