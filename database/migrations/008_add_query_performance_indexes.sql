-- Migration: Add indexes for common folder/document query patterns
-- Date: 2026-03-16
-- Description: Adds indexes that match the project's most frequent
--   WHERE/ORDER BY clauses and trims a few avoidable RLS costs.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Speed up folder listing by parent and sort by name.
CREATE INDEX IF NOT EXISTS idx_folders_parent_folder_name
    ON public.folders(parent_folder_id, name);

-- Speed up document listing within a folder ordered by revision.
CREATE INDEX IF NOT EXISTS idx_design_documents_folder_revision
    ON public.design_documents(folder_id, revision_number);

-- Speed up ILIKE folder search queries.
CREATE INDEX IF NOT EXISTS idx_folders_name_trgm
    ON public.folders USING gin(name gin_trgm_ops);

-- Match the active push-token lookup pattern used by the API.
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_active_lookup
    ON public.user_push_tokens(user_id, platform, is_active);

-- Compute auth.uid() once per statement for push-token RLS policies.
DROP POLICY IF EXISTS "Users can read own push tokens" ON public.user_push_tokens;
CREATE POLICY "Users can read own push tokens"
    ON public.user_push_tokens FOR SELECT
    USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own push tokens" ON public.user_push_tokens;
CREATE POLICY "Users can insert own push tokens"
    ON public.user_push_tokens FOR INSERT
    WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own push tokens" ON public.user_push_tokens;
CREATE POLICY "Users can update own push tokens"
    ON public.user_push_tokens FOR UPDATE
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);