-- Migration: Replace user_names view with a table + trigger
-- Date: 2026-02-15
-- Description: The user_names view reads from auth.users which is inaccessible
--   to the anon role used by PostgREST. Replace it with a proper table that is
--   automatically populated via a trigger on auth.users inserts/updates.

-- ============================================================================
-- 1. Drop the existing view (if it exists)
-- ============================================================================
DROP VIEW IF EXISTS public.user_names;

-- ============================================================================
-- 2. Create the user_names table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_names (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL DEFAULT '',
    full_name TEXT NOT NULL DEFAULT ''
);

-- Grant access
GRANT SELECT ON public.user_names TO authenticated;
GRANT SELECT ON public.user_names TO anon;

-- Enable RLS but allow all reads (names are not sensitive)
ALTER TABLE public.user_names ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read user names"
    ON public.user_names FOR SELECT
    USING (true);

-- ============================================================================
-- 3. Backfill existing users from auth.users
-- ============================================================================
INSERT INTO public.user_names (id, email, full_name)
SELECT
    id,
    COALESCE(email, ''),
    COALESCE(
        raw_user_meta_data->>'full_name',
        SPLIT_PART(COALESCE(email, ''), '@', 1),
        ''
    )
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name;

-- ============================================================================
-- 4. Create trigger function to sync on user creation/update
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_auth_user_change()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_names (id, email, full_name)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            SPLIT_PART(COALESCE(NEW.email, ''), '@', 1),
            ''
        )
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. Attach trigger to auth.users
-- ============================================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_auth_user_change();
