# Running Concurrent Indexes (For Large Datasets)

## When to Use This

Use concurrent index creation if:
- You have **> 100,000 rows** in folders or design_documents
- Your app is **actively used** and you can't afford table locks
- You're running indexes during **business hours**

For smaller datasets, use `PERFORMANCE_INDEXES_SUPABASE.sql` instead (faster, simpler).

---

## How Concurrent Indexes Work

- **CONCURRENTLY** = Creates index without locking table for writes
- **Downside**: Must run ONE AT A TIME, outside transactions
- **Process**: Run each command separately via `psql` or API

---

## Option 1: Using psql (Recommended)

### Prerequisites
```bash
# Install PostgreSQL client
brew install postgresql  # Mac
sudo apt-get install postgresql-client  # Linux
```

### Get Connection String
1. Go to **Supabase Dashboard** → **Project Settings** → **Database**
2. Copy **Connection String** (session pooler)
3. Replace `[YOUR-PASSWORD]` with your database password

### Run Indexes
```bash
# Connect to database
psql "postgresql://postgres:[YOUR-PASSWORD]@db.jyjsbbugskbbhibhlyks.supabase.co:5432/postgres"

# Then run each command one by one:
```

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_folders_user_id
ON folders(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_user_id
ON design_documents(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_folders_updated_at
ON folders(updated_at DESC NULLS LAST);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_updated_at
ON design_documents(updated_at DESC NULLS LAST);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_folders_created_at
ON folders(created_at DESC NULLS LAST);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_created_at
ON design_documents(created_at DESC NULLS LAST);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_folders_parent_updated
ON folders(parent_folder_id, updated_at DESC)
WHERE parent_folder_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_folder_updated
ON design_documents(folder_id, updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_folders_root_user
ON folders(user_id, updated_at DESC)
WHERE parent_folder_id IS NULL AND user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_folders_name_lower
ON folders(LOWER(name) text_pattern_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_folders_name_gin
ON folders USING gin(to_tsvector('english', name));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_folders_active_user
ON folders(user_id, parent_folder_id, updated_at DESC)
WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_with_ess
ON design_documents(folder_id, updated_at DESC)
WHERE ess_design_issue_path IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_with_third_party
ON design_documents(folder_id, updated_at DESC)
WHERE third_party_design_path IS NOT NULL;

-- Update statistics
ANALYZE folders;
ANALYZE design_documents;
```

---

## Option 2: Using Supabase API (Advanced)

If you can't use `psql`, use Supabase's REST API:

```bash
# Save this as run_indexes.sh

#!/bin/bash

# Replace with your project details
PROJECT_REF="jyjsbbugskbbhibhlyks"
API_KEY="your-service-role-key"  # From Supabase Dashboard → Settings → API

BASE_URL="https://${PROJECT_REF}.supabase.co/rest/v1/rpc"

# Array of index creation commands
INDEXES=(
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_folders_user_id ON folders(user_id) WHERE user_id IS NOT NULL"
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_user_id ON design_documents(user_id) WHERE user_id IS NOT NULL"
    # ... add rest of indexes here
)

# Run each index
for sql in "${INDEXES[@]}"; do
    echo "Creating index: ${sql:0:60}..."
    curl -X POST "${BASE_URL}" \
        -H "apikey: ${API_KEY}" \
        -H "Authorization: Bearer ${API_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"query\": \"${sql}\"}"

    # Wait 2 seconds between indexes
    sleep 2
done

echo "✅ All indexes created!"
```

---

## Option 3: Scheduled Maintenance Window

Best approach for production:

1. **Schedule downtime** (e.g., 2 AM Sunday)
2. **Use non-concurrent indexes** (from `PERFORMANCE_INDEXES_SUPABASE.sql`)
3. **Faster completion** (all indexes in 10-30 seconds instead of several minutes)

---

## Monitoring Progress

Check index creation status:

```sql
-- See all indexes and their sizes
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as size,
    idx_scan as times_used
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- Check if index is being created (shows in progress)
SELECT
    pid,
    now() - pg_stat_activity.query_start AS duration,
    query
FROM pg_stat_activity
WHERE query LIKE '%CREATE INDEX%'
AND state = 'active';
```

---

## Estimated Time

For concurrent index creation:

| Rows | Time per Index | Total Time |
|------|----------------|------------|
| 10K | 2-5 seconds | ~1 minute |
| 100K | 10-20 seconds | ~5 minutes |
| 1M | 1-2 minutes | ~30 minutes |

**Non-concurrent is 5-10x faster** but locks tables briefly.

---

## Recommendation

**For your use case** (PDF management app):
- Likely **< 100K rows** → Use `PERFORMANCE_INDEXES_SUPABASE.sql`
- Table locks will be **< 1 second each**
- Total time: **10-30 seconds**
- **No downtime** needed

Only use concurrent if you have:
- Very large dataset (> 1M rows)
- Zero-downtime requirement
- Active users 24/7

---

## Troubleshooting

### Error: "relation already exists"
- Index already created, safe to ignore
- Or: Drop and recreate: `DROP INDEX IF EXISTS idx_name;`

### Error: "permission denied"
- Use service role key, not anon key
- Check database permissions

### Slow creation
- Normal for large tables
- Check progress with monitoring query above
- Don't interrupt - will restart from beginning

---

## Verification

After all indexes created:

```sql
-- Should show "Index Scan" not "Seq Scan"
EXPLAIN ANALYZE
SELECT * FROM folders
WHERE user_id = 'some-user-id'
ORDER BY updated_at DESC;
```

Expected output:
```
Index Scan using idx_folders_user_id on folders  (cost=0.15..8.17 rows=1 width=...)
```

✅ If you see "Index Scan" → Working!
❌ If you see "Seq Scan" → Index not being used (check query)
