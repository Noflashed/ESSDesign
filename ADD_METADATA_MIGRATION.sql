-- Migration: Add File Metadata Columns
-- Date: 2026-02-13
-- Purpose: Add file size and user_id columns to support Google Drive-like metadata display

-- Add user_id columns to track ownership
ALTER TABLE folders
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE design_documents
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add file size columns to design_documents (size in bytes)
ALTER TABLE design_documents
ADD COLUMN IF NOT EXISTS ess_design_file_size BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS third_party_design_file_size BIGINT DEFAULT 0;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_user ON design_documents(user_id);

-- Add comments for documentation
COMMENT ON COLUMN folders.user_id IS 'User who created/owns the folder';
COMMENT ON COLUMN design_documents.user_id IS 'User who uploaded the document';
COMMENT ON COLUMN design_documents.ess_design_file_size IS 'File size in bytes for ESS design PDF';
COMMENT ON COLUMN design_documents.third_party_design_file_size IS 'File size in bytes for third-party design PDF';
