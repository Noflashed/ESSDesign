using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ESSDesign.Server.Services
{
    public sealed class TomTomUsageBudgetService
    {
        private const string UsageTable = "ess_tomtom_api_usage";
        private const int DefaultSoftDailyLimit = 1800;
        private const int DefaultHardDailyLimit = 2300;
        private const int DefaultFallbackHardDailyLimit = 250;
        private static readonly SemaphoreSlim UsageLock = new(1, 1);
        private static string _fallbackUsageDate = string.Empty;
        private static int _fallbackUsageCount;

        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;
        private readonly ILogger<TomTomUsageBudgetService> _logger;
        private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web);
        private readonly string _supabaseUrl;
        private readonly string _supabaseKey;

        public TomTomUsageBudgetService(
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            ILogger<TomTomUsageBudgetService> logger)
        {
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
            _logger = logger;
            _supabaseUrl = configuration["Supabase:Url"] ?? string.Empty;
            _supabaseKey = configuration["Supabase:ServiceRoleKey"]
                ?? configuration["Supabase:Key"]
                ?? string.Empty;
        }

        public async Task<bool> IsHardLimitReachedAsync(CancellationToken cancellationToken = default)
        {
            if (!HasSupabaseConfig())
            {
                return await IsFallbackHardLimitReachedAsync(cancellationToken);
            }

            var count = await GetTodayUsageCountAsync(cancellationToken);
            return count.HasValue
                ? count.Value >= HardDailyLimit
                : await IsFallbackHardLimitReachedAsync(cancellationToken);
        }

        public async Task<bool> TryConsumeAsync(string category, CancellationToken cancellationToken = default)
        {
            if (!HasSupabaseConfig())
            {
                return await TryConsumeFallbackAsync(category, cancellationToken);
            }

            await UsageLock.WaitAsync(cancellationToken);
            try
            {
                var count = await GetTodayUsageCountAsync(cancellationToken);
                if (!count.HasValue)
                {
                    return TryConsumeFallbackUnsafe(category, DateTimeOffset.UtcNow);
                }

                if (count.Value >= HardDailyLimit)
                {
                    _logger.LogWarning(
                        "TomTom daily hard limit reached ({Count}/{Limit}); skipping {Category} call",
                        count.Value,
                        HardDailyLimit,
                        category);
                    return false;
                }

                if (!await InsertUsageEventAsync(NormalizeCategory(category), cancellationToken))
                {
                    return TryConsumeFallbackUnsafe(category, DateTimeOffset.UtcNow);
                }

                var nextCount = count.Value + 1;
                if (nextCount >= SoftDailyLimit)
                {
                    _logger.LogWarning(
                        "TomTom daily soft limit reached ({Count}/{Limit}); hard stop at {HardLimit}",
                        nextCount,
                        SoftDailyLimit,
                        HardDailyLimit);
                }

                return true;
            }
            finally
            {
                UsageLock.Release();
            }
        }

        private int SoftDailyLimit => ReadConfigInt("TomTom:DailySoftLimit", DefaultSoftDailyLimit);

        private int FallbackHardDailyLimit => ReadConfigInt("TomTom:FallbackDailyHardLimit", DefaultFallbackHardDailyLimit);

        private int HardDailyLimit
        {
            get
            {
                var configured = ReadConfigInt("TomTom:DailyHardLimit", DefaultHardDailyLimit);
                return Math.Max(1, configured);
            }
        }

        private int ReadConfigInt(string key, int fallback)
        {
            return int.TryParse(_configuration[key], NumberStyles.Integer, CultureInfo.InvariantCulture, out var value)
                ? value
                : fallback;
        }

        private async Task<int?> GetTodayUsageCountAsync(CancellationToken cancellationToken)
        {
            var usageDate = GetSydneyUsageDate(DateTimeOffset.UtcNow);
            using var request = CreateSupabaseRequest(
                HttpMethod.Get,
                $"{UsageTable}?select=id&usage_date=eq.{usageDate}");
            request.Headers.TryAddWithoutValidation("Prefer", "count=exact");
            request.Headers.TryAddWithoutValidation("Range-Unit", "items");
            request.Headers.TryAddWithoutValidation("Range", "0-0");
            using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var details = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning("Unable to read TomTom usage count: {Status} {Details}", response.StatusCode, details);
                return null;
            }

            if (TryReadContentRangeCount(response, out var count))
            {
                return count;
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            return JsonSerializer.Deserialize<List<TomTomUsageRow>>(json, _jsonOptions)?.Count ?? 0;
        }

        private async Task<bool> IsFallbackHardLimitReachedAsync(CancellationToken cancellationToken)
        {
            await UsageLock.WaitAsync(cancellationToken);
            try
            {
                return IsFallbackHardLimitReachedUnsafe(DateTimeOffset.UtcNow);
            }
            finally
            {
                UsageLock.Release();
            }
        }

        private async Task<bool> TryConsumeFallbackAsync(string category, CancellationToken cancellationToken)
        {
            await UsageLock.WaitAsync(cancellationToken);
            try
            {
                return TryConsumeFallbackUnsafe(category, DateTimeOffset.UtcNow);
            }
            finally
            {
                UsageLock.Release();
            }
        }

        private bool IsFallbackHardLimitReachedUnsafe(DateTimeOffset now)
        {
            EnsureFallbackUsageDate(now);
            return _fallbackUsageCount >= FallbackHardDailyLimit;
        }

        private bool TryConsumeFallbackUnsafe(string category, DateTimeOffset now)
        {
            EnsureFallbackUsageDate(now);
            if (_fallbackUsageCount >= FallbackHardDailyLimit)
            {
                _logger.LogWarning(
                    "TomTom fallback daily hard limit reached ({Count}/{Limit}); skipping {Category} call until budget table is available",
                    _fallbackUsageCount,
                    FallbackHardDailyLimit,
                    category);
                return false;
            }

            _fallbackUsageCount += 1;
            _logger.LogWarning(
                "Using in-memory TomTom fallback budget ({Count}/{Limit}) for {Category}; apply database/migrations/023_add_tomtom_usage_budget.sql for persistent tracking",
                _fallbackUsageCount,
                FallbackHardDailyLimit,
                category);
            return true;
        }

        private static void EnsureFallbackUsageDate(DateTimeOffset now)
        {
            var usageDate = GetSydneyUsageDate(now);
            if (string.Equals(_fallbackUsageDate, usageDate, StringComparison.Ordinal))
            {
                return;
            }

            _fallbackUsageDate = usageDate;
            _fallbackUsageCount = 0;
        }

        private static bool TryReadContentRangeCount(HttpResponseMessage response, out int count)
        {
            count = 0;
            var values = response.Headers.TryGetValues("Content-Range", out var headerValues)
                ? headerValues
                : response.Content.Headers.TryGetValues("Content-Range", out var contentHeaderValues)
                    ? contentHeaderValues
                    : Enumerable.Empty<string>();
            var contentRange = values.FirstOrDefault();
            var totalPart = contentRange?.Split('/').LastOrDefault();
            return int.TryParse(totalPart, NumberStyles.Integer, CultureInfo.InvariantCulture, out count);
        }

        private async Task<bool> InsertUsageEventAsync(string category, CancellationToken cancellationToken)
        {
            var now = DateTimeOffset.UtcNow;
            var payload = new[]
            {
                new
                {
                    usage_date = GetSydneyUsageDate(now),
                    category,
                    created_at = now,
                },
            };

            using var request = CreateSupabaseRequest(
                HttpMethod.Post,
                UsageTable,
                JsonSerializer.Serialize(payload, _jsonOptions));
            using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var details = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning("Unable to record TomTom usage event: {Status} {Details}", response.StatusCode, details);
                return false;
            }

            return true;
        }

        private HttpRequestMessage CreateSupabaseRequest(HttpMethod method, string relativeUrl, string? jsonBody = null)
        {
            var request = new HttpRequestMessage(method, $"{_supabaseUrl.TrimEnd('/')}/rest/v1/{relativeUrl}");
            request.Headers.Add("apikey", _supabaseKey);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _supabaseKey);
            if (jsonBody != null)
            {
                request.Content = new StringContent(jsonBody, Encoding.UTF8, "application/json");
            }
            return request;
        }

        private bool HasSupabaseConfig()
        {
            if (!string.IsNullOrWhiteSpace(_supabaseUrl) && !string.IsNullOrWhiteSpace(_supabaseKey))
            {
                return true;
            }

            _logger.LogWarning("Supabase configuration missing; TomTom usage will use the in-memory fallback budget.");
            return false;
        }

        private static string NormalizeCategory(string category)
        {
            var normalized = (category ?? string.Empty).Trim().ToLowerInvariant();
            return string.IsNullOrWhiteSpace(normalized) ? "unknown" : normalized;
        }

        private static string GetSydneyUsageDate(DateTimeOffset now)
        {
            var local = TimeZoneInfo.ConvertTime(now, GetSydneyTimeZone());
            return local.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        }

        private static TimeZoneInfo GetSydneyTimeZone()
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById("AUS Eastern Standard Time");
            }
            catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException)
            {
                return TimeZoneInfo.FindSystemTimeZoneById("Australia/Sydney");
            }
        }

        private sealed class TomTomUsageRow
        {
            [JsonPropertyName("id")]
            public string Id { get; set; } = string.Empty;
        }
    }
}
