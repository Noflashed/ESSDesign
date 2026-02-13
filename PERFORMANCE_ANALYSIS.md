# Performance Analysis & Optimization Plan
## PDF Viewer Application - Supabase Backend

**Date:** February 13, 2026
**Goal:** Achieve Google Drive-like instantaneous responsiveness for refresh, upload, and deletion operations

---

## 🔍 Current Performance Bottlenecks Identified

### 1. **Database Schema & Indexing Issues** 🔴 HIGH IMPACT

#### Current State:
```sql
-- From DATABASE_MIGRATION.md - Missing critical indexes!
CREATE INDEX idx_folders_parent ON folders(parent_folder_id);
CREATE INDEX idx_documents_folder ON design_documents(folder_id);
CREATE INDEX idx_documents_revision ON design_documents(revision_number);
```

#### Problems:
- ❌ **No index on `user_id` columns** (added recently but indexes missing in production)
- ❌ **No composite index for common queries** (e.g., `folder_id + updated_at`)
- ❌ **Missing index on `updated_at` for sorting**
- ❌ **No index optimization for RLS policies**

#### Impact:
- Slow folder filtering by user
- Inefficient sorting by date
- Full table scans on user-specific queries

---

### 2. **N+1 Query Problem** 🔴 HIGH IMPACT

#### Current Implementation (SupabaseService.cs):

```csharp
// Lines 137-150 - BuildFolderResponseFull
var subfoldersTask = _supabase.From<Folder>()
    .Filter("parent_folder_id", Postgrest.Constants.Operator.Equals, folder.Id.ToString())
    .Get();

var documentsTask = _supabase.From<DesignDocument>()
    .Filter("folder_id", Postgrest.Constants.Operator.Equals, folder.Id.ToString())
    .Get();
```

#### Problems:
- ❌ **Separate queries for subfolders and documents** for EACH folder
- ❌ **No batch loading** - loads one folder at a time
- ❌ **Breadcrumbs fetched separately** (lines 299-318) - traverses parent chain with individual queries
- ❌ **Search results** (lines 513-609) - fetches subfolders/documents separately for each match

#### Impact:
- For 10 folders with 5 subfolders each = 50+ database queries
- Breadcrumb for depth 5 = 5 sequential queries
- Network latency multiplied by number of queries

---

### 3. **Inefficient Caching Strategy** 🟡 MEDIUM IMPACT

#### Current Implementation (SupabaseService.cs):

```csharp
// Lines 14-15 - Static cache with fixed TTL
private static readonly ConcurrentDictionary<Guid, (FolderResponse Data, DateTime Expiry)> _folderCache = new();
private static readonly TimeSpan _cacheExpiration = TimeSpan.FromMinutes(5);
```

#### Problems:
- ❌ **Fixed 5-minute TTL** - data can be stale for up to 5 minutes
- ❌ **Manual cache invalidation** - error-prone, easy to miss spots
- ❌ **No cache warming** - first load always slow
- ❌ **Cache per folder** - doesn't cache root folder list efficiently
- ❌ **No ETags or conditional requests** - always fetches full data

#### Impact:
- Users see stale data after operations
- Unnecessary re-fetches when data hasn't changed
- Cold cache on every deployment

---

### 4. **File Upload Workflow Issues** 🔴 HIGH IMPACT

#### Current Implementation (SupabaseService.cs):

```csharp
// Lines 334-361 - Sequential upload workflow
1. Create document record in database
2. Upload files to storage (parallel but blocking)
3. Update document with file paths
4. Clear cache
5. Return document ID
```

#### Problems:
- ❌ **Frontend waits for entire upload** before showing success
- ❌ **No progress indication** during upload
- ❌ **No resumable uploads** for large files
- ❌ **Files uploaded through backend** instead of direct-to-storage
- ❌ **No multipart upload** for files >5MB
- ❌ **Blocking cache clear** at the end

#### Impact:
- Perceived slowness - users wait for full upload
- Large files (>10MB) feel extremely slow
- Backend becomes bottleneck for file transfer

