using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Globalization;

namespace ESSDesign.Server.Services
{
    public sealed class DeliveryAnalysisService
    {
        public sealed class DeliveryAnalysisRequest
        {
            public string SiteLocation { get; set; } = string.Empty;
            public string BuilderName { get; set; } = string.Empty;
            public string ProjectName { get; set; } = string.Empty;
            public string ScaffoldingSystem { get; set; } = string.Empty;
            public string ScheduledDate { get; set; } = string.Empty;
            public int ScheduledHour { get; set; }
            public int ScheduledMinute { get; set; }
        }

        public sealed class DeliveryAnalysisResult
        {
            public int TravelToSiteMinutes { get; set; }
            public int UnloadingMinutes { get; set; }
            public int ReturnTravelMinutes { get; set; }
            public string WeatherSummary { get; set; } = string.Empty;
            public string TrafficNote { get; set; } = string.Empty;
            public string WeatherImpact { get; set; } = string.Empty;
            public string SummaryText { get; set; } = string.Empty;
            public double DistanceKm { get; set; }
            public string EstimatedArrival { get; set; } = string.Empty;
            public string EstimatedUnloadComplete { get; set; } = string.Empty;
            public string EstimatedReturn { get; set; } = string.Empty;
        }

        public sealed class RoutePreviewRequest
        {
            public string SiteLocation { get; set; } = string.Empty;
            public string? ScheduledDate { get; set; }
            public int? ScheduledHour { get; set; }
            public int? ScheduledMinute { get; set; }
        }

        public sealed class RoutePreviewBetweenRequest
        {
            public string FromLocation { get; set; } = string.Empty;
            public string ToLocation { get; set; } = string.Empty;
            public string? ScheduledDate { get; set; }
            public int? ScheduledHour { get; set; }
            public int? ScheduledMinute { get; set; }
        }

        public sealed class RoutePoint
        {
            public double Lat { get; set; }
            public double Lon { get; set; }
        }

        public sealed class RoutePreviewResult
        {
            public RoutePoint Yard { get; set; } = new();
            public RoutePoint Site { get; set; } = new();
            public double DistanceMeters { get; set; }
            public double BaseDurationSeconds { get; set; }
            public double DurationSeconds { get; set; }
            public double TrafficDelaySeconds { get; set; }
            public bool HasLiveTraffic { get; set; }
            public string TrafficProvider { get; set; } = string.Empty;
            public string TrafficNote { get; set; } = string.Empty;
            public List<RoutePoint> PathPoints { get; set; } = new();
        }

        private class RouteTimingResult
        {
            public double DistanceMeters { get; set; }
            public double BaseDurationSeconds { get; set; }
            public double DurationSeconds { get; set; }
            public bool HasLiveTraffic { get; set; }
            public string TrafficProvider { get; set; } = string.Empty;
            public string TrafficNote { get; set; } = string.Empty;
            public double DistanceKm => Math.Round(DistanceMeters / 1000.0, 1);
            public double TrafficDelaySeconds => Math.Max(0, DurationSeconds - BaseDurationSeconds);
        }

        private sealed class RouteProviderResult : RouteTimingResult
        {
            public List<RoutePoint> PathPoints { get; set; } = new();
        }

        public sealed class TimeSlotRecommendationRequest
        {
            public string SiteLocation { get; set; } = string.Empty;
            public string ScaffoldingSystem { get; set; } = string.Empty;
            public string ScheduledDate { get; set; } = string.Empty;
            public List<ExistingDelivery> ExistingDeliveries { get; set; } = new();
        }

        public sealed class ExistingDelivery
        {
            public string TruckId { get; set; } = string.Empty;
            public string TruckLabel { get; set; } = string.Empty;
            public int Hour { get; set; }
            public int Minute { get; set; }
        }

        public sealed class TimeSlotRecommendationResult
        {
            public string RecommendedTruckId { get; set; } = string.Empty;
            public string RecommendedTruckLabel { get; set; } = string.Empty;
            public int RecommendedHour { get; set; }
            public int RecommendedMinute { get; set; }
            public string Reason { get; set; } = string.Empty;
        }

        // Girraween yard coordinates (hardcoded — yard is always here)
        private const double YardLat = -33.8122;
        private const double YardLon = 150.9354;

        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;
        private readonly ILogger<DeliveryAnalysisService> _logger;
        private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web);

        public DeliveryAnalysisService(
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            ILogger<DeliveryAnalysisService> logger)
        {
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
            _logger = logger;
        }

        private static double HaversineKm(double lat1, double lon1, double lat2, double lon2)
        {
            const double R = 6371.0;
            var dLat = (lat2 - lat1) * Math.PI / 180.0;
            var dLon = (lon2 - lon1) * Math.PI / 180.0;
            var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                    Math.Cos(lat1 * Math.PI / 180.0) * Math.Cos(lat2 * Math.PI / 180.0) *
                    Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
            return R * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        }

