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
            public List<VoiceSuggestion> Suggestions { get; set; } = new();
        }

        public sealed class VoiceSuggestion
        {
            public string HeardPhrase { get; set; } = string.Empty;
            public string RowId { get; set; } = string.Empty;
            public string Side { get; set; } = string.Empty;
            public string Quantity { get; set; } = string.Empty;
            public string Label { get; set; } = string.Empty;
            public string? Spec { get; set; }
            public double Confidence { get; set; }
            public bool NeedsConfirmation { get; set; } = true;
        }

        private sealed class CatalogItem
        {
            public string RowId { get; set; } = string.Empty;
            public string Side { get; set; } = string.Empty;
            public string Label { get; set; } = string.Empty;
            public string Spec { get; set; } = string.Empty;
        }

        private sealed class CatalogAlias
        {
            public string RowId { get; set; } = string.Empty;
            public string Side { get; set; } = string.Empty;
            public string Phrase { get; set; } = string.Empty;
        }

        private sealed class VoiceMemoryRow
        {
            public Guid? UserId { get; set; }
            public string HeardPhraseNormalized { get; set; } = string.Empty;
            public string RowId { get; set; } = string.Empty;
            public string Side { get; set; } = string.Empty;
            public string Label { get; set; } = string.Empty;
            public string? Spec { get; set; }
            public int ConfirmedCount { get; set; }
        }

        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;
        private readonly ILogger<MaterialOrderingAiService> _logger;
        private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web);

        private static readonly Regex QuantityMeasurementPattern = new(
            @"\b(?<qty>\d{1,3})\s+(?<measure>\d+(?:\.\d+)?)\s*(?<unit>m|mm|metre|metres|meter|meters|millimetre|millimetres)\s+(?<label>(?:[a-z0-9/\-]+\s+){0,5}[a-z0-9/\-]+)(?=(?:\band\b)|$)",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex QuantityBeforeLabelPattern = new(
            @"\b(?<qty>\d{1,3})\s+(?<label>(?:[a-z0-9/\-]+\s+){0,5}[a-z0-9/\-]+?)\s+(?:at\s+)?(?<measure>\d+(?:\.\d+)?)\s*(?<unit>m|mm|metre|metres|meter|meters|millimetre|millimetres)\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex MergedDecimalMeasurementPattern = new(
            @"\b(?<merged>\d+\.\d+)\s*(?<unit>m|mm|metre|metres|meter|meters|millimetre|millimetres)\s+(?<label>(?:[a-z0-9/\-]+\s+){0,5}[a-z0-9/\-]+)(?=(?:\band\b)|$)",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        // Handles "20 3m standards", "6 2.4m ledgers", "12 1.8m transoms" —
        // quantity and measurement are already separate tokens, label follows.
        private static readonly Regex QuantityThenMeasureLabelPattern = new(
            @"\b(?<qty>\d{1,3})\s+(?<measure>\d+(?:\.\d+)?)\s*(?<unit>m|mm|metre|metres|meter|meters|millimetre|millimetres)\s+(?<label>(?:[a-z0-9/\-]+\s+){0,5}[a-z0-9/\-]+?)(?=\s+(?:and\b|\d)|$)",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly (Regex Pattern, string Replacement)[] VoiceAliases =
        {
            (new Regex(@"\bledges\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "ledgers"),
            (new Regex(@"\bthai\s*bars?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "tie bars"),
            (new Regex(@"\bthai\s*wire\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "tie wire"),
            (new Regex(@"\bopen[\s-]*ended\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "open end"),
            (new Regex(@"\bopen\s*standards?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "open end"),
            (new Regex(@"\bhyper\s*brackets?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "hop-up brackets"),
            (new Regex(@"\btax\s*screws?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "tech screws"),
            (new Regex(@"\btrash\s*transoms?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "transoms"),
            (new Regex(@"\btransom\s*trust\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "transom truss"),
            (new Regex(@"\bcastle\s*wheels?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "castor wheels"),
            (new Regex(@"\bold\s*boards?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "sole boards"),
            (new Regex(@"\bsoul\s*boards?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "sole boards"),
            (new Regex(@"\bmil\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "mm"),
            (new Regex(@"\bscrew\s*jacks?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "screwjacks"),
            (new Regex(@"\bu\s*head\s*jacks?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "u head jack"),
            (new Regex(@"\bswivel\s*jacks?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "swivel jack"),
            (new Regex(@"\bhop\s*up\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "hop-up"),
            (new Regex(@"\bhopup\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "hop-up"),
            (new Regex(@"\bledger\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "ledgers"),
            (new Regex(@"\btransom\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "transoms"),
            (new Regex(@"\bbrace\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "braces"),
            (new Regex(@"\bboard\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "boards"),
            (new Regex(@"\btoe\s*board\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "toe board"),
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

        private static readonly List<CatalogAlias> CatalogAliases = BuildCatalogAliases();

        public MaterialOrderingAiService(
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            ILogger<MaterialOrderingAiService> logger)
        {
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
            _logger = logger;
        }

        public async Task<InterpretationResult> InterpretAsync(string transcript, Guid? userId, CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(transcript))
            {
                return new InterpretationResult();
            }

            var normalizedTranscript = NormalizeTranscript(transcript);
            var rememberedResult = await ApplyRememberedCorrectionsAsync(normalizedTranscript, userId, cancellationToken);
            var heuristicResult = TryInterpretWithHeuristics(transcript);

            var apiKey = _configuration["OpenAI:ApiKey"];
            var model = _configuration["OpenAI:Model"] ?? "gpt-4o-mini";
            var promptCatalog = Catalog.Where(item => !string.IsNullOrWhiteSpace(item.Label)).ToList();
            var promptAliases = CatalogAliases.Where(item => !string.IsNullOrWhiteSpace(item.Phrase)).ToList();

            if (string.IsNullOrWhiteSpace(apiKey))
            {
                return MergeInterpretationResults(rememberedResult, heuristicResult);
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
- Scan the whole transcript for the most plausible scaffold item and row, even when the wording is imperfect.
- Correct likely speech-to-text mistakes and near-miss terms to the closest scaffold item when the intent is clear.
- Be lenient with singular/plural, spacing, hyphenation, and common site shorthand.
- Infer likely intended terms from messy transcripts, for example:
  - 'free metre standards' -> '3 metre standards'
  - '18 3 metre standards' -> quantity 18, standards 3.0M
  - '28 2.4 metre ledges' -> quantity 28, ledgers 2.4M
  - '20 1.2 metre infill boards' -> quantity 20, infill boards 1.2M
  - 'thai bar 1.2' -> 'tie bars 1.2M'
  - '2 board hop up' -> 'HOP-UP BRACKETS 2'
- 'stair bolts', 'stair door', 'aluminium top rail' should still match even without a measurement.
- If an item has no measurement/spec, choose the most plausible row for that named item from the catalog.
- If the transcript says '3 metre', 'three metre', or '3m', treat them as the same measurement where the catalog uses 3.0M.
- If confidence is low but you have a strong guess, return it in suggestions instead of updates.
- Quantity must be an integer string.
- Return JSON only with shape: {"updates":[{"rowId":"r09","side":"left","quantity":"10"}],"suggestions":[{"heardPhrase":"free metre standards","rowId":"r09","side":"left","quantity":"3","label":"STANDARDS","spec":"3.0M","confidence":0.62}]}
""";

            var userPrompt = $"""
Transcript:
{transcript}

Catalog:
{JsonSerializer.Serialize(promptCatalog, _jsonOptions)}

Helpful item phrases:
{JsonSerializer.Serialize(promptAliases, _jsonOptions)}
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
                var fallbackResult = MergeInterpretationResults(rememberedResult, heuristicResult);
                if (fallbackResult.Updates.Count > 0 || fallbackResult.Suggestions.Count > 0)
                {
                    return fallbackResult;
                }

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
                return MergeInterpretationResults(rememberedResult, heuristicResult);
            }

            using var structuredDocument = JsonDocument.Parse(content);
            var validRowKeys = promptCatalog.Select(item => $"{item.RowId}:{item.Side}").ToHashSet(StringComparer.OrdinalIgnoreCase);
            var result = new InterpretationResult();
            var seenKeys = new HashSet<string>(
                rememberedResult.Updates.Select(update => $"{update.RowId}:{update.Side}"),
                StringComparer.OrdinalIgnoreCase);
            var seenSuggestionKeys = new HashSet<string>(
                rememberedResult.Suggestions.Select(suggestion => $"{suggestion.RowId}:{suggestion.Side}:{suggestion.Quantity}"),
                StringComparer.OrdinalIgnoreCase);

            result.Updates.AddRange(rememberedResult.Updates);
            result.Suggestions.AddRange(rememberedResult.Suggestions);

            if (structuredDocument.RootElement.TryGetProperty("updates", out var updatesElement) &&
                updatesElement.ValueKind == JsonValueKind.Array)
            {
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

                    var key = $"{rowId}:{side}";
                    if (!seenKeys.Add(key))
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
            }

            if (structuredDocument.RootElement.TryGetProperty("suggestions", out var suggestionsElement) &&
                suggestionsElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var suggestionElement in suggestionsElement.EnumerateArray())
                {
                    var rowId = suggestionElement.TryGetProperty("rowId", out var rowIdEl) ? rowIdEl.GetString() : null;
                    var side = suggestionElement.TryGetProperty("side", out var sideEl) ? sideEl.GetString() : null;
                    var quantity = suggestionElement.TryGetProperty("quantity", out var quantityEl) ? quantityEl.GetString() : null;
                    var heardPhrase = suggestionElement.TryGetProperty("heardPhrase", out var heardEl) ? heardEl.GetString() : null;
                    var label = suggestionElement.TryGetProperty("label", out var labelEl) ? labelEl.GetString() : null;
                    var spec = suggestionElement.TryGetProperty("spec", out var specEl) ? specEl.GetString() : null;
                    var confidence = suggestionElement.TryGetProperty("confidence", out var confidenceEl) && confidenceEl.TryGetDouble(out var parsedConfidence)
                        ? parsedConfidence
                        : 0.0;

                    if (string.IsNullOrWhiteSpace(rowId) ||
                        string.IsNullOrWhiteSpace(side) ||
                        string.IsNullOrWhiteSpace(quantity) ||
                        string.IsNullOrWhiteSpace(heardPhrase) ||
                        string.IsNullOrWhiteSpace(label) ||
                        !ValidSides.Contains(side) ||
                        !quantity.All(char.IsDigit) ||
                        !validRowKeys.Contains($"{rowId}:{side}"))
                    {
                        continue;
                    }

                    var suggestionKey = $"{rowId}:{side}:{quantity}";
                    if (!seenSuggestionKeys.Add(suggestionKey) || seenKeys.Contains($"{rowId}:{side}"))
                    {
                        continue;
                    }

                    result.Suggestions.Add(new VoiceSuggestion
                    {
                        HeardPhrase = heardPhrase,
                        RowId = rowId,
                        Side = side.ToLowerInvariant(),
                        Quantity = quantity,
                        Label = label,
                        Spec = spec,
                        Confidence = confidence,
                        NeedsConfirmation = true
                    });
                }
            }

            return PruneMeasuredFamilyUpdates(normalizedTranscript, MergeInterpretationResults(result, heuristicResult));
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

            // Handles "20 3m standards", "6 2.4m ledgers" — qty and measure already separate tokens
            foreach (Match match in QuantityThenMeasureLabelPattern.Matches(normalizedTranscript))
            {
                AppendHeuristicMatch(result, seenKeys, match);
            }

            foreach (Match match in MergedDecimalMeasurementPattern.Matches(normalizedTranscript))
            {
                AppendMergedDecimalMatch(result, seenKeys, match);
            }

            AppendAliasOnlyMatches(result, seenKeys, normalizedTranscript);

            return result;
        }

        private InterpretationResult PruneMeasuredFamilyUpdates(string normalizedTranscript, InterpretationResult result)
        {
            var anchoredItems = CollectAnchoredCatalogItems(normalizedTranscript);
            if (anchoredItems.Count == 0)
            {
                return result;
            }

            var anchoredKeys = anchoredItems
                .Select(item => $"{item.RowId}:{item.Side}")
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            var anchoredFamilies = anchoredItems
                .Select(item => NormalizeCatalogText(item.Label))
                .Where(label => !string.IsNullOrWhiteSpace(label))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            result.Updates = result.Updates
                .Where(update =>
                {
                    var catalogItem = Catalog.FirstOrDefault(item =>
                        string.Equals(item.RowId, update.RowId, StringComparison.OrdinalIgnoreCase) &&
                        string.Equals(item.Side, update.Side, StringComparison.OrdinalIgnoreCase));
                    if (catalogItem == null)
                    {
                        return true;
                    }

                    var family = NormalizeCatalogText(catalogItem.Label);
                    if (!anchoredFamilies.Contains(family))
                    {
                        return true;
                    }

                    return anchoredKeys.Contains($"{update.RowId}:{update.Side}");
                })
                .ToList();

            result.Suggestions = result.Suggestions
                .Where(suggestion =>
                {
                    var family = NormalizeCatalogText(suggestion.Label);
                    if (!anchoredFamilies.Contains(family))
                    {
                        return true;
                    }

                    return anchoredKeys.Contains($"{suggestion.RowId}:{suggestion.Side}");
                })
                .ToList();

            return result;
        }

        private List<CatalogItem> CollectAnchoredCatalogItems(string normalizedTranscript)
        {
            var anchoredItems = new List<CatalogItem>();
            var seenKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            void AppendAnchoredMatch(Match match)
            {
                var label = NormalizeCatalogText(match.Groups["label"].Value);
                var measure = NormalizeMeasurement(match.Groups["measure"].Value, match.Groups["unit"].Value);
                var catalogItem = FindCatalogItemForMeasuredLabel(label, measure);
                if (catalogItem == null)
                {
                    return;
                }

                var key = $"{catalogItem.RowId}:{catalogItem.Side}";
                if (!seenKeys.Add(key))
                {
                    return;
                }

                anchoredItems.Add(catalogItem);
            }

            foreach (Match match in QuantityMeasurementPattern.Matches(normalizedTranscript))
            {
                AppendAnchoredMatch(match);
            }

            foreach (Match match in QuantityBeforeLabelPattern.Matches(normalizedTranscript))
            {
                AppendAnchoredMatch(match);
            }

            foreach (Match match in QuantityThenMeasureLabelPattern.Matches(normalizedTranscript))
            {
                AppendAnchoredMatch(match);
            }

            return anchoredItems;
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

            var catalogItem = FindCatalogItemForMeasuredLabel(label, measure);

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

        private void AppendMergedDecimalMatch(InterpretationResult result, HashSet<string> seenKeys, Match match)
        {
            var label = NormalizeCatalogText(match.Groups["label"].Value);
            var merged = match.Groups["merged"].Value.Trim();

            if (string.IsNullOrWhiteSpace(label) || string.IsNullOrWhiteSpace(merged))
            {
                return;
            }

            var catalogCandidates = Catalog.Where(item =>
                !string.IsNullOrWhiteSpace(item.Label) &&
                (NormalizeCatalogText(item.Label).Contains(label, StringComparison.OrdinalIgnoreCase) ||
                 label.Contains(NormalizeCatalogText(item.Label), StringComparison.OrdinalIgnoreCase)))
                .ToList();

            foreach (var catalogItem in catalogCandidates)
            {
                var repairedQuantity = RepairMergedDecimalQuantity(merged, catalogItem.Spec);
                if (string.IsNullOrWhiteSpace(repairedQuantity))
                {
                    continue;
                }

                var key = $"{catalogItem.RowId}:{catalogItem.Side}";
                if (!seenKeys.Add(key))
                {
                    continue;
                }

                result.Updates.Add(new VoiceUpdate
                {
                    RowId = catalogItem.RowId,
                    Side = catalogItem.Side,
                    Quantity = repairedQuantity
                });
                return;
            }
        }

        private CatalogItem? FindCatalogItemForMeasuredLabel(string normalizedLabel, string normalizedMeasure)
        {
            var catalogItem = Catalog.FirstOrDefault(item =>
                !string.IsNullOrWhiteSpace(item.Label) &&
                NormalizeCatalogText(item.Label).Contains(normalizedLabel, StringComparison.OrdinalIgnoreCase) &&
                NormalizeMeasurement(item.Spec, string.Empty) == normalizedMeasure);

            if (catalogItem != null)
            {
                return catalogItem;
            }

            return Catalog.FirstOrDefault(item =>
                !string.IsNullOrWhiteSpace(item.Label) &&
                normalizedLabel.Contains(NormalizeCatalogText(item.Label), StringComparison.OrdinalIgnoreCase) &&
                NormalizeMeasurement(item.Spec, string.Empty) == normalizedMeasure);
        }

        private void AppendAliasOnlyMatches(InterpretationResult result, HashSet<string> seenKeys, string normalizedTranscript)
        {
            foreach (var alias in CatalogAliases.OrderByDescending(item => item.Phrase.Length))
            {
                if (!normalizedTranscript.Contains(alias.Phrase, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var index = normalizedTranscript.IndexOf(alias.Phrase, StringComparison.OrdinalIgnoreCase);
                if (index < 0)
                {
                    continue;
                }

                var quantity = FindNearestQuantityValue(normalizedTranscript, index, index + alias.Phrase.Length, alias.Phrase);
                if (string.IsNullOrWhiteSpace(quantity) || !quantity.All(char.IsDigit))
                {
                    continue;
                }

                var key = $"{alias.RowId}:{alias.Side}";
                if (!seenKeys.Add(key))
                {
                    continue;
                }

                result.Updates.Add(new VoiceUpdate
                {
                    RowId = alias.RowId,
                    Side = alias.Side,
                    Quantity = quantity
                });
            }
        }

        public async Task SaveConfirmedCorrectionAsync(
            Guid userId,
            string heardPhrase,
            string rowId,
            string side,
            string label,
            string? spec,
            CancellationToken cancellationToken)
        {
            var normalizedPhrase = NormalizeCatalogText(NormalizeTranscript(heardPhrase));
            if (string.IsNullOrWhiteSpace(normalizedPhrase))
            {
                throw new InvalidOperationException("Heard phrase could not be normalized.");
            }

            var existing = await GetRememberedCorrectionsAsync(userId, cancellationToken);
            var current = existing.FirstOrDefault(item =>
                string.Equals(item.HeardPhraseNormalized, normalizedPhrase, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(item.RowId, rowId, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(item.Side, side, StringComparison.OrdinalIgnoreCase));

            var payload = new Dictionary<string, object?>
            {
                ["user_id"] = userId,
                ["heard_phrase_normalized"] = normalizedPhrase,
                ["row_id"] = rowId,
                ["side"] = side.ToLowerInvariant(),
                ["label"] = label,
                ["spec"] = spec,
                ["confirmed_count"] = (current?.ConfirmedCount ?? 0) + 1,
                ["updated_at"] = DateTime.UtcNow,
            };

            if (current == null)
            {
                payload["created_at"] = DateTime.UtcNow;
            }

            await UpsertVoiceMemoryAsync(payload, cancellationToken);
        }

        private async Task<InterpretationResult> ApplyRememberedCorrectionsAsync(
            string normalizedTranscript,
            Guid? userId,
            CancellationToken cancellationToken)
        {
            var result = new InterpretationResult();
            if (userId == null)
            {
                return result;
            }

            var rows = await GetRememberedCorrectionsAsync(userId.Value, cancellationToken);
            var seenKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var row in rows.OrderByDescending(item => item.HeardPhraseNormalized.Length))
            {
                if (string.IsNullOrWhiteSpace(row.HeardPhraseNormalized) ||
                    !normalizedTranscript.Contains(row.HeardPhraseNormalized, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var index = normalizedTranscript.IndexOf(row.HeardPhraseNormalized, StringComparison.OrdinalIgnoreCase);
                if (index < 0)
                {
                    continue;
                }

                var quantity = FindNearestQuantityValue(
                    normalizedTranscript,
                    index,
                    index + row.HeardPhraseNormalized.Length,
                    row.HeardPhraseNormalized);

                if (string.IsNullOrWhiteSpace(quantity) || !quantity.All(char.IsDigit))
                {
                    continue;
                }

                var key = $"{row.RowId}:{row.Side}";
                if (!seenKeys.Add(key))
                {
                    continue;
                }

                result.Updates.Add(new VoiceUpdate
                {
                    RowId = row.RowId,
                    Side = row.Side.ToLowerInvariant(),
                    Quantity = quantity
                });
            }

            return result;
        }

        private InterpretationResult MergeInterpretationResults(InterpretationResult first, InterpretationResult second)
        {
            var result = new InterpretationResult();
            var seenUpdateKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var seenSuggestionKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var update in first.Updates.Concat(second.Updates))
            {
                var key = $"{update.RowId}:{update.Side}";
                if (!seenUpdateKeys.Add(key))
                {
                    continue;
                }

                result.Updates.Add(update);
            }

            foreach (var suggestion in first.Suggestions.Concat(second.Suggestions))
            {
                var key = $"{suggestion.RowId}:{suggestion.Side}:{suggestion.Quantity}";
                if (!seenSuggestionKeys.Add(key))
                {
                    continue;
                }

                result.Suggestions.Add(suggestion);
            }

            return result;
        }

        private static string RepairMergedQuantity(string quantity, string rawMeasure)
        {
            if (string.IsNullOrWhiteSpace(quantity) || !quantity.All(char.IsDigit))
            {
                return quantity;
            }

            // If the quantity string doesn't end with any digit signature from the measure,
            // it was already a clean separate token — return it unchanged.
            bool anySignatureMatch = BuildMeasurementDigitSignatures(rawMeasure)
                .Any(sig => !string.IsNullOrWhiteSpace(sig) && quantity.EndsWith(sig, StringComparison.Ordinal));
            if (!anySignatureMatch)
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

                if (signature.Length == 1 &&
                    prefix.Length == 1 &&
                    Regex.IsMatch(rawMeasure, @"^\s*\d+(?:\.0+)?\s*(m|mm|metre|metres|meter|meters)?\s*$", RegexOptions.IgnoreCase))
                {
                    return $"{prefix}0";
                }

                return prefix.TrimStart('0') is { Length: > 0 } trimmed ? trimmed : "0";
            }

            return quantity;
        }

        private static string? RepairMergedDecimalQuantity(string mergedValue, string rawMeasure)
        {
            var cleanMerged = mergedValue.Trim().ToLowerInvariant();
            if (!Regex.IsMatch(cleanMerged, @"^\d+\.\d+$"))
            {
                return null;
            }

            foreach (var rawVariant in BuildMeasurementRawVariants(rawMeasure))
            {
                if (!cleanMerged.EndsWith(rawVariant, StringComparison.Ordinal))
                {
                    continue;
                }

                var prefix = cleanMerged[..^rawVariant.Length].TrimEnd('.');
                if (string.IsNullOrWhiteSpace(prefix))
                {
                    continue;
                }

                if (prefix.Length == 1 && rawVariant.Contains('.'))
                {
                    return $"{prefix}0";
                }

                return prefix.TrimStart('0') is { Length: > 0 } trimmed ? trimmed : "0";
            }

            return null;
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

        private static IEnumerable<string> BuildMeasurementRawVariants(string rawMeasure)
        {
            var normalized = rawMeasure.Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(normalized))
            {
                yield break;
            }

            if (Regex.IsMatch(normalized, @"\d"))
            {
                yield return normalized.Replace("mm", string.Empty).Replace("m", string.Empty).Trim();
            }

            if (Regex.IsMatch(normalized, @"^\d+\.0+$"))
            {
                yield return normalized.Split('.')[0];
            }
        }

        private static string NormalizeTranscript(string transcript)
        {
            var normalized = CanonicalizeNumberWords(transcript
                .ToLowerInvariant()
                .Replace(",", " ")
                .Replace(";", " ")
                .Replace(":", " ")
                .Replace("&", " and "));

            normalized = Regex.Replace(normalized, @"\bmetres?\b", "metre");
            normalized = Regex.Replace(normalized, @"\bmillimetres?\b", "millimetre");
            normalized = Regex.Replace(normalized, @"\bmeters?\b", "meter");
            normalized = Regex.Replace(normalized, @"\bfree\s+(?=(?:m|meter|metre|millimetre|mm|board))", "3 ", RegexOptions.IgnoreCase);
            normalized = Regex.Replace(normalized, @"\bto\s+board\b", "2 board", RegexOptions.IgnoreCase);
            normalized = Regex.Replace(normalized, @"\bfor\s+board\b", "4 board", RegexOptions.IgnoreCase);

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
                .Trim();

            foreach (var (pattern, replacement) in VoiceAliases)
            {
                normalized = pattern.Replace(normalized, replacement);
            }

            return Regex.Replace(normalized, @"\s+", " ").Trim();
        }

        private static string NormalizeMeasurement(string measure, string unit)
        {
            var cleanMeasure = measure.Trim().ToLowerInvariant().Replace(" ", string.Empty);
            if (string.IsNullOrWhiteSpace(cleanMeasure))
            {
                return string.Empty;
            }

            var normalizedUnit = unit.Trim().ToLowerInvariant().Replace(" ", string.Empty);
            if (string.IsNullOrWhiteSpace(normalizedUnit))
            {
                if (cleanMeasure.EndsWith("millimetre"))
                {
                    cleanMeasure = cleanMeasure[..^"millimetre".Length];
                    normalizedUnit = "mm";
                }
                else if (cleanMeasure.EndsWith("millimetres"))
                {
                    cleanMeasure = cleanMeasure[..^"millimetres".Length];
                    normalizedUnit = "mm";
                }
                else if (cleanMeasure.EndsWith("mm"))
                {
                    cleanMeasure = cleanMeasure[..^2];
                    normalizedUnit = "mm";
                }
                else if (cleanMeasure.EndsWith("metre"))
                {
                    cleanMeasure = cleanMeasure[..^"metre".Length];
                    normalizedUnit = "m";
                }
                else if (cleanMeasure.EndsWith("meter"))
                {
                    cleanMeasure = cleanMeasure[..^"meter".Length];
                    normalizedUnit = "m";
                }
                else if (cleanMeasure.EndsWith("m"))
                {
                    cleanMeasure = cleanMeasure[..^1];
                    normalizedUnit = "m";
                }
            }

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
                return cleanMeasure;
            }

            if (normalizedUnit == "m" && !cleanMeasure.Contains('.'))
            {
                cleanMeasure = $"{cleanMeasure}.0";
            }

            return $"{cleanMeasure}{normalizedUnit}";
        }

        private async Task<List<VoiceMemoryRow>> GetRememberedCorrectionsAsync(Guid userId, CancellationToken cancellationToken)
        {
            var url = BuildRestUrl($"ess_material_ordering_voice_memory?select=user_id,heard_phrase_normalized,row_id,side,label,spec,confirmed_count&user_id=eq.{userId:D}&order=confirmed_count.desc");
            using var request = CreateRestRequest(HttpMethod.Get, url);
            using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Failed loading remembered material ordering corrections: {StatusCode} {Body}", response.StatusCode, body);
                return new List<VoiceMemoryRow>();
            }

            return JsonSerializer.Deserialize<List<VoiceMemoryRow>>(body, _jsonOptions) ?? new List<VoiceMemoryRow>();
        }

        private async Task UpsertVoiceMemoryAsync(object payload, CancellationToken cancellationToken)
        {
            var url = BuildRestUrl("ess_material_ordering_voice_memory?on_conflict=user_id,heard_phrase_normalized,row_id,side");
            using var request = CreateRestRequest(HttpMethod.Post, url, "resolution=merge-duplicates");
            request.Content = new StringContent(JsonSerializer.Serialize(payload, _jsonOptions), Encoding.UTF8, "application/json");
            using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"Failed saving material ordering voice correction: {(int)response.StatusCode} {body}");
            }
        }

        private HttpRequestMessage CreateRestRequest(HttpMethod method, string url, string? prefer = null)
        {
            var apiKey = _configuration["Supabase:ServiceRoleKey"]
                ?? _configuration["Supabase:Key"]
                ?? throw new InvalidOperationException("Supabase key is not configured.");

            var request = new HttpRequestMessage(method, url);
            request.Headers.Add("apikey", apiKey);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            if (!string.IsNullOrWhiteSpace(prefer))
            {
                request.Headers.TryAddWithoutValidation("Prefer", prefer);
            }

            return request;
        }

        private string BuildRestUrl(string relativePath)
        {
            var supabaseUrl = _configuration["Supabase:Url"];
            if (string.IsNullOrWhiteSpace(supabaseUrl))
            {
                throw new InvalidOperationException("Supabase URL is not configured.");
            }

            return $"{supabaseUrl.TrimEnd('/')}/rest/v1/{relativePath}";
        }

        private static string CanonicalizeNumberWords(string input)
        {
            var numberWords = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
            {
                ["zero"] = 0,
                ["one"] = 1,
                ["two"] = 2,
                ["three"] = 3,
                ["four"] = 4,
                ["five"] = 5,
                ["six"] = 6,
                ["seven"] = 7,
                ["eight"] = 8,
                ["nine"] = 9,
                ["ten"] = 10,
                ["eleven"] = 11,
                ["twelve"] = 12,
                ["thirteen"] = 13,
                ["fourteen"] = 14,
                ["fifteen"] = 15,
                ["sixteen"] = 16,
                ["seventeen"] = 17,
                ["eighteen"] = 18,
                ["nineteen"] = 19,
                ["twenty"] = 20,
                ["thirty"] = 30,
                ["forty"] = 40,
                ["fifty"] = 50,
                ["sixty"] = 60,
                ["seventy"] = 70,
                ["eighty"] = 80,
                ["ninety"] = 90,
            };

            var tokens = input.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            var output = new List<string>();

            for (var index = 0; index < tokens.Length;)
            {
                if (!numberWords.ContainsKey(tokens[index]))
                {
                    output.Add(tokens[index]);
                    index += 1;
                    continue;
                }

                var value = 0;
                var consumed = 0;
                while (index + consumed < tokens.Length && numberWords.TryGetValue(tokens[index + consumed], out var tokenValue))
                {
                    value += tokenValue;
                    consumed += 1;
                    if (index + consumed < tokens.Length && string.Equals(tokens[index + consumed], "and", StringComparison.OrdinalIgnoreCase))
                    {
                        consumed += 1;
                    }
                }

                if (index + consumed < tokens.Length && string.Equals(tokens[index + consumed], "point", StringComparison.OrdinalIgnoreCase))
                {
                    var decimalDigits = new StringBuilder();
                    consumed += 1;
                    while (index + consumed < tokens.Length && numberWords.TryGetValue(tokens[index + consumed], out var decimalValue))
                    {
                        decimalDigits.Append(decimalValue);
                        consumed += 1;
                    }

                    if (decimalDigits.Length > 0)
                    {
                        output.Add($"{value}.{decimalDigits}");
                        index += consumed;
                        continue;
                    }
                }

                output.Add(value.ToString());
                index += consumed;
            }

            return string.Join(' ', output);
        }

        private static List<CatalogAlias> BuildCatalogAliases()
        {
            var aliases = new List<CatalogAlias>();

            foreach (var item in Catalog.Where(item => !string.IsNullOrWhiteSpace(item.Label)))
            {
                var label = NormalizeCatalogText(item.Label);
                if (!string.IsNullOrWhiteSpace(label))
                {
                    aliases.Add(new CatalogAlias { RowId = item.RowId, Side = item.Side, Phrase = label });
                }

                var spec = NormalizeCatalogText(item.Spec);
                if (!string.IsNullOrWhiteSpace(spec) && !string.IsNullOrWhiteSpace(label))
                {
                    aliases.Add(new CatalogAlias { RowId = item.RowId, Side = item.Side, Phrase = $"{label} {spec}" });
                    aliases.Add(new CatalogAlias { RowId = item.RowId, Side = item.Side, Phrase = $"{spec} {label}" });
                }

                if (label.StartsWith("hop up brackets", StringComparison.OrdinalIgnoreCase))
                {
                    var boardMatch = Regex.Match(spec, @"(?<count>\d+)\s+board", RegexOptions.IgnoreCase);
                    if (boardMatch.Success)
                    {
                        var count = boardMatch.Groups["count"].Value;
                        aliases.Add(new CatalogAlias { RowId = item.RowId, Side = item.Side, Phrase = $"{count} board hop up" });
                        aliases.Add(new CatalogAlias { RowId = item.RowId, Side = item.Side, Phrase = $"hop up {count} board" });
                    }
                }

                if (label.StartsWith("tie bars", StringComparison.OrdinalIgnoreCase))
                {
                    aliases.Add(new CatalogAlias { RowId = item.RowId, Side = item.Side, Phrase = $"tie bar {spec}".Trim() });
                    aliases.Add(new CatalogAlias { RowId = item.RowId, Side = item.Side, Phrase = $"thai bar {spec}".Trim() });
                }
            }

            return aliases
                .Where(item => !string.IsNullOrWhiteSpace(item.Phrase))
                .GroupBy(item => $"{item.RowId}:{item.Side}:{item.Phrase}", StringComparer.OrdinalIgnoreCase)
                .Select(group => group.First())
                .ToList();
        }

        private static string? FindNearestQuantityValue(string normalizedText, int candidateStart, int candidateEnd, string candidateText)
        {
            var windowSize = Math.Max(36, candidateText.Length + 12);
            var beforeWindow = normalizedText[Math.Max(0, candidateStart - windowSize)..candidateStart];
            var mergedDecimalMatch = Regex.Match(beforeWindow, @"(\d+\.\d+)\s*(?:m|mm)?\s*$", RegexOptions.IgnoreCase);
            if (mergedDecimalMatch.Success)
            {
                var repaired = RepairMergedDecimalQuantity(mergedDecimalMatch.Groups[1].Value, candidateText);
                if (!string.IsNullOrWhiteSpace(repaired))
                {
                    return repaired;
                }
            }

            var beforeMatches = Regex.Matches(beforeWindow, @"\b(\d+)\b");
            if (beforeMatches.Count > 0)
            {
                return beforeMatches[^1].Groups[1].Value;
            }

            var afterEnd = Math.Min(normalizedText.Length, candidateEnd + windowSize);
            var afterWindow = normalizedText[candidateEnd..afterEnd];
            var afterMatch = Regex.Match(afterWindow, @"\b(\d+)\b");
            if (afterMatch.Success)
            {
                return afterMatch.Groups[1].Value;
            }

            return null;
        }
    }
}
