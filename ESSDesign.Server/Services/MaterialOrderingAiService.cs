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
            public InterpretationDebug? Debug { get; set; }
        }

        public sealed class AssistantMessage
        {
            public string Role { get; set; } = string.Empty;
            public string Content { get; set; } = string.Empty;
        }

        public sealed class AssistantTurnResult
        {
            public string AssistantReply { get; set; } = string.Empty;
            public List<VoiceUpdate> Updates { get; set; } = new();
            public bool ReadyToApply { get; set; }
            public string? AudioBase64 { get; set; }
            public string AudioFormat { get; set; } = "mp3";
            public bool UsesAiVoice { get; set; }
        }

        public sealed class AssistantSpeechResult
        {
            public string? AudioBase64 { get; set; }
            public string AudioFormat { get; set; } = "mp3";
            public bool UsesAiVoice { get; set; }
        }

        public sealed class InterpretationDebug
        {
            public string NormalizedTranscript { get; set; } = string.Empty;
            public List<string> Segments { get; set; } = new();
            public List<string> AnchoredRows { get; set; } = new();
            public List<string> UpdatesBeforePrune { get; set; } = new();
            public List<string> UpdatesAfterPrune { get; set; } = new();
            public List<string> SuggestionsAfterPrune { get; set; } = new();
            public string AiContent { get; set; } = string.Empty;
            public string Source { get; set; } = string.Empty;
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

        private sealed class NormalizedCatalogItem
        {
            public CatalogItem Item { get; init; } = new();
            public string NormalizedLabel { get; init; } = string.Empty;
            public string NormalizedSpec { get; init; } = string.Empty;
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

        private sealed class AssistantCurrentStateItem
        {
            public string RowId { get; init; } = string.Empty;
            public string Side { get; init; } = string.Empty;
            public string Quantity { get; init; } = string.Empty;
            public string Label { get; init; } = string.Empty;
            public string Spec { get; init; } = string.Empty;
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

        private static readonly Regex QuantityOfTheMeasureLabelPattern = new(
            @"\b(?<qty>\d{1,3})\s+(?:of\s+)?(?:the\s+)?(?<measure>\d+(?:\.\d+)?)\s*(?<unit>m|mm|metre|metres|meter|meters|millimetre|millimetres)\s+(?<label>(?:[a-z0-9/\-]+\s+){0,5}[a-z0-9/\-]+?)(?=\s+(?:and\b|\d)|$)",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex QuantityBoardLabelPattern = new(
            @"\b(?<qty>\d{1,3})\s+(?:of\s+)?(?:the\s+)?(?<measure>\d+)\s+(?<unit>board|boards)\s+(?<label>(?:[a-z0-9/\-]+\s+){0,5}[a-z0-9/\-]+?)(?=\s+(?:and\b|\d)|$)",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex MergedDecimalMeasurementPattern = new(
            @"\b(?<merged>\d+\.\d+)\s*(?<unit>m|mm|metre|metres|meter|meters|millimetre|millimetres)\s+(?<label>(?:[a-z0-9/\-]+\s+){0,5}[a-z0-9/\-]+)(?=(?:\band\b)|$)",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        // Handles "20 3m standards", "6 2.4m ledgers", "12 1.8m transoms" —
        // quantity and measurement are already separate tokens, label follows.
        private static readonly Regex QuantityThenMeasureLabelPattern = new(
            @"\b(?<qty>\d{1,3})\s+(?<measure>\d+(?:\.\d+)?)\s*(?<unit>m|mm|metre|metres|meter|meters|millimetre|millimetres)\s+(?<label>(?:[a-z0-9/\-]+\s+){0,5}[a-z0-9/\-]+?)(?=\s+(?:and\b|\d)|$)",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex SegmentNoisePattern = new(
            @"\b(?:also\s+put\s+in\s+there|also\s+put\s+in|also\s+put|also\s+check\s+in|also\s+chuck\s+in\s+another|also\s+chuck\s+in|chuck\s+in\s+another|chuck\s+in|put\s+in\s+there|put\s+in|if\s+you\s+can|as\s+well|we\s+also\s+need|we\s+need|i\s+need|give\s+me|can\s+you|please)\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex QuantityStartPattern = new(
            @"(^|\s)(?<qty>\d{1,3})(?=\s)",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly (Regex Pattern, string Replacement)[] VoiceAliases =
        {
            (new Regex(@"\bopening\s+standards?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "open end standards"),
            (new Regex(@"\bopen\s*ended\s+standards?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "open end standards"),
            (new Regex(@"\bfree[\s-]*board[\s-]*hop[\s-]*ups?\s+with\s+spigots?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "3-board hop-up with spigot"),
            (new Regex(@"\bthree[\s-]*board[\s-]*hop[\s-]*ups?\s+with\s+spigots?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "3-board hop-up with spigot"),
            (new Regex(@"\b3[\s-]*board[\s-]*hop[\s-]*ups?\s+with\s+spigots?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "3-board hop-up with spigot"),
            (new Regex(@"\btwo[\s-]*board[\s-]*hop[\s-]*ups?\s+with\s+spigots?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "2-board hop-up with spigot"),
            (new Regex(@"\b2[\s-]*board[\s-]*hop[\s-]*ups?\s+with\s+spigots?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "2-board hop-up with spigot"),
            (new Regex(@"\bfree[\s-]*board[\s-]*hop[\s-]*ups?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "3-board hop-up"),
            (new Regex(@"\bthree[\s-]*board[\s-]*hop[\s-]*ups?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "3-board hop-up"),
            (new Regex(@"\b3[\s-]*board[\s-]*hop[\s-]*ups?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "3-board hop-up"),
            (new Regex(@"\btwo[\s-]*board[\s-]*hop[\s-]*ups?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "2-board hop-up"),
            (new Regex(@"\b2[\s-]*board[\s-]*hop[\s-]*ups?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "2-board hop-up"),
            (new Regex(@"\bone[\s-]*board[\s-]*hop[\s-]*ups?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "1-board hop-up"),
            (new Regex(@"\b1[\s-]*board[\s-]*hop[\s-]*ups?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "1-board hop-up"),
            (new Regex(@"\bledges\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "ledgers"),
            (new Regex(@"\bthai\s*bars?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "tie bars"),
            (new Regex(@"\bthai\s*bales?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "tie bars"),
            (new Regex(@"\bthai\s*wire\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "tie wire"),
            (new Regex(@"\btawa\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "tie wire"),
            (new Regex(@"\b(\d+)\s+wood(?=\s+pop[\s-]*ups?\b)", RegexOptions.IgnoreCase | RegexOptions.Compiled), "$1 board"),
            (new Regex(@"\bpop[\s-]*ups?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "hop up"),
            (new Regex(@"\binfield\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "infill"),
            (new Regex(@"\bfree\s+me\s+to\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "3 metre"),
            (new Regex(@"\bfree\s*meat\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "3 metre"),
            (new Regex(@"\bfree\s*meter\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "3 metre"),
            (new Regex(@"\bopen[\s-]*ended\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "open end"),
            (new Regex(@"\bopen\s*standards?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "open end"),
            (new Regex(@"\bhyper\s*brackets?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "hop-up brackets"),
            (new Regex(@"\btax\s*screws?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "tech screws"),
            (new Regex(@"\btrash\s*transoms?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "transoms"),
            (new Regex(@"\btransom\s*trust\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "transom truss"),
            (new Regex(@"\btrust\s*transoms?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "truss transom"),
            (new Regex(@"\bcastle\s*wheels?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "castor wheels"),
            (new Regex(@"\bcast\s*wheels?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "castor wheels"),
            (new Regex(@"\bold\s*boards?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "sole boards"),
            (new Regex(@"\bsoul\s*boards?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "sole boards"),
            (new Regex(@"\bside\s*boards?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "sole boards"),
            (new Regex(@"\bside\s*woods?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "sole boards"),
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
            (new Regex(@"\blatter\s*beams?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "ladder beams"),
            (new Regex(@"\bstring\s*treads?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "stair stringer"),
            (new Regex(@"\bstair\s*strings?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "stair stringer"),
            (new Regex(@"\bwall\s*brackets?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "wall tie brackets"),
            (new Regex(@"\bdouble\s*couples?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "double couplers"),
            (new Regex(@"\bswirl\s*couplers?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "swivel coupler"),
            (new Regex(@"\bscaff\s*dogs?\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "scaff tags"),
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
            new() { RowId = "r09", Side = "right", Label = "LADDER", Spec = "6.0M" },
            new() { RowId = "r10", Side = "left", Label = "STANDARDS", Spec = "2.5M" },
            new() { RowId = "r10", Side = "middle", Label = "HARDWOOD SOLE BOARDS", Spec = "1.5M" },
            new() { RowId = "r10", Side = "right", Label = "LADDER", Spec = "5.4M" },
            new() { RowId = "r11", Side = "left", Label = "STANDARDS", Spec = "2.0M" },
            new() { RowId = "r11", Side = "middle", Label = "SCREW JACKS", Spec = "" },
            new() { RowId = "r11", Side = "right", Label = "LADDER", Spec = "4.8M" },
            new() { RowId = "r12", Side = "left", Label = "STANDARDS", Spec = "1.5M" },
            new() { RowId = "r12", Side = "middle", Label = "U HEAD JACK", Spec = "" },
            new() { RowId = "r12", Side = "right", Label = "LADDER", Spec = "4.2M" },
            new() { RowId = "r13", Side = "left", Label = "STANDARDS", Spec = "1.0M" },
            new() { RowId = "r13", Side = "middle", Label = "SWIVEL JACK", Spec = "" },
            new() { RowId = "r13", Side = "right", Label = "LADDER", Spec = "3.6M" },
            new() { RowId = "r14", Side = "left", Label = "STANDARDS", Spec = "0.5M" },
            new() { RowId = "r14", Side = "middle", Label = "TIMBER BOARDS", Spec = "" },
            new() { RowId = "r14", Side = "right", Label = "LADDER", Spec = "3.0M" },
            new() { RowId = "r15", Side = "left", Label = "INTERMEDIATE STANDARD", Spec = "2.0M" },
            new() { RowId = "r15", Side = "middle", Label = "TIMBER BOARDS", Spec = "3.6M" },
            new() { RowId = "r15", Side = "right", Label = "LADDER", Spec = "2.4M" },
            new() { RowId = "r16", Side = "left", Label = "STANDARD OPEN/END", Spec = "3.0M" },
            new() { RowId = "r16", Side = "middle", Label = "TIMBER BOARDS", Spec = "3.0M" },
            new() { RowId = "r17", Side = "left", Label = "STANDARD OPEN/END", Spec = "2.5M" },
            new() { RowId = "r17", Side = "middle", Label = "TIMBER BOARDS", Spec = "2.4M" },
            new() { RowId = "r17", Side = "right", Label = "LADDER HATCHES", Spec = "" },
            new() { RowId = "r18", Side = "left", Label = "STANDARD OPEN/END", Spec = "2.0M" },
            new() { RowId = "r18", Side = "middle", Label = "TIMBER BOARDS", Spec = "1.8M" },
            new() { RowId = "r18", Side = "right", Label = "CORNER BRACKET", Spec = "1 X 2" },
            new() { RowId = "r19", Side = "left", Label = "STANDARD OPEN/END", Spec = "1.5M" },
            new() { RowId = "r19", Side = "middle", Label = "TIMBER BOARDS", Spec = "1.5M" },
            new() { RowId = "r19", Side = "right", Label = "CORNER BRACKET", Spec = "2 X 2" },
            new() { RowId = "r20", Side = "left", Label = "STANDARD OPEN/END", Spec = "1.0M" },
            new() { RowId = "r20", Side = "middle", Label = "TIMBER BOARDS", Spec = "1.2M" },
            new() { RowId = "r20", Side = "right", Label = "CORNER BRACKET", Spec = "2 X 3" },
            new() { RowId = "r21", Side = "left", Label = "STANDARD OPEN/END", Spec = "0.5M" },
            new() { RowId = "r21", Side = "middle", Label = "SCAFFOLD CLIPS", Spec = "" },
            new() { RowId = "r21", Side = "right", Label = "HANDRAIL POST", Spec = "1M" },
            new() { RowId = "r22", Side = "left", Label = "LEDGERS", Spec = "3.0M" },
            new() { RowId = "r22", Side = "middle", Label = "DOUBLE COUPLER", Spec = "" },
            new() { RowId = "r22", Side = "right", Label = "HANDRAIL TIE POST", Spec = "0.75M" },
            new() { RowId = "r23", Side = "left", Label = "LEDGERS", Spec = "2.4M" },
            new() { RowId = "r23", Side = "right", Label = "HANDRAIL TIE POST", Spec = "0.3M" },
            new() { RowId = "r24", Side = "left", Label = "LEDGERS", Spec = "1.8M" },
            new() { RowId = "r24", Side = "middle", Label = "SWIVEL COUPLER", Spec = "" },
            new() { RowId = "r24", Side = "right", Label = "WALL TIE BRACKETS", Spec = "" },
            new() { RowId = "r25", Side = "left", Label = "LEDGERS", Spec = "1.2M" },
            new() { RowId = "r26", Side = "left", Label = "LEDGERS", Spec = "9.5M" },
            new() { RowId = "r26", Side = "middle", Label = "PUTLOG CLIPS", Spec = "" },
            new() { RowId = "r27", Side = "left", Label = "LEDGERS", Spec = "0.7M" },
            new() { RowId = "r27", Side = "middle", Label = "JOINERS INTERNAL / EXTERNAL", Spec = "" },
            new() { RowId = "r27", Side = "right", Label = "LADDER BEAMS", Spec = "6.3M" },
            new() { RowId = "r28", Side = "left", Label = "LEDGERS", Spec = "1 BOARD" },
            new() { RowId = "r28", Side = "middle", Label = "BEAM CLAMPS", Spec = "" },
            new() { RowId = "r28", Side = "right", Label = "LADDER BEAMS", Spec = "5M" },
            new() { RowId = "r29", Side = "left", Label = "TRANSOMS", Spec = "2.4M" },
            new() { RowId = "r29", Side = "middle", Label = "TOE BOARD CLIPS", Spec = "" },
            new() { RowId = "r29", Side = "right", Label = "LADDER BEAMS", Spec = "4.2M" },
            new() { RowId = "r30", Side = "left", Label = "TRANSOMS", Spec = "1.8M" },
            new() { RowId = "r30", Side = "middle", Label = "CC CLIPS", Spec = "" },
            new() { RowId = "r30", Side = "right", Label = "LADDER BEAMS", Spec = "3.0M" },
            new() { RowId = "r31", Side = "left", Label = "TRANSOMS", Spec = "1.2M" },
            new() { RowId = "r31", Side = "middle", Label = "TOE BOARD SPADES", Spec = "" },
            new() { RowId = "r31", Side = "right", Label = "PALLET CAGE", Spec = "" },
            new() { RowId = "r32", Side = "left", Label = "TRANSOMS", Spec = "9.5M" },
            new() { RowId = "r32", Side = "middle", Label = "V CLIPS", Spec = "" },
            new() { RowId = "r32", Side = "right", Label = "PALLETS", Spec = "" },
            new() { RowId = "r33", Side = "left", Label = "TRANSOMS", Spec = "0.7M" },
            new() { RowId = "r33", Side = "right", Label = "PALLET CASTOR", Spec = "" },
            new() { RowId = "r34", Side = "left", Label = "TRANSOMS 2 BOARD", Spec = "2 BOARD" },
            new() { RowId = "r34", Side = "right", Label = "UNIT BEAMS", Spec = "3.6M" },
            new() { RowId = "r35", Side = "left", Label = "TRANSOMS 1 BOARD", Spec = "1 BOARD" },
            new() { RowId = "r35", Side = "right", Label = "TRUSS TRANSOM", Spec = "2.4M" },
            new() { RowId = "r36", Side = "left", Label = "LADDER TRANSOM", Spec = "" },
            new() { RowId = "r36", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "6.0M" },
            new() { RowId = "r36", Side = "right", Label = "TRUSS TRANSOM", Spec = "1.8M" },
            new() { RowId = "r37", Side = "left", Label = "LADDER TRANSOM", Spec = "1.2M" },
            new() { RowId = "r37", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "5.4M" },
            new() { RowId = "r37", Side = "right", Label = "TRUSS TRANSOM", Spec = "1.2M" },
            new() { RowId = "r38", Side = "left", Label = "DIAGONAL BRACE", Spec = "3.6M" },
            new() { RowId = "r38", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "4.8M" },
            new() { RowId = "r38", Side = "right", Label = "2 BOARD LAP PLATES", Spec = "" },
            new() { RowId = "r39", Side = "left", Label = "DIAGONAL BRACE", Spec = "3.2M" },
            new() { RowId = "r39", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "4.2M" },
            new() { RowId = "r39", Side = "right", Label = "3 BOARD LAP PLATES", Spec = "" },
            new() { RowId = "r40", Side = "left", Label = "DIAGONAL BRACE", Spec = "2.7M" },
            new() { RowId = "r40", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "3.6M" },
            new() { RowId = "r40", Side = "right", Label = "CASTOR WHEELS", Spec = "" },
            new() { RowId = "r41", Side = "left", Label = "DIAGONAL BRACE", Spec = "1.9M" },
            new() { RowId = "r41", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "3.0M" },
            new() { RowId = "r41", Side = "right", Label = "SALE ITEMS", Spec = "" },
            new() { RowId = "r42", Side = "left", Label = "STEEL BOARDS", Spec = "3.0M" },
            new() { RowId = "r42", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "2.4M" },
            new() { RowId = "r42", Side = "right", Label = "CHAIN/SHADE BLUE", Spec = "" },
            new() { RowId = "r43", Side = "left", Label = "STEEL BOARDS", Spec = "2.4M" },
            new() { RowId = "r43", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "1.8M" },
            new() { RowId = "r43", Side = "right", Label = "CHAIN/SHADE GREEN", Spec = "" },
            new() { RowId = "r44", Side = "left", Label = "STEEL BOARDS", Spec = "1.8M" },
            new() { RowId = "r44", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "1.5M" },
            new() { RowId = "r44", Side = "right", Label = "CHAIN/SHADE BLACK", Spec = "" },
            new() { RowId = "r45", Side = "left", Label = "STEEL BOARDS", Spec = "1.2M" },
            new() { RowId = "r45", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "1.2M" },
            new() { RowId = "r45", Side = "right", Label = "CHAIN/SHADE", Spec = "" },
            new() { RowId = "r46", Side = "left", Label = "STEEL BOARDS", Spec = "0.95M" },
            new() { RowId = "r46", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "0.9M" },
            new() { RowId = "r47", Side = "left", Label = "STEEL BOARDS", Spec = "0.745" },
            new() { RowId = "r47", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "0.6M" },
            new() { RowId = "r47", Side = "right", Label = "100MM SCREW BOLTS", Spec = "" },
            new() { RowId = "r48", Side = "left", Label = "INFILL BOARDS", Spec = "2.4M" },
            new() { RowId = "r48", Side = "middle", Label = "SCAFFOLD TUBE", Spec = "0.3M" },
            new() { RowId = "r48", Side = "right", Label = "75MM SCREW BOLTS", Spec = "" },
            new() { RowId = "r49", Side = "left", Label = "INFILL BOARDS", Spec = "1.8M" },
            new() { RowId = "r49", Side = "middle", Label = "SCAFFOLD STAIRS", Spec = "" },
            new() { RowId = "r49", Side = "right", Label = "TECH SCREWS", Spec = "90MM" },
            new() { RowId = "r50", Side = "left", Label = "INFILL BOARDS", Spec = "1.2M" },
            new() { RowId = "r50", Side = "middle", Label = "ALUMINIUM STAIRS", Spec = "" },
            new() { RowId = "r50", Side = "right", Label = "TECH SCREWS", Spec = "45MM" },
            new() { RowId = "r51", Side = "left", Label = "3-BOARD HOP-UP WITH SPIGOT", Spec = "" },
            new() { RowId = "r51", Side = "middle", Label = "ALUMINIUM HANDRAIL", Spec = "" },
            new() { RowId = "r52", Side = "left", Label = "2-BOARD HOP-UP WITH SPIGOT", Spec = "" },
            new() { RowId = "r52", Side = "middle", Label = "ALUMINIUM TOP RAIL", Spec = "" },
            new() { RowId = "r52", Side = "right", Label = "17MM PLYWOOD", Spec = "" },
            new() { RowId = "r53", Side = "left", Label = "3-BOARD HOP-UP", Spec = "" },
            new() { RowId = "r53", Side = "middle", Label = "STAIR BOLTS", Spec = "" },
            new() { RowId = "r53", Side = "right", Label = "12MM PLYWOOD", Spec = "" },
            new() { RowId = "r54", Side = "left", Label = "2-BOARD HOP-UP", Spec = "" },
            new() { RowId = "r54", Side = "middle", Label = "STAIR STRINGER", Spec = "" },
            new() { RowId = "r54", Side = "right", Label = "TIE WIRE", Spec = "" },
            new() { RowId = "r55", Side = "left", Label = "1-BOARD HOP-UP", Spec = "" },
            new() { RowId = "r55", Side = "middle", Label = "1-BOARD STEP DOWN", Spec = "1 BOARD" },
            new() { RowId = "r55", Side = "right", Label = "INCOMPLETE SIGNS", Spec = "" },
            new() { RowId = "r56", Side = "left", Label = "TIE BARS", Spec = "2.4M" },
            new() { RowId = "r56", Side = "middle", Label = "2-BOARD STEP-DOWN", Spec = "2 BOARD" },
            new() { RowId = "r56", Side = "right", Label = "SCAFF TAGS", Spec = "" },
            new() { RowId = "r57", Side = "left", Label = "TIE BARS", Spec = "1.8M" },
            new() { RowId = "r57", Side = "middle", Label = "ALUMINIUM STAIR", Spec = "2.0M" },
            new() { RowId = "r58", Side = "left", Label = "TIE BARS", Spec = "1.2M" },
            new() { RowId = "r58", Side = "middle", Label = "ALUMINIUM STAIR", Spec = "1.0M" },
            new() { RowId = "r59", Side = "left", Label = "TIE BARS", Spec = "0.7M" },
            new() { RowId = "r59", Side = "middle", Label = "STAIR BOLTS", Spec = "" },
            new() { RowId = "r60", Side = "middle", Label = "STAIR DOOR", Spec = "" }
        };

        private static readonly List<CatalogAlias> CatalogAliases;
        private static readonly List<NormalizedCatalogItem> NormalizedCatalog;

        static MaterialOrderingAiService()
        {
            NormalizedCatalog = Catalog
                .Where(item => !string.IsNullOrWhiteSpace(item.Label))
                .Select(item => new NormalizedCatalogItem
                {
                    Item = item,
                    NormalizedLabel = NormalizeCatalogText(item.Label),
                    NormalizedSpec = NormalizeMeasurement(item.Spec, string.Empty)
                })
                .ToList();

            CatalogAliases = BuildCatalogAliases();
        }

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
            var segments = SegmentInstructions(normalizedTranscript);
            var debug = new InterpretationDebug
            {
                NormalizedTranscript = normalizedTranscript,
                Segments = segments
            };
            try
            {
                var rememberedResult = await ApplyRememberedCorrectionsAsync(normalizedTranscript, userId, cancellationToken);
                var heuristicResult = TryInterpretWithHeuristics(transcript);

                var apiKey = _configuration["OpenAI:ApiKey"];
                var model = _configuration["OpenAI:Model"] ?? "gpt-4o-mini";
                var promptCatalog = Catalog.Where(item => !string.IsNullOrWhiteSpace(item.Label)).ToList();
                var promptAliases = CatalogAliases.Where(item => !string.IsNullOrWhiteSpace(item.Phrase)).ToList();

                if (string.IsNullOrWhiteSpace(apiKey))
                {
                    var fallback = MergeInterpretationResults(rememberedResult, heuristicResult);
                    fallback.Debug = debug;
                    fallback.Debug.Source = "no openai key";
                    fallback.Debug.UpdatesAfterPrune = fallback.Updates.Select(update => $"{update.RowId}:{update.Side}={update.Quantity}").ToList();
                    fallback.Debug.SuggestionsAfterPrune = fallback.Suggestions.Select(suggestion => $"{suggestion.RowId}:{suggestion.Side}={suggestion.Quantity}").ToList();
                    return fallback;
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
- Parse the transcript as a sequence of scaffold item instructions, not as one bag of words.
- Treat filler words like 'also', 'put in', 'of the', 'if you can', 'as well', 'we also need' as noise between item instructions.
- If two adjacent spoken numbers likely represent quantity + measurement, split them intelligently. Example:
  - 'thirty three metre standards' means quantity 30 of 3.0M standards, not 33 of an impossible 33-metre standard.
  - 'twenty one point two metre infill boards' means quantity 20 of 1.2M infill boards when 21.2M is not a valid catalog measurement.
- Never infer quantity from the measurement itself. A measurement token should only become quantity if splitting adjacent spoken numbers makes the catalog match clearer.
- Infer likely intended terms from messy transcripts, for example:
  - 'free metre standards' -> '3 metre standards'
  - '18 3 metre standards' -> quantity 18, standards 3.0M
  - '28 2.4 metre ledges' -> quantity 28, ledgers 2.4M
  - '20 1.2 metre infill boards' -> quantity 20, infill boards 1.2M
  - 'thai bar 1.2' -> 'tie bars 1.2M'
  - '2 board hop ups' -> 2-BOARD HOP-UP (r54:left), where the board count is part of the item name
  - 'three board hop ups' -> 3-BOARD HOP-UP (r53:left)
  - 'free board hop ups' -> 3-BOARD HOP-UP (r53:left)
  - '2 board hop ups with spigot' -> 2-BOARD HOP-UP WITH SPIGOT (r52:left)
  - Never use the board-count digit as a separate quantity for hop-ups unless another explicit quantity is also present
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

Normalized segmented instructions:
{JsonSerializer.Serialize(segments, _jsonOptions)}

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
                    fallbackResult.Debug = debug;
                    fallbackResult.Debug.Source = $"openai error {(int)response.StatusCode}";
                    if (fallbackResult.Updates.Count > 0 || fallbackResult.Suggestions.Count > 0)
                    {
                        fallbackResult.Debug.UpdatesAfterPrune = fallbackResult.Updates.Select(update => $"{update.RowId}:{update.Side}={update.Quantity}").ToList();
                        fallbackResult.Debug.SuggestionsAfterPrune = fallbackResult.Suggestions.Select(suggestion => $"{suggestion.RowId}:{suggestion.Side}={suggestion.Quantity}").ToList();
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
                    var emptyResult = MergeInterpretationResults(rememberedResult, heuristicResult);
                    emptyResult.Debug = debug;
                    emptyResult.Debug.Source = "empty ai content";
                    emptyResult.Debug.UpdatesAfterPrune = emptyResult.Updates.Select(update => $"{update.RowId}:{update.Side}={update.Quantity}").ToList();
                    emptyResult.Debug.SuggestionsAfterPrune = emptyResult.Suggestions.Select(suggestion => $"{suggestion.RowId}:{suggestion.Side}={suggestion.Quantity}").ToList();
                    return emptyResult;
                }

                debug.AiContent = content;

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

                if (!structuredDocument.RootElement.TryGetProperty("updates", out _) &&
                    !structuredDocument.RootElement.TryGetProperty("suggestions", out _))
                {
                    _logger.LogWarning("OpenAI returned JSON without updates or suggestions: {Content}", content);
                    debug.Source = "ai-no-fields";
                }

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

            var mergedResult = MergeInterpretationResults(result, heuristicResult);
            debug.UpdatesBeforePrune = mergedResult.Updates.Select(update => $"{update.RowId}:{update.Side}={update.Quantity}").ToList();
            var prunedResult = PruneMeasuredFamilyUpdates(normalizedTranscript, mergedResult, debug);
            debug.UpdatesAfterPrune = prunedResult.Updates.Select(update => $"{update.RowId}:{update.Side}={update.Quantity}").ToList();
            debug.SuggestionsAfterPrune = prunedResult.Suggestions.Select(suggestion => $"{suggestion.RowId}:{suggestion.Side}={suggestion.Quantity}").ToList();
            debug.Source = "openai+heuristic";
            prunedResult.Debug = debug;
            return prunedResult;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Material ordering interpretation crashed.");
                return new InterpretationResult
                {
                    Debug = new InterpretationDebug
                    {
                        NormalizedTranscript = normalizedTranscript,
                        Segments = segments,
                        Source = $"interpret exception: {ex.GetType().Name}",
                        AiContent = ex.Message
                    }
                };
            }
        }

        public async Task<AssistantTurnResult> RunAssistantTurnAsync(
            string userName,
            string transcript,
            List<AssistantMessage>? history,
            List<VoiceUpdate>? currentUpdates,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(transcript))
            {
                throw new InvalidOperationException("Transcript is required.");
            }

            var apiKey = _configuration["OpenAI:ApiKey"];
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                throw new InvalidOperationException("OpenAI API key is not configured.");
            }

            var model = _configuration["OpenAI:Model"] ?? "gpt-4o-mini";
            var promptCatalog = Catalog.Where(item => !string.IsNullOrWhiteSpace(item.Label)).ToList();
            var promptAliases = CatalogAliases.Where(item => !string.IsNullOrWhiteSpace(item.Phrase)).ToList();
            var compactCatalog = BuildCompactAssistantCatalog(promptCatalog);
            var compactAliases = BuildCompactAssistantAliases(promptAliases);

            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(10);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

            var currentDraft = (currentUpdates ?? new List<VoiceUpdate>())
                .Where(update =>
                    !string.IsNullOrWhiteSpace(update.RowId) &&
                    !string.IsNullOrWhiteSpace(update.Side) &&
                    !string.IsNullOrWhiteSpace(update.Quantity))
                .Select(update => new
                {
                    update.RowId,
                    update.Side,
                    update.Quantity,
                    Item = Catalog.FirstOrDefault(item =>
                        string.Equals(item.RowId, update.RowId, StringComparison.OrdinalIgnoreCase) &&
                        string.Equals(item.Side, update.Side, StringComparison.OrdinalIgnoreCase))
                })
                .Where(item => item.Item != null)
                .Select(item => new AssistantCurrentStateItem
                {
                    RowId = item.RowId,
                    Side = item.Side,
                    Quantity = item.Quantity,
                    Label = item.Item!.Label,
                    Spec = item.Item!.Spec
                })
                .ToList();
            var compactCurrentState = BuildCompactAssistantCurrentState(currentDraft);
            var normalizedTranscript = NormalizeTranscript(transcript);

            if (TryBuildAssistantFastPathResult(normalizedTranscript, transcript, currentDraft, out var fastPathResult))
            {
                var generatedFastAudio = await TryCreateAssistantSpeechAsync(client, apiKey, fastPathResult.AssistantReply, cancellationToken);
                if (generatedFastAudio != null)
                {
                    fastPathResult.AudioBase64 = generatedFastAudio.Value.AudioBase64;
                    fastPathResult.AudioFormat = generatedFastAudio.Value.AudioFormat;
                    fastPathResult.UsesAiVoice = true;
                }

                return fastPathResult;
            }

            var systemPrompt = $$"""
You are a warm, conversational scaffold material ordering assistant for {userName}.

Your job:
- listen to the user's latest spoken request
- maintain the live picking-card state
- speak back naturally and clearly
- keep adding valid items onto the existing picking card state
- allow the user to make corrections in follow-up turns
- only mark readyToApply true when the user clearly confirms they are finished and do not need anything else

Rules:
- Keep the response conversational, brief, and helpful.
- Sound like a practical, human site coordinator rather than a scripted robot.
- Greet the user by first name only, never by full name.
- Use the provided catalog only.
- Understand reversed phrasing like 'truss transom 2.4 28' as quantity 28 of 2.4M truss transoms.
- Understand likely speech mistakes and site shorthand, for example:
  - ledges -> ledgers
  - tie/thai bar -> tie bars
  - cast wheels -> castor wheels
  - stringer treads / stair strings -> stair stringer
  - wall brackets -> wall tie brackets
  - open ended standards / standards open end -> standard open/end
  - side boards / side woods -> sole boards
- If a number blob is implausible like '33 metre standards', split it intelligently into quantity plus measurement when that better matches the catalog.
- Return the full current picking-card updates after applying the user's latest changes, not only the delta.
- Quantity must be an integer string.
- Never claim an item was added unless it clearly maps to a real catalog item.
- Treat phrases like 'add that to the sheet', 'that'll do', 'all good', 'that's everything', and similar confirmations as conversational control instructions, not material names.
- If the user asks for something that is not on the list, or the match is uncertain, do not invent a match and do not change updates.
  Instead say that you couldn't find that exact item and ask a short clarification question.
- The user may ask questions about the current picking card instead of adding items, such as:
  - how many ledgers do we have in total
  - do we have any hop-ups yet
  - read back the current list
  When that happens, answer from the current picking-card state naturally and keep updates unchanged.
- If the picking card already has items and the user adds one or two more items, do not read the full list back again unless they explicitly ask.
  Instead say short, human confirmations like:
  - No worries, I’ll add 20 more 2.4 metre ledgers now.
  - Done, I’ve added those on.
  - Yep, we’ve already got hop-ups in there.
- If clarification is needed, ask only about the missing or ambiguous part.
- If the user says they are happy, all good, correct, or to go ahead, and the picking card is non-empty, set readyToApply true and keep the full updates.
- If the user asks for counts across a family, total the relevant rows from the current picking-card state.
- Return JSON only with shape:
  {
    "assistantReply": "I've got 28 of the 2.4 metre ledgers and 17 of the 1 board hop-ups. Is that everything?",
    "updates": [{"rowId":"r23","side":"left","quantity":"28"}],
    "readyToApply": false
  }
""";

            var messageList = new List<object>
            {
                new { role = "system", content = systemPrompt }
            };

            foreach (var message in (history ?? new List<AssistantMessage>()).TakeLast(8))
            {
                var role = string.Equals(message.Role, "assistant", StringComparison.OrdinalIgnoreCase)
                    ? "assistant"
                    : "user";
                if (string.IsNullOrWhiteSpace(message.Content))
                {
                    continue;
                }

                messageList.Add(new { role, content = message.Content.Trim() });
            }

            var userPrompt = $"""
Latest user transcript:
{transcript}

Current picking-card state:
{compactCurrentState}

Catalog:
{compactCatalog}

Helpful item phrases:
{compactAliases}
""";

            messageList.Add(new { role = "user", content = userPrompt });

            var payload = new
            {
                model,
                temperature = 0.2,
                response_format = new { type = "json_object" },
                messages = messageList.ToArray()
            };

            using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/chat/completions")
            {
                Content = new StringContent(JsonSerializer.Serialize(payload, _jsonOptions), Encoding.UTF8, "application/json")
            };

            using var response = await client.SendAsync(request, cancellationToken);
            var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("OpenAI assistant failed: {StatusCode} {Body}", response.StatusCode, responseContent);
                throw new InvalidOperationException($"Assistant request failed with {(int)response.StatusCode}.");
            }

            using var completionDocument = JsonDocument.Parse(responseContent);
            var content = completionDocument.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString();

            if (string.IsNullOrWhiteSpace(content))
            {
                throw new InvalidOperationException("Assistant returned empty content.");
            }

            using var structuredDocument = JsonDocument.Parse(content);
            var validRowKeys = promptCatalog.Select(item => $"{item.RowId}:{item.Side}").ToHashSet(StringComparer.OrdinalIgnoreCase);
            var result = new AssistantTurnResult
            {
                AssistantReply = structuredDocument.RootElement.TryGetProperty("assistantReply", out var replyElement)
                    ? (replyElement.GetString() ?? string.Empty)
                    : string.Empty,
                ReadyToApply = structuredDocument.RootElement.TryGetProperty("readyToApply", out var readyElement) &&
                    readyElement.ValueKind is JsonValueKind.True or JsonValueKind.False &&
                    readyElement.GetBoolean()
            };

            if (structuredDocument.RootElement.TryGetProperty("updates", out var updatesElement) &&
                updatesElement.ValueKind == JsonValueKind.Array)
            {
                var seenKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
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

            if (string.IsNullOrWhiteSpace(result.AssistantReply))
            {
                result.AssistantReply = "No worries, I’ve updated the picking card. Let me know what you want to add or change.";
            }

            var generatedAudio = await TryCreateAssistantSpeechAsync(client, apiKey, result.AssistantReply, cancellationToken);
            if (generatedAudio != null)
            {
                result.AudioBase64 = generatedAudio.Value.AudioBase64;
                result.AudioFormat = generatedAudio.Value.AudioFormat;
                result.UsesAiVoice = true;
            }

            return result;
        }

        private bool TryBuildAssistantFastPathResult(
            string normalizedTranscript,
            string rawTranscript,
            List<AssistantCurrentStateItem> currentDraft,
            out AssistantTurnResult result)
        {
            result = new AssistantTurnResult();

            if (IsAssistantSheetConfirmation(normalizedTranscript))
            {
                result.AssistantReply = currentDraft.Count > 0
                    ? "No worries, I’ve kept those items on the picking card. What else do you need?"
                    : "I haven’t added any materials yet. Tell me what you want on the picking card.";
                result.Updates = ConvertCurrentDraftToVoiceUpdates(currentDraft);
                return true;
            }

            if (IsAssistantFinishedConfirmation(normalizedTranscript))
            {
                result.AssistantReply = currentDraft.Count > 0
                    ? "No worries, that’s all set. The picking card is ready."
                    : "No worries. There’s nothing on the picking card yet, so just tell me what materials you need.";
                result.Updates = ConvertCurrentDraftToVoiceUpdates(currentDraft);
                result.ReadyToApply = currentDraft.Count > 0;
                return true;
            }

            if (TryBuildAssistantQuestionReply(normalizedTranscript, currentDraft, out var questionReply))
            {
                result.AssistantReply = questionReply;
                result.Updates = ConvertCurrentDraftToVoiceUpdates(currentDraft);
                return true;
            }

            if (HasIncompleteMeasuredAssistantSegment(normalizedTranscript))
            {
                result.AssistantReply = "I caught the quantity and size, but I still need the item name. For example, say 28 of the 2.4 metre ledgers.";
                result.Updates = ConvertCurrentDraftToVoiceUpdates(currentDraft);
                return true;
            }

            var heuristic = TryInterpretWithHeuristics(rawTranscript);
            if (heuristic.Updates.Count > 0)
            {
                var prunedHeuristic = PruneMeasuredFamilyUpdates(normalizedTranscript, heuristic);
                if (LooksLikeAmbiguousFamilySpread(prunedHeuristic))
                {
                    result.AssistantReply = "I need a bit more detail on that item so I don’t add the wrong size. Can you say the quantity, size, and item name together?";
                    result.Updates = ConvertCurrentDraftToVoiceUpdates(currentDraft);
                    return true;
                }
                var merged = MergeAssistantCurrentState(currentDraft, prunedHeuristic.Updates);
                result.Updates = merged;
                result.AssistantReply = BuildAssistantAddConfirmation(prunedHeuristic.Updates);
                return true;
            }

            return false;
        }

        public async Task<AssistantSpeechResult> GenerateAssistantSpeechAsync(string text, CancellationToken cancellationToken)
        {
            var trimmed = text.Trim();
            if (string.IsNullOrWhiteSpace(trimmed))
            {
                return new AssistantSpeechResult();
            }

            var apiKey = _configuration["OpenAI:ApiKey"];
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                throw new InvalidOperationException("OpenAI API key is not configured.");
            }

            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(12);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

            var generatedAudio = await TryCreateAssistantSpeechAsync(client, apiKey, trimmed, cancellationToken);
            if (generatedAudio == null)
            {
                return new AssistantSpeechResult();
            }

            return new AssistantSpeechResult
            {
                AudioBase64 = generatedAudio.Value.AudioBase64,
                AudioFormat = generatedAudio.Value.AudioFormat,
                UsesAiVoice = true
            };
        }

        private async Task<(string AudioBase64, string AudioFormat)?> TryCreateAssistantSpeechAsync(
            HttpClient client,
            string apiKey,
            string assistantReply,
            CancellationToken cancellationToken)
        {
            var trimmedReply = assistantReply.Trim();
            if (string.IsNullOrWhiteSpace(trimmedReply))
            {
                return null;
            }

            var ttsModel = _configuration["OpenAI:TtsModel"] ?? "gpt-4o-mini-tts";
            var ttsVoice = _configuration["OpenAI:TtsVoice"] ?? "onyx";
            var audioFormat = _configuration["OpenAI:TtsFormat"] ?? "wav";
            var speechInstructions = _configuration["OpenAI:TtsInstructions"] ??
                "Speak in a warm, natural, masculine Australian voice for a scaffold materials assistant. Sound human, calm, practical, and conversational. Avoid sounding robotic or overly formal. Keep the pacing brisk but clear.";

            using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/audio/speech")
            {
                Content = new StringContent(
                    JsonSerializer.Serialize(new
                    {
                        model = ttsModel,
                        voice = ttsVoice,
                        input = trimmedReply,
                        instructions = speechInstructions,
                        response_format = audioFormat
                    }, _jsonOptions),
                    Encoding.UTF8,
                    "application/json")
            };

            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

            try
            {
                using var response = await client.SendAsync(request, cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
                    _logger.LogWarning(
                        "OpenAI assistant speech generation failed: {StatusCode} {Body}",
                        response.StatusCode,
                        responseBody);
                    return null;
                }

                var audioBytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
                if (audioBytes.Length == 0)
                {
                    return null;
                }

                return (Convert.ToBase64String(audioBytes), audioFormat);
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
            {
                _logger.LogWarning(ex, "OpenAI assistant speech generation request failed");
                return null;
            }
        }

        private static string BuildCompactAssistantCatalog(IEnumerable<CatalogItem> items)
        {
            return string.Join(
                "\n",
                items.Select(item =>
                    $"{item.RowId}:{item.Side}:{item.Label}{(string.IsNullOrWhiteSpace(item.Spec) ? string.Empty : $" [{item.Spec}]")}"));
        }

        private static string BuildCompactAssistantAliases(IEnumerable<CatalogAlias> aliases)
        {
            return string.Join(
                "\n",
                aliases
                    .Take(120)
                    .Select(alias => $"{alias.Phrase} -> {alias.RowId}:{alias.Side}"));
        }

        private static string BuildCompactAssistantCurrentState(IEnumerable<AssistantCurrentStateItem> currentState)
        {
            var lines = currentState
                .Select(item =>
                {
                    var rowId = item.RowId;
                    var side = item.Side;
                    var quantity = item.Quantity;
                    var label = item.Label;
                    var spec = item.Spec;
                    var specSuffix = string.IsNullOrWhiteSpace(spec) ? string.Empty : $" [{spec}]";
                    return string.IsNullOrWhiteSpace(rowId) || string.IsNullOrWhiteSpace(side) || string.IsNullOrWhiteSpace(quantity)
                        ? string.Empty
                        : $"{rowId}:{side}:{quantity}:{label}{specSuffix}";
                })
                .Where(line => !string.IsNullOrWhiteSpace(line))
                .ToList();

            return lines.Count == 0 ? "(empty)" : string.Join("\n", lines);
        }

        private static List<VoiceUpdate> ConvertCurrentDraftToVoiceUpdates(IEnumerable<AssistantCurrentStateItem> currentState)
        {
            return currentState
                .Select(item => new VoiceUpdate
                {
                    RowId = item.RowId,
                    Side = item.Side,
                    Quantity = item.Quantity
                })
                .Where(update =>
                    !string.IsNullOrWhiteSpace(update.RowId) &&
                    !string.IsNullOrWhiteSpace(update.Side) &&
                    !string.IsNullOrWhiteSpace(update.Quantity))
                .ToList();
        }

        private static bool IsAssistantSheetConfirmation(string normalizedTranscript)
        {
            return Regex.IsMatch(
                normalizedTranscript,
                @"\b(add|put|keep)\s+(that|those|it)\s+(?:on|onto|to)\s+(?:the\s+)?(?:sheet|card|picking\s+card)\b",
                RegexOptions.IgnoreCase);
        }

        private static bool IsAssistantFinishedConfirmation(string normalizedTranscript)
        {
            return Regex.IsMatch(
                normalizedTranscript,
                @"\b(?:all\s+good|that(?:'s| is)?\s+(?:all|everything)|that(?:'ll| will)\s+do|i(?:'m| am)\s+happy|go\s+ahead|looks\s+good|we(?:'re| are)\s+done)\b",
                RegexOptions.IgnoreCase);
        }

        private static bool HasIncompleteMeasuredAssistantSegment(string normalizedTranscript)
        {
            return SegmentInstructions(normalizedTranscript)
                .Any(segment => Regex.IsMatch(segment, @"\b\d{1,3}\s+\d+(?:\.\d+)?m\b\s*$", RegexOptions.IgnoreCase));
        }

        private static bool LooksLikeAmbiguousFamilySpread(InterpretationResult result)
        {
            var repeatedFamilies = result.Updates
                .Select(update => Catalog.FirstOrDefault(item =>
                    string.Equals(item.RowId, update.RowId, StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(item.Side, update.Side, StringComparison.OrdinalIgnoreCase)))
                .Where(item => item != null)
                .GroupBy(item => NormalizeCatalogText(item!.Label))
                .Any(group => group.Count() > 1);

            return repeatedFamilies;
        }

        private static bool TryBuildAssistantQuestionReply(
            string normalizedTranscript,
            List<AssistantCurrentStateItem> currentState,
            out string reply)
        {
            reply = string.Empty;
            var currentUpdates = ConvertCurrentDraftToVoiceUpdates(currentState);
            if (currentUpdates.Count == 0)
            {
                if (Regex.IsMatch(normalizedTranscript, @"\b(?:how many|do we have|read back|current list|what(?:'s| is)\s+on)\b", RegexOptions.IgnoreCase))
                {
                    reply = "There’s nothing on the picking card yet. Tell me what materials you want and I’ll add them on.";
                    return true;
                }

                return false;
            }

            if (Regex.IsMatch(normalizedTranscript, @"\bhow many\b.*\bledgers?\b|\btotal\b.*\bledgers?\b", RegexOptions.IgnoreCase))
            {
                var total = SumMatchingFamily(currentUpdates, "LEDGERS");
                reply = total > 0
                    ? $"We currently have {total} ledgers on the picking card. Want me to add any more?"
                    : "We don’t have any ledgers on the picking card yet. Want me to add some?";
                return true;
            }

            if (Regex.IsMatch(normalizedTranscript, @"\b(?:do we have|any)\b.*\bhop[\s-]*ups?\b", RegexOptions.IgnoreCase))
            {
                var total = SumMatchingFamily(currentUpdates, "HOP-UP");
                reply = total > 0
                    ? $"Yep, we’ve already got {total} hop-ups on the picking card."
                    : "Not yet, there aren’t any hop-ups on the picking card.";
                return true;
            }

            if (Regex.IsMatch(normalizedTranscript, @"\b(?:read back|current list|what(?:'s| is)\s+on\s+(?:the\s+)?(?:sheet|card)|give me the current list)\b", RegexOptions.IgnoreCase))
            {
                var summary = string.Join(", ", currentUpdates
                    .Take(8)
                    .Select(DescribeAssistantUpdate));
                reply = $"At the moment we’ve got {summary}.{(currentUpdates.Count > 8 ? " There are a few more items on there as well." : string.Empty)}";
                return true;
            }

            return false;
        }

        private static int SumMatchingFamily(IEnumerable<VoiceUpdate> updates, string familyToken)
        {
            return updates
                .Select(update => new
                {
                    Update = update,
                    Item = Catalog.FirstOrDefault(item =>
                        string.Equals(item.RowId, update.RowId, StringComparison.OrdinalIgnoreCase) &&
                        string.Equals(item.Side, update.Side, StringComparison.OrdinalIgnoreCase))
                })
                .Where(item => item.Item != null && NormalizeCatalogText(item.Item.Label).Contains(familyToken, StringComparison.OrdinalIgnoreCase))
                .Sum(item => int.TryParse(item.Update.Quantity, out var parsed) ? parsed : 0);
        }

        private static List<VoiceUpdate> MergeAssistantCurrentState(List<AssistantCurrentStateItem> currentState, IEnumerable<VoiceUpdate> additions)
        {
            var merged = ConvertCurrentDraftToVoiceUpdates(currentState)
                .ToDictionary(update => $"{update.RowId}:{update.Side}", StringComparer.OrdinalIgnoreCase);

            foreach (var addition in additions)
            {
                if (string.IsNullOrWhiteSpace(addition.RowId) ||
                    string.IsNullOrWhiteSpace(addition.Side) ||
                    string.IsNullOrWhiteSpace(addition.Quantity))
                {
                    continue;
                }

                merged[$"{addition.RowId}:{addition.Side}"] = new VoiceUpdate
                {
                    RowId = addition.RowId,
                    Side = addition.Side,
                    Quantity = addition.Quantity
                };
            }

            return merged.Values.ToList();
        }

        private static string BuildAssistantAddConfirmation(IEnumerable<VoiceUpdate> additions)
        {
            var descriptions = additions
                .Take(3)
                .Select(DescribeAssistantUpdate)
                .ToList();

            if (descriptions.Count == 0)
            {
                return "No worries, I’ve updated the picking card. What else do you need?";
            }

            if (descriptions.Count == 1)
            {
                return $"No worries, I’ll add {descriptions[0]} now.";
            }

            if (descriptions.Count == 2)
            {
                return $"No worries, I’ll add {descriptions[0]} and {descriptions[1]} now.";
            }

            return $"No worries, I’ll add {descriptions[0]}, {descriptions[1]}, and {descriptions[2]} now.";
        }

        private static string DescribeAssistantUpdate(VoiceUpdate update)
        {
            var item = Catalog.FirstOrDefault(catalogItem =>
                string.Equals(catalogItem.RowId, update.RowId, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(catalogItem.Side, update.Side, StringComparison.OrdinalIgnoreCase));

            if (item == null)
            {
                return $"{update.Quantity} items";
            }

            var label = item.Label.ToLowerInvariant();
            var spec = string.IsNullOrWhiteSpace(item.Spec) ? string.Empty : $" {item.Spec.ToLowerInvariant()}";
            return $"{update.Quantity} {label}{spec}";
        }

        private InterpretationResult TryInterpretWithHeuristics(string transcript)
        {
            var normalizedTranscript = NormalizeTranscript(transcript);
            var result = new InterpretationResult();
            var seenKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var segment in SegmentInstructions(normalizedTranscript))
            {
                foreach (Match match in QuantityMeasurementPattern.Matches(segment))
                {
                    AppendHeuristicMatch(result, seenKeys, match);
                }

                foreach (Match match in QuantityBeforeLabelPattern.Matches(segment))
                {
                    AppendHeuristicMatch(result, seenKeys, match);
                }

                foreach (Match match in QuantityOfTheMeasureLabelPattern.Matches(segment))
                {
                    AppendHeuristicMatch(result, seenKeys, match);
                }

                foreach (Match match in QuantityThenMeasureLabelPattern.Matches(segment))
                {
                    AppendHeuristicMatch(result, seenKeys, match);
                }

                foreach (Match match in QuantityBoardLabelPattern.Matches(segment))
                {
                    AppendHeuristicMatch(result, seenKeys, match);
                }

                foreach (Match match in MergedDecimalMeasurementPattern.Matches(segment))
                {
                    AppendMergedDecimalMatch(result, seenKeys, match);
                }

                AppendAliasOnlyMatches(result, seenKeys, segment);
            }

            return result;
        }

        private InterpretationResult PruneMeasuredFamilyUpdates(string normalizedTranscript, InterpretationResult result, InterpretationDebug? debug = null)
        {
            var anchoredItems = CollectAnchoredCatalogItems(normalizedTranscript);
            if (debug != null)
            {
                debug.AnchoredRows = anchoredItems
                    .Select(item => $"{item.RowId}:{item.Side}:{item.Label}:{item.Spec}")
                    .ToList();
            }
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

            foreach (var segment in SegmentInstructions(normalizedTranscript))
            {
                foreach (Match match in QuantityMeasurementPattern.Matches(segment))
                {
                    AppendAnchoredMatch(match);
                }

                foreach (Match match in QuantityBeforeLabelPattern.Matches(segment))
                {
                    AppendAnchoredMatch(match);
                }

                foreach (Match match in QuantityOfTheMeasureLabelPattern.Matches(segment))
                {
                    AppendAnchoredMatch(match);
                }

                foreach (Match match in QuantityThenMeasureLabelPattern.Matches(segment))
                {
                    AppendAnchoredMatch(match);
                }

                foreach (Match match in QuantityBoardLabelPattern.Matches(segment))
                {
                    AppendAnchoredMatch(match);
                }
            }

            return anchoredItems;
        }

        private static List<string> SegmentInstructions(string normalizedTranscript)
        {
            if (string.IsNullOrWhiteSpace(normalizedTranscript))
            {
                return new List<string>();
            }

            var prepared = SegmentNoisePattern.Replace(normalizedTranscript, " | ");
            prepared = Regex.Replace(prepared, @"\s+\|\s+", " | ").Trim();

            var starts = new List<int>();
            foreach (Match match in QuantityStartPattern.Matches(prepared))
            {
                var startIndex = match.Index + match.Groups[1].Length;
                var quantityToken = match.Groups["qty"].Value;
                if (IsSpecLikeQuantityStart(prepared, startIndex, quantityToken))
                {
                    continue;
                }
                if (starts.Count == 0 || startIndex > starts[^1])
                {
                    starts.Add(startIndex);
                }
            }

            var rawSegments = starts.Count > 0
                ? starts.Select((start, index) =>
                {
                    var end = index + 1 < starts.Count ? starts[index + 1] : prepared.Length;
                    return prepared[start..end];
                })
                : new[] { prepared };

            var segments = rawSegments
                .Select(segment => Regex.Replace(segment.Replace("|", " "), @"\s+", " ").Trim())
                .Where(segment => Regex.IsMatch(segment, @"\d") && Regex.IsMatch(segment, @"[a-z]", RegexOptions.IgnoreCase))
                .ToList();

            return segments.Count > 0 ? segments : new List<string> { normalizedTranscript };
        }

        private static bool IsSpecLikeQuantityStart(string value, int startIndex, string quantityToken)
        {
            var previousToken = GetPreviousToken(value, startIndex);
            if (string.Equals(previousToken, "x", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            if (!Regex.IsMatch(previousToken, @"^\d{1,3}$"))
            {
                return false;
            }

            var after = value[(startIndex + quantityToken.Length)..];
            if (Regex.IsMatch(after, @"^\s*boards?\s+(?:hop|step|lap)", RegexOptions.IgnoreCase))
            {
                return true;
            }

            return Regex.IsMatch(after, @"^\s*(?:m|mm|meter|meters|metre|metres|millimetre|millimetres)\b", RegexOptions.IgnoreCase);
        }

        private static string GetPreviousToken(string value, int startIndex)
        {
            var before = value[..startIndex].TrimEnd();
            var match = Regex.Match(before, @"([a-z0-9.]+)$", RegexOptions.IgnoreCase);
            return match.Success ? match.Groups[1].Value : string.Empty;
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

            var catalogCandidates = NormalizedCatalog.Where(item =>
                !string.IsNullOrWhiteSpace(item.NormalizedLabel) &&
                (item.NormalizedLabel.Contains(label, StringComparison.OrdinalIgnoreCase) ||
                 label.Contains(item.NormalizedLabel, StringComparison.OrdinalIgnoreCase)))
                .ToList();

            foreach (var catalogItem in catalogCandidates)
            {
                var repairedQuantity = RepairMergedDecimalQuantity(merged, catalogItem.Item.Spec);
                if (string.IsNullOrWhiteSpace(repairedQuantity))
                {
                    continue;
                }

                var key = $"{catalogItem.Item.RowId}:{catalogItem.Item.Side}";
                if (!seenKeys.Add(key))
                {
                    continue;
                }

                result.Updates.Add(new VoiceUpdate
                {
                    RowId = catalogItem.Item.RowId,
                    Side = catalogItem.Item.Side,
                    Quantity = repairedQuantity
                });
                return;
            }
        }

        private CatalogItem? FindCatalogItemForMeasuredLabel(string normalizedLabel, string normalizedMeasure)
        {
            var catalogItem = NormalizedCatalog.FirstOrDefault(item =>
                !string.IsNullOrWhiteSpace(item.NormalizedLabel) &&
                item.NormalizedLabel.Contains(normalizedLabel, StringComparison.OrdinalIgnoreCase) &&
                item.NormalizedSpec == normalizedMeasure);

            if (catalogItem != null)
            {
                return catalogItem.Item;
            }

            return NormalizedCatalog.FirstOrDefault(item =>
                !string.IsNullOrWhiteSpace(item.NormalizedLabel) &&
                normalizedLabel.Contains(item.NormalizedLabel, StringComparison.OrdinalIgnoreCase) &&
                item.NormalizedSpec == normalizedMeasure)?.Item;
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

                var normalizedPrefix = prefix.TrimStart('0') is { Length: > 0 } trimmedPrefix ? trimmedPrefix : "0";
                if (!int.TryParse(normalizedPrefix, out var parsedPrefix) || parsedPrefix <= 0 || parsedPrefix > 999)
                {
                    continue;
                }

                if (signature.Length == 1 &&
                    prefix.Length == 1 &&
                    Regex.IsMatch(rawMeasure, @"^\s*\d+(?:\.0+)?\s*(m|mm|metre|metres|meter|meters)?\s*$", RegexOptions.IgnoreCase))
                {
                    return $"{prefix}0";
                }

                return parsedPrefix.ToString();
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

                var normalizedPrefix = prefix.TrimStart('0') is { Length: > 0 } trimmedPrefix ? trimmedPrefix : "0";
                if (!int.TryParse(normalizedPrefix, out var parsedPrefix) || parsedPrefix <= 0 || parsedPrefix > 999)
                {
                    continue;
                }

                if (prefix.Length == 1 && rawVariant.Contains('.'))
                {
                    return $"{prefix}0";
                }

                return parsedPrefix.ToString();
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
            normalized = Regex.Replace(normalized, @"\bfree[\s-]*board[\s-]*hop[\s-]*ups?\s+with\s+spigots?\b", "3-board hop-up with spigot", RegexOptions.IgnoreCase);
            normalized = Regex.Replace(normalized, @"\bfree[\s-]*board[\s-]*hop[\s-]*ups?\b", "3-board hop-up", RegexOptions.IgnoreCase);
            normalized = Regex.Replace(normalized, @"\bfree\s+(?=(?:m|meter|metre|millimetre|mm|board))", "3 ", RegexOptions.IgnoreCase);
            normalized = Regex.Replace(normalized, @"\bto\s+board\b", "2 board", RegexOptions.IgnoreCase);
            normalized = Regex.Replace(normalized, @"\bfor\s+board\b", "4 board", RegexOptions.IgnoreCase);
            normalized = Regex.Replace(normalized, @"\bfor\s+a\s+met(?:er|re)\b", "4 metre", RegexOptions.IgnoreCase);
            normalized = Regex.Replace(normalized, @"\bfor\s+met(?:er|re)\b", "4 metre", RegexOptions.IgnoreCase);
            normalized = Regex.Replace(normalized, @"\b(\d+(?:\.\d+)?)\s+(?:meter|metre|m)\b", "$1m", RegexOptions.IgnoreCase);
            normalized = Regex.Replace(normalized, @"\b(\d+(?:\.\d+)?)\s+(?:millimetre|mm)\b", "$1mm", RegexOptions.IgnoreCase);
            normalized = Regex.Replace(normalized, @"\b(\d+)\s+boards?\b", "$1 board", RegexOptions.IgnoreCase);

            normalized = Regex.Replace(normalized, @"\s+", " ").Trim();
            foreach (var (pattern, replacement) in VoiceAliases)
            {
                normalized = pattern.Replace(normalized, replacement);
            }

            normalized = Regex.Replace(normalized, @"\b(\d+(?:\.\d+)?)\s+(?:meter|metre|m)\b", "$1m", RegexOptions.IgnoreCase);
            normalized = Regex.Replace(normalized, @"\b(\d+(?:\.\d+)?)\s+(?:millimetre|mm)\b", "$1mm", RegexOptions.IgnoreCase);
            normalized = Regex.Replace(normalized, @"\b(\d+)\s+boards?\b", "$1 board", RegexOptions.IgnoreCase);
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
                else if (cleanMeasure.EndsWith("boards"))
                {
                    cleanMeasure = cleanMeasure[..^"boards".Length];
                    normalizedUnit = "board";
                }
                else if (cleanMeasure.EndsWith("board"))
                {
                    cleanMeasure = cleanMeasure[..^"board".Length];
                    normalizedUnit = "board";
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
            else if (normalizedUnit.StartsWith("board"))
            {
                normalizedUnit = "board";
            }

            if (string.IsNullOrWhiteSpace(normalizedUnit))
            {
                return cleanMeasure;
            }

            if (decimal.TryParse(cleanMeasure, out var parsedMeasure))
            {
                cleanMeasure = parsedMeasure.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture);
            }

            if (normalizedUnit == "board")
            {
                return $"{cleanMeasure} board";
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

                var hopUpMatch = Regex.Match(label, @"^(?<count>\d+)\s+boards?\s+hop\s+up(?:\s+with\s+spigot)?$", RegexOptions.IgnoreCase);
                if (hopUpMatch.Success)
                {
                    var count = hopUpMatch.Groups["count"].Value;
                    aliases.Add(new CatalogAlias { RowId = item.RowId, Side = item.Side, Phrase = $"{count} board hop up" });
                    aliases.Add(new CatalogAlias { RowId = item.RowId, Side = item.Side, Phrase = $"hop up {count} board" });
                    aliases.Add(new CatalogAlias { RowId = item.RowId, Side = item.Side, Phrase = $"{count}-board hop-up" });
                    if (label.Contains("with spigot", StringComparison.OrdinalIgnoreCase))
                    {
                        aliases.Add(new CatalogAlias { RowId = item.RowId, Side = item.Side, Phrase = $"{count} board hop up with spigot" });
                        aliases.Add(new CatalogAlias { RowId = item.RowId, Side = item.Side, Phrase = $"{count}-board hop-up with spigot" });
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
