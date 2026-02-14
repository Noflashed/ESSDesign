-- Migration: Add description column to design_documents table
-- Date: 2026-02-14
-- Description: Adds an optional description field to design documents for change notes

-- Add description column
ALTER TABLE design_documents
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add comment
COMMENT ON COLUMN design_documents.description IS 'Optional description of changes made in this revision';
