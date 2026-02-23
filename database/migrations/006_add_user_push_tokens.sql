-- Migration: Add table for iOS/APNs device token registration
-- Date: 2026-02-23

CREATE TABLE IF NOT EXISTS public.user_push_tokens (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'ios',
    app_bundle_id TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate active token rows per user/platform
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_push_tokens_user_platform
    ON public.user_push_tokens(user_id, platform);

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_push_tokens_token
    ON public.user_push_tokens(token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_push_tokens TO authenticated;
GRANT SELECT ON public.user_push_tokens TO anon;

ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read their own token rows
CREATE POLICY "Users can read own push tokens"
    ON public.user_push_tokens FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own token rows
CREATE POLICY "Users can insert own push tokens"
    ON public.user_push_tokens FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own token rows
CREATE POLICY "Users can update own push tokens"
    ON public.user_push_tokens FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Keep updated_at current
CREATE OR REPLACE FUNCTION public.touch_user_push_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_user_push_tokens_updated_at ON public.user_push_tokens;
CREATE TRIGGER trg_touch_user_push_tokens_updated_at
    BEFORE UPDATE ON public.user_push_tokens
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_user_push_tokens_updated_at();
