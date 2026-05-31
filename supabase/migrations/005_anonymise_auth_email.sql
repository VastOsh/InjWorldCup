-- =============================================================================
-- Migration 005: Anonymise email on Discord signup
-- The app uses Discord identity only (scope: identify). Email is never needed.
-- This replaces handle_new_user to immediately null-out the email Supabase
-- stores in auth.users after every new OAuth signup.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, discord_id, username, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'provider_id',
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      'Unknown'
    ),
    COALESCE(
      NEW.raw_user_meta_data ->> 'avatar_url',
      ''
    )
  )
  ON CONFLICT (id) DO NOTHING;

  -- Discard the email Supabase captures from Discord — it is never used.
  UPDATE auth.users SET email = NULL WHERE id = NEW.id;

  RETURN NEW;
END;
$$;
