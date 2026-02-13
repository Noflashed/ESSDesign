-- ============================================================================
-- COMPLETE SETUP: User Names Display Feature
-- ============================================================================
-- This script does EVERYTHING needed to show user names instead of IDs
-- Run this ONCE in Supabase SQL Editor
-- ============================================================================

-- STEP 1: Create the view
-- ============================================================================
CREATE OR REPLACE VIEW public.user_names AS
SELECT
    id,
    email,
    COALESCE(
        raw_user_meta_data->>'full_name',
        email
    ) as full_name
FROM auth.users;

-- Grant permissions
GRANT SELECT ON public.user_names TO authenticated;
GRANT SELECT ON public.user_names TO anon;

-- STEP 2: Create helper function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_name(user_uuid UUID)
RETURNS TEXT AS $$
BEGIN
    RETURN (
        SELECT COALESCE(
            raw_user_meta_data->>'full_name',
            email,
            'Unknown User'
        )
        FROM auth.users
        WHERE id = user_uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_user_name(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_name(UUID) TO anon;

-- STEP 3: Fix existing users without full_name
-- ============================================================================
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{full_name}',
    to_jsonb(COALESCE(email, 'Unknown User'))
)
WHERE raw_user_meta_data->>'full_name' IS NULL;

-- STEP 4: Verify everything works
-- ============================================================================
DO $$
DECLARE
    view_exists boolean;
    user_count integer;
    users_with_names integer;
BEGIN
    -- Check view exists
    SELECT EXISTS (
        SELECT FROM pg_views
        WHERE schemaname = 'public' AND viewname = 'user_names'
    ) INTO view_exists;

    -- Count users
    SELECT COUNT(*) FROM auth.users INTO user_count;

    -- Count users with names
    SELECT COUNT(*) FROM auth.users
    WHERE raw_user_meta_data->>'full_name' IS NOT NULL
    INTO users_with_names;

    -- Report results
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ SETUP COMPLETE!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'View exists: %', view_exists;
    RAISE NOTICE 'Total users: %', user_count;
    RAISE NOTICE 'Users with names: %', users_with_names;
    RAISE NOTICE '';
    RAISE NOTICE '📋 Next steps:';
    RAISE NOTICE '1. Restart your backend server';
    RAISE NOTICE '2. Refresh your frontend';
    RAISE NOTICE '3. User names should now appear!';
    RAISE NOTICE '========================================';
END $$;

-- STEP 5: Show sample data
-- ============================================================================
SELECT
    'Sample User Data:' as info,
    id,
    email,
    full_name
FROM public.user_names
LIMIT 5;

-- ============================================================================
-- ALL DONE!
-- Now restart your backend and user names should appear in the UI!
-- ============================================================================
