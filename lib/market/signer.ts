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
// KmsSigner — AWS KMS-backed signer for mainnet custody. The private key is an
// asymmetric ECC_SECG_P256K1 (secp256k1) KMS key that NEVER leaves AWS: we ask
// KMS to sign the keccak256 digest of the SignDoc, normalise to low-S (Injective
// rejects high-S), assemble the tx ourselves, and broadcast it. Selected with
// MARKET_SIGNER=kms.
//
// Required env:
//   MARKET_KMS_KEY_ID  — key id / ARN / alias (spec ECC_SECG_P256K1, usage SIGN_VERIFY)
//   MARKET_KMS_REGION  — AWS region of the key (falls back to AWS_REGION)
//   AWS credentials via the standard provider chain (AWS_ACCESS_KEY_ID /
//     AWS_SECRET_ACCESS_KEY, or an attached role); needs kms:Sign + kms:GetPublicKey.
//   MARKET_NETWORK=mainnet|testnet — selects endpoints + chain-id.
//
// The derived inj1 address is asserted against MARKET_WALLET_ADDRESS by the
// broadcastPayout caller, so a mis-provisioned key fails safe (submitted:false).
// ---------------------------------------------------------------------------
class KmsSigner implements MarketSigner {
  readonly kind = "kms";
  private cached?: { address: string; pubKeyB64: string };

  private keyId(): string {
    const id = process.env.MARKET_KMS_KEY_ID?.trim();
    if (!id) throw new Error("KMS signer selected (MARKET_SIGNER=kms) but MARKET_KMS_KEY_ID is not set");
    return id;
  }

  private async client() {
    const { KMSClient } = await import("@aws-sdk/client-kms");
    const region = process.env.MARKET_KMS_REGION?.trim() || process.env.AWS_REGION?.trim();
    return new KMSClient(region ? { region } : {});
  }

  /** Fetch the KMS public key once and derive the inj1 address + base64
   *  compressed pubkey (matching PrivateKey's ethsecp256k1 derivation). */
  private async identity(): Promise<{ address: string; pubKeyB64: string }> {
    if (this.cached) return this.cached;
    const { GetPublicKeyCommand } = await import("@aws-sdk/client-kms");
    const { secp256k1 } = await import("@noble/curves/secp256k1");
    const { keccak_256 } = await import("@noble/hashes/sha3");
    const { bech32 } = await import("@scure/base");

    const res = await (await this.client()).send(new GetPublicKeyCommand({ KeyId: this.keyId() }));
    if (!res.PublicKey) throw new Error("KMS GetPublicKey returned no key");
    // KMS returns a DER SubjectPublicKeyInfo; the uncompressed secp256k1 point
    // (0x04 || X || Y) is its trailing 65 bytes.
    const spki = new Uint8Array(res.PublicKey);
    const uncompressed = spki.slice(-65);
    if (uncompressed[0] !== 0x04) throw new Error("Unexpected KMS public-key encoding (not an uncompressed EC point)");
    const pubKeyB64 = Buffer.from(secp256k1.ProjectivePoint.fromHex(uncompressed).toRawBytes(true)).toString("base64");
    const ethAddr = keccak_256(uncompressed.slice(1)).slice(-20); // last 20 bytes of keccak(pubkey)
    const address = bech32.encode("inj", bech32.toWords(ethAddr));
    this.cached = { address, pubKeyB64 };
    return this.cached;
  }

  /** KMS-sign a 32-byte digest → 64-byte low-S compact (r‖s). */
  private async signDigest(digest: Uint8Array): Promise<Uint8Array> {
    const { SignCommand } = await import("@aws-sdk/client-kms");
    const { secp256k1 } = await import("@noble/curves/secp256k1");
    const res = await (await this.client()).send(new SignCommand({
      KeyId: this.keyId(),
      Message: digest,
      MessageType: "DIGEST", // we pre-hash; KMS signs these 32 bytes as-is
      SigningAlgorithm: "ECDSA_SHA_256",
    }));
    if (!res.Signature) throw new Error("KMS Sign returned no signature");
    let sig = secp256k1.Signature.fromDER(new Uint8Array(res.Signature));
    if (sig.hasHighS()) sig = sig.normalizeS(); // Cosmos/Injective require canonical low-S
    return sig.toCompactRawBytes();
  }

  async getAddress(): Promise<string> {
    return (await this.identity()).address;
  }

  async send(to: string, denom: string, amount: string, memo?: string): Promise<SendOutcome> {
    let broadcasting = false;
    try {
      const { MsgSend, createTransaction, TxGrpcApi, ChainRestAuthApi, BaseAccount } =
        await import("@injectivelabs/sdk-ts");
      const { Network, getNetworkEndpoints } = await import("@injectivelabs/networks");

      const isMainnet = process.env.MARKET_NETWORK === "mainnet";
      const network = isMainnet ? Network.Mainnet : Network.Testnet;
      const endpoints = getNetworkEndpoints(network);
      const chainId = isMainnet ? "injective-1" : "injective-888";
      const { address, pubKeyB64 } = await this.identity();

      // Account number + sequence from the chain.
      const accountRes = await new ChainRestAuthApi(endpoints.rest).fetchAccount(address);
      const account = BaseAccount.fromRestApi(accountRes);

      const msg = MsgSend.fromJSON({
        amount: { denom, amount },
        srcInjectiveAddress: address,
        dstInjectiveAddress: to,
      });

      // Build the tx; signHashedBytes is keccak256(signBytes) — exactly what the
      // ethsecp256k1 signature is over, so it feeds straight into KMS.
      const { txRaw, signHashedBytes } = createTransaction({
        message: msg,
        memo: memo ?? "",
        chainId,
        pubKey: pubKeyB64,
        sequence: account.sequence,
        accountNumber: account.accountNumber,
      });

      const signature = await this.signDigest(signHashedBytes);
      txRaw.signatures = [signature];

      // From here a throw is ambiguous — the tx may already be in the mempool.
      broadcasting = true;
      const res = await new TxGrpcApi(endpoints.grpc).broadcast(txRaw);
      if (res.code !== 0) {
        return { ok: false, submitted: false, error: res.rawLog || `Transaction failed (code ${res.code})` };
      }
      return { ok: true, submitted: true, txHash: res.txHash };
    } catch (e) {
      return { ok: false, submitted: broadcasting, error: (e as Error).message };
    }
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
