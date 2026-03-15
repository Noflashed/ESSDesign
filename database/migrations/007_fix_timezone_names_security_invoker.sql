-- Migration: Fix timezone_names view security mode
-- Date: 2026-03-16
-- Description: Recreates public.timezone_names as a SECURITY INVOKER view so it
--   respects the querying role's permissions and satisfies the Supabase linter.

DROP VIEW IF EXISTS public.timezone_names;

CREATE VIEW public.timezone_names
WITH (security_invoker = true) AS
SELECT name FROM public.cached_timezone_names;

GRANT SELECT ON public.timezone_names TO authenticated, anon, authenticator;

COMMENT ON VIEW public.timezone_names IS
  'Simple view providing just timezone names from cached data. Uses security invoker so queries run with the caller''s permissions.';

