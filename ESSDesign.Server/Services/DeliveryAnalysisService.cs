using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

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

        private static string AddMinutesFormatted(string date, int hour, int minute, int addMinutes)
        {
            try
            {
                var dt = DateTime.ParseExact(date, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
                var result = dt.Date.AddHours(hour).AddMinutes(minute + addMinutes);
                return result.ToString("h:mm tt", System.Globalization.CultureInfo.InvariantCulture);
            }
            catch
            {
                return "N/A";
            }
        }

        public async Task<DeliveryAnalysisResult> AnalyzeAsync(DeliveryAnalysisRequest request)
        {
            var apiKey = _configuration["OpenAI:ApiKey"];
            if (string.IsNullOrWhiteSpace(apiKey))
                throw new InvalidOperationException("OpenAI API key is not configured.");

            var model = _configuration["OpenAI:Model"] ?? "gpt-4o-mini";

            var httpClient = _httpClientFactory.CreateClient();

            var siteCoords = await GeocodeAsync(request.SiteLocation, httpClient);
            var distanceKm = siteCoords.HasValue
                ? HaversineKm(YardLat, YardLon, siteCoords.Value.Lat, siteCoords.Value.Lon)
                : 0;

            var weatherSummary = siteCoords.HasValue
                ? await GetWeatherSummaryAsync(siteCoords.Value.Lat, siteCoords.Value.Lon, request.ScheduledDate, request.ScheduledHour, httpClient)
                : "Weather data unavailable (site could not be geocoded)";

            var dayOfWeek = "Unknown";
            if (DateTime.TryParseExact(request.ScheduledDate, "yyyy-MM-dd",
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None, out var scheduledDt))
            {
                dayOfWeek = scheduledDt.DayOfWeek.ToString();
            }

            var departureTime = $"{request.ScheduledHour:D2}:{request.ScheduledMinute:D2}";

            var systemPrompt = """
                You are a delivery logistics analyst for ESS (Erect Safe Scaffolding), a scaffolding company based in Sydney, Australia.
                The ESS delivery yard is at 130 Gilba Road, Girraween NSW 2145.

                You provide realistic delivery timing estimates for scaffolding material runs in Greater Sydney, factoring in:
                - Road distance and real-world driving conditions on Sydney roads
                - Time-of-day and day-of-week traffic patterns (peak hours, school zones, highway vs suburban)
                - Weather impact on driving safety and unloading efficiency
                - Scaffolding system complexity for unloading time

                Always respond with valid JSON only, matching the exact schema requested.
                """;

            var userPrompt = $$"""
                Estimate timings for this scaffolding delivery from the ESS yard to site:

                Departure: {{departureTime}} AEST, {{dayOfWeek}}
                Site address: {{request.SiteLocation}}
                Builder: {{request.BuilderName}}
                Project: {{request.ProjectName}}
                Scaffolding system: {{request.ScaffoldingSystem}}
                Straight-line yard-to-site distance: {{distanceKm:F1}} km
                Weather at site at departure: {{weatherSummary}}

                Return exactly this JSON:
                {
                  "travelToSiteMinutes": <realistic integer drive time yard to site including traffic>,
                  "unloadingMinutes": <realistic integer for unloading scaffolding materials on site>,
                  "returnTravelMinutes": <realistic integer drive time site back to yard>,
                  "trafficNote": "<one sentence traffic assessment for this day/time, max 90 chars>",
                  "weatherImpact": "<one sentence weather impact on the run, max 90 chars>",
                  "summaryText": "<2-3 sentences summarising the delivery run with key factors>"
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

            httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/chat/completions")
            {
                Content = new StringContent(JsonSerializer.Serialize(payload, _jsonOptions), Encoding.UTF8, "application/json")
            };

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

            return new DeliveryAnalysisResult
            {
                TravelToSiteMinutes = travelToSite,
                UnloadingMinutes = unloading,
                ReturnTravelMinutes = returnTravel,
                WeatherSummary = weatherSummary,
                TrafficNote = trafficNote,
                WeatherImpact = weatherImpact,
                SummaryText = summaryText,
                DistanceKm = Math.Round(distanceKm, 1),
                EstimatedArrival = AddMinutesFormatted(request.ScheduledDate, request.ScheduledHour, request.ScheduledMinute, travelToSite),
                EstimatedUnloadComplete = AddMinutesFormatted(request.ScheduledDate, request.ScheduledHour, request.ScheduledMinute, travelToSite + unloading),
                EstimatedReturn = AddMinutesFormatted(request.ScheduledDate, request.ScheduledHour, request.ScheduledMinute, travelToSite + unloading + returnTravel),
            };
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

            httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/chat/completions")
            {
                Content = new StringContent(JsonSerializer.Serialize(payload, _jsonOptions), Encoding.UTF8, "application/json")
            };

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
