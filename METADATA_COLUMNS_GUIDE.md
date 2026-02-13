# Google Drive-Style Metadata Columns Implementation Guide

## Overview
This guide documents the implementation of file metadata columns (Date Modified, Owner, and File Size) in the list view, similar to Google Drive's file browser.

## Implementation Summary

### ✅ Step 1: Database Schema Updates
**File:** `ADD_METADATA_MIGRATION.sql`

Added the following columns to the database:

**folders table:**
- `user_id` (UUID) - References auth.users(id) for folder ownership

**design_documents table:**
- `user_id` (UUID) - References auth.users(id) for document ownership
- `ess_design_file_size` (BIGINT) - File size in bytes for ESS design PDF
- `third_party_design_file_size` (BIGINT) - File size in bytes for third-party PDF

**To apply these changes:**
1. Log in to your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `ADD_METADATA_MIGRATION.sql`
4. Execute the SQL commands

---

### ✅ Step 2: Backend Model Updates
**File:** `ESSDesign.Server/Models/Models.cs`

**Changes made:**

1. **DesignDocument model** - Added file size properties:
   ```csharp
   [Column("ess_design_file_size")]
   public long? EssDesignFileSize { get; set; }

   [Column("third_party_design_file_size")]
   public long? ThirdPartyDesignFileSize { get; set; }
   ```

2. **FolderResponse DTO** - Added owner and file size:
   ```csharp
   public string? OwnerName { get; set; }
   public long? FileSize { get; set; }
   ```

3. **DocumentResponse DTO** - Added file sizes and owner:
   ```csharp
   public long? EssDesignFileSize { get; set; }
   public long? ThirdPartyDesignFileSize { get; set; }
   public long? TotalFileSize { get; set; }
   public string? OwnerName { get; set; }
   ```

4. **UploadDocumentRequest** - Added file size parameters:
   ```csharp
   public long? EssDesignFileSize { get; set; }
   public long? ThirdPartyDesignFileSize { get; set; }
   ```

---

### ✅ Step 3: Backend Service Updates
**File:** `ESSDesign.Server/Services/SupabaseService.cs`

**Key changes:**

1. **UploadDocumentAsync** - Now captures file sizes automatically from `IFormFile.Length`:
   ```csharp
   document.EssDesignFileSize = essDesign.Length;
   document.ThirdPartyDesignFileSize = thirdParty.Length;
   ```

2. **BuildFolderResponseFull** - Calculates total file size:
   ```csharp
   var totalSize = (d.EssDesignFileSize ?? 0) + (d.ThirdPartyDesignFileSize ?? 0);
   TotalFileSize = totalSize > 0 ? totalSize : null
   ```

3. **Added helper method** `GetUserDisplayNameAsync` to fetch user display names from Supabase auth (implementation pending - requires RPC function setup)

---

### ✅ Step 4: Frontend Component Updates
**File:** `essdesign.client/src/components/FolderBrowser.jsx`

**Changes made:**

1. **Added utility functions:**
   ```javascript
   // Format file sizes (bytes → KB/MB/GB)
   const formatFileSize = (bytes) => { ... }

   // Format dates (ISO → "Jan 15, 2026")
   const formatDate = (dateString) => { ... }
   ```

2. **Added list view header:**
   ```jsx
   <div className="list-header">
       <div className="list-header-icon"></div>
       <div className="list-header-name">Name</div>
       <div className="list-header-owner">Owner</div>
       <div className="list-header-modified">Date Modified</div>
       <div className="list-header-size">File Size</div>
       <div className="list-header-actions"></div>
   </div>
   ```

3. **Updated list items to include metadata columns:**
   ```jsx
   <div className="list-item-owner">{item.ownerName || 'Unknown'}</div>
   <div className="list-item-modified">{formatDate(item.updatedAt || item.createdAt)}</div>
   <div className="list-item-size">{item.isDocument ? formatFileSize(item.totalFileSize) : '—'}</div>
   ```

---

### ✅ Step 5: CSS Styling Updates
**File:** `essdesign.client/src/components/FolderBrowser.css`

**Changes made:**

1. **List header styling:**
   ```css
   .list-header {
       display: grid;
       grid-template-columns: 40px 2fr 1fr 1.2fr 0.8fr auto;
       /* Google Drive-like header styling */
   }
   ```

2. **List item grid layout:**
   ```css
   .list-item {
       display: grid;
       grid-template-columns: 40px 2fr 1fr 1.2fr 0.8fr auto;
       /* Aligns with header columns */
   }
   ```

