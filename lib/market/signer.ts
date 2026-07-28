// =============================================================================
// Market signer — the swappable "how a payout is signed" boundary.
//
// broadcastPayout owns the engine concerns (input validation, the check that
// the signer actually controls MARKET_WALLET_ADDRESS, the memo, and the
// exactly-once `submitted` classification). Everything about HOW the private
// key is held and how the tx is signed lives behind MarketSigner, so the
// mainnet story is a drop-in, not a rewrite:
//
//   MARKET_SIGNER unset / "env-key" → EnvKeySigner  (mnemonic/PK in env; testnet)
//   MARKET_SIGNER = "kms"           → KmsSigner     (HSM/KMS; implement for mainnet)
//
// A signer NEVER throws out of send(): it returns a SendOutcome whose `submitted`
// flag tells the caller whether a refund is safe (see PayoutResult.submitted).
// =============================================================================

export interface SendOutcome {
  ok: boolean;
  txHash?: string;
  error?: string;
  /** Whether the tx may have reached the chain (false = definitely not sent → a
   *  refund is safe; true = ambiguous → leave pending for the reconcile job). */
  submitted: boolean;
}

export interface MarketSigner {
  /** Identifier for logs/diagnostics. */
  readonly kind: string;
  /** The inj1 address this signer controls. Throws if the signer isn't
   *  configured (e.g. no key / no KMS binding). */
  getAddress(): Promise<string>;
  /** Sign + broadcast a bank MsgSend of `amount`/`denom` to `to`, tagged `memo`. */
  send(to: string, denom: string, amount: string, memo?: string): Promise<SendOutcome>;
}

// ---------------------------------------------------------------------------
// EnvKeySigner — a private key from env (mnemonic or hex). Testnet default.
// The key never leaves the process; fine for testnet, NOT for mainnet custody.
// ---------------------------------------------------------------------------
class EnvKeySigner implements MarketSigner {
  readonly kind = "env-key";
  constructor(private readonly mnemonic?: string, private readonly pkHex?: string) {}

  private async key() {
    if (!this.mnemonic && !this.pkHex) {
      throw new Error("Market signer not configured (MARKET_WALLET_MNEMONIC or MARKET_WALLET_PK)");
    }
    const { PrivateKey } = await import("@injectivelabs/sdk-ts");
    return this.mnemonic
      ? PrivateKey.fromMnemonic(this.mnemonic)
      : PrivateKey.fromHex(this.pkHex as string);
  }

  async getAddress(): Promise<string> {
    return (await this.key()).toBech32();
  }

  async send(to: string, denom: string, amount: string, memo?: string): Promise<SendOutcome> {
    let broadcasting = false;
    try {
      const { MsgSend, MsgBroadcasterWithPk } = await import("@injectivelabs/sdk-ts");
      const { Network } = await import("@injectivelabs/networks");
      const key = await this.key();

      const network = process.env.MARKET_NETWORK === "mainnet" ? Network.Mainnet : Network.Testnet;
      const msg = MsgSend.fromJSON({
        amount: { denom, amount },
        srcInjectiveAddress: key.toBech32(),
        dstInjectiveAddress: to,
      });

      const broadcaster = new MsgBroadcasterWithPk({ network, privateKey: key });
      // From here a throw is ambiguous — the tx may already be in the mempool.
      broadcasting = true;
      const res = await broadcaster.broadcast({ msgs: msg, memo });

      // A non-zero code = included but FAILED atomically → no funds moved → refund-safe.
      if (res.code !== 0) {
        return { ok: false, submitted: false, error: res.rawLog || `Transaction failed (code ${res.code})` };
      }
      return { ok: true, submitted: true, txHash: res.txHash };
    } catch (e) {
      return { ok: false, submitted: broadcasting, error: (e as Error).message };
    }
  }
}

// ---------------------------------------------------------------------------
// KmsSigner — mainnet placeholder. Implement getAddress()/send() against your
// KMS/HSM (or a remote signing service): getAddress() returns the KMS-backed
// inj1 address; send() builds the SignDoc, has the KMS produce the signature,
// assembles + broadcasts the tx, and classifies `submitted` the same way.
// Until implemented it is inert — a payout attempt fails safely (submitted:false).
// ---------------------------------------------------------------------------
class KmsSigner implements MarketSigner {
  readonly kind = "kms";
  private notConfigured(): never {
    throw new Error("KMS signer selected (MARKET_SIGNER=kms) but not implemented — see lib/market/signer.ts");
  }
  async getAddress(): Promise<string> {
    this.notConfigured();
  }
  async send(): Promise<SendOutcome> {
    return { ok: false, submitted: false, error: "KMS signer not implemented" };
  }
}

/** Select the market signer from env. Defaults to the env-key signer (testnet). */
export function getMarketSigner(): MarketSigner {
  const kind = (process.env.MARKET_SIGNER || "env-key").toLowerCase();
  if (kind === "kms") return new KmsSigner();
  return new EnvKeySigner(
    process.env.MARKET_WALLET_MNEMONIC?.trim(),
    process.env.MARKET_WALLET_PK?.trim(),
  );
}
