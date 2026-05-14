using System.Net.Http.Headers;
using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace ESSDesign.Server.Controllers
{
    [ApiController]
    [Route("api/scaffold-ai")]
    public sealed class ScaffoldAiController : ControllerBase
    {
        private static readonly HashSet<string> ValidClasses = new(StringComparer.OrdinalIgnoreCase)
        {
            "ledger",
            "transom",
            "standard"
        };

        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;
        private readonly ILogger<ScaffoldAiController> _logger;
        private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web);

        public ScaffoldAiController(
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            ILogger<ScaffoldAiController> logger)
        {
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
            _logger = logger;
        }

        public sealed class SuggestBoxesRequest
        {
            public string ImageUrl { get; set; } = string.Empty;
            public string ObjectPath { get; set; } = string.Empty;
            public string ComponentClass { get; set; } = "ledger";
            public List<string> TargetClasses { get; set; } = new();
        }

        public sealed class SuggestedBox
        {
            public string ComponentClass { get; set; } = "ledger";
            public double X { get; set; }
            public double Y { get; set; }
            public double Width { get; set; }
            public double Height { get; set; }
            public double Confidence { get; set; }
        }

        public sealed class SuggestBoxesResponse
        {
            public List<SuggestedBox> Boxes { get; set; } = new();
            public string Model { get; set; } = string.Empty;
            public string Notes { get; set; } = string.Empty;
            public bool ReviewRequired { get; set; } = true;
        }

        [HttpPost("suggest-boxes")]
        public async Task<IActionResult> SuggestBoxes([FromBody] SuggestBoxesRequest request, CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(request.ImageUrl))
            {
                return BadRequest(new { error = "imageUrl is required." });
            }

            if (!Uri.TryCreate(request.ImageUrl, UriKind.Absolute, out var imageUri)
                || (imageUri.Scheme != Uri.UriSchemeHttps && imageUri.Scheme != Uri.UriSchemeHttp))
            {
                return BadRequest(new { error = "imageUrl must be an absolute http or https URL." });
            }

            var apiKey = _configuration["OpenAI:ApiKey"];
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                return StatusCode(503, new { error = "AI suggestion service is not configured." });
            }

            var targetClasses = BuildTargetClasses(request);
            var model = _configuration["OpenAI:VisionModel"]
                ?? _configuration["OpenAI:Model"]
                ?? "gpt-4o-mini";

            try
            {
                var httpClient = _httpClientFactory.CreateClient();
                httpClient.Timeout = TimeSpan.FromSeconds(45);

                var payload = BuildOpenAiPayload(model, request.ImageUrl, targetClasses);
                using var httpRequest = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/chat/completions")
                {
                    Content = new StringContent(JsonSerializer.Serialize(payload, _jsonOptions), Encoding.UTF8, "application/json")
                };
                httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

                var response = await httpClient.SendAsync(httpRequest, cancellationToken);
                var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Scaffold AI suggestion request failed: {StatusCode} {Body}", response.StatusCode, responseBody);
                    return StatusCode(502, new { error = "AI suggestion failed. Please try again." });
                }

                var content = ExtractMessageContent(responseBody);
                if (string.IsNullOrWhiteSpace(content))
                {
                    return StatusCode(502, new { error = "AI suggestion returned no usable content." });
                }

                var result = ParseSuggestionContent(content, targetClasses);
                result.Model = model;
                return Ok(result);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Scaffold AI suggestion failed for {ObjectPath}", request.ObjectPath);
                return StatusCode(500, new { error = "AI suggestion failed. Please try again." });
            }
        }

        private static string[] BuildTargetClasses(SuggestBoxesRequest request)
        {
            var classes = request.TargetClasses
                .Select(NormalizeClass)
                .Where(value => value != null)
                .Select(value => value!)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();

            if (classes.Length > 0)
            {
                return classes;
            }

            return new[] { NormalizeClass(request.ComponentClass) ?? "ledger" };
        }

        private static object BuildOpenAiPayload(string model, string imageUrl, string[] targetClasses)
        {
            var classList = string.Join(", ", targetClasses);
            var pluralInstruction = targetClasses.Length == 1
                ? $"Detect only {classList} components. Do not label other scaffold components."
                : $"Detect only these scaffold component classes: {classList}. Do not label other scaffold components.";

            var systemPrompt = """
                You are a careful computer-vision labelling assistant for a scaffolding company.
                Your job is to propose object-detection training boxes for scaffold components.
                Return valid JSON only. The user must review your boxes before saving.
                """;

            var userPrompt = $$"""
                Analyse this scaffold training image and propose bounding boxes.

                {{pluralInstruction}}

                Labelling rules:
                - Box each individually countable visible end/object, not the whole stack.
                - Use tight boxes around the visible countable component end or head.
                - If components are heavily overlapped, only box items you can reasonably separate.
                - Skip ambiguous objects rather than guessing.
                - Coordinates must be normalized relative to the full image: x, y, width, height in the 0.0 to 1.0 range.
                - x and y are the top-left of the box.
                - confidence must be from 0.0 to 1.0.
                - Use componentClass values exactly: ledger, transom, or standard.

                Return exactly this JSON shape:
                {
                  "boxes": [
                    { "componentClass": "ledger", "x": 0.123, "y": 0.234, "width": 0.045, "height": 0.067, "confidence": 0.82 }
                  ],
                  "notes": "short review note"
                }
                """;

            return new
            {
                model,
                temperature = 0.1,
                response_format = new { type = "json_object" },
                messages = new object[]
                {
                    new { role = "system", content = systemPrompt },
                    new
                    {
                        role = "user",
                        content = new object[]
                        {
                            new { type = "text", text = userPrompt },
                            new { type = "image_url", image_url = new { url = imageUrl, detail = "high" } }
                        }
                    }
                }
            };
        }

        private string ExtractMessageContent(string responseBody)
        {
            var responseJson = JsonSerializer.Deserialize<JsonElement>(responseBody, _jsonOptions);
            if (!responseJson.TryGetProperty("choices", out var choices) || choices.ValueKind != JsonValueKind.Array || choices.GetArrayLength() == 0)
            {
                return string.Empty;
            }

            var firstChoice = choices[0];
            if (!firstChoice.TryGetProperty("message", out var message) || !message.TryGetProperty("content", out var content))
            {
                return string.Empty;
            }

            return content.GetString() ?? string.Empty;
        }

        private static SuggestBoxesResponse ParseSuggestionContent(string content, string[] targetClasses)
        {
            var targetSet = new HashSet<string>(targetClasses, StringComparer.OrdinalIgnoreCase);
            using var document = JsonDocument.Parse(content);
            var root = document.RootElement;
            var result = new SuggestBoxesResponse
            {
                Notes = TryGetString(root, "notes") ?? string.Empty
            };

            if (!root.TryGetProperty("boxes", out var boxesElement) || boxesElement.ValueKind != JsonValueKind.Array)
            {
                return result;
            }

            foreach (var item in boxesElement.EnumerateArray())
            {
                var componentClass = NormalizeClass(TryGetString(item, "componentClass") ?? TryGetString(item, "class"));
                if (string.IsNullOrWhiteSpace(componentClass) || !targetSet.Contains(componentClass))
                {
                    componentClass = targetClasses[0];
                }

                var x = Clamp01(TryGetDouble(item, "x"));
                var y = Clamp01(TryGetDouble(item, "y"));
                var width = Clamp01(TryGetDouble(item, "width"));
                var height = Clamp01(TryGetDouble(item, "height"));
                if (width <= 0.004 || height <= 0.004)
                {
                    continue;
                }

                width = Math.Min(width, 1 - x);
                height = Math.Min(height, 1 - y);
                if (width <= 0.004 || height <= 0.004)
                {
                    continue;
                }

                result.Boxes.Add(new SuggestedBox
                {
                    ComponentClass = componentClass,
                    X = Math.Round(x, 6),
                    Y = Math.Round(y, 6),
                    Width = Math.Round(width, 6),
                    Height = Math.Round(height, 6),
                    Confidence = Math.Round(Clamp01(TryGetDouble(item, "confidence", 0.5)), 3)
                });
            }

            return result;
        }

        private static string? NormalizeClass(string? value)
        {
            var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
            return ValidClasses.Contains(normalized) ? normalized : null;
        }

        private static string? TryGetString(JsonElement element, string propertyName)
        {
            if (!element.TryGetProperty(propertyName, out var property) || property.ValueKind == JsonValueKind.Null)
            {
                return null;
            }

            return property.GetString();
        }

        private static double TryGetDouble(JsonElement element, string propertyName, double fallback = 0)
        {
            if (!element.TryGetProperty(propertyName, out var property))
            {
                return fallback;
            }

            return property.ValueKind switch
            {
                JsonValueKind.Number when property.TryGetDouble(out var value) => value,
                JsonValueKind.String when double.TryParse(property.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var value) => value,
                _ => fallback
            };
        }

        private static double Clamp01(double value)
        {
            if (double.IsNaN(value) || double.IsInfinity(value)) return 0;
            return Math.Max(0, Math.Min(1, value));
        }
    }
}