3. **Column-specific styling:**
   ```css
   .list-item-owner,
   .list-item-modified,
   .list-item-size {
       /* Consistent padding and text styling */
   }
   ```

**Grid column breakdown:**
- Column 1 (40px): Icon
- Column 2 (2fr): Name + metadata
- Column 3 (1fr): Owner
- Column 4 (1.2fr): Date Modified
- Column 5 (0.8fr): File Size
- Column 6 (auto): Action buttons

---

## Features Implemented

### 📅 Date Modified
- Displays the last updated timestamp for both folders and documents
- Fallback to `createdAt` if `updatedAt` is not available
- Format: "Jan 15, 2026" (locale-aware)

### 👤 Owner (Account Name)
- Shows the account name of the user who created the item
- Backend prepared for Supabase auth.users integration
- Displays "Unknown" for items without owner information

### 📊 File Size
- Calculates total size from both ESS and third-party PDFs
- Human-readable format: "1.2 MB", "345 KB", etc.
- Shows "—" for folders (no size)
- Automatically captured during upload from file metadata

---

## How to Test

### 1. Apply Database Migration
```sql
-- Run ADD_METADATA_MIGRATION.sql in Supabase SQL Editor
```

### 2. Build and Run Backend
```bash
cd ESSDesign.Server
dotnet build
dotnet run
```

### 3. Build and Run Frontend
```bash
cd essdesign.client
npm install
npm run dev
```

### 4. Test Scenarios

**Upload a new document:**
- Upload should now automatically capture file sizes
- Check that file size displays correctly in list view

**View existing items:**
- Existing items will show "—" for file size (legacy data)
- To populate legacy data, re-upload or run a migration script

**Check owner display:**
- Owner names will need Supabase RPC function setup (see below)

---

## Next Steps / Future Enhancements

### 1. Owner Name Display (Requires Supabase RPC Setup)

Create a Supabase RPC function to fetch user display names:

```sql
CREATE OR REPLACE FUNCTION get_user_display_name(user_id_param UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    display_name TEXT;
BEGIN
    SELECT
        COALESCE(
            raw_user_meta_data->>'full_name',
            raw_user_meta_data->>'name',
            email
        )
    INTO display_name
    FROM auth.users
    WHERE id = user_id_param;

    RETURN display_name;
END;
$$;
```

### 2. Folder Size Calculation

Currently folders show "—" for size. To show aggregate size:
- Calculate total size of all documents in folder
- Cache the result for performance
- Update on document add/delete

### 3. Sortable Columns

Add click handlers to column headers to sort by:
- Name (alphabetical)
- Owner (alphabetical)
- Date Modified (chronological)
- File Size (numerical)

### 4. Backfill Legacy Data

For existing documents without file sizes:
- Create a migration script to query Supabase Storage
- Fetch file metadata and update database
- Or, file sizes will be populated on next edit/re-upload

---

## Column Layout Reference

```
┌─────────┬────────────────────┬─────────────┬──────────────┬───────────┬─────────────┐
│  Icon   │       Name         │    Owner    │Date Modified │File Size  │   Actions   │
├─────────┼────────────────────┼─────────────┼──────────────┼───────────┼─────────────┤
│   📁    │ Project A          │ John Doe    │ Jan 15, 2026 │     —     │             │
│   📄    │ Rev 01             │ Jane Smith  │ Jan 14, 2026 │  1.2 MB   │  [Buttons]  │
│   📄    │ Rev 02             │ John Doe    │ Jan 12, 2026 │  850 KB   │  [Buttons]  │
└─────────┴────────────────────┴─────────────┴──────────────┴───────────┴─────────────┘
```

---

## Files Modified

| File | Purpose |
|------|---------|
| `ADD_METADATA_MIGRATION.sql` | Database schema changes |
| `ESSDesign.Server/Models/Models.cs` | Backend data models |
| `ESSDesign.Server/Services/SupabaseService.cs` | File size capture & owner fetching |
| `essdesign.client/src/components/FolderBrowser.jsx` | List view display logic |
| `essdesign.client/src/components/FolderBrowser.css` | List view styling |
| `METADATA_COLUMNS_GUIDE.md` | This documentation |

---

## Support

If you encounter any issues:
1. Check that the database migration was applied successfully
2. Verify that new uploads are capturing file sizes in the database
3. Check browser console for any JavaScript errors
4. Review backend logs for any API errors

For owner name display issues, ensure the Supabase RPC function is created and permissions are set correctly.
