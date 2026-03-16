-- Migration: Backend latency optimizations for folders, breadcrumbs, and search
-- Date: 2026-03-16
-- Description: Persists folder total sizes, keeps them in sync with triggers,
--   and adds lightweight RPC helpers for breadcrumbs, hierarchy, and search.

ALTER TABLE public.folders
    ADD COLUMN IF NOT EXISTS total_file_size BIGINT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.adjust_folder_total_file_size(start_folder_id UUID, size_delta BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_id UUID := start_folder_id;
BEGIN
    IF current_id IS NULL OR size_delta = 0 THEN
        RETURN;
    END IF;

    WHILE current_id IS NOT NULL LOOP
        UPDATE public.folders
        SET total_file_size = GREATEST(0, COALESCE(total_file_size, 0) + size_delta)
        WHERE id = current_id;

        SELECT parent_folder_id
        INTO current_id
        FROM public.folders
        WHERE id = current_id;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_folder_total_file_size_from_documents()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    old_size BIGINT := COALESCE(OLD.ess_design_file_size, 0) + COALESCE(OLD.third_party_design_file_size, 0);
    new_size BIGINT := COALESCE(NEW.ess_design_file_size, 0) + COALESCE(NEW.third_party_design_file_size, 0);
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM public.adjust_folder_total_file_size(NEW.folder_id, new_size);
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        PERFORM public.adjust_folder_total_file_size(OLD.folder_id, -old_size);
        RETURN OLD;
    END IF;

    IF NEW.folder_id IS DISTINCT FROM OLD.folder_id THEN
        PERFORM public.adjust_folder_total_file_size(OLD.folder_id, -old_size);
        PERFORM public.adjust_folder_total_file_size(NEW.folder_id, new_size);
    ELSE
        PERFORM public.adjust_folder_total_file_size(NEW.folder_id, new_size - old_size);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_folder_total_file_size_from_documents ON public.design_documents;
CREATE TRIGGER trg_sync_folder_total_file_size_from_documents
    AFTER INSERT OR UPDATE OR DELETE ON public.design_documents
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_folder_total_file_size_from_documents();

CREATE OR REPLACE FUNCTION public.sync_folder_total_file_size_from_folders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    moved_size BIGINT := COALESCE(CASE WHEN TG_OP = 'DELETE' THEN OLD.total_file_size ELSE NEW.total_file_size END, 0);
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.parent_folder_id IS NOT NULL THEN
            PERFORM public.adjust_folder_total_file_size(OLD.parent_folder_id, -moved_size);
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.parent_folder_id IS DISTINCT FROM OLD.parent_folder_id THEN
        IF OLD.parent_folder_id IS NOT NULL THEN
            PERFORM public.adjust_folder_total_file_size(OLD.parent_folder_id, -moved_size);
        END IF;

        IF NEW.parent_folder_id IS NOT NULL THEN
            PERFORM public.adjust_folder_total_file_size(NEW.parent_folder_id, moved_size);
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_folder_total_file_size_from_folders ON public.folders;
CREATE TRIGGER trg_sync_folder_total_file_size_from_folders
    AFTER UPDATE OF parent_folder_id OR DELETE ON public.folders
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_folder_total_file_size_from_folders();

WITH RECURSIVE folder_tree AS (
    SELECT id AS ancestor_id, id AS folder_id
    FROM public.folders

    UNION ALL

    SELECT ft.ancestor_id, child.id AS folder_id
    FROM folder_tree ft
    JOIN public.folders child ON child.parent_folder_id = ft.folder_id
),
doc_sizes AS (
    SELECT
        folder_id,
        COALESCE(ess_design_file_size, 0) + COALESCE(third_party_design_file_size, 0) AS size_bytes
    FROM public.design_documents
),
folder_totals AS (
    SELECT
        ft.ancestor_id AS folder_id,
        COALESCE(SUM(ds.size_bytes), 0) AS total_size
    FROM folder_tree ft
    LEFT JOIN doc_sizes ds ON ds.folder_id = ft.folder_id
    GROUP BY ft.ancestor_id
)
UPDATE public.folders f
SET total_file_size = ft.total_size
FROM folder_totals ft
WHERE ft.folder_id = f.id;

CREATE OR REPLACE FUNCTION public.get_folder_breadcrumbs(p_folder_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH RECURSIVE ancestors AS (
        SELECT id, name, parent_folder_id, 0 AS depth
        FROM public.folders
        WHERE id = p_folder_id

        UNION ALL

        SELECT parent.id, parent.name, parent.parent_folder_id, ancestors.depth + 1
        FROM public.folders parent
        JOIN ancestors ON ancestors.parent_folder_id = parent.id
    )
    SELECT COALESCE(
        JSONB_AGG(
            JSONB_BUILD_OBJECT(
                'id', id,
                'name', name
            )
            ORDER BY depth DESC
        ),
        '[]'::JSONB
    )
    FROM ancestors;
$$;

CREATE OR REPLACE FUNCTION public.get_folder_hierarchy(p_folder_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH RECURSIVE ancestors AS (
        SELECT id, name, parent_folder_id, 0 AS depth
        FROM public.folders
        WHERE id = p_folder_id

        UNION ALL

        SELECT parent.id, parent.name, parent.parent_folder_id, ancestors.depth + 1
        FROM public.folders parent
        JOIN ancestors ON ancestors.parent_folder_id = parent.id
    )
    SELECT JSONB_BUILD_OBJECT(
        'scaffold', MAX(name) FILTER (WHERE depth = 0),
        'project', MAX(name) FILTER (WHERE depth = 1),
        'client', MAX(name) FILTER (WHERE depth = 2)
    )
    FROM ancestors;
$$;

CREATE OR REPLACE FUNCTION public.search_folders(p_query TEXT, p_limit INTEGER DEFAULT 10)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH matched AS (
        SELECT
            f.id,
            f.name,
            f.parent_folder_id,
            f.user_id,
            f.created_at,
            f.updated_at,
            f.total_file_size
        FROM public.folders f
        WHERE f.name ILIKE '%' || p_query || '%'
        ORDER BY f.name ASC
        LIMIT GREATEST(COALESCE(p_limit, 10), 1)
    ),
    ancestors AS (
        SELECT
            m.id AS match_id,
            parent.id,
            parent.name,
            parent.parent_folder_id,
            0 AS depth
        FROM matched m
        JOIN public.folders parent ON parent.id = m.parent_folder_id

        UNION ALL

        SELECT
            ancestors.match_id,
            parent.id,
            parent.name,
            parent.parent_folder_id,
            ancestors.depth + 1
        FROM ancestors
        JOIN public.folders parent ON parent.id = ancestors.parent_folder_id
    ),
    paths AS (
        SELECT
            match_id,
            STRING_AGG(name, ' / ' ORDER BY depth DESC) AS path
        FROM ancestors
        GROUP BY match_id
    ),
    subfolder_counts AS (
        SELECT parent_folder_id AS folder_id, COUNT(*)::INT AS subfolder_count
        FROM public.folders
        WHERE parent_folder_id IN (SELECT id FROM matched)
        GROUP BY parent_folder_id
    ),
    document_counts AS (
        SELECT folder_id, COUNT(*)::INT AS document_count
        FROM public.design_documents
        WHERE folder_id IN (SELECT id FROM matched)
        GROUP BY folder_id
    ),
    owners AS (
        SELECT
            id::TEXT AS user_id,
            NULLIF(full_name, '') AS full_name,
            email
        FROM public.user_names
        WHERE id IN (
            SELECT NULLIF(user_id, '')::UUID
            FROM matched
            WHERE NULLIF(user_id, '') IS NOT NULL
        )
    )
    SELECT COALESCE(
        JSONB_AGG(
            JSONB_BUILD_OBJECT(
                'id', m.id,
                'name', m.name,
                'type', 'folder',
                'parentFolderId', m.parent_folder_id,
                'path', COALESCE(p.path, ''),
                'ownerName', COALESCE(o.full_name, o.email),
                'createdAt', m.created_at,
                'updatedAt', m.updated_at,
                'fileSize', NULLIF(m.total_file_size, 0),
                'subFolderCount', COALESCE(sf.subfolder_count, 0),
                'documentCount', COALESCE(dc.document_count, 0),
                'subFolders', '[]'::JSONB,
                'documents', '[]'::JSONB
            )
            ORDER BY m.name ASC
        ),
        '[]'::JSONB
    )
    FROM matched m
    LEFT JOIN paths p ON p.match_id = m.id
    LEFT JOIN subfolder_counts sf ON sf.folder_id = m.id
    LEFT JOIN document_counts dc ON dc.folder_id = m.id
    LEFT JOIN owners o ON o.user_id = m.user_id;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_folder_total_file_size(UUID, BIGINT) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.get_folder_breadcrumbs(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_folder_hierarchy(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.search_folders(TEXT, INTEGER) TO authenticated, anon, service_role;