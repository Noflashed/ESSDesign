# Timezone Query Optimization

## Problem

The query `SELECT name FROM pg_timezone_names` was consuming 28.79% of total database query time:

- **26 calls** with mean time of **672.87ms** each
- **Total time: 17,494ms** across all calls
- **0% cache hit rate** (no caching)
- **31,044 rows read** (1,194 rows × 26 calls)
- Called by the `authenticator` role (PostgREST/Supabase)

The `pg_timezone_names` system view dynamically generates timezone data on every query, making it expensive for repeated lookups.

## Solution

Created a **materialized view** (`cached_timezone_names`) that caches timezone data:

- **~1,194 timezone records** cached in memory
- **Near-instant lookups** (<1ms instead of ~673ms)
- **Indexed** for fast name and UTC offset queries
- **Minimal storage overhead** (~200KB)

## Database Objects Created

### 1. `public.cached_timezone_names` (Materialized View)
Caches all timezone data with columns:
- `name` - Timezone name (e.g., "America/New_York", "Australia/Sydney")
- `abbrev` - Timezone abbreviation (e.g., "EST", "AEST")
- `utc_offset` - UTC offset as interval
- `is_dst` - Whether currently observing daylight saving time

**Indexes:**
- `idx_cached_timezone_names_name` (UNIQUE) - Fast lookup by name
- `idx_cached_timezone_names_utc_offset` - Fast filtering by UTC offset

### 2. `public.timezone_names` (View)
Simple view that returns just timezone names from the cached data.

### 3. `public.refresh_timezone_cache()` (Function)
Refreshes the cached timezone data from `pg_timezone_names`.

**When to refresh:**
- After PostgreSQL version upgrades
- If timezone data needs updating (rare)

**How to refresh:**
```sql
SELECT public.refresh_timezone_cache();
```

## Migration Applied

Migration file: `005_optimize_timezone_query.sql`

## Application Updates Needed

### Option 1: Use the cached view (Recommended)

**Before:**
```sql
SELECT name FROM pg_timezone_names;
```

**After:**
```sql
SELECT name FROM public.timezone_names;
-- OR for full data:
SELECT * FROM public.cached_timezone_names;
```

### Option 2: Update Supabase/PostgREST queries

If the query is coming from Supabase client code (e.g., a timezone selector), update it to use the new view:

**JavaScript/TypeScript example:**
```javascript
// Before
const { data } = await supabase
  .rpc('get_timezones')  // or direct query to pg_timezone_names

// After
const { data } = await supabase
  .from('timezone_names')
  .select('name')
  .order('name');

// Or for full timezone data:
const { data } = await supabase
  .from('cached_timezone_names')
  .select('*')
  .order('name');
```

### Option 3: Client-side caching

For frequently accessed timezone lists, consider caching the results in the application:

```javascript
// Cache timezone list on app initialization
const TIMEZONE_CACHE = await fetchTimezones();

// Use cached data instead of querying repeatedly
function getTimezoneList() {
  return TIMEZONE_CACHE;
}
```

## Performance Impact

### Before
- Query time: **~673ms per call**
- Total time for 26 calls: **~17,494ms**
- Cache hit rate: **0%**

### After (Expected)
- Query time: **<1ms per call**
- Total time for 26 calls: **<26ms**
- Cache hit rate: **~100%** (data is materialized)

### Estimated Improvement
- **672x faster** per query (~673ms → ~1ms)
- **~99.85% reduction** in total query time
- **~28.5% reduction** in overall database query time

## Maintenance

Timezone data rarely changes (only with PostgreSQL upgrades). The cache should remain valid indefinitely unless:

1. PostgreSQL is upgraded to a new major version
2. System timezone database is updated
3. New timezones are added (extremely rare)

When maintenance is needed, simply run:
```sql
SELECT public.refresh_timezone_cache();
```

## Monitoring

To verify the optimization is working, check:

1. **Query performance:**
   ```sql
   SELECT
     query,
     calls,
     mean_time,
     total_time
   FROM pg_stat_statements
   WHERE query LIKE '%timezone%'
   ORDER BY total_time DESC;
   ```

2. **Cache freshness:**
   ```sql
   -- Check when cache was last refreshed
   SELECT
     schemaname,
     matviewname,
     last_refresh
   FROM pg_matviews
   WHERE matviewname = 'cached_timezone_names';
   ```

3. **Row count verification:**
   ```sql
   SELECT COUNT(*) FROM public.cached_timezone_names;
   -- Should return ~1,194 rows
   ```

## Rollback (if needed)

To rollback this optimization:

```sql
DROP VIEW IF EXISTS public.timezone_names CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.cached_timezone_names CASCADE;
DROP FUNCTION IF EXISTS public.refresh_timezone_cache();
```

Then update application code to use `pg_timezone_names` directly again.
