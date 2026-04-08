-- Migration: Add durable user notifications for mobile/app inbox
-- Date: 2026-04-08

CREATE TABLE IF NOT EXISTS public.user_notifications (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'document_update',
    actor_name TEXT NULL,
    actor_image_url TEXT NULL,
    folder_id UUID NULL REFERENCES public.folders(id) ON DELETE SET NULL,
    document_id UUID NULL REFERENCES public.design_documents(id) ON DELETE SET NULL,
    read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
    ON public.user_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_read
    ON public.user_notifications(user_id, read);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notifications TO authenticated;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
    ON public.user_notifications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
    ON public.user_notifications FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
    ON public.user_notifications FOR DELETE
    USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_user_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_user_notifications_updated_at ON public.user_notifications;
CREATE TRIGGER trg_touch_user_notifications_updated_at
    BEFORE UPDATE ON public.user_notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_user_notifications_updated_at();