        private async Task<(double Lat, double Lon)?> GeocodeAsync(string address, HttpClient client)
        {
            try
            {
                var url = $"https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q={Uri.EscapeDataString(address)}";
                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                request.Headers.Add("User-Agent", "ESSDesignApp/1.0 (nathanb@erectsafe.com.au)");

                var response = await client.SendAsync(request);
                if (!response.IsSuccessStatusCode) return null;

                var json = await response.Content.ReadAsStringAsync();
                var results = JsonSerializer.Deserialize<JsonElement[]>(json);
                if (results == null || results.Length == 0) return null;

                var first = results[0];
                if (!first.TryGetProperty("lat", out var latEl) || !first.TryGetProperty("lon", out var lonEl)) return null;

                if (!double.TryParse(latEl.GetString(), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var lat)) return null;
                if (!double.TryParse(lonEl.GetString(), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var lon)) return null;

                return (lat, lon);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Geocoding failed for: {Address}", address);
                return null;
            }
        }

        private async Task<string> GetWeatherSummaryAsync(double lat, double lon, string date, int hour, HttpClient client)
        {
            try
            {
                var url = $"https://api.open-meteo.com/v1/forecast?latitude={lat:F4}&longitude={lon:F4}" +
                          $"&hourly=temperature_2m,precipitation_probability,windspeed_10m,weathercode" +
                          $"&timezone=Australia%2FSydney&start_date={date}&end_date={date}";

                var response = await client.GetAsync(url);
                if (!response.IsSuccessStatusCode) return "Weather data unavailable";

                var json = await response.Content.ReadAsStringAsync();
                var root = JsonSerializer.Deserialize<JsonElement>(json);
                var hourly = root.GetProperty("hourly");

                var times = hourly.GetProperty("time").EnumerateArray().ToList();
                var temps = hourly.GetProperty("temperature_2m").EnumerateArray().ToList();
                var precips = hourly.GetProperty("precipitation_probability").EnumerateArray().ToList();
                var winds = hourly.GetProperty("windspeed_10m").EnumerateArray().ToList();
                var codes = hourly.GetProperty("weathercode").EnumerateArray().ToList();

                var targetTime = $"{date}T{hour:D2}:00";
                var idx = times.FindIndex(t => t.GetString()?.StartsWith(targetTime) == true);
                if (idx < 0) idx = Math.Clamp(hour, 0, times.Count - 1);

                var temp = idx < temps.Count ? temps[idx].GetDouble() : 18.0;
                var precip = idx < precips.Count ? precips[idx].GetDouble() : 0.0;
                var wind = idx < winds.Count ? winds[idx].GetDouble() : 10.0;
                var code = idx < codes.Count ? codes[idx].GetInt32() : 1;

                return $"{WeatherCodeToDescription(code)}, {temp:F0}°C, wind {wind:F0} km/h, rain probability {precip:F0}%";
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Weather fetch failed");
                return "Weather data unavailable";
            }
        }

        private static string WeatherCodeToDescription(int code) => code switch
        {
            0 => "Clear sky",
            1 => "Mainly clear",
            2 => "Partly cloudy",
            3 => "Overcast",
            45 or 48 => "Foggy",
            51 or 53 or 55 => "Drizzle",
            61 or 63 or 65 => "Rain",
            71 or 73 or 75 => "Snow",
            80 or 81 or 82 => "Rain showers",
            95 => "Thunderstorm",
            _ => "Cloudy",
        };

