# Testing Guide for Migration 005: Timezone Query Optimization

## Pre-Migration Baseline

Before applying the migration, capture baseline performance metrics:

```sql
-- Enable pg_stat_statements if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Reset statistics for clean measurement
SELECT pg_stat_statements_reset();

-- Check current timezone query performance
SELECT
  query,
  calls,
  mean_exec_time as mean_time,
  total_exec_time as total_time,
  rows / calls as avg_rows_per_call
FROM pg_stat_statements
WHERE query LIKE '%pg_timezone_names%'
ORDER BY total_exec_time DESC;
```

## Apply Migration

```bash
# Connect to your Supabase/PostgreSQL database
psql "your-connection-string"

# Run the migration
\i database/migrations/005_optimize_timezone_query.sql
```

Or via Supabase Dashboard:
1. Go to SQL Editor
2. Copy contents of `005_optimize_timezone_query.sql`
3. Execute the SQL

## Post-Migration Verification

### 1. Verify Objects Were Created

```sql
-- Check materialized view
SELECT
  schemaname,
  matviewname,
  matviewowner,
  tablespace,
  hasindexes
FROM pg_matviews
WHERE matviewname = 'cached_timezone_names';

-- Check view
SELECT
  schemaname,
  viewname,
  viewowner
FROM pg_views
WHERE viewname = 'timezone_names'
  AND schemaname = 'public';

-- Check function
SELECT
  n.nspname as schema,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'refresh_timezone_cache';

-- Check indexes
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'cached_timezone_names'
ORDER BY indexname;
```

### 2. Verify Data Integrity

```sql
-- Check row count (should be ~1,194 timezones)
SELECT COUNT(*) as cached_count FROM public.cached_timezone_names;
SELECT COUNT(*) as system_count FROM pg_timezone_names;
-- Both should match

-- Verify data consistency (spot check)
SELECT * FROM public.cached_timezone_names
WHERE name IN ('America/New_York', 'Australia/Sydney', 'Europe/London', 'Asia/Tokyo')
ORDER BY name;

-- Compare cached vs system view for specific timezone
SELECT 'cached' as source, * FROM public.cached_timezone_names WHERE name = 'America/New_York'
UNION ALL
SELECT 'system' as source, * FROM pg_timezone_names WHERE name = 'America/New_York';
-- Data should be identical
```

### 3. Verify Permissions

```sql
-- Check permissions on materialized view
SELECT
  grantee,
  privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name = 'cached_timezone_names';
-- Should include SELECT for authenticated, anon, authenticator

-- Check permissions on view
SELECT
  grantee,
  privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name = 'timezone_names';
-- Should include SELECT for authenticated, anon, authenticator

-- Check function permissions
SELECT
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'refresh_timezone_cache';
-- Should only allow postgres role to execute
```

### 4. Test Query Performance

```sql
-- Reset statistics
SELECT pg_stat_statements_reset();

-- Test old query (for comparison)
EXPLAIN ANALYZE SELECT name FROM pg_timezone_names;

-- Test new cached query
EXPLAIN ANALYZE SELECT name FROM public.timezone_names;

-- Test full cached data query
EXPLAIN ANALYZE SELECT * FROM public.cached_timezone_names;

-- Wait for some application queries, then check stats
SELECT
  query,
  calls,
  mean_exec_time as mean_time_ms,
  total_exec_time as total_time_ms,
  (blk_read_time + blk_write_time) / calls as avg_io_time_ms,
  100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0) as cache_hit_rate
FROM pg_stat_statements
WHERE query LIKE '%timezone%'
ORDER BY total_exec_time DESC
LIMIT 10;
```

### 5. Test Refresh Function

```sql
-- Test the refresh function
SELECT public.refresh_timezone_cache();
-- Should return successfully with NOTICE message

-- Verify last refresh time
SELECT last_refresh
FROM pg_matviews
WHERE matviewname = 'cached_timezone_names';
-- Should show current timestamp
```

### 6. Test Application Integration

#### Test from Supabase Client (JavaScript/TypeScript)

