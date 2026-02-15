-- Migration: Fix RLS performance and duplicate indexes
-- Date: 2026-02-15
-- Description: Fixes auth_rls_initplan warnings on user_preferences by wrapping
--   auth.uid() in (select ...) subqueries, and removes duplicate indexes on
--   design_documents and folders tables.

-- ============================================================================
-- 1. Fix RLS policies on user_preferences
--    Wrap auth.uid() in (select auth.uid()) so the value is computed once
--    per query instead of once per row.
-- ============================================================================

-- SELECT policy
DROP POLICY IF EXISTS "Users can view own preferences" ON public.user_preferences;
CREATE POLICY "Users can view own preferences"
  ON public.user_preferences
  FOR SELECT
  USING (user_id = (select auth.uid()));

-- INSERT policy
DROP POLICY IF EXISTS "Users can insert own preferences" ON public.user_preferences;
CREATE POLICY "Users can insert own preferences"
  ON public.user_preferences
  FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

-- UPDATE policy
DROP POLICY IF EXISTS "Users can update own preferences" ON public.user_preferences;
CREATE POLICY "Users can update own preferences"
  ON public.user_preferences
  FOR UPDATE
  USING (user_id = (select auth.uid()));

-- DELETE policy
DROP POLICY IF EXISTS "Users can delete own preferences" ON public.user_preferences;
CREATE POLICY "Users can delete own preferences"
  ON public.user_preferences
  FOR DELETE
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- 2. Remove duplicate indexes
--    Keep idx_documents_user_id and idx_folders_user_id (more descriptive names),
--    drop the shorter-named duplicates.
-- ============================================================================

DROP INDEX IF EXISTS public.idx_documents_user;
DROP INDEX IF EXISTS public.idx_folders_user;