        private static TimeZoneInfo GetSydneyTimeZone()
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById("AUS Eastern Standard Time");
            }
            catch (TimeZoneNotFoundException)
            {
                return TimeZoneInfo.FindSystemTimeZoneById("Australia/Sydney");
            }
        }

        private static DateTimeOffset GetSydneyNow()
        {
            return TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, GetSydneyTimeZone());
        }

        private static DateTimeOffset? BuildSydneyDeparture(string? date, int? hour, int? minute)
        {
            if (string.IsNullOrWhiteSpace(date) || !hour.HasValue || !minute.HasValue)
            {
                return null;
            }

            if (!DateTime.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDate))
            {
                return null;
            }

            var localTime = parsedDate.Date.AddHours(Math.Clamp(hour.Value, 0, 23)).AddMinutes(Math.Clamp(minute.Value, 0, 59));
            var offset = GetSydneyTimeZone().GetUtcOffset(localTime);
            return new DateTimeOffset(localTime, offset);
        }

        private static (double DelaySeconds, string Label) EstimateSydneyTrafficDelay(double baseDurationSeconds, DateTimeOffset departure)
        {
            var local = TimeZoneInfo.ConvertTime(departure, GetSydneyTimeZone());
            var hour = local.Hour + local.Minute / 60.0;
            var isWeekday = local.DayOfWeek is not DayOfWeek.Saturday and not DayOfWeek.Sunday;

            var factor = 0.04;
            var label = "Light traffic";

            if (isWeekday && hour >= 6.5 && hour < 9.0)
            {
                factor = 0.24;
                label = "Morning peak traffic";
            }
            else if (isWeekday && hour >= 15.5 && hour < 18.5)
            {
                factor = 0.28;
                label = "Afternoon peak traffic";
            }
            else if (isWeekday && hour >= 9.0 && hour < 15.5)
            {
                factor = 0.10;
                label = "Steady daytime traffic";
            }
            else if (!isWeekday && hour >= 10.0 && hour < 17.0)
            {
                factor = 0.08;
                label = "Weekend daytime traffic";
            }

            return (Math.Max(0, baseDurationSeconds * factor), label);
        }

        private string? GetGoogleMapsApiKey()
        {
            var candidates = new[]
            {
                _configuration["GoogleMaps:ApiKey"],
                _configuration["Google:MapsApiKey"],
                _configuration["Traffic:GoogleMapsApiKey"],
            };

            return candidates.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
        }

        private string? GetTomTomApiKey()
        {
            var candidates = new[]
            {
                _configuration["TomTom:ApiKey"],
                _configuration["TomTom:Key"],
                _configuration["Routing:TomTomApiKey"],
            };

            return candidates.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
        }

        private static string BuildTomTomDepartureValue(DateTimeOffset departure)
        {
            return departure <= DateTimeOffset.UtcNow.AddMinutes(2)
                ? "now"
                : departure.ToString("yyyy-MM-dd'T'HH:mm:sszzz", CultureInfo.InvariantCulture);
        }

        private async Task<RouteProviderResult?> GetTomTomRouteAsync(
            double fromLat,
            double fromLon,
            double toLat,
            double toLon,
            HttpClient client,
            DateTimeOffset departure)
        {
            var apiKey = GetTomTomApiKey();
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                return null;
            }

            try
            {
                var locations = FormattableString.Invariant($"{fromLat:F6},{fromLon:F6}:{toLat:F6},{toLon:F6}");
                var url = $"https://api.tomtom.com/routing/1/calculateRoute/{locations}/json" +
                          "?traffic=true" +
                          "&computeTravelTimeFor=all" +
                          "&routeRepresentation=polyline" +
                          "&travelMode=truck" +
                          "&vehicleCommercial=true" +
                          "&avoid=tollRoads" +
                          $"&departAt={Uri.EscapeDataString(BuildTomTomDepartureValue(departure))}" +
                          $"&key={Uri.EscapeDataString(apiKey)}";

                using var response = await client.GetAsync(url);
                if (!response.IsSuccessStatusCode)
                {
                    return null;
                }

                var json = await response.Content.ReadAsStringAsync();
                var root = JsonSerializer.Deserialize<JsonElement>(json, _jsonOptions);
                if (!root.TryGetProperty("routes", out var routesEl))
                {
                    return null;
                }

                var routes = routesEl.EnumerateArray().ToList();
                if (routes.Count == 0 || !routes[0].TryGetProperty("summary", out var summary))
                {
                    return null;
                }

                var distanceMeters = summary.TryGetProperty("lengthInMeters", out var lengthEl)
                    ? lengthEl.GetDouble()
                    : 0;
                var durationSeconds = summary.TryGetProperty("travelTimeInSeconds", out var travelEl)
                    ? travelEl.GetDouble()
                    : 0;
                var baseDurationSeconds = summary.TryGetProperty("noTrafficTravelTimeInSeconds", out var noTrafficEl)
                    ? noTrafficEl.GetDouble()
                    : durationSeconds;
                var trafficDelaySeconds = summary.TryGetProperty("trafficDelayInSeconds", out var delayEl)
                    ? Math.Max(0, delayEl.GetDouble())
                    : Math.Max(0, durationSeconds - baseDurationSeconds);

                if (distanceMeters <= 0 || durationSeconds <= 0)
                {
                    return null;
                }

                var pathPoints = new List<RoutePoint>();
                if (routes[0].TryGetProperty("legs", out var legsEl))
                {
                    foreach (var leg in legsEl.EnumerateArray())
                    {
                        if (!leg.TryGetProperty("points", out var pointsEl))
                        {
                            continue;
                        }

                        foreach (var point in pointsEl.EnumerateArray())
                        {
                            if (!point.TryGetProperty("latitude", out var latEl) || !point.TryGetProperty("longitude", out var lonEl))
                            {
                                continue;
                            }

                            pathPoints.Add(new RoutePoint { Lat = latEl.GetDouble(), Lon = lonEl.GetDouble() });
                        }
                    }
                }

                var delayMinutes = Math.Round(trafficDelaySeconds / 60.0);
                return new RouteProviderResult
                {
                    DistanceMeters = distanceMeters,
                    BaseDurationSeconds = baseDurationSeconds,
                    DurationSeconds = Math.Max(baseDurationSeconds, durationSeconds),
                    HasLiveTraffic = true,
                    TrafficProvider = "TomTom traffic",
                    TrafficNote = delayMinutes > 0
                        ? $"TomTom toll-free route adding about {delayMinutes:F0} min"
                        : "TomTom toll-free route with no extra delay",
                    PathPoints = pathPoints,
                };
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "TomTom routing failed");
                return null;
            }
        }

        private async Task<RouteTimingResult?> GetGoogleTrafficRouteAsync(
            double fromLat,
            double fromLon,
            double toLat,
            double toLon,
            HttpClient client,
            DateTimeOffset departure)
        {
            var apiKey = GetGoogleMapsApiKey();
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                return null;
            }

            try
            {
                var departureTime = departure <= DateTimeOffset.UtcNow.AddMinutes(2)
                    ? "now"
                    : departure.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture);
                var origin = FormattableString.Invariant($"{fromLat:F6},{fromLon:F6}");
                var destination = FormattableString.Invariant($"{toLat:F6},{toLon:F6}");
                var url = "https://maps.googleapis.com/maps/api/directions/json" +
                          $"?origin={Uri.EscapeDataString(origin)}" +
                          $"&destination={Uri.EscapeDataString(destination)}" +
                          "&mode=driving&traffic_model=best_guess" +
                          $"&departure_time={departureTime}" +
                          $"&key={Uri.EscapeDataString(apiKey)}";

                using var response = await client.GetAsync(url);
                if (!response.IsSuccessStatusCode)
                {
                    return null;
                }

                var json = await response.Content.ReadAsStringAsync();
                var root = JsonSerializer.Deserialize<JsonElement>(json, _jsonOptions);
                if (!root.TryGetProperty("status", out var statusEl) || statusEl.GetString() != "OK")
                {
                    return null;
                }

                var routes = root.GetProperty("routes").EnumerateArray().ToList();
                if (routes.Count == 0)
                {
                    return null;
                }

                var legs = routes[0].GetProperty("legs").EnumerateArray().ToList();
                if (legs.Count == 0)
                {
                    return null;
                }

                var leg = legs[0];
                var baseSeconds = leg.GetProperty("duration").GetProperty("value").GetDouble();
                var trafficSeconds = leg.TryGetProperty("duration_in_traffic", out var trafficEl)
                    ? trafficEl.GetProperty("value").GetDouble()
                    : baseSeconds;
                var distanceMeters = leg.GetProperty("distance").GetProperty("value").GetDouble();
                var delayMinutes = Math.Max(0, Math.Round((trafficSeconds - baseSeconds) / 60.0));

                return new RouteTimingResult
                {
                    DistanceMeters = distanceMeters,
                    BaseDurationSeconds = baseSeconds,
                    DurationSeconds = Math.Max(baseSeconds, trafficSeconds),
                    HasLiveTraffic = true,
                    TrafficProvider = "Google live traffic",
                    TrafficNote = delayMinutes > 0
                        ? $"Live traffic adding about {delayMinutes:F0} min"
                        : "Live traffic showing no extra delay",
                };
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Google traffic routing failed");
                return null;
            }
        }

        private async Task<RouteTimingResult?> GetOsrmRouteAsync(
            double fromLat, double fromLon, double toLat, double toLon, HttpClient client)
        {
            try
            {
                var url = $"https://router.project-osrm.org/route/v1/driving/{fromLon:F6},{fromLat:F6};{toLon:F6},{toLat:F6}?overview=false";
                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                request.Headers.Add("User-Agent", "ESSDesignApp/1.0 (nathanb@erectsafe.com.au)");

                var response = await client.SendAsync(request);
                if (!response.IsSuccessStatusCode) return null;

                var json = await response.Content.ReadAsStringAsync();
                var root = JsonSerializer.Deserialize<JsonElement>(json, _jsonOptions);

                if (!root.TryGetProperty("code", out var codeEl) || codeEl.GetString() != "Ok") return null;
                if (!root.TryGetProperty("routes", out var routesEl)) return null;

                var routes = routesEl.EnumerateArray().ToList();
                if (routes.Count == 0) return null;

                var route = routes[0];
                var distanceM = route.GetProperty("distance").GetDouble();
                var durationS = route.GetProperty("duration").GetDouble();

                return new RouteTimingResult
                {
                    DistanceMeters = distanceM,
                    BaseDurationSeconds = durationS,
                    DurationSeconds = durationS,
                    HasLiveTraffic = false,
                    TrafficProvider = "OSRM",
                    TrafficNote = "Free-flow route timing",
                };
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "OSRM routing failed");
                return null;
            }
        }

        private async Task<RouteTimingResult?> GetTrafficAwareRouteAsync(
            double fromLat,
            double fromLon,
            double toLat,
            double toLon,
            HttpClient client,
            DateTimeOffset? departure = null)
        {
            var departureTime = departure ?? GetSydneyNow();
            var tomTomRoute = await GetTomTomRouteAsync(fromLat, fromLon, toLat, toLon, client, departureTime);
            if (tomTomRoute != null)
            {
                return tomTomRoute;
            }

            var googleRoute = await GetGoogleTrafficRouteAsync(fromLat, fromLon, toLat, toLon, client, departureTime);
            if (googleRoute != null)
            {
                return googleRoute;
            }

            var osrmRoute = await GetOsrmRouteAsync(fromLat, fromLon, toLat, toLon, client);
            if (osrmRoute == null)
            {
                return null;
            }

            var traffic = EstimateSydneyTrafficDelay(osrmRoute.BaseDurationSeconds, departureTime);
            osrmRoute.DurationSeconds = osrmRoute.BaseDurationSeconds + traffic.DelaySeconds;
            osrmRoute.TrafficProvider = "Sydney traffic estimate";
            osrmRoute.TrafficNote = $"{traffic.Label}; ETA includes local time-of-day delay";
            return osrmRoute;
        }

        private async Task<RoutePreviewResult?> GetOsrmRoutePreviewAsync(
            double fromLat,
            double fromLon,
            double toLat,
            double toLon,
            HttpClient client,
            DateTimeOffset? departure = null)
        {
            try
            {
                var url = $"https://router.project-osrm.org/route/v1/driving/{fromLon:F6},{fromLat:F6};{toLon:F6},{toLat:F6}?overview=full&geometries=geojson";
                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                request.Headers.Add("User-Agent", "ESSDesignApp/1.0 (nathanb@erectsafe.com.au)");

                var response = await client.SendAsync(request);
                if (!response.IsSuccessStatusCode) return null;

                var json = await response.Content.ReadAsStringAsync();
                var root = JsonSerializer.Deserialize<JsonElement>(json, _jsonOptions);

                if (!root.TryGetProperty("code", out var codeEl) || codeEl.GetString() != "Ok") return null;
                if (!root.TryGetProperty("routes", out var routesEl)) return null;

                var routes = routesEl.EnumerateArray().ToList();
                if (routes.Count == 0) return null;

                var route = routes[0];
                if (!route.TryGetProperty("geometry", out var geometryEl)) return null;
                if (!geometryEl.TryGetProperty("coordinates", out var coordinatesEl)) return null;

                var pathPoints = new List<RoutePoint>();
                foreach (var coordinate in coordinatesEl.EnumerateArray())
                {
                    var parts = coordinate.EnumerateArray().ToArray();
                    if (parts.Length < 2) continue;
                    var lon = parts[0].GetDouble();
                    var lat = parts[1].GetDouble();
                    pathPoints.Add(new RoutePoint { Lat = lat, Lon = lon });
                }

                if (pathPoints.Count == 0) return null;

                var timing = await GetTrafficAwareRouteAsync(fromLat, fromLon, toLat, toLon, client, departure);
                var distanceMeters = timing?.DistanceMeters ?? route.GetProperty("distance").GetDouble();
                var baseDurationSeconds = timing?.BaseDurationSeconds ?? route.GetProperty("duration").GetDouble();
                var durationSeconds = timing?.DurationSeconds ?? baseDurationSeconds;

                return new RoutePreviewResult
                {
                    Yard = new RoutePoint { Lat = fromLat, Lon = fromLon },
                    Site = new RoutePoint { Lat = toLat, Lon = toLon },
                    DistanceMeters = distanceMeters,
                    BaseDurationSeconds = baseDurationSeconds,
                    DurationSeconds = durationSeconds,
                    TrafficDelaySeconds = Math.Max(0, durationSeconds - baseDurationSeconds),
                    HasLiveTraffic = timing?.HasLiveTraffic ?? false,
                    TrafficProvider = timing?.TrafficProvider ?? "OSRM",
                    TrafficNote = timing?.TrafficNote ?? "Free-flow route timing",
                    PathPoints = pathPoints,
                };
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "OSRM route preview failed");
                return null;
            }
        }

        private async Task<RoutePreviewResult?> GetTomTomRoutePreviewAsync(
            double fromLat,
            double fromLon,
            double toLat,
            double toLon,
            HttpClient client,
            DateTimeOffset? departure = null)
        {
            var route = await GetTomTomRouteAsync(fromLat, fromLon, toLat, toLon, client, departure ?? GetSydneyNow());
            if (route == null || route.PathPoints.Count == 0)
            {
                return null;
            }

            return new RoutePreviewResult
            {
                Yard = new RoutePoint { Lat = fromLat, Lon = fromLon },
                Site = new RoutePoint { Lat = toLat, Lon = toLon },
                DistanceMeters = route.DistanceMeters,
                BaseDurationSeconds = route.BaseDurationSeconds,
                DurationSeconds = route.DurationSeconds,
                TrafficDelaySeconds = route.TrafficDelaySeconds,
                HasLiveTraffic = route.HasLiveTraffic,
                TrafficProvider = route.TrafficProvider,
                TrafficNote = route.TrafficNote,
                PathPoints = route.PathPoints,
            };
        }

        private static string AddMinutesFormatted(string date, int hour, int minute, int addMinutes)
        {
            try
            {
                var dt = DateTime.ParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture);
                var result = dt.Date.AddHours(hour).AddMinutes(minute + addMinutes);
                return result.ToString("h:mm tt", CultureInfo.InvariantCulture);
            }
            catch
            {
                return "N/A";
            }
        }

        private static int SecondsToWholeMinutes(double seconds)
        {
            return Math.Max(1, (int)Math.Round(seconds / 60.0, MidpointRounding.AwayFromZero));
        }

        public async Task<DeliveryAnalysisResult> AnalyzeAsync(DeliveryAnalysisRequest request)
        {
            var apiKey = _configuration["OpenAI:ApiKey"];
            if (string.IsNullOrWhiteSpace(apiKey))
                throw new InvalidOperationException("OpenAI API key is not configured.");

            var model = _configuration["OpenAI:Model"] ?? "gpt-4o-mini";

            var httpClient = _httpClientFactory.CreateClient();

            // Geocode the site and fetch routing + weather in parallel
            var siteCoords = await GeocodeAsync(request.SiteLocation, httpClient);

            RouteTimingResult? trafficRoute = null;
            string weatherSummary;
            var scheduledDeparture = BuildSydneyDeparture(request.ScheduledDate, request.ScheduledHour, request.ScheduledMinute);

            if (siteCoords.HasValue)
            {
                var routeTask = GetTrafficAwareRouteAsync(YardLat, YardLon, siteCoords.Value.Lat, siteCoords.Value.Lon, httpClient, scheduledDeparture);
                var weatherTask = GetWeatherSummaryAsync(siteCoords.Value.Lat, siteCoords.Value.Lon, request.ScheduledDate, request.ScheduledHour, httpClient);
                await Task.WhenAll(routeTask, weatherTask);
                trafficRoute = routeTask.Result;
                weatherSummary = weatherTask.Result;
            }
            else
            {
                weatherSummary = "Weather data unavailable (site could not be geocoded)";
            }

            // Use road distance from routing; fall back to straight-line if routing unavailable
            var displayDistanceKm = trafficRoute?.DistanceKm
                ?? (siteCoords.HasValue ? HaversineKm(YardLat, YardLon, siteCoords.Value.Lat, siteCoords.Value.Lon) : 0);

            var dayOfWeek = "Unknown";
            if (DateTime.TryParseExact(request.ScheduledDate, "yyyy-MM-dd",
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None, out var scheduledDt))
            {
                dayOfWeek = scheduledDt.DayOfWeek.ToString();
            }

            var departureTime = $"{request.ScheduledHour:D2}:{request.ScheduledMinute:D2}";

            // Build routing context line — tells the AI exactly what the router measured
            var routingContext = trafficRoute != null
                ? $"Road distance: {trafficRoute.DistanceKm:F1} km | Free-flow drive time: {SecondsToWholeMinutes(trafficRoute.BaseDurationSeconds)} min | Traffic-aware drive time: {SecondsToWholeMinutes(trafficRoute.DurationSeconds)} min | Provider: {trafficRoute.TrafficProvider} | {trafficRoute.TrafficNote}"
                : $"Straight-line distance (routing unavailable): {displayDistanceKm:F1} km";

            var systemPrompt = """
                You are a delivery logistics analyst for ESS (Erect Safe Scaffolding), a scaffolding company based in Sydney, Australia.
                The ESS delivery yard is at 130 Gilba Road, Girraween NSW 2145.

                You are given the actual road distance, free-flow drive time, and traffic-aware drive time.
                Your job is to use that routing data and weather context to produce precise minute-level timing.

                Rules:
                - travelToSiteMinutes must match the traffic-aware drive time provided when available.
                - returnTravelMinutes should account for the time of day when the driver will be heading back.
                - Do not round to the nearest 5 or 10; give the most precise estimate you can.
                - Always respond with valid JSON only.
                """;

            var userPrompt = $$"""
                Calculate exact timings for this scaffolding delivery:

                Departure: {{departureTime}} AEST, {{dayOfWeek}}
                Site address: {{request.SiteLocation}}
                Builder: {{request.BuilderName}}
                Project: {{request.ProjectName}}
                Scaffolding system: {{request.ScaffoldingSystem}}
                {{routingContext}}
                Weather at site at departure time: {{weatherSummary}}

                Use the traffic-aware drive time above as the source of truth. Do not replace it with
                a rounded generic estimate. Apply weather only where it genuinely affects unloading or risk.

                Return exactly this JSON:
                {
                  "travelToSiteMinutes": <integer — free-flow time plus expected traffic delay>,
                  "unloadingMinutes": <integer — realistic unload time for this scaffolding system>,
                  "returnTravelMinutes": <integer — return trip adjusted for time of day>,
                  "trafficNote": "<one sentence on traffic conditions for this route/time, max 90 chars>",
                  "weatherImpact": "<one sentence on weather impact on this run, max 90 chars>",
                  "summaryText": "<2-3 sentences: exact route context, timing rationale, and any risk factors>"
                }
                """;

            var payload = new
            {
                model,
                response_format = new { type = "json_object" },
                messages = new[]
                {
                    new { role = "system", content = systemPrompt },
                    new { role = "user", content = userPrompt },
                }
            };

            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/chat/completions")
            {
                Content = new StringContent(JsonSerializer.Serialize(payload, _jsonOptions), Encoding.UTF8, "application/json")
            };
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

            var response = await httpClient.SendAsync(httpRequest);
            var responseBody = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
                throw new InvalidOperationException($"OpenAI returned {response.StatusCode}: {responseBody}");

            var responseJson = JsonSerializer.Deserialize<JsonElement>(responseBody, _jsonOptions);
            var content = responseJson
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString();

            if (string.IsNullOrWhiteSpace(content))
                throw new InvalidOperationException("No content in OpenAI response.");

            var analysisJson = JsonSerializer.Deserialize<JsonElement>(content, _jsonOptions);

            var travelToSite = analysisJson.GetProperty("travelToSiteMinutes").GetInt32();
            var unloading = analysisJson.GetProperty("unloadingMinutes").GetInt32();
            var returnTravel = analysisJson.GetProperty("returnTravelMinutes").GetInt32();
            var trafficNote = analysisJson.GetProperty("trafficNote").GetString() ?? string.Empty;
            var weatherImpact = analysisJson.GetProperty("weatherImpact").GetString() ?? string.Empty;
            var summaryText = analysisJson.GetProperty("summaryText").GetString() ?? string.Empty;

            if (trafficRoute != null)
            {
                travelToSite = SecondsToWholeMinutes(trafficRoute.DurationSeconds);
                trafficNote = trafficRoute.TrafficNote;
            }

            if (siteCoords.HasValue && trafficRoute != null)
            {
                var returnDeparture = (scheduledDeparture ?? GetSydneyNow()).AddMinutes(travelToSite + unloading);
                var returnRoute = await GetTrafficAwareRouteAsync(
                    siteCoords.Value.Lat,
                    siteCoords.Value.Lon,
                    YardLat,
                    YardLon,
                    httpClient,
                    returnDeparture);

                if (returnRoute != null)
                {
                    returnTravel = SecondsToWholeMinutes(returnRoute.DurationSeconds);
                    if (!string.IsNullOrWhiteSpace(returnRoute.TrafficNote) && returnRoute.TrafficNote != trafficNote)
                    {
                        trafficNote = $"{trafficNote}; return {returnRoute.TrafficNote}";
                    }
                }
            }

            return new DeliveryAnalysisResult
            {
                TravelToSiteMinutes = travelToSite,
                UnloadingMinutes = unloading,
                ReturnTravelMinutes = returnTravel,
                WeatherSummary = weatherSummary,
                TrafficNote = trafficNote,
                WeatherImpact = weatherImpact,
                SummaryText = summaryText,
                DistanceKm = Math.Round(displayDistanceKm, 1),
                EstimatedArrival = AddMinutesFormatted(request.ScheduledDate, request.ScheduledHour, request.ScheduledMinute, travelToSite),
                EstimatedUnloadComplete = AddMinutesFormatted(request.ScheduledDate, request.ScheduledHour, request.ScheduledMinute, travelToSite + unloading),
                EstimatedReturn = AddMinutesFormatted(request.ScheduledDate, request.ScheduledHour, request.ScheduledMinute, travelToSite + unloading + returnTravel),
            };
        }

        public async Task<RoutePreviewResult?> GetRoutePreviewAsync(RoutePreviewRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.SiteLocation))
            {
                return null;
            }

            var httpClient = _httpClientFactory.CreateClient();
            httpClient.Timeout = TimeSpan.FromSeconds(10);

            var siteCoords = await GeocodeAsync(request.SiteLocation, httpClient);
            if (!siteCoords.HasValue)
            {
                return null;
            }

            var departure = BuildSydneyDeparture(request.ScheduledDate, request.ScheduledHour, request.ScheduledMinute);
            var tomTomRoute = await GetTomTomRoutePreviewAsync(
                YardLat,
                YardLon,
                siteCoords.Value.Lat,
                siteCoords.Value.Lon,
                httpClient,
                departure);
            if (tomTomRoute != null)
            {
                return tomTomRoute;
            }

            return await GetOsrmRoutePreviewAsync(
                YardLat,
                YardLon,
                siteCoords.Value.Lat,
                siteCoords.Value.Lon,
                httpClient,
                departure);
        }

        public async Task<RoutePreviewResult?> GetRoutePreviewBetweenAsync(RoutePreviewBetweenRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.FromLocation) || string.IsNullOrWhiteSpace(request.ToLocation))
            {
                return null;
            }

            var httpClient = _httpClientFactory.CreateClient();
            httpClient.Timeout = TimeSpan.FromSeconds(10);

            var fromCoords = await GeocodeAsync(request.FromLocation, httpClient);
            var toCoords = await GeocodeAsync(request.ToLocation, httpClient);
            if (!fromCoords.HasValue || !toCoords.HasValue)
            {
                return null;
            }

            var departure = BuildSydneyDeparture(request.ScheduledDate, request.ScheduledHour, request.ScheduledMinute);
            var tomTomRoute = await GetTomTomRoutePreviewAsync(
                fromCoords.Value.Lat,
                fromCoords.Value.Lon,
                toCoords.Value.Lat,
                toCoords.Value.Lon,
                httpClient,
                departure);
            if (tomTomRoute != null)
            {
                return tomTomRoute;
            }

            return await GetOsrmRoutePreviewAsync(
                fromCoords.Value.Lat,
                fromCoords.Value.Lon,
                toCoords.Value.Lat,
                toCoords.Value.Lon,
                httpClient,
                departure);
        }

        public async Task<TimeSlotRecommendationResult> RecommendTimeSlotAsync(TimeSlotRecommendationRequest request)
        {
            var apiKey = _configuration["OpenAI:ApiKey"];
            if (string.IsNullOrWhiteSpace(apiKey))
                throw new InvalidOperationException("OpenAI API key is not configured.");

            var model = _configuration["OpenAI:Model"] ?? "gpt-4o-mini";
            var httpClient = _httpClientFactory.CreateClient();

            var siteCoords = string.IsNullOrWhiteSpace(request.SiteLocation)
                ? (ValueTuple<double, double>?)null
                : await GeocodeAsync(request.SiteLocation, httpClient);

            var distanceKm = siteCoords.HasValue
                ? HaversineKm(YardLat, YardLon, siteCoords.Value.Item1, siteCoords.Value.Item2)
                : 0;

            var dayOfWeek = "Unknown";
            if (DateTime.TryParseExact(request.ScheduledDate, "yyyy-MM-dd",
                System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.None, out var scheduledDt))
            {
                dayOfWeek = scheduledDt.DayOfWeek.ToString();
            }

            var weatherSummary = siteCoords.HasValue
                ? await GetWeatherSummaryAsync(siteCoords.Value.Item1, siteCoords.Value.Item2, request.ScheduledDate, 8, httpClient)
                : "Weather data unavailable";

            var trucks = new[] { ("truck-1", "ESS01"), ("truck-2", "ESS02"), ("truck-3", "ESS03") };
            var scheduleLines = trucks.Select(truck =>
            {
                var deliveries = request.ExistingDeliveries
                    .Where(d => d.TruckId == truck.Item1)
                    .OrderBy(d => d.Hour).ThenBy(d => d.Minute)
                    .Select(d =>
                    {
                        var h = d.Hour % 12 == 0 ? 12 : d.Hour % 12;
                        var suffix = d.Hour >= 12 ? "PM" : "AM";
                        return $"{h}:{d.Minute:D2} {suffix}";
                    });
                var list = string.Join(", ", deliveries);
                return string.IsNullOrEmpty(list)
                    ? $"  {truck.Item2}: (no deliveries booked)"
                    : $"  {truck.Item2}: {list}";
            });
            var scheduleText = string.Join("\n", scheduleLines);

            var systemPrompt = """
                You are a delivery logistics analyst for ESS (Erect Safe Scaffolding), a scaffolding company in Girraween, Sydney.
                Recommend the best available time slot for a new scaffolding delivery given the existing schedule.
                Always respond with valid JSON only.
                """;

            var userPrompt = $$"""
                Recommend the best time slot for a new scaffolding delivery on {{request.ScheduledDate}} ({{dayOfWeek}}).

                Site: {{(string.IsNullOrWhiteSpace(request.SiteLocation) ? "Unknown" : request.SiteLocation)}}
                Scaffolding system: {{(string.IsNullOrWhiteSpace(request.ScaffoldingSystem) ? "Standard" : request.ScaffoldingSystem)}}
                Straight-line distance from yard: {{distanceKm:F1}} km
                Weather (morning): {{weatherSummary}}
                Typical delivery duration: 90 minutes (yard to site, unload, return)

                Today's truck schedule (each booking occupies 90 minutes):
                {{scheduleText}}

                Choose a slot that:
                - Does not overlap any existing booking (leave 90-min gap)
                - Avoids peak-hour Sydney traffic where practical (7–9 AM, 4–6 PM)
                - Starts no later than 14:30 so the truck returns by 16:00
                - Prefers the truck with the most free time today

                Return exactly this JSON:
                {
                  "recommendedTruckId": "truck-1" or "truck-2" or "truck-3",
                  "recommendedTruckLabel": "ESS01" or "ESS02" or "ESS03",
                  "recommendedHour": <integer 6–14>,
                  "recommendedMinute": <0, 15, 30, or 45>,
                  "reason": "<one sentence, max 90 chars>"
                }
                """;

            var payload = new
            {
                model,
                response_format = new { type = "json_object" },
                messages = new[]
                {
                    new { role = "system", content = systemPrompt },
                    new { role = "user", content = userPrompt },
                }
            };

            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/chat/completions")
            {
                Content = new StringContent(JsonSerializer.Serialize(payload, _jsonOptions), Encoding.UTF8, "application/json")
            };
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

            var response = await httpClient.SendAsync(httpRequest);
            var responseBody = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
                throw new InvalidOperationException($"OpenAI returned {response.StatusCode}: {responseBody}");

            var responseJson = JsonSerializer.Deserialize<JsonElement>(responseBody, _jsonOptions);
            var content = responseJson
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString();

            if (string.IsNullOrWhiteSpace(content))
                throw new InvalidOperationException("No content in OpenAI response.");

            var analysisJson = JsonSerializer.Deserialize<JsonElement>(content, _jsonOptions);

            var truckId = analysisJson.TryGetProperty("recommendedTruckId", out var tidEl) ? tidEl.GetString() ?? "truck-1" : "truck-1";
            var truckLabel = analysisJson.TryGetProperty("recommendedTruckLabel", out var tlEl) ? tlEl.GetString() ?? "ESS01" : "ESS01";
            var recHour = analysisJson.TryGetProperty("recommendedHour", out var hourEl) ? hourEl.GetInt32() : 8;
            var recMinute = analysisJson.TryGetProperty("recommendedMinute", out var minEl) ? minEl.GetInt32() : 0;
            var reason = analysisJson.TryGetProperty("reason", out var reasonEl) ? reasonEl.GetString() ?? string.Empty : string.Empty;

            recHour = Math.Max(6, Math.Min(14, recHour));
            recMinute = recMinute is 0 or 15 or 30 or 45 ? recMinute : 0;

            return new TimeSlotRecommendationResult
            {
                RecommendedTruckId = truckId,
                RecommendedTruckLabel = truckLabel,
                RecommendedHour = recHour,
                RecommendedMinute = recMinute,
                Reason = reason,
            };
        }
    }
}
