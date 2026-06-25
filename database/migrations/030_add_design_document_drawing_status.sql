-- Migration: Add issued-for status to ESS Design documents

ALTER TABLE public.design_documents
ADD COLUMN IF NOT EXISTS drawing_status TEXT NOT NULL DEFAULT 'Construction';

UPDATE public.design_documents
SET drawing_status = CASE
    WHEN upper(coalesce(ess_design_issue_name, third_party_design_name, '')) LIKE '%(ASB)%' THEN 'As-Built'
    WHEN upper(coalesce(ess_design_issue_name, third_party_design_name, '')) LIKE '%(PRE)%' THEN 'Preliminary'
    WHEN upper(coalesce(ess_design_issue_name, third_party_design_name, '')) LIKE '%(CON)%' THEN 'Construction'
    WHEN upper(coalesce(ess_design_issue_name, third_party_design_name, '')) LIKE '%(CPT)%' THEN 'Concept'
    WHEN upper(coalesce(ess_design_issue_name, third_party_design_name, '')) LIKE '%(CONCEPT)%' THEN 'Concept'
    ELSE drawing_status
END
WHERE coalesce(ess_design_issue_name, third_party_design_name, '') ~* '\((ASB|PRE|CON|CPT|CONCEPT)\)';

ALTER TABLE public.design_documents
DROP CONSTRAINT IF EXISTS design_documents_drawing_status_check;

ALTER TABLE public.design_documents
ADD CONSTRAINT design_documents_drawing_status_check
CHECK (drawing_status IN ('Construction', 'Preliminary', 'Concept', 'As-Built'));

COMMENT ON COLUMN public.design_documents.drawing_status IS 'Issued-for status for the drawing revision.';
