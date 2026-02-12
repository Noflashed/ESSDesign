# Database Migration for Hierarchical Folder Structure

## Run this SQL in your Supabase SQL Editor

```sql
-- Drop old tables
DROP TABLE IF EXISTS revisions CASCADE;
DROP TABLE IF EXISTS design_sets CASCADE;

-- Create folders table
CREATE TABLE folders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    parent_folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create design_documents table
CREATE TABLE design_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    folder_id UUID REFERENCES folders(id) ON DELETE CASCADE NOT NULL,
    revision_number TEXT NOT NULL,
    ess_design_issue_path TEXT,
    ess_design_issue_name TEXT,
    third_party_design_path TEXT,
    third_party_design_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_folders_parent ON folders(parent_folder_id);
CREATE INDEX idx_documents_folder ON design_documents(folder_id);
CREATE INDEX idx_documents_revision ON design_documents(revision_number);

-- Enable RLS
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_documents ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all for development)
CREATE POLICY "Enable all operations for folders" ON folders FOR ALL USING (true);
CREATE POLICY "Enable all operations for documents" ON design_documents FOR ALL USING (true);
```

## Storage Bucket

Your existing `design-pdfs` storage bucket can stay as is. No changes needed.

## New Folder Structure

You can now create nested folders:
- Builder 1
  - Project A
    - Scaffold 1
      - Rev 01
      - Rev 02
    - Scaffold 2
  - Project B
- Builder 2
  - Project C

Each bottom folder can contain multiple document revisions.