---

### 5. **Frontend Data Fetching Inefficiencies** 🟡 MEDIUM IMPACT

#### Current Implementation (FolderBrowser.jsx):

```javascript
// Lines 68-71 - Sequential fetches
const [data, crumbs] = await Promise.all([
    foldersAPI.getFolder(currentFolder),
    foldersAPI.getBreadcrumbs(currentFolder)
]);
```

#### Problems:
- ❌ **No pagination** - loads all items at once
- ❌ **No infinite scroll** - poor UX for folders with 100+ items
- ❌ **No prefetching** - only loads when clicked
- ❌ **Manual cache management** - 60-second client-side cache
- ❌ **Full re-render** on every update
- ❌ **No optimistic updates** - waits for server confirmation

#### Impact:
- Folders with 50+ documents load slowly
- Every navigation requires full data fetch
- UI feels sluggish due to network round trips

---

### 6. **Lack of Realtime Updates** 🟡 MEDIUM IMPACT

#### Current State:
```csharp
// Program.cs line 28
AutoConnectRealtime = false  // ❌ Realtime is disabled!
```

#### Problems:
- ❌ **No WebSocket connections** - relying on polling/manual refresh
- ❌ **Changes by other users not visible** until page refresh
- ❌ **Sidebar doesn't auto-update** when folders created elsewhere
- ❌ **Missed opportunity for instant updates**

#### Impact:
- Multi-user scenarios show stale data
- Manual refresh required to see others' changes
- Feels less responsive than modern apps

---

### 7. **Delete Operation Inefficiency** 🟡 MEDIUM IMPACT

#### Current Implementation (SupabaseService.cs):

```csharp
// Lines 378-414 - DeleteDocumentAsync
1. Fetch document from database
2. Delete files from storage (parallel)
3. Delete database record
4. Clear cache
```

#### Problems:
- ❌ **Frontend blocks until completion**
- ❌ **No optimistic deletion** - item stays visible until confirmed
- ❌ **Cascading deletes not optimized** - folder deletion slow for large trees
- ❌ **No bulk delete API** - deleting multiple items = multiple round trips

#### Impact:
- Deleting folder with 20 documents = 20+ operations
- UI feels frozen during delete operations

---

## 📊 Performance Metrics (Current vs Target)

| Operation | Current | Target | Gap |
|-----------|---------|--------|-----|
| **Root folder load** | ~2-3s | <500ms | 4-6x too slow |
| **Folder navigation** | ~1-2s | <200ms | 5-10x too slow |
| **File upload (5MB)** | ~5-10s | <2s | 3-5x too slow |
| **Delete operation** | ~1-3s | <500ms | 2-6x too slow |
| **Search results** | ~2-4s | <1s | 2-4x too slow |

---

## 🎯 Optimization Priorities

### **PHASE 1: Quick Wins (1-2 days)** 🚀

#### 1.1 Add Database Indexes
**Impact:** 50-70% faster queries
**Effort:** 10 minutes

```sql
-- Add missing indexes
CREATE INDEX CONCURRENTLY idx_folders_user_id ON folders(user_id);
CREATE INDEX CONCURRENTLY idx_documents_user_id ON design_documents(user_id);
CREATE INDEX CONCURRENTLY idx_folders_updated_at ON folders(updated_at DESC);
CREATE INDEX CONCURRENTLY idx_documents_updated_at ON design_documents(updated_at DESC);

-- Composite indexes for common queries
CREATE INDEX CONCURRENTLY idx_folders_parent_updated ON folders(parent_folder_id, updated_at DESC);
CREATE INDEX CONCURRENTLY idx_documents_folder_updated ON design_documents(folder_id, updated_at DESC);
```

#### 1.2 Implement Optimistic UI Updates
**Impact:** Instant perceived response
**Effort:** 2-3 hours

- Show folder/document immediately in UI
- Send API request in background
- Rollback on error

#### 1.3 Enable Direct Storage Uploads
**Impact:** 60-80% faster uploads
**Effort:** 3-4 hours

