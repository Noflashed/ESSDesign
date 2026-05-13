using System.Collections.Concurrent;
using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ESSDesign.Server.Services
{
    public sealed class TransportRouteEstimateService
    {
        public const string YardLocation = "130 Gilba Road, Girraween, NSW, Australia";

        private const string EstimatesTable = "ess_transport_route_estimates";
        private const string RouteKeyVersion = "road-v4";
        private static readonly TimeSpan EstimateTtl = TimeSpan.FromMinutes(30);
        private static readonly TimeSpan ActiveRequestWindow = TimeSpan.FromMinutes(45);
        private static readonly ConcurrentDictionary<string, SemaphoreSlim> RouteLocks = new(StringComparer.Ordinal);
        private static readonly ConcurrentDictionary<string, RouteEstimateRow> MemoryRouteEstimates = new(StringComparer.Ordinal);

        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<TransportRouteEstimateService> _logger;
        private readonly DeliveryAnalysisService _deliveryAnalysisService;
        private readonly TomTomUsageBudgetService _tomTomUsageBudgetService;
        private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web);
        private readonly string _supabaseUrl;
        private readonly string _supabaseKey;

        public TransportRouteEstimateService(
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            ILogger<TransportRouteEstimateService> logger,
            DeliveryAnalysisService deliveryAnalysisService,
            TomTomUsageBudgetService tomTomUsageBudgetService)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
            _deliveryAnalysisService = deliveryAnalysisService;
            _tomTomUsageBudgetService = tomTomUsageBudgetService;
            _supabaseUrl = configuration["Supabase:Url"] ?? string.Empty;
            _supabaseKey = configuration["Supabase:ServiceRoleKey"]
                ?? configuration["Supabase:Key"]
                ?? string.Empty;
        }

        public async Task<DeliveryAnalysisService.RoutePreviewResult?> GetOrRefreshYardRouteAsync(
            DeliveryAnalysisService.RoutePreviewRequest request,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(request.SiteLocation))
            {
                return null;
            }

            return await GetOrRefreshRouteBetweenAsync(
                new DeliveryAnalysisService.RoutePreviewBetweenRequest
                {
                    FromLocation = YardLocation,
                    ToLocation = request.SiteLocation,
                    ScheduledDate = request.ScheduledDate,
                    ScheduledHour = request.ScheduledHour,
                    ScheduledMinute = request.ScheduledMinute,
                    EnableTolls = request.EnableTolls,
                    Segment = string.IsNullOrWhiteSpace(request.Segment) ? "primary" : request.Segment,
                    ForceRefresh = request.ForceRefresh,
                },
                cancellationToken);
        }

        public async Task<DeliveryAnalysisService.RoutePreviewResult?> GetOrRefreshRouteBetweenAsync(
            DeliveryAnalysisService.RoutePreviewBetweenRequest request,
            CancellationToken cancellationToken = default)
        {
            var routeKey = BuildRouteKey(
                request.Segment,
                request.FromLocation,
                request.ToLocation,
                request.ScheduledDate,
                request.ScheduledHour,
                request.ScheduledMinute,
                request.EnableTolls);

            if (string.IsNullOrWhiteSpace(routeKey))
            {
                return null;
            }

            var routeLock = RouteLocks.GetOrAdd(routeKey, _ => new SemaphoreSlim(1, 1));
            await routeLock.WaitAsync(cancellationToken);
            try
            {
                var now = DateTimeOffset.UtcNow;
                var existing = await ReadRouteRowAsync(routeKey, cancellationToken);
                if (!request.ForceRefresh)
                {
                    if (TryBuildFreshResult(existing, now, out var cachedResult))
                    {
                        await MarkRouteRequestedAsync(existing!, BuildActiveUntilUtc(request.ScheduledDate, now), cancellationToken);
                        return cachedResult;
                    }
                }

                if (await _tomTomUsageBudgetService.IsHardLimitReachedAsync(cancellationToken)
                    && TryBuildSavedResult(existing, out var savedResult))
                {
                    await MarkRouteRequestedAsync(existing!, BuildActiveUntilUtc(request.ScheduledDate, now), cancellationToken);
                    return savedResult;
                }

                var result = await _deliveryAnalysisService.GetRoutePreviewBetweenAsync(request);
                if (result == null)
                {
                    return TryBuildSavedResult(existing, out var fallbackResult) ? fallbackResult : null;
                }

                var refreshedAt = DateTimeOffset.UtcNow;
                result.RouteKey = routeKey;
                result.LastRefreshedAt = refreshedAt;
                result.ExpiresAt = refreshedAt.Add(EstimateTtl);
                result.SharedTraffic = true;

                await UpsertRouteRowAsync(request, result, refreshedAt, cancellationToken);
                return result;
            }
            finally
            {
                routeLock.Release();
            }
        }

        public static string BuildRouteKey(
            string? segment,
            string? fromLocation,
            string? toLocation,
            string? scheduledDate,
            int? scheduledHour,
            int? scheduledMinute,
            bool enableTolls)
        {
            var from = NormalizeRouteLocation(fromLocation);
            var to = NormalizeRouteLocation(toLocation);
            if (string.IsNullOrWhiteSpace(from) || string.IsNullOrWhiteSpace(to))
            {
                return string.Empty;
            }

            return string.Join("|", new[]
            {
                RouteKeyVersion,
                string.IsNullOrWhiteSpace(segment) ? "primary" : segment.Trim().ToLowerInvariant(),
                from,
                to,
                scheduledDate?.Trim() ?? string.Empty,
                scheduledHour.HasValue ? Math.Clamp(scheduledHour.Value, 0, 23).ToString(CultureInfo.InvariantCulture) : string.Empty,
                scheduledMinute.HasValue ? Math.Clamp(scheduledMinute.Value, 0, 59).ToString(CultureInfo.InvariantCulture) : string.Empty,
                enableTolls ? "tolls" : "no-tolls",
            });
        }

        private static string NormalizeRouteLocation(string? value)
        {
            return string.Join(" ", (value ?? string.Empty).Trim().ToLowerInvariant().Split(
                Array.Empty<char>(),
                StringSplitOptions.RemoveEmptyEntries));
        }

        private static bool TryBuildFreshResult(RouteEstimateRow? row, DateTimeOffset now, out DeliveryAnalysisService.RoutePreviewResult? result)
        {
            result = null;
            if (row == null || !row.ExpiresAt.HasValue || row.ExpiresAt.Value <= now)
            {
                return false;
            }

            result = BuildResult(row);
            return result != null;
        }

        private static bool TryBuildSavedResult(RouteEstimateRow? row, out DeliveryAnalysisService.RoutePreviewResult? result)
        {
            result = row == null ? null : BuildResult(row);
            return result != null;
        }

        private static DeliveryAnalysisService.RoutePreviewResult? BuildResult(RouteEstimateRow row)
        {
            if (row.RouteData.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
            {
                return null;
            }

            var result = row.RouteData.Deserialize<DeliveryAnalysisService.RoutePreviewResult>(
                new JsonSerializerOptions(JsonSerializerDefaults.Web));
            if (result == null || result.DurationSeconds <= 0)
            {
                return null;
            }

            result.RouteKey = row.RouteKey;
            result.LastRefreshedAt = row.LastRefreshedAt;
            result.ExpiresAt = row.ExpiresAt;
            result.SharedTraffic = true;
            return result;
        }

        private async Task<RouteEstimateRow?> ReadRouteRowAsync(string routeKey, CancellationToken cancellationToken)
        {
            var rows = await ReadRowsAsync(
                $"{EstimatesTable}?select=*&route_key=eq.{Uri.EscapeDataString(routeKey)}&limit=1",
                cancellationToken);
            return rows.FirstOrDefault()
                ?? (MemoryRouteEstimates.TryGetValue(routeKey, out var memoryRow) ? memoryRow : null);
        }

        private async Task<List<RouteEstimateRow>> ReadRowsAsync(string relativeUrl, CancellationToken cancellationToken)
        {
            if (!HasSupabaseConfig())
            {
                return new List<RouteEstimateRow>();
            }

            using var request = CreateSupabaseRequest(HttpMethod.Get, relativeUrl);
            using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var details = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning("Unable to read shared route estimates: {Status} {Details}", response.StatusCode, details);
                return new List<RouteEstimateRow>();
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            return JsonSerializer.Deserialize<List<RouteEstimateRow>>(json, _jsonOptions) ?? new List<RouteEstimateRow>();
        }

        private async Task UpsertRouteRowAsync(
            DeliveryAnalysisService.RoutePreviewBetweenRequest request,
            DeliveryAnalysisService.RoutePreviewResult result,
            DateTimeOffset refreshedAt,
            CancellationToken cancellationToken)
        {
            StoreMemoryRouteRow(request, result, refreshedAt);

            if (!HasSupabaseConfig())
            {
                return;
            }

            var activeUntil = BuildActiveUntilUtc(request.ScheduledDate, refreshedAt);
            var payload = new[]
            {
                new
                {
                    route_key = result.RouteKey,
                    segment = string.IsNullOrWhiteSpace(request.Segment) ? "primary" : request.Segment.Trim().ToLowerInvariant(),
                    from_location = request.FromLocation.Trim(),
                    to_location = request.ToLocation.Trim(),
                    scheduled_date = string.IsNullOrWhiteSpace(request.ScheduledDate) ? null : request.ScheduledDate,
                    scheduled_hour = request.ScheduledHour,
                    scheduled_minute = request.ScheduledMinute,
                    enable_tolls = request.EnableTolls,
                    route_data = result,
                    distance_meters = result.DistanceMeters,
                    base_duration_seconds = result.BaseDurationSeconds,
                    duration_seconds = result.DurationSeconds,
                    traffic_delay_seconds = result.TrafficDelaySeconds,
                    has_live_traffic = result.HasLiveTraffic,
                    traffic_provider = result.TrafficProvider,
                    traffic_note = result.TrafficNote,
                    last_refreshed_at = refreshedAt,
                    expires_at = refreshedAt.Add(EstimateTtl),
                    active_until = activeUntil,
                    last_requested_at = refreshedAt,
                    request_count = 1,
                    updated_at = refreshedAt,
                },
            };

            using var httpRequest = CreateSupabaseRequest(
                HttpMethod.Post,
                $"{EstimatesTable}?on_conflict=route_key",
                JsonSerializer.Serialize(payload, _jsonOptions));
            httpRequest.Headers.TryAddWithoutValidation("Prefer", "resolution=merge-duplicates,return=representation");
            using var response = await _httpClientFactory.CreateClient().SendAsync(httpRequest, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var details = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning("Unable to upsert shared route estimate {RouteKey}: {Status} {Details}", result.RouteKey, response.StatusCode, details);
            }
        }

        private async Task MarkRouteRequestedAsync(RouteEstimateRow row, DateTimeOffset activeUntil, CancellationToken cancellationToken)
        {
            TouchMemoryRouteRow(row.RouteKey, activeUntil);

            if (!HasSupabaseConfig() || row.ActiveUntil.HasValue && row.ActiveUntil.Value >= activeUntil)
            {
                return;
            }

            var payload = new
            {
                active_until = activeUntil,
                last_requested_at = DateTimeOffset.UtcNow,
                request_count = Math.Max(0, row.RequestCount) + 1,
                updated_at = DateTimeOffset.UtcNow,
            };
            using var request = CreateSupabaseRequest(
                HttpMethod.Patch,
                $"{EstimatesTable}?route_key=eq.{Uri.EscapeDataString(row.RouteKey)}",
                JsonSerializer.Serialize(payload, _jsonOptions));
            using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var details = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning("Unable to touch shared route estimate {RouteKey}: {Status} {Details}", row.RouteKey, response.StatusCode, details);
            }
        }

        private void StoreMemoryRouteRow(
            DeliveryAnalysisService.RoutePreviewBetweenRequest request,
            DeliveryAnalysisService.RoutePreviewResult result,
            DateTimeOffset refreshedAt)
        {
            if (string.IsNullOrWhiteSpace(result.RouteKey))
            {
                return;
            }

            var activeUntil = BuildActiveUntilUtc(request.ScheduledDate, refreshedAt);
            MemoryRouteEstimates[result.RouteKey] = new RouteEstimateRow
            {
                RouteKey = result.RouteKey,
                Segment = string.IsNullOrWhiteSpace(request.Segment) ? "primary" : request.Segment.Trim().ToLowerInvariant(),
                FromLocation = request.FromLocation.Trim(),
                ToLocation = request.ToLocation.Trim(),
                ScheduledDate = string.IsNullOrWhiteSpace(request.ScheduledDate) ? null : request.ScheduledDate,
                ScheduledHour = request.ScheduledHour,
                ScheduledMinute = request.ScheduledMinute,
                EnableTolls = request.EnableTolls,
                RouteData = JsonSerializer.SerializeToElement(result, _jsonOptions),
                LastRefreshedAt = refreshedAt,
                ExpiresAt = refreshedAt.Add(EstimateTtl),
                ActiveUntil = activeUntil,
                LastRequestedAt = refreshedAt,
                RequestCount = 1,
            };
        }

        private static void TouchMemoryRouteRow(string routeKey, DateTimeOffset activeUntil)
        {
            if (!MemoryRouteEstimates.TryGetValue(routeKey, out var row))
            {
                return;
            }

            if (!row.ActiveUntil.HasValue || row.ActiveUntil.Value < activeUntil)
            {
                row.ActiveUntil = activeUntil;
            }

            row.LastRequestedAt = DateTimeOffset.UtcNow;
            row.RequestCount = Math.Max(0, row.RequestCount) + 1;
            MemoryRouteEstimates[routeKey] = row;
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

            _logger.LogWarning("Supabase configuration missing; shared route estimates are disabled.");
            return false;
        }

        private static DateTimeOffset BuildActiveUntilUtc(string? scheduledDate, DateTimeOffset now)
        {
            _ = scheduledDate;
            return now.Add(ActiveRequestWindow);
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

        private sealed class RouteEstimateRow
        {
            [JsonPropertyName("route_key")]
            public string RouteKey { get; set; } = string.Empty;

            [JsonPropertyName("segment")]
            public string Segment { get; set; } = "primary";

            [JsonPropertyName("from_location")]
            public string FromLocation { get; set; } = string.Empty;

            [JsonPropertyName("to_location")]
            public string ToLocation { get; set; } = string.Empty;

            [JsonPropertyName("scheduled_date")]
            public string? ScheduledDate { get; set; }

            [JsonPropertyName("scheduled_hour")]
            public int? ScheduledHour { get; set; }

            [JsonPropertyName("scheduled_minute")]
            public int? ScheduledMinute { get; set; }

            [JsonPropertyName("enable_tolls")]
            public bool EnableTolls { get; set; }

            [JsonPropertyName("route_data")]
            public JsonElement RouteData { get; set; }

            [JsonPropertyName("last_refreshed_at")]
            public DateTimeOffset? LastRefreshedAt { get; set; }

            [JsonPropertyName("expires_at")]
            public DateTimeOffset? ExpiresAt { get; set; }

            [JsonPropertyName("active_until")]
            public DateTimeOffset? ActiveUntil { get; set; }

            [JsonPropertyName("last_requested_at")]
            public DateTimeOffset? LastRequestedAt { get; set; }

            [JsonPropertyName("request_count")]
            public int RequestCount { get; set; }
        }
    }
}
