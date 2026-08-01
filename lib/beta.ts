// =============================================================================
// Closed-beta gate helpers.
//
// A tester redeems a single-use invite code (see migration 029). On success we
// set an httpOnly cookie whose value is the server-only BETA_COOKIE_SECRET, and
// the proxy lets that browser through. The cookie is never readable by JS and
// can't be forged without the secret, so a simple constant comparison is enough
// — no crypto, so it works in any proxy runtime. Identity (which wallet) comes
// later from wallet sign-in; this gate only answers "did a valid code redeem
// here?".
// =============================================================================

export const BETA_COOKIE = "injcup_beta";
export const BETA_COOKIE_MAX_AGE = 60 * 60 * 24 * 60; // 60 days

/** The value we store in the gate cookie: the server-only secret itself. */
export function betaToken(): string | undefined {
  return process.env.BETA_COOKIE_SECRET?.trim() || undefined;
}

/** Whether a request's cookie value proves a redeemed beta code. */
export function betaCookieValid(value: string | undefined | null): boolean {
  const token = betaToken();
  return !!token && value === token;
}