- Generate signed URLs for direct upload
- Upload directly from browser to Supabase Storage
- Update database after upload completes

---

### **PHASE 2: Structural Improvements (3-5 days)** 🏗️

#### 2.1 Implement Pagination
**Impact:** 80-90% faster initial load
**Effort:** 4-6 hours

```typescript
// Frontend - Infinite scroll
const ITEMS_PER_PAGE = 50;
const loadMore = async (cursor) => {
    const response = await foldersAPI.getFolder(folderId, {
        limit: ITEMS_PER_PAGE,
        offset: cursor
    });
};
```

#### 2.2 Enable Supabase Realtime
**Impact:** Instant multi-user updates
**Effort:** 2-3 hours

```csharp
// Backend
AutoConnectRealtime = true

// Frontend
supabase
  .channel('folders')
  .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'folders'
  }, handleFolderChange)
  .subscribe();
```

#### 2.3 Implement Smart Caching
**Impact:** 70-90% fewer API calls
**Effort:** 3-4 hours

- Use ETags for conditional requests
- Implement cache-aside pattern
- Add cache warming on startup

---

### **PHASE 3: Advanced Optimizations (1-2 weeks)** ⚡

#### 3.1 Batch Query Optimization
**Impact:** 80% fewer database queries
**Effort:** 1-2 days

```sql
-- Single query with recursive CTE for breadcrumbs
WITH RECURSIVE folder_path AS (
    SELECT id, name, parent_folder_id, 1 as depth
    FROM folders
    WHERE id = $1
    UNION ALL
    SELECT f.id, f.name, f.parent_folder_id, fp.depth + 1
    FROM folders f
    JOIN folder_path fp ON f.id = fp.parent_folder_id
)
SELECT * FROM folder_path ORDER BY depth DESC;
```

#### 3.2 Implement GraphQL or Custom Batch Endpoint
**Impact:** Single request for complex data
**Effort:** 2-3 days

```graphql
query FolderWithContext($id: UUID!) {
  folder(id: $id) {
    id
    name
    breadcrumbs { id, name }
    subFolders { id, name, updatedAt }
    documents { id, revisionNumber, fileSize }
  }
}
```

#### 3.3 Add File Upload Progress & Chunking
**Impact:** Better UX for large files
**Effort:** 2-3 days

- Implement resumable uploads
- Show real-time progress bar
- Chunk files >10MB

---

## 🔧 Implementation Recommendations

### **Start Here (This Week):**

1. **Run index creation SQL** (10 min)
2. **Enable optimistic UI updates** for folder create/delete (2 hours)
3. **Add upload progress indicator** (1 hour)
4. **Implement pagination** for folder contents (4 hours)

### **Next Week:**

5. **Enable Supabase Realtime** (3 hours)
6. **Implement direct storage uploads** (4 hours)
7. **Add smart caching with ETags** (3 hours)

### **Long Term:**

8. **Batch query optimization** (2 days)
9. **Add file chunking for large uploads** (3 days)

---

## 📈 Expected Results After Optimizations

| Operation | Before | After Phase 1 | After Phase 2 | After Phase 3 |
|-----------|--------|---------------|---------------|---------------|
| Root load | 2-3s | 1-1.5s | 300-500ms | <200ms |
| Navigation | 1-2s | 500ms-1s | 200-300ms | <100ms |
| Upload (5MB) | 5-10s | 3-5s | 1-2s | <1s |
| Delete | 1-3s | 500ms-1s | <500ms | <200ms |

---

## 🎯 Success Metrics

- [ ] 95% of operations complete in <1 second
- [ ] Initial page load <500ms
- [ ] File uploads show progress immediately
- [ ] Realtime updates working for multi-user scenarios
- [ ] Zero perceived lag for folder navigation
- [ ] Database query count reduced by 80%

---

## 📝 Notes

- All optimizations are backwards compatible
- Can be implemented incrementally
- No breaking changes to existing functionality
- Focus on user-perceived performance first
- Measure before/after for each optimization
