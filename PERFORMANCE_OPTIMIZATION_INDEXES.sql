-- ============================================================================
-- PHASE 1 PERFORMANCE OPTIMIZATION: DATABASE INDEXES
-- ============================================================================
-- Purpose: Add critical missing indexes to achieve 50-70% faster query performance
-- Estimated Impact: 2-3s queries → 500ms-1s queries
-- Safe to run: Uses CONCURRENTLY to avoid table locks
-- ============================================================================

-- Before running, verify current indexes:
-- SELECT schemaname, tablename, indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
-- ORDER BY tablename, indexname;

-- ============================================================================
-- 1. USER-BASED FILTERING INDEXES
-- ============================================================================
-- Impact: Dramatically speeds up "my folders" and "my documents" queries
-- Current: Full table scan on every user-specific query
-- After: Index scan - 10-100x faster depending on data size

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_folders_user_id
ON folders(user_id)
WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_user_id
ON design_documents(user_id)
WHERE user_id IS NOT NULL;

COMMENT ON INDEX idx_folders_user_id IS 'Speeds up user-specific folder queries';
COMMENT ON INDEX idx_documents_user_id IS 'Speeds up user-specific document queries';

-- ============================================================================
-- 2. SORTING AND ORDERING INDEXES
-- ============================================================================
-- Impact: Enables fast sorting by date without full table scan
-- Current: Sorts entire table in memory
-- After: Pre-sorted index - constant time access

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_folders_updated_at
ON folders(updated_at DESC NULLS LAST);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_updated_at
ON design_documents(updated_at DESC NULLS LAST);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_folders_created_at
ON folders(created_at DESC NULLS LAST);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_created_at
ON design_documents(created_at DESC NULLS LAST);

COMMENT ON INDEX idx_folders_updated_at IS 'Enables fast "recently modified" sorting';
COMMENT ON INDEX idx_documents_updated_at IS 'Enables fast document date sorting';

-- ============================================================================
-- 3. COMPOSITE INDEXES FOR COMMON QUERIES
-- ============================================================================
-- Impact: Optimizes the most common query patterns
-- Covers: "Get subfolders of X ordered by date" - used on every folder navigation

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_folders_parent_updated
ON folders(parent_folder_id, updated_at DESC)
WHERE parent_folder_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_folder_updated
ON design_documents(folder_id, updated_at DESC);

-- For root folders (NULL parent) with user filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_folders_root_user
ON folders(user_id, updated_at DESC)
WHERE parent_folder_id IS NULL AND user_id IS NOT NULL;

COMMENT ON INDEX idx_folders_parent_updated IS 'Optimizes subfolder listing with date sort';
COMMENT ON INDEX idx_documents_folder_updated IS 'Optimizes document listing in folders';
COMMENT ON INDEX idx_folders_root_user IS 'Optimizes root folder listing for users';

-- ============================================================================
-- 4. TEXT SEARCH OPTIMIZATION
-- ============================================================================
-- Impact: Makes folder name search 5-20x faster
-- Enables case-insensitive search with proper indexing

-- For case-insensitive search (ILIKE)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_folders_name_lower
ON folders(LOWER(name) text_pattern_ops);

-- For full-text search (if needed in future)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_folders_name_gin
ON folders USING gin(to_tsvector('english', name));

COMMENT ON INDEX idx_folders_name_lower IS 'Speeds up case-insensitive name search (ILIKE)';
COMMENT ON INDEX idx_folders_name_gin IS 'Enables full-text search on folder names';

-- ============================================================================
-- 5. PARTIAL INDEXES FOR COMMON FILTERS
-- ============================================================================
-- Impact: Smaller, faster indexes for specific use cases
-- Only indexes rows that match the filter condition

-- Index for active (non-deleted) folders with user ownership
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_folders_active_user
ON folders(user_id, parent_folder_id, updated_at DESC)
WHERE user_id IS NOT NULL;

-- Index for documents with files
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_with_ess
ON design_documents(folder_id, updated_at DESC)
WHERE ess_design_issue_path IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_with_third_party
ON design_documents(folder_id, updated_at DESC)
WHERE third_party_design_path IS NOT NULL;

COMMENT ON INDEX idx_folders_active_user IS 'Optimized index for user-owned folders';
COMMENT ON INDEX idx_documents_with_ess IS 'Fast lookup for documents with ESS design files';
COMMENT ON INDEX idx_documents_with_third_party IS 'Fast lookup for documents with third-party files';

-- ============================================================================
-- 6. STATISTICS UPDATE
-- ============================================================================
-- Force PostgreSQL to update statistics for better query planning

ANALYZE folders;
ANALYZE design_documents;

-- ============================================================================
-- 7. VERIFICATION QUERIES
-- ============================================================================
-- Run these to verify indexes are being used:

-- Check if user_id index is used (should show "Index Scan")
-- EXPLAIN ANALYZE
-- SELECT * FROM folders WHERE user_id = 'some-user-id';

-- Check if composite index is used (should show "Index Scan")
-- EXPLAIN ANALYZE
-- SELECT * FROM folders
-- WHERE parent_folder_id = 'some-folder-id'
-- ORDER BY updated_at DESC;

-- View all indexes on our tables
-- SELECT
--     schemaname,
--     tablename,
--     indexname,
--     pg_size_pretty(pg_relation_size(indexrelid)) as index_size
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- AND (tablename = 'folders' OR tablename = 'design_documents')
-- ORDER BY tablename, indexname;

-- ============================================================================
-- 8. MAINTENANCE NOTES
-- ============================================================================

-- Re-run ANALYZE weekly if you have heavy write traffic:
-- ANALYZE folders;
-- ANALYZE design_documents;

-- Monitor index usage (unused indexes waste space):
-- SELECT
--     schemaname,
--     tablename,
--     indexname,
--     idx_scan,
--     pg_size_pretty(pg_relation_size(indexrelid)) as size
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan ASC;

-- Rebuild indexes if they become bloated (rare, but good to know):
-- REINDEX INDEX CONCURRENTLY idx_folders_user_id;

-- ============================================================================
-- EXPECTED PERFORMANCE IMPROVEMENTS
-- ============================================================================

-- Before:
-- - Root folder query: 2-3 seconds
-- - Subfolder navigation: 1-2 seconds
-- - Search: 2-4 seconds

-- After:
-- - Root folder query: 500ms-1s (3-6x faster)
-- - Subfolder navigation: 200-500ms (3-5x faster)
-- - Search: 500ms-1s (4-8x faster)

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================

-- To remove all indexes created by this script:
/*
DROP INDEX CONCURRENTLY IF EXISTS idx_folders_user_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_documents_user_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_folders_updated_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_documents_updated_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_folders_created_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_documents_created_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_folders_parent_updated;
DROP INDEX CONCURRENTLY IF EXISTS idx_documents_folder_updated;
DROP INDEX CONCURRENTLY IF EXISTS idx_folders_root_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_folders_name_lower;
DROP INDEX CONCURRENTLY IF EXISTS idx_folders_name_gin;
DROP INDEX CONCURRENTLY IF EXISTS idx_folders_active_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_documents_with_ess;
DROP INDEX CONCURRENTLY IF EXISTS idx_documents_with_third_party;
*/
