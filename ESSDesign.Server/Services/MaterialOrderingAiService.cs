using System.Net.Http.Headers;
using System.Text.RegularExpressions;
using System.Text;
using System.Text.Json;

namespace ESSDesign.Server.Services
{
    public sealed class MaterialOrderingAiService
    {
        public sealed class VoiceUpdate
        {
            public string RowId { get; set; } = string.Empty;
            public string Side { get; set; } = string.Empty;
            public string Quantity { get; set; } = string.Empty;
        }

        public sealed class InterpretationResult
        {
            public List<VoiceUpdate> Updates { get; set; } = new();
        }

        private sealed class CatalogItem
        {
            public string RowId { get; set; } = string.Empty;
            public string Side { get; set; } = string.Empty;
            public string Label { get; set; } = string.Empty;
            public string Spec { get; set; } = string.Empty;
        }

        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;
        private readonly ILogger<MaterialOrderingAiService> _logger;
        private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web)
        {
            PropertyNameCaseInsensitive = true
        };
        private static readonly Regex QuantityMeasurementPattern = new(
            @"\b(?<qty>\d{1,3})\s+(?<measure>\d+(?:\.\d+)?)\s*(?<unit>m|mm|metre|metres|meter|meters|millimetre|millimetres)\s+(?<label>[a-z0-9/\-\s]+?)(?=(?:\band\b)|$)",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex QuantityBeforeLabelPattern = new(
            @"\b(?<qty>\d{1,3})\s+(?<label>[a-z0-9/\-\s]+?)\s+(?<measure>\d+(?:\.\d+)?)\s*(?<unit>m|mm|metre|metres|meter|meters|millimetre|millimetres)\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly (Regex Pattern, string Replacement)[] VoiceAliases =
        {
            (new Regex(@"\bscrew\s*jacks?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "screwjacks"),
            (new Regex(@"\bu\s*head\s*jacks?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "u head jack"),
            (new Regex(@"\bswivel\s*jacks?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "swivel jack"),
            (new Regex(@"\bhop\s*up\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "hop-up"),
            (new Regex(@"\bhopup\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "hop-up"),
            (new Regex(@"\bledger\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "ledgers"),
            (new Regex(@"\btransom\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "transoms"),
            (new Regex(@"\bbrace\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "braces"),
            (new Regex(@"\bboard\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "boards"),
            (new Regex(@"\bput\s*log\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "putlog"),
            (new Regex(@"\bin\s*fill\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "infill"),
            (new Regex(@"\bunit\s*beam\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "unit beams"),
            (new Regex(@"\bsole\s*board\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "sole boards"),
            (new Regex(@"\bscaff\s*tube\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "scaffold tube"),
            (new Regex(@"\bscaff\s*ladder\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "scaffold ladder"),
            (new Regex(@"\bscaff\s*stairs\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "scaffold stairs"),
            (new Regex(@"\bshade\s*cloth\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "shade"),
        };

        private static readonly HashSet<string> ValidSides = new(StringComparer.OrdinalIgnoreCase)
        {
            "left",
            "middle",
            "right"
        };

        private static readonly List<CatalogItem> Catalog = new()
        {
            new() { RowId = "r09", Side = "left", Label = "STANDARDS", Spec = "3.0M" },
            new() { RowId = "r09", Side = "middle", Label = "HARDWOOD SOLE BOARDS", Spec = "0.5M" },
            new() { RowId = "r09", Side = "right", Label = "SCAFFOLD LADDER", Spec = "6.0M / 5.4M" },
            new() { RowId = "r10", Side = "left", Label = "STANDARDS", Spec = "2.5M" },
            new() { RowId = "r10", Side = "middle", Label = "HARDWOOD SOLE BOARDS", Spec = "1.5M" },
            new() { RowId = "r10", Side = "right", Label = "SCAFFOLD LADDER", Spec = "4.8M / 4.2M" },
            new() { RowId = "r11", Side = "left", Label = "STANDARDS", Spec = "2.0M" },
            new() { RowId = "r11", Side = "middle", Label = "SCREWJACKS", Spec = "" },
            new() { RowId = "r11", Side = "right", Label = "", Spec = "3.6M" },
            new() { RowId = "r12", Side = "left", Label = "STANDARDS", Spec = "1.5M" },
            new() { RowId = "r12", Side = "middle", Label = "U HEAD JACK", Spec = "" },
            new() { RowId = "r12", Side = "right", Label = "", Spec = "3M" },
            new() { RowId = "r13", Side = "left", Label = "STANDARDS", Spec = "1.0M" },
            new() { RowId = "r13", Side = "middle", Label = "SWIVEL JACK", Spec = "" },
            new() { RowId = "r13", Side = "right", Label = "", Spec = "2.4M" },
            new() { RowId = "r14", Side = "left", Label = "STANDARDS", Spec = "0.5M" },
            new() { RowId = "r14", Side = "middle", Label = "TIMBER BOARDS", Spec = "" },
            new() { RowId = "r14", Side = "right", Label = "LADDER HATCHES", Spec = "" },
            new() { RowId = "r15", Side = "left", Label = "STANDARD INTERMEDIATE", Spec = "2M LOCK" },
            new() { RowId = "r15", Side = "middle", Label = "TIMBER BOARDS", Spec = "3.6M" },
            new() { RowId = "r15", Side = "right", Label = "CORNER BRACKET", Spec = "1 X 2" },
            new() { RowId = "r16", Side = "left", Label = "OPEN END", Spec = "3.0M" },
            new() { RowId = "r16", Side = "middle", Label = "TIMBER BOARDS", Spec = "3.0M" },
            new() { RowId = "r16", Side = "right", Label = "CORNER BRACKET", Spec = "2 X 2" },
            new() { RowId = "r17", Side = "left", Label = "OPEN END", Spec = "2.5M" },
            new() { RowId = "r17", Side = "middle", Label = "TIMBER BOARDS", Spec = "2.4M" },
            new() { RowId = "r17", Side = "right", Label = "CORNER BRACKET", Spec = "2 X 3" },
            new() { RowId = "r18", Side = "left", Label = "OPEN END", Spec = "2.0M" },
            new() { RowId = "r18", Side = "middle", Label = "TIMBER BOARDS", Spec = "1.8M" },
            new() { RowId = "r18", Side = "right", Label = "HANDRAIL POST (STANDARD)", Spec = "1M" },
            new() { RowId = "r19", Side = "left", Label = "OPEN END", Spec = "1.5M" },
            new() { RowId = "r19", Side = "middle", Label = "TIMBER BOARDS", Spec = "1.5M" },
            new() { RowId = "r19", Side = "right", Label = "HANDRAIL TIE POST", Spec = "0.75" },
            new() { RowId = "r20", Side = "left", Label = "OPEN END", Spec = "1.0M" },
            new() { RowId = "r20", Side = "middle", Label = "TIMBER BOARDS", Spec = "1.2M" },
            new() { RowId = "r20", Side = "right", Label = "HANDRAIL TIE POST", Spec = "0.3" },
            new() { RowId = "r21", Side = "left", Label = "STANDARD 1 STAR OPEN END", Spec = "0.5M" },
            new() { RowId = "r21", Side = "middle", Label = "SCAFFOLD CLIPS", Spec = "" },
            new() { RowId = "r21", Side = "right", Label = "WALL TIE BRACKETS", Spec = "" },
            new() { RowId = "r22", Side = "left", Label = "LEDGERS", Spec = "2.4M" },
            new() { RowId = "r22", Side = "middle", Label = "DOUBLE CLIP 90 DEGREES", Spec = "" },
            new() { RowId = "r22", Side = "right", Label = "WALL TIE DOUBLE", Spec = "" },
            new() { RowId = "r23", Side = "left", Label = "LEDGERS", Spec = "1.8M" },
            new() { RowId = "r23", Side = "middle", Label = "DOUBLE SAFETY", Spec = "" },
            new() { RowId = "r23", Side = "right", Label = "WALL TIE SAFETY", Spec = "" },
            new() { RowId = "r24", Side = "left", Label = "LEDGERS", Spec = "1.2M" },
            new() { RowId = "r24", Side = "middle", Label = "SWIVEL", Spec = "" },
            new() { RowId = "r24", Side = "right", Label = "LADDER BEAMS", Spec = "6.3" },
            new() { RowId = "r25", Side = "left", Label = "LEDGERS", Spec = "9.5M" },
            new() { RowId = "r25", Side = "middle", Label = "SWIVEL SAFETY", Spec = "" },
            new() { RowId = "r25", Side = "right", Label = "LADDER BEAMS", Spec = "5M" },
            new() { RowId = "r26", Side = "left", Label = "LEDGERS", Spec = "0.7M" },
            new() { RowId = "r26", Side = "middle", Label = "PUTLOG CLIPS", Spec = "" },
            new() { RowId = "r26", Side = "right", Label = "LADDER BEAMS", Spec = "4.2" },
            new() { RowId = "r27", Side = "left", Label = "LEDGERS", Spec = "1 BOARD" },
            new() { RowId = "r27", Side = "middle", Label = "JOINERS INTERNAL / EXTERNAL", Spec = "" },
            new() { RowId = "r27", Side = "right", Label = "LADDER BEAMS", Spec = "3.0M" },
            new() { RowId = "r28", Side = "left", Label = "TRANSOMS", Spec = "2.4M" },
            new() { RowId = "r28", Side = "middle", Label = "BEAM CLAMPS", Spec = "" },
            new() { RowId = "r28", Side = "right", Label = "PALLET CAGE", Spec = "" },
            new() { RowId = "r29", Side = "left", Label = "TRANSOMS", Spec = "1.8M" },
            new() { RowId = "r29", Side = "middle", Label = "TOE BOARD CLIPS", Spec = "" },
            new() { RowId = "r29", Side = "right", Label = "PALLETS", Spec = "" },
            new() { RowId = "r30", Side = "left", Label = "TRANSOMS", Spec = "1.2M" },
            new() { RowId = "r30", Side = "middle", Label = "COUPLER CLIPS", Spec = "" },
            new() { RowId = "r30", Side = "right", Label = "PALLET CASTOR", Spec = "" },
            new() { RowId = "r31", Side = "left", Label = "TRANSOMS", Spec = "9.50M" },
            new() { RowId = "r31", Side = "middle", Label = "TOE BOARD SPADES", Spec = "" },
            new() { RowId = "r31", Side = "right", Label = "UNIT BEAMS", Spec = "" },
            new() { RowId = "r32", Side = "left", Label = "TRANSOMS", Spec = "0.7M" },
            new() { RowId = "r32", Side = "middle", Label = "V CLIPS", Spec = "" },
            new() { RowId = "r32", Side = "right", Label = "UNIT BEAMS", Spec = "" },
            new() { RowId = "r33", Side = "left", Label = "TRANSOMS 2 BOARD", Spec = "0.51M" },
            new() { RowId = "r33", Side = "right", Label = "UNIT BEAMS", Spec = "" },
            new() { RowId = "r34", Side = "left", Label = "TRANSOMS 2 BOARD", Spec = "0.48M" },
            new() { RowId = "r34", Side = "right", Label = "UNIT BEAMS", Spec = "3.6M" },
            new() { RowId = "r35", Side = "left", Label = "TRANSOMS 1 BOARD", Spec = "1 BOARD" },
            new() { RowId = "r35", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "" },
            new() { RowId = "r35", Side = "right", Label = "TRANSOM TRUSS", Spec = "2.4M" },
            new() { RowId = "r36", Side = "left", Label = "LADDER TRANSOMS", Spec = "" },
            new() { RowId = "r36", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "6.0M" },
            new() { RowId = "r36", Side = "right", Label = "TRANSOM TRUSS", Spec = "1.8M" },
            new() { RowId = "r37", Side = "left", Label = "LADDER TRANSOMS", Spec = "1.2M" },
            new() { RowId = "r37", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "5.4M" },
            new() { RowId = "r37", Side = "right", Label = "TRANSOM TRUSS", Spec = "1.2M" },
            new() { RowId = "r38", Side = "left", Label = "DIAGONAL BRACES", Spec = "3.6M" },
            new() { RowId = "r38", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "4.8M" },
            new() { RowId = "r38", Side = "right", Label = "LAP PLATES", Spec = "2 BOARD" },
            new() { RowId = "r39", Side = "left", Label = "DIAGONAL BRACES", Spec = "3.2M" },
            new() { RowId = "r39", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "4.2M" },
            new() { RowId = "r39", Side = "right", Label = "LAP PLATES", Spec = "3 BOARD" },
            new() { RowId = "r40", Side = "left", Label = "DIAGONAL BRACES", Spec = "2.7M" },
            new() { RowId = "r40", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "3.6M" },
            new() { RowId = "r40", Side = "right", Label = "CASTOR WHEELS", Spec = "" },
            new() { RowId = "r41", Side = "left", Label = "DIAGONAL BRACES", Spec = "1.9M" },
            new() { RowId = "r41", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "3.0M" },
            new() { RowId = "r41", Side = "right", Label = "SALE ITEMS", Spec = "" },
            new() { RowId = "r42", Side = "left", Label = "STEEL BOARDS", Spec = "2.4M" },
            new() { RowId = "r42", Side = "middle", Label = "", Spec = "2.4 M" },
            new() { RowId = "r42", Side = "right", Label = "CHAIN/SHADE BLUE", Spec = "15M" },
            new() { RowId = "r43", Side = "left", Label = "STEEL BOARDS", Spec = "1.8M" },
            new() { RowId = "r43", Side = "middle", Label = "", Spec = "1.8 M" },
            new() { RowId = "r43", Side = "right", Label = "CHAIN/SHADE GREEN", Spec = "15M" },
            new() { RowId = "r44", Side = "left", Label = "STEEL BOARDS", Spec = "1.2M" },
            new() { RowId = "r44", Side = "middle", Label = "", Spec = "1.5 M" },
            new() { RowId = "r44", Side = "right", Label = "CHAIN/SHADE BLACK", Spec = "15M" },
            new() { RowId = "r45", Side = "left", Label = "STEEL BOARDS", Spec = "0.95M" },
            new() { RowId = "r45", Side = "middle", Label = "", Spec = "1.2 M" },
            new() { RowId = "r45", Side = "right", Label = "CHAIN/SHADE", Spec = "0.9 MM" },
            new() { RowId = "r46", Side = "left", Label = "STEEL BOARDS", Spec = "0.745" },
            new() { RowId = "r46", Side = "middle", Label = "", Spec = "0.9 MM" },
            new() { RowId = "r46", Side = "right", Label = "CHAIN WIRE 15M / SHADE 50M", Spec = "" },
            new() { RowId = "r47", Side = "left", Label = "INFILL BOARDS", Spec = "2.4M" },
            new() { RowId = "r47", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "0.6MM" },
            new() { RowId = "r47", Side = "right", Label = "SCREW BOLTS 100MM", Spec = "12MM" },
            new() { RowId = "r48", Side = "left", Label = "INFILL BOARDS", Spec = "1.8M" },
            new() { RowId = "r48", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "0.3MM" },
            new() { RowId = "r48", Side = "right", Label = "SCREW BOLTS 75MM", Spec = "12MM" },
            new() { RowId = "r49", Side = "left", Label = "INFILL BOARDS", Spec = "1.2M" },
            new() { RowId = "r49", Side = "middle", Label = "SCAFFOLD STAIRS", Spec = "" },
            new() { RowId = "r49", Side = "right", Label = "TECH SCREWS", Spec = "90MM" },
            new() { RowId = "r50", Side = "left", Label = "HOP-UP 3 SPIGOTS", Spec = "" },
            new() { RowId = "r50", Side = "middle", Label = "ALUMINIUM STAIRS", Spec = "" },
            new() { RowId = "r50", Side = "right", Label = "TECH SCREWS", Spec = "45MM" },
            new() { RowId = "r51", Side = "left", Label = "HOP-UP 2 SPIGOTS", Spec = "" },
            new() { RowId = "r51", Side = "middle", Label = "ALUMINIUM HANDRAIL", Spec = "" },
            new() { RowId = "r51", Side = "right", Label = "TECH SCREWS TIMBER", Spec = "45MM" },
            new() { RowId = "r52", Side = "left", Label = "HOP-UP BRACKETS 3", Spec = "3 BOARD" },
            new() { RowId = "r52", Side = "middle", Label = "ALUMINIUM TOP RAIL", Spec = "" },
            new() { RowId = "r52", Side = "right", Label = "PLYWOOD 17MM / 12MM", Spec = "" },
            new() { RowId = "r53", Side = "left", Label = "HOP-UP BRACKETS 2", Spec = "2 BOARD" },
            new() { RowId = "r53", Side = "middle", Label = "STAIR BOLTS", Spec = "" },
            new() { RowId = "r53", Side = "right", Label = "3/2 TIMBERS", Spec = "" },
            new() { RowId = "r54", Side = "left", Label = "HOP-UP BRACKETS 1", Spec = "1 BOARD" },
            new() { RowId = "r54", Side = "middle", Label = "STAIR STRINGER", Spec = "" },
            new() { RowId = "r54", Side = "right", Label = "TIE WIRE", Spec = "" },
            new() { RowId = "r55", Side = "left", Label = "TIE BARS", Spec = "2.4M" },
            new() { RowId = "r55", Side = "middle", Label = "1 BOARD STEP DOWNS", Spec = "1 BOARD" },
            new() { RowId = "r55", Side = "right", Label = "INCOMPLETE SIGNS", Spec = "" },
            new() { RowId = "r56", Side = "left", Label = "TIE BARS", Spec = "1.8M" },
            new() { RowId = "r56", Side = "middle", Label = "2 BOARD STEP DOWNS", Spec = "2 BOARD" },
            new() { RowId = "r56", Side = "right", Label = "SCAFF TAGS", Spec = "" },
            new() { RowId = "r57", Side = "left", Label = "TIE BARS", Spec = "1.2M" },
            new() { RowId = "r57", Side = "middle", Label = "ALUMINIUM STAIR RISER", Spec = "2.0M" },
            new() { RowId = "r57", Side = "right", Label = "M20 TREAD ROD", Spec = "" },
            new() { RowId = "r58", Side = "left", Label = "TIE BARS", Spec = "0.745" },
            new() { RowId = "r58", Side = "middle", Label = "ALUMINIUM STAIR RISER", Spec = "1.0M" },
            new() { RowId = "r58", Side = "right", Label = "UNIT BEAM BRACKETS", Spec = "" },
            new() { RowId = "r59", Side = "left", Label = "LEDGER", Spec = "3.0M" },
            new() { RowId = "r59", Side = "middle", Label = "STAIR BOLTS", Spec = "" },
            new() { RowId = "r60", Side = "left", Label = "STEEL BOARDS", Spec = "3M" },
            new() { RowId = "r60", Side = "middle", Label = "STAIR DOOR", Spec = "" }
        };

        public MaterialOrderingAiService(
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            ILogger<MaterialOrderingAiService> logger)
        {
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
            _logger = logger;
        }

        public async Task<InterpretationResult> InterpretAsync(string transcript, CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(transcript))
            {
                return new InterpretationResult();
            }

            var heuristicResult = TryInterpretWithHeuristics(transcript);
            if (heuristicResult.Updates.Count > 0)
            {
                return heuristicResult;
            }

            var apiKey = _configuration["OpenAI:ApiKey"];
            var model = _configuration["OpenAI:Model"] ?? "gpt-5-mini";

            if (string.IsNullOrWhiteSpace(apiKey))
            {
                throw new InvalidOperationException("OpenAI API key is not configured on the backend.");
            }

            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(20);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

            var systemPrompt = """
You convert speech transcripts for a scaffold picking card into exact row updates.

Rules:
- Only use items from the provided catalog.
- Measurements/specs matter. If an item name exists in multiple sizes, do not match it unless the size/spec is clear.
- Decimal sizes matter, for example 3.0M, 2.4M, 0.745, 0.95M, 0.6MM.
- Support natural speech like 'put 10 standards at 3 metres', '20 two point four ledgers', 'add 6 screwjacks and 4 swivels'.
- Correct likely speech-to-text mistakes and near-miss terms to the closest scaffold item when the intent is clear.
- Be lenient with singular/plural, spacing, hyphenation, and common site shorthand.
- Return only confident matches.
- Quantity must be an integer string.
- Return JSON only with shape: {"updates":[{"rowId":"r09","side":"left","quantity":"10"}]}
""";

            var userPrompt = $"""
Transcript:
{transcript}

Catalog:
{JsonSerializer.Serialize(Catalog, _jsonOptions)}
""";

            var payload = new
            {
                model,
                temperature = 0.1,
                response_format = new { type = "json_object" },
                messages = new object[]
                {
                    new { role = "system", content = systemPrompt },
                    new { role = "user", content = userPrompt }
                }
            };

            using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/chat/completions")
            {
                Content = new StringContent(JsonSerializer.Serialize(payload, _jsonOptions), Encoding.UTF8, "application/json")
            };

            using var response = await client.SendAsync(request, cancellationToken);
            var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("OpenAI interpretation failed: {StatusCode} {Body}", response.StatusCode, responseContent);
                throw new InvalidOperationException("Voice interpretation failed on the backend.");
            }

            using var completionDocument = JsonDocument.Parse(responseContent);
            var root = completionDocument.RootElement;
            var content = root
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString();

            if (string.IsNullOrWhiteSpace(content))
            {
                return new InterpretationResult();
            }

            using var structuredDocument = JsonDocument.Parse(content);
            if (!structuredDocument.RootElement.TryGetProperty("updates", out var updatesElement) ||
                updatesElement.ValueKind != JsonValueKind.Array)
            {
                return new InterpretationResult();
            }

            var validRowKeys = Catalog.Select(item => $"{item.RowId}:{item.Side}").ToHashSet(StringComparer.OrdinalIgnoreCase);
            var result = new InterpretationResult();

            foreach (var updateElement in updatesElement.EnumerateArray())
            {
                var rowId = updateElement.TryGetProperty("rowId", out var rowIdEl) ? rowIdEl.GetString() : null;
                var side = updateElement.TryGetProperty("side", out var sideEl) ? sideEl.GetString() : null;
                var quantity = updateElement.TryGetProperty("quantity", out var quantityEl) ? quantityEl.GetString() : null;

                if (string.IsNullOrWhiteSpace(rowId) ||
                    string.IsNullOrWhiteSpace(side) ||
                    string.IsNullOrWhiteSpace(quantity) ||
                    !ValidSides.Contains(side) ||
                    !quantity.All(char.IsDigit) ||
                    !validRowKeys.Contains($"{rowId}:{side}"))
                {
                    continue;
                }

                result.Updates.Add(new VoiceUpdate
                {
                    RowId = rowId,
                    Side = side.ToLowerInvariant(),
                    Quantity = quantity
                });
            }

            return result;
        }

        private InterpretationResult TryInterpretWithHeuristics(string transcript)
        {
            var normalizedTranscript = NormalizeTranscript(transcript);
            var result = new InterpretationResult();
            var seenKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (Match match in QuantityMeasurementPattern.Matches(normalizedTranscript))
            {
                AppendHeuristicMatch(result, seenKeys, match);
            }

            foreach (Match match in QuantityBeforeLabelPattern.Matches(normalizedTranscript))
            {
                AppendHeuristicMatch(result, seenKeys, match);
            }

            return result;
        }

        private void AppendHeuristicMatch(InterpretationResult result, HashSet<string> seenKeys, Match match)
        {
            var quantity = RepairMergedQuantity(
                match.Groups["qty"].Value.Trim(),
                match.Groups["measure"].Value.Trim());
            var label = NormalizeCatalogText(match.Groups["label"].Value);
            var measure = NormalizeMeasurement(match.Groups["measure"].Value, match.Groups["unit"].Value);

            if (string.IsNullOrWhiteSpace(quantity) || string.IsNullOrWhiteSpace(label) || string.IsNullOrWhiteSpace(measure))
            {
                return;
            }

            var catalogItem = Catalog.FirstOrDefault(item =>
                !string.IsNullOrWhiteSpace(item.Label) &&
                NormalizeCatalogText(item.Label).Contains(label, StringComparison.OrdinalIgnoreCase) &&
                NormalizeMeasurement(item.Spec, string.Empty) == measure);

            if (catalogItem == null)
            {
                catalogItem = Catalog.FirstOrDefault(item =>
                    !string.IsNullOrWhiteSpace(item.Label) &&
                    label.Contains(NormalizeCatalogText(item.Label), StringComparison.OrdinalIgnoreCase) &&
                    NormalizeMeasurement(item.Spec, string.Empty) == measure);
            }

            if (catalogItem == null)
            {
                return;
            }

            var key = $"{catalogItem.RowId}:{catalogItem.Side}";
            if (!seenKeys.Add(key))
            {
                return;
            }

            result.Updates.Add(new VoiceUpdate
            {
                RowId = catalogItem.RowId,
                Side = catalogItem.Side,
                Quantity = quantity
            });
        }

        private static string RepairMergedQuantity(string quantity, string rawMeasure)
        {
            if (string.IsNullOrWhiteSpace(quantity) || !quantity.All(char.IsDigit))
            {
                return quantity;
            }

            foreach (var signature in BuildMeasurementDigitSignatures(rawMeasure))
            {
                if (string.IsNullOrWhiteSpace(signature) ||
                    !quantity.EndsWith(signature, StringComparison.Ordinal) ||
                    quantity.Length <= signature.Length)
                {
                    continue;
                }

                var prefix = quantity[..^signature.Length];
                if (string.IsNullOrWhiteSpace(prefix))
                {
                    continue;
                }

                if (signature.Length == 1 && prefix.Length == 1)
                {
                    return $"{prefix}0";
                }

                return prefix.TrimStart('0') is { Length: > 0 } trimmed ? trimmed : "0";
            }

            return quantity;
        }

        private static IEnumerable<string> BuildMeasurementDigitSignatures(string rawMeasure)
        {
            var normalized = rawMeasure.Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(normalized))
            {
                yield break;
            }

            var compact = new string(normalized.Where(char.IsDigit).ToArray()).TrimStart('0');
            if (!string.IsNullOrWhiteSpace(compact))
            {
                yield return compact;
            }

            if (Regex.IsMatch(normalized, @"^\d+\.0+$"))
            {
                yield return normalized.Split('.')[0];
            }

            if (Regex.IsMatch(normalized, @"^0\.\d+$"))
            {
                var trimmed = normalized[2..];
                if (!string.IsNullOrWhiteSpace(trimmed))
                {
                    yield return trimmed;
                }
            }
        }

        private static string NormalizeTranscript(string transcript)
        {
            var normalized = transcript
                .ToLowerInvariant()
                .Replace(",", " ")
                .Replace(";", " ")
                .Replace(":", " ")
                .Replace(" metres ", " metre ")
                .Replace(" meters ", " meter ")
                .Replace(" millimetres ", " millimetre ");

            normalized = Regex.Replace(normalized, @"\s+", " ").Trim();
            foreach (var (pattern, replacement) in VoiceAliases)
            {
                normalized = pattern.Replace(normalized, replacement);
            }

            return Regex.Replace(normalized, @"\s+", " ").Trim();
        }

        private static string NormalizeCatalogText(string value)
        {
            var normalized = value
                .ToLowerInvariant()
                .Replace("/", " ")
                .Replace("-", " ")
                .Replace("(", " ")
                .Replace(")", " ")
                .Replace("  ", " ")
                .Trim();

            foreach (var (pattern, replacement) in VoiceAliases)
            {
                normalized = pattern.Replace(normalized, replacement);
            }

            return normalized;
        }

        private static string NormalizeMeasurement(string measure, string unit)
        {
            var cleanMeasure = measure.Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(cleanMeasure))
            {
                return string.Empty;
            }

            var normalizedUnit = unit.Trim().ToLowerInvariant();
            if (normalizedUnit.StartsWith("met"))
            {
                normalizedUnit = "m";
            }
            else if (normalizedUnit.StartsWith("mill"))
            {
                normalizedUnit = "mm";
            }

            if (string.IsNullOrWhiteSpace(normalizedUnit))
            {
                if (cleanMeasure.EndsWith("mm"))
                {
                    return cleanMeasure;
                }

                if (cleanMeasure.EndsWith("m"))
                {
                    return cleanMeasure;
                }

                return cleanMeasure;
            }

            if (normalizedUnit == "m" && !cleanMeasure.Contains('.'))
            {
                cleanMeasure = $"{cleanMeasure}.0";
            }

            return $"{cleanMeasure}{normalizedUnit}";
        }
    }
}