```javascript
// Test in browser console or Node.js

// Test 1: Query timezone names
const { data: names, error: error1 } = await supabase
  .from('timezone_names')
  .select('name')
  .limit(10);

console.log('Timezone names:', names);
console.log('Error:', error1);

// Test 2: Query full timezone data
const { data: timezones, error: error2 } = await supabase
  .from('cached_timezone_names')
  .select('*')
  .order('name')
  .limit(10);

console.log('Full timezone data:', timezones);
console.log('Error:', error2);

// Test 3: Filter by timezone name
const { data: aest, error: error3 } = await supabase
  .from('cached_timezone_names')
  .select('*')
  .eq('name', 'Australia/Sydney')
  .single();

console.log('AEST timezone:', aest);
console.log('Error:', error3);
```

#### Test from psql (SQL)

```sql
-- Test as different roles
SET ROLE authenticated;
SELECT COUNT(*) FROM public.timezone_names;
-- Should work

SET ROLE anon;
SELECT COUNT(*) FROM public.timezone_names;
-- Should work

SET ROLE authenticator;
SELECT COUNT(*) FROM public.timezone_names;
-- Should work

-- Reset role
RESET ROLE;
```

## Performance Benchmarking

Run this script to compare performance:

```sql
-- Benchmark old method (pg_timezone_names)
DO $$
DECLARE
  start_time timestamp;
  end_time timestamp;
  i integer;
BEGIN
  start_time := clock_timestamp();

  FOR i IN 1..100 LOOP
    PERFORM name FROM pg_timezone_names;
  END LOOP;

  end_time := clock_timestamp();

  RAISE NOTICE 'pg_timezone_names (100 iterations): % ms',
    EXTRACT(MILLISECONDS FROM (end_time - start_time));
END $$;

-- Benchmark new method (cached_timezone_names)
DO $$
DECLARE
  start_time timestamp;
  end_time timestamp;
  i integer;
BEGIN
  start_time := clock_timestamp();

  FOR i IN 1..100 LOOP
    PERFORM name FROM public.timezone_names;
  END LOOP;

  end_time := clock_timestamp();

  RAISE NOTICE 'timezone_names (100 iterations): % ms',
    EXTRACT(MILLISECONDS FROM (end_time - start_time));
END $$;
```

## Expected Results

### Before Optimization
- Query: `SELECT name FROM pg_timezone_names`
- Mean time: ~673ms per query
- Cache hit rate: 0%
- Rows scanned: 1,194 per query

### After Optimization
- Query: `SELECT name FROM public.timezone_names`
- Mean time: <1ms per query
- Cache hit rate: ~100%
- Rows scanned: 1,194 (cached in memory)

### Performance Improvement
- **~672x faster** per query
- **~99.85% reduction** in query time
- **~28.5% reduction** in overall database load (based on original proportion)

## Monitoring in Production

After deployment, monitor for 24-48 hours:

```sql
-- Daily monitoring query
SELECT
  CURRENT_TIMESTAMP as check_time,
  query,
  calls,
  mean_exec_time,
  total_exec_time,
  100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0) as cache_hit_rate
FROM pg_stat_statements
WHERE query LIKE '%timezone%'
  AND query NOT LIKE '%pg_stat_statements%'
ORDER BY total_exec_time DESC;
```

## Troubleshooting

### Issue: Materialized view not refreshing
**Solution:**
```sql
SELECT public.refresh_timezone_cache();
```

### Issue: Permission denied errors
**Solution:**
```sql
GRANT SELECT ON public.cached_timezone_names TO authenticated, anon, authenticator;
GRANT SELECT ON public.timezone_names TO authenticated, anon, authenticator;
```

### Issue: View returns no data
**Solution:**
```sql
-- Check if materialized view has data
SELECT COUNT(*) FROM public.cached_timezone_names;

-- If empty, refresh it
SELECT public.refresh_timezone_cache();
```

### Issue: Application still using pg_timezone_names
**Solution:**
Update application code to use `public.timezone_names` or `public.cached_timezone_names` instead. Check:
- Supabase client queries
- Direct SQL queries in application code
- ORM configurations

## Rollback Plan

If issues occur, rollback with:

```sql
DROP VIEW IF EXISTS public.timezone_names CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.cached_timezone_names CASCADE;
DROP FUNCTION IF EXISTS public.refresh_timezone_cache();
```

Then update application to use `pg_timezone_names` directly.

## Success Criteria

✅ Materialized view contains ~1,194 timezones
✅ View queries return in <1ms
✅ All roles (authenticated, anon, authenticator) can read data
✅ Refresh function works without errors
✅ No application errors after deployment
✅ Overall database query time reduced by ~25-30%
✅ pg_timezone_names queries reduced or eliminated in pg_stat_statements
