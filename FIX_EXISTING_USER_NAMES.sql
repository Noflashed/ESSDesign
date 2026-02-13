-- ============================================================================
-- FIX: Add full_name to existing users who don't have it
-- ============================================================================
-- Run this if existing users don't have full_name in their metadata
-- ============================================================================

-- Option 1: Set full_name to email for all users missing it
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{full_name}',
    to_jsonb(COALESCE(email, 'Unknown User'))
)
WHERE raw_user_meta_data->>'full_name' IS NULL;

-- Option 2: Set specific names for known users (edit as needed)
-- UPDATE auth.users
-- SET raw_user_meta_data = jsonb_set(
--     COALESCE(raw_user_meta_data, '{}'::jsonb),
--     '{full_name}',
--     '"John Doe"'::jsonb
-- )
-- WHERE email = 'john@example.com';

-- Verify the changes
SELECT
    email,
    raw_user_meta_data->>'full_name' as full_name,
    updated_at
FROM auth.users
ORDER BY created_at DESC;

-- ============================================================================
-- DONE! All users should now have full_name in metadata
-- ============================================================================
