-- ============================================================================
-- DEBUG: Check if user_names view exists and what data it contains
-- ============================================================================
-- Run these queries in Supabase SQL Editor to debug

-- 1. Check if the view exists
SELECT EXISTS (
    SELECT FROM pg_views
    WHERE schemaname = 'public'
    AND viewname = 'user_names'
) AS view_exists;

-- 2. Check what's in auth.users
SELECT
    id,
    email,
    raw_user_meta_data,
    raw_user_meta_data->>'full_name' as extracted_full_name,
    created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 10;

-- 3. Try to query the user_names view (will fail if view doesn't exist)
SELECT * FROM public.user_names LIMIT 10;

-- 4. Check current folders and their user_ids
SELECT
    id,
    name,
    user_id,
    created_at
FROM folders
ORDER BY created_at DESC
LIMIT 10;

-- 5. Check current documents and their user_ids
SELECT
    id,
    revision_number,
    folder_id,
    user_id,
    created_at
FROM design_documents
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- RESULTS INTERPRETATION:
-- ============================================================================
-- Query 1: Should return "true" if view exists, "false" if not
-- Query 2: Shows raw user data and if full_name exists
-- Query 3: Shows the formatted user names (email, full_name)
-- Query 4: Shows which folders have user_ids
-- Query 5: Shows which documents have user_ids
-- ============================================================================
