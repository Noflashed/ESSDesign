-- Migration: Add issued-for status to ESS Design documents

ALTER TABLE public.design_documents
ADD COLUMN IF NOT EXISTS drawing_status TEXT NOT NULL DEFAULT 'Construction';

ALTER TABLE public.design_documents
DROP CONSTRAINT IF EXISTS design_documents_drawing_status_check;

ALTER TABLE public.design_documents
ADD CONSTRAINT design_documents_drawing_status_check
CHECK (drawing_status IN ('Construction', 'Preliminary', 'Concept', 'As-Built'));

COMMENT ON COLUMN public.design_documents.drawing_status IS 'Issued-for status for the drawing revision.';
