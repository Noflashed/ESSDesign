-- ============================================================================
-- CREATE USER NAMES VIEW
-- ============================================================================
-- This view exposes user IDs and names from auth.users for easy access
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Create a view that exposes user names from auth.users
CREATE OR REPLACE VIEW public.user_names AS
SELECT
    id,
    email,
    COALESCE(
        raw_user_meta_data->>'full_name',
        email
    ) as full_name
FROM auth.users;

-- Grant access to authenticated users
GRANT SELECT ON public.user_names TO authenticated;
GRANT SELECT ON public.user_names TO anon;

-- ============================================================================
-- ALTERNATIVE: Create a function to get user name by ID
-- ============================================================================
-- This is faster for single lookups
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_name(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_name(UUID) TO anon;

-- ============================================================================
-- TEST QUERIES (Optional - for verification)
-- ============================================================================
-- Uncomment to test:
-- SELECT * FROM public.user_names;
-- SELECT get_user_name('your-user-id-here');

-- ============================================================================
-- DONE! You can now query user names easily from your application
-- ============================================================================
