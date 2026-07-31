-- =============================================================================
-- Migration 025: Wallet-first sign-in (dual-auth)
--
-- Until now the wallet was only a secondary attribute a logged-in Discord user
-- could attach (link-wallet). This migration lets a wallet be a FIRST-CLASS
-- sign-in that resolves to ONE canonical account — so a person who uses Discord
-- one day and their wallet the next never ends up with two split balances.
--
-- Supabase Auth has no native Cosmos/Injective provider, so wallet sign-in is:
--   verify ADR-036 signature (server) → look up / admin-create the auth user →
--   mint a real GoTrue session via a one-time OTP. The session handle for a
--   wallet-native account is a synthesized, non-deliverable `<wallet>@wallet.invalid`
--   email (RFC 2606 reserved TLD; not PII, never a login vector — there is no
--   password and nothing is ever mailed).
--
-- Additive + backward-compatible: the Discord signup path is preserved exactly
-- (its real email is still nulled). Not applied to prod without explicit OK.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles: allow accounts that have NO Discord identity.
-- discord_id was NOT NULL UNIQUE — drop NOT NULL (UNIQUE stays; Postgres allows
-- many NULLs under a UNIQUE constraint, so wallet-first rows coexist). Add a
-- guard so every profile still carries at least one identity.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ALTER COLUMN discord_id DROP NOT NULL;

ALTER TABLE public.profiles
  ADD CONSTRAINT ck_profile_identity
  CHECK (discord_id IS NOT NULL OR wallet_address IS NOT NULL)
  NOT VALID;   -- binds future writes; existing rows all have discord_id already

-- ---------------------------------------------------------------------------
-- handle_new_user: branch on signup type.
--   • wallet signup (raw_user_meta_data.wallet_address present) → wallet-native
--     profile; KEEP the synthesized @wallet.invalid email (it is the OTP handle).
--   • Discord signup → unchanged from migration 005 (real email nulled).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet TEXT := NEW.raw_user_meta_data ->> 'wallet_address';
BEGIN
  IF v_wallet IS NOT NULL THEN
    -- Wallet-first account: the wallet IS the identity; no Discord id.
    INSERT INTO public.profiles (id, wallet_address, username, avatar_url)
    VALUES (
      NEW.id,
      v_wallet,
      COALESCE(
        NULLIF(NEW.raw_user_meta_data ->> 'username', ''),
        left(v_wallet, 9) || '…' || right(v_wallet, 4)
      ),
      ''
    )
    ON CONFLICT (id) DO NOTHING;
    -- Deliberately do NOT null the email: the @wallet.invalid address is the
    -- session handle used to mint OTP sessions on every wallet sign-in.
  ELSE
    -- Discord signup — identical to migration 005.
    INSERT INTO public.profiles (id, discord_id, username, avatar_url)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data ->> 'provider_id',
      COALESCE(
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.raw_user_meta_data ->> 'name',
        'Unknown'
      ),
      COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', '')
    )
    ON CONFLICT (id) DO NOTHING;

    -- Discard the email Supabase captures from Discord — it is never used.
    UPDATE auth.users SET email = NULL WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- wallet_auth_challenges — single-use, short-lived login nonces.
-- One active challenge per wallet (PK on wallet; re-request upserts). The nonce
-- is bound into the signed message and deleted on use → no signature replay.
-- Service-role only (RLS on, no policy). Written/read solely by /auth/wallet.
-- ---------------------------------------------------------------------------
CREATE TABLE public.wallet_auth_challenges (
  wallet     TEXT        PRIMARY KEY,
  nonce      TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallet_auth_challenges_expires
  ON public.wallet_auth_challenges (expires_at);

ALTER TABLE public.wallet_auth_challenges ENABLE ROW LEVEL SECURITY;  -- no policy → service role only
