using System.Net.Http.Headers;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using ESSDesign.Server.Models;

namespace ESSDesign.Server.Services
{
    public sealed class AdminAssistantService
    {
        // ── Public data contracts ────────────────────────────────────────────

        public sealed class ChatMessage
        {
            public string Role { get; set; } = string.Empty;
            public string Content { get; set; } = string.Empty;
        }

        public sealed class ChatResult
        {
            public string Reply { get; set; } = string.Empty;
            public List<AdminAssistantLink> Links { get; set; } = new();
            public List<string> Sources { get; set; } = new();
        }

        public sealed class AdminAssistantLink
        {
            public string Label { get; set; } = string.Empty;
            public string Url { get; set; } = string.Empty;
            public string Type { get; set; } = string.Empty;
        }

        // ── Private data types ───────────────────────────────────────────────

        private sealed class EmployeeContextRow
        {
            public string? Id { get; set; }
            public string? UserId { get; set; }
            public string FirstName { get; set; } = string.Empty;
            public string LastName { get; set; } = string.Empty;
            public string FullName { get; set; } = string.Empty;
            public string? Email { get; set; }
            public string? PhoneNumber { get; set; }
            public string? PreferredName { get; set; }
            public string? DateOfBirth { get; set; }
            public string? Gender { get; set; }
            public string? PersonalAddress { get; set; }
            public string? AddressStreet { get; set; }
            public string? AddressCity { get; set; }
            public string? AddressState { get; set; }
            public string? AddressPostalCode { get; set; }
            public string? AddressCountry { get; set; }
            public string? EmergencyContactName { get; set; }
            public string? EmergencyRelationship { get; set; }
            public string? EmergencyPhoneNumber { get; set; }
            public string? EmergencyEmail { get; set; }
            public string? EmergencyAddress { get; set; }
            public bool IsRosterEmployee { get; set; } = true;
            public bool LeadingHand { get; set; }
            public bool Verified { get; set; }
            public string? AppRole { get; set; }
            public List<string> PreferredSites { get; set; } = new();
        }

        private sealed class JobsiteContextRow
        {
            public string? Id { get; set; }
            public string? BuilderId { get; set; }
            public string BuilderName { get; set; } = string.Empty;
            public string Name { get; set; } = string.Empty;
            public string? SiteLocation { get; set; }
            public string ScaffoldEntity { get; set; } = DefaultScaffoldEntity;
            public bool Archived { get; set; }
            public string SiteKey { get; set; } = string.Empty;
            public string InductionSource { get; set; } = "explicit";
            public List<string> InductedEmployeeIds { get; set; } = new();
            public List<EmployeeContextRow> InductedEmployees { get; set; } = new();
            public string? ProjectManagerEmployeeId { get; set; }
            public string? ProjectManagerUserId { get; set; }
            public EmployeeContextRow? ProjectManager { get; set; }
            public string? SiteSupervisorEmployeeId { get; set; }
            public string? SiteSupervisorUserId { get; set; }
            public EmployeeContextRow? SiteSupervisor { get; set; }
            public string? LeadingHandEmployeeId { get; set; }
            public string? LeadingHandUserId { get; set; }
            public EmployeeContextRow? LeadingHand { get; set; }
        }

        private sealed class DesignQueryResolution
        {
            public string Query { get; set; } = string.Empty;
            public string? CorrectedFrom { get; set; }
            public string? CorrectionReason { get; set; }
            public List<object> MatchedSites { get; set; } = new();
        }

        private sealed class ProjectDataDocumentRow
        {
            public string DocumentId { get; set; } = string.Empty;
            public string Kind { get; set; } = string.Empty;
            public string KindLabel { get; set; } = string.Empty;
            public string BuilderId { get; set; } = string.Empty;
            public string BuilderName { get; set; } = string.Empty;
            public string ProjectId { get; set; } = string.Empty;
            public string ProjectName { get; set; } = string.Empty;
            public string? SiteLocation { get; set; }
            public string Name { get; set; } = string.Empty;
            public string Reference { get; set; } = string.Empty;
            public string Status { get; set; } = "Current";
            public string UploadedAt { get; set; } = string.Empty;
            public string UploadedBy { get; set; } = "Project data";
            public string? ExpiresAt { get; set; }
            public string? Location { get; set; }
            public string? StoragePath { get; set; }
            public string? FormId { get; set; }
            public long? Size { get; set; }
            public Dictionary<string, string> Details { get; set; } = new(StringComparer.OrdinalIgnoreCase);
            public int MatchScore { get; set; }
            public List<string> MatchedTerms { get; set; } = new();
        }

        private sealed class TruckLiveLocationContext
        {
            public string TruckId { get; set; } = string.Empty;
            public string TruckLabel { get; set; } = string.Empty;
            public string RoleName { get; set; } = string.Empty;
            public string? DriverUserId { get; set; }
            public string? DeliveryRequestId { get; set; }
            public double Latitude { get; set; }
            public double Longitude { get; set; }
            public double? AccuracyM { get; set; }
            public double? HeadingDeg { get; set; }
            public double? SpeedMps { get; set; }
            public double? BatteryPercent { get; set; }
            public string Status { get; set; } = string.Empty;
            public string RecordedAt { get; set; } = string.Empty;
            public string UpdatedAt { get; set; } = string.Empty;
            public int AgeMinutes { get; set; }
            public bool IsStale { get; set; }
            public bool IsOffline { get; set; }
            public string Freshness { get; set; } = string.Empty;
            public string StatusLabel { get; set; } = string.Empty;
            public string Coordinates { get; set; } = string.Empty;
            public string MapUrl { get; set; } = string.Empty;
        }

        // ── Constants ────────────────────────────────────────────────────────

        private const string SafetyBucket = "project-information";
        private const string SafetyProjectsPath = "projects.json";
        private const string DefaultScaffoldEntity = "Erect Safe Scaffolding";
        private const string MaterialRequestsPath = "material-order-requests/index.json";
        private const string MaterialRequestsTable = "ess_material_order_requests";
        private const string TruckLiveLocationsTable = "ess_truck_live_locations";

        private static readonly (string TruckId, string Label, string RoleName, string Number)[] KnownTruckLanes =
        {
            ("truck-1", "ESS01", "truck_ess01", "1"),
            ("truck-2", "ESS02", "truck_ess02", "2"),
            ("truck-3", "ESS03", "truck_ess03", "3"),
        };

        private static readonly Dictionary<string, (string Label, string Spec)> MaterialOrderQuantityLabels = new(StringComparer.OrdinalIgnoreCase)
        {
            ["r09_left_qty"] = ("STANDARDS", "3.0M"),
            ["r09_middle_qty"] = ("HARDWOOD SOLE BOARDS", "0.5M"),
            ["r09_right_qty"] = ("SCAFFOLD LADDER", "6.0M / 5.4M"),
            ["r10_left_qty"] = ("STANDARDS", "2.5M"),
            ["r10_middle_qty"] = ("HARDWOOD SOLE BOARDS", "1.5M"),
            ["r10_right_qty"] = ("SCAFFOLD LADDER", "4.8M / 4.2M"),
            ["r11_left_qty"] = ("STANDARDS", "2.0M"),
            ["r11_middle_qty"] = ("SCREWJACKS", ""),
            ["r11_right_qty"] = ("3.6m", ""),
            ["r12_left_qty"] = ("STANDARDS", "1.5M"),
            ["r12_middle_qty"] = ("U HEAD JACK", ""),
            ["r12_right_qty"] = ("3m", ""),
            ["r13_left_qty"] = ("STANDARDS", "1.0M"),
            ["r13_middle_qty"] = ("SWIVEL JACK", ""),
            ["r13_right_qty"] = ("2.4m", ""),
            ["r14_left_qty"] = ("STANDARDS", "0.5M"),
            ["r14_middle_qty"] = ("TIMBER BOARDS", ""),
            ["r14_right_qty"] = ("LADDER HATCHES", ""),
            ["r15_left_qty"] = ("STANDARD INTERMEDIATE", "2M LOCK"),
            ["r15_middle_qty"] = ("TIMBER BOARDS", "3.6M"),
            ["r15_right_qty"] = ("CORNER BRACKET", "1 X 2"),
            ["r16_left_qty"] = ("OPEN END", "3.0M"),
            ["r16_middle_qty"] = ("TIMBER BOARDS", "3.0M"),
            ["r16_right_qty"] = ("CORNER BRACKET", "2 X 2"),
            ["r17_left_qty"] = ("OPEN END", "2.5M"),
            ["r17_middle_qty"] = ("TIMBER BOARDS", "2.4M"),
            ["r17_right_qty"] = ("CORNER BRACKET", "2 X 3"),
            ["r18_left_qty"] = ("OPEN END", "2.0M"),
            ["r18_middle_qty"] = ("TIMBER BOARDS", "1.8M"),
            ["r18_right_qty"] = ("HANDRAIL POST (STANDARD)", "1M"),
            ["r19_left_qty"] = ("OPEN END", "1.5M"),
            ["r19_middle_qty"] = ("TIMBER BOARDS", "1.5M"),
            ["r19_right_qty"] = ("HANDRAIL TIE POST", "0.75"),
            ["r20_left_qty"] = ("OPEN END", "1.0M"),
            ["r20_middle_qty"] = ("TIMBER BOARDS", "1.2M"),
            ["r20_right_qty"] = ("HANDRAIL TIE POST", "0.3"),
            ["r21_left_qty"] = ("STANDARD 1 STAR OPEN END", "0.5M"),
            ["r21_middle_qty"] = ("SCAFFOLD CLIPS", ""),
            ["r21_right_qty"] = ("WALL TIE BRACKETS", ""),
            ["r22_left_qty"] = ("LEDGERS", "2.4M"),
            ["r22_middle_qty"] = ("DOUBLE CLIP 90 DEGREES", ""),
            ["r22_right_qty"] = ("WALL TIE DOUBLE", ""),
            ["r23_left_qty"] = ("LEDGERS", "1.8M"),
            ["r23_middle_qty"] = ("DOUBLE SAFETY", ""),
            ["r23_right_qty"] = ("WALL TIE SAFETY", ""),
            ["r24_left_qty"] = ("LEDGERS", "1.2M"),
            ["r24_middle_qty"] = ("SWIVEL", ""),
            ["r24_right_qty"] = ("LADDER BEAMS", "6.3"),
            ["r25_left_qty"] = ("LEDGERS", "9.5M"),
            ["r25_middle_qty"] = ("SWIVEL SAFETY", ""),
            ["r25_right_qty"] = ("LADDER BEAMS", "5m"),
            ["r26_left_qty"] = ("LEDGERS", "0.7M"),
            ["r26_middle_qty"] = ("PUTLOG CLIPS", ""),
            ["r26_right_qty"] = ("LADDER BEAMS", "4.2"),
            ["r27_left_qty"] = ("LEDGERS", "1 BOARD"),
            ["r27_middle_qty"] = ("JOINERS INTERNAL / EXTERNAL", ""),
            ["r27_right_qty"] = ("LADDER BEAMS", "3.0M"),
            ["r28_left_qty"] = ("TRANSOMS", "2.4M"),
            ["r28_middle_qty"] = ("BEAM CLAMPS", ""),
            ["r28_right_qty"] = ("PALLET CAGE", ""),
            ["r29_left_qty"] = ("TRANSOMS", "1.8M"),
            ["r29_middle_qty"] = ("TOE BOARD CLIPS", ""),
            ["r29_right_qty"] = ("PALLETS", ""),
            ["r30_left_qty"] = ("TRANSOMS", "1.2M"),
            ["r30_middle_qty"] = ("COUPLER CLIPS", ""),
            ["r30_right_qty"] = ("PALLET CASTOR", ""),
            ["r31_left_qty"] = ("TRANSOMS", "9.50M"),
            ["r31_middle_qty"] = ("TOE BOARD SPADES", ""),
            ["r31_right_qty"] = ("UNIT BEAMS", ""),
            ["r32_left_qty"] = ("TRANSOMS", "0.7M"),
            ["r32_middle_qty"] = ("V CLIPS", ""),
            ["r32_right_qty"] = ("UNIT BEAMS", ""),
            ["r33_left_qty"] = ("TRANSOMS 2 BOARD", "0.51M"),
            ["r34_left_qty"] = ("TRANSOMS 2 BOARD", "0.48M"),
            ["r34_right_qty"] = ("UNIT BEAMS", "3.6M"),
            ["r35_left_qty"] = ("TRANSOMS 1 BOARD", "1 BOARD"),
            ["r35_middle_qty"] = ("SCAFFOLD TUBE", ""),
            ["r35_right_qty"] = ("TRANSOM TRUSS", "2.4M"),
            ["r36_left_qty"] = ("LADDER TRANSOMS", ""),
            ["r36_middle_qty"] = ("SCAFFOLD TUBE", "6.0M"),
            ["r36_right_qty"] = ("TRANSOM TRUSS", "1.8M"),
            ["r37_left_qty"] = ("LADDER TRANSOMS", "1.2M"),
            ["r37_middle_qty"] = ("SCAFFOLD TUBE", "5.4M"),
            ["r37_right_qty"] = ("TRANSOM TRUSS", "1.2M"),
            ["r38_left_qty"] = ("DIAGONAL BRACES", "3.6M"),
            ["r38_middle_qty"] = ("SCAFFOLD TUBE", "4.8M"),
            ["r38_right_qty"] = ("LAP PLATES", "2 BOARD"),
            ["r39_left_qty"] = ("DIAGONAL BRACES", "3.2M"),
            ["r39_middle_qty"] = ("SCAFFOLD TUBE", "4.2M"),
            ["r39_right_qty"] = ("LAP PLATES", "3 BOARD"),
            ["r40_left_qty"] = ("DIAGONAL BRACES", "2.7M"),
            ["r40_middle_qty"] = ("SCAFFOLD TUBE", "3.6M"),
            ["r40_right_qty"] = ("CASTOR WHEELS", ""),
            ["r41_left_qty"] = ("DIAGONAL BRACES", "1.9M"),
            ["r41_middle_qty"] = ("SCAFFOLD TUBE", "3.0M"),
            ["r42_left_qty"] = ("STEEL BOARDS", "2.4M"),
            ["r42_middle_qty"] = ("2.4", "M"),
            ["r42_right_qty"] = ("CHAIN/SHADE BLUE", "15M"),
            ["r43_left_qty"] = ("STEEL BOARDS", "1.8M"),
            ["r43_middle_qty"] = ("1.8", "M"),
            ["r43_right_qty"] = ("CHAIN/SHADE GREEN", "15M"),
            ["r44_left_qty"] = ("STEEL BOARDS", "1.2M"),
            ["r44_middle_qty"] = ("1.5", "M"),
            ["r44_right_qty"] = ("CHAIN/SHADE BLACK", "15M"),
            ["r45_left_qty"] = ("STEEL BOARDS", "0.95M"),
            ["r45_middle_qty"] = ("1.2", "M"),
            ["r45_right_qty"] = ("CHAIN/SHADE", "0.9 mm"),
            ["r46_left_qty"] = ("STEEL BOARDS", "0.745"),
            ["r46_middle_qty"] = ("0.9", "mm"),
            ["r46_right_qty"] = ("CHAIN WIRE 15M / SHADE 50M", ""),
            ["r47_left_qty"] = ("INFILL BOARDS", "2.4M"),
            ["r47_middle_qty"] = ("SCAFFOLD TUBE", "0.6MM"),
            ["r47_right_qty"] = ("SCREW BOLTS 100MM", "12MM"),
            ["r48_left_qty"] = ("INFILL BOARDS", "1.8M"),
            ["r48_middle_qty"] = ("SCAFFOLD TUBE", "0.3MM"),
            ["r48_right_qty"] = ("SCREW BOLTS 75MM", "12MM"),
            ["r49_left_qty"] = ("INFILL BOARDS", "1.2M"),
            ["r49_middle_qty"] = ("SCAFFOLD STAIRS", ""),
            ["r49_right_qty"] = ("TECH SCREWS", "90MM"),
            ["r50_left_qty"] = ("HOP-UP 3 SPIGOTS", ""),
            ["r50_middle_qty"] = ("ALUMINIUM STAIRS", ""),
            ["r50_right_qty"] = ("TECH SCREWS", "45MM"),
            ["r51_left_qty"] = ("HOP-UP 2 SPIGOTS", ""),
            ["r51_middle_qty"] = ("ALUMINIUM HANDRAIL", ""),
            ["r51_right_qty"] = ("TECH SCREWS TIMBER", "45MM"),
            ["r52_left_qty"] = ("HOP-UP BRACKETS 3", "3 BOARD"),
            ["r52_middle_qty"] = ("ALUMINIUM TOP RAIL", ""),
            ["r52_right_qty"] = ("PLYWOOD 17MM / 12MM", ""),
            ["r53_left_qty"] = ("HOP-UP BRACKETS 2", "2 BOARD"),
            ["r53_middle_qty"] = ("STAIR BOLTS", ""),
            ["r53_right_qty"] = ("3/2 TIMBERS", ""),
            ["r54_left_qty"] = ("HOP-UP BRACKETS 1", "1 BOARD"),
            ["r54_middle_qty"] = ("STAIR STRINGER", ""),
            ["r54_right_qty"] = ("TIE WIRE", ""),
            ["r55_left_qty"] = ("TIE BARS", "2.4M"),
            ["r55_middle_qty"] = ("1 BOARD STEP DOWNS", "1 BOARD"),
            ["r55_right_qty"] = ("INCOMPLETE SIGNS", ""),
            ["r56_left_qty"] = ("TIE BARS", "1.8M"),
            ["r56_middle_qty"] = ("2 BOARD STEP DOWNS", "2 BOARD"),
            ["r56_right_qty"] = ("SCAFF TAGS", ""),
            ["r57_left_qty"] = ("TIE BARS", "1.2M"),
            ["r57_middle_qty"] = ("ALUMINIUM STAIR RISER", "2.0M"),
            ["r57_right_qty"] = ("M20 TREAD ROD", ""),
            ["r58_left_qty"] = ("TIE BARS", "0.745"),
            ["r58_middle_qty"] = ("ALUMINIUM STAIR RISER", "1.0M"),
            ["r58_right_qty"] = ("UNIT BEAM BRACKETS", ""),
            ["r59_left_qty"] = ("LEDGER", "3.0M"),
            ["r59_middle_qty"] = ("STAIR BOLTS", ""),
            ["r60_left_qty"] = ("STEEL BOARDS", "3M"),
            ["r60_middle_qty"] = ("STAIR DOOR", ""),
        };

        // ── Fields and constructor ────────────────────────────────────────────

        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;
        private readonly SupabaseService _supabaseService;
        private readonly DeliveryAnalysisService _deliveryAnalysisService;
        private readonly ILogger<AdminAssistantService> _logger;
        private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web);

        public AdminAssistantService(
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            SupabaseService supabaseService,
            DeliveryAnalysisService deliveryAnalysisService,
            ILogger<AdminAssistantService> logger)
        {
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
            _supabaseService = supabaseService;
            _deliveryAnalysisService = deliveryAnalysisService;
            _logger = logger;
        }

        // ── Public API ────────────────────────────────────────────────────────

        public async Task<ChatResult> AskAsync(
            string question,
            IReadOnlyList<ChatMessage>? history,
            UserInfo currentUser,
            CancellationToken cancellationToken)
        {
            var cleanQuestion = (question ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(cleanQuestion))
                throw new InvalidOperationException("Question is required.");

            var deterministicAnswer = await TryAnswerScaffoldEntityQuestionAsync(cleanQuestion, cancellationToken);
            if (deterministicAnswer != null)
                return deterministicAnswer;

            var apiKey = _configuration["OpenAI:ApiKey"];
            if (string.IsNullOrWhiteSpace(apiKey))
                return new ChatResult
                {
                    Reply = "The AI model is not connected because OpenAI:ApiKey is not configured on the server.",
                    Links = new List<AdminAssistantLink>(),
                    Sources = new List<string>(),
                };

            var model = _configuration["OpenAI:AdminAssistantModel"]
                ?? _configuration["OpenAI:Model"]
                ?? "gpt-4o-mini";

            return await RunAgentLoopAsync(cleanQuestion, history, currentUser, apiKey, model, cancellationToken);
        }

        private async Task<ChatResult?> TryAnswerScaffoldEntityQuestionAsync(string question, CancellationToken ct)
        {
            var normalizedQuestion = NormalizeSearchText(question);
            if (!IsScaffoldEntityQuestion(normalizedQuestion))
                return null;

            var jobsites = await FetchJobsiteDirectoryAsync(ct);
            var includeArchived = normalizedQuestion.Contains("archived", StringComparison.OrdinalIgnoreCase)
                || normalizedQuestion.Contains("deleted", StringComparison.OrdinalIgnoreCase)
                || normalizedQuestion.Contains("inactive", StringComparison.OrdinalIgnoreCase);
            var tokens = BuildBroadSearchTokens(question)
                .Where(token => !ScaffoldEntityQuestionStopWords.Contains(token))
                .ToList();

            var matches = RankMatchingJobsites(jobsites, tokens, normalizedQuestion, includeArchived)
                .Take(8)
                .ToList();

            if (matches.Count == 0)
                return null;

            var exactAddressMatches = FilterToLikelyExactAddressMatches(matches, normalizedQuestion);
            if (exactAddressMatches.Count > 0)
                matches = exactAddressMatches;

            var activeLabel = includeArchived ? "matching" : "active";
            string reply;
            if (matches.Count == 1)
            {
                var site = matches[0];
                reply = $"{SiteLabel(site)} is under {site.ScaffoldEntity}.";
            }
            else if (matches.Select(site => site.ScaffoldEntity).Distinct(StringComparer.OrdinalIgnoreCase).Count() == 1)
            {
                var entity = matches[0].ScaffoldEntity;
                var siteList = string.Join("; ", matches.Select(SiteLabel));
                reply = $"You're right - the {activeLabel} {BestSiteReference(matches, normalizedQuestion)} job-sites are under {entity}: {siteList}.";
            }
            else
            {
                var siteList = string.Join("; ", matches.Select(site => $"{SiteLabel(site)} is under {site.ScaffoldEntity}"));
                reply = $"There are multiple {activeLabel} matches, so the entity depends on the builder: {siteList}.";
            }

            return new ChatResult
            {
                Reply = reply,
                Links = new List<AdminAssistantLink>(),
                Sources = new List<string> { "Project data job-site registry" },
            };
        }

        // ── Agent Loop ────────────────────────────────────────────────────────

        private static readonly HashSet<string> ScaffoldEntityQuestionStopWords = new(StringComparer.OrdinalIgnoreCase)
        {
            "site", "job", "project", "company", "entity", "associated", "belongs", "belong",
            "under", "with", "what", "which", "who", "is", "are", "the", "at", "to",
            "erect", "safe", "scaffolding", "maloo", "access", "group", "scaff", "technic",
        };

        private static bool IsScaffoldEntityQuestion(string normalizedQuestion)
        {
            if (string.IsNullOrWhiteSpace(normalizedQuestion))
                return false;

            var mentionsKnownEntity = normalizedQuestion.Contains("maloo", StringComparison.OrdinalIgnoreCase)
                || normalizedQuestion.Contains("erect safe", StringComparison.OrdinalIgnoreCase)
                || normalizedQuestion.Contains("scaff technic", StringComparison.OrdinalIgnoreCase)
                || normalizedQuestion.Contains("scafftechnic", StringComparison.OrdinalIgnoreCase);
            var asksEntity = normalizedQuestion.Contains("scaffold entity", StringComparison.OrdinalIgnoreCase)
                || normalizedQuestion.Contains(" entity", StringComparison.OrdinalIgnoreCase)
                || normalizedQuestion.Contains("company", StringComparison.OrdinalIgnoreCase)
                || normalizedQuestion.Contains("associated", StringComparison.OrdinalIgnoreCase)
                || normalizedQuestion.Contains("belongs", StringComparison.OrdinalIgnoreCase)
                || normalizedQuestion.Contains("under", StringComparison.OrdinalIgnoreCase);
            var mentionsSiteContext = normalizedQuestion.Contains("site", StringComparison.OrdinalIgnoreCase)
                || normalizedQuestion.Contains("job", StringComparison.OrdinalIgnoreCase)
                || normalizedQuestion.Contains("project", StringComparison.OrdinalIgnoreCase)
                || normalizedQuestion.Contains("place", StringComparison.OrdinalIgnoreCase)
                || normalizedQuestion.Contains("street", StringComparison.OrdinalIgnoreCase)
                || BuildNumericSearchTokens(normalizedQuestion).Count > 0;

            return mentionsSiteContext && (asksEntity || mentionsKnownEntity);
        }

        private static List<JobsiteContextRow> FilterToLikelyExactAddressMatches(
            IReadOnlyList<JobsiteContextRow> matches,
            string normalizedQuestion)
        {
            var numericTokens = BuildNumericSearchTokens(normalizedQuestion);
            if (numericTokens.Count == 0)
                return new List<JobsiteContextRow>();

            return matches
                .Where(site =>
                {
                    var siteText = NormalizeSearchText($"{site.Name} {site.SiteLocation}");
                    return numericTokens.All(token => NumericTokenAppears(siteText, token));
                })
                .ToList();
        }

        private static string SiteLabel(JobsiteContextRow site)
        {
            var location = string.IsNullOrWhiteSpace(site.SiteLocation) || site.SiteLocation.Equals(site.Name, StringComparison.OrdinalIgnoreCase)
                ? string.Empty
                : $" at {site.SiteLocation}";
            return $"{site.BuilderName} - {site.Name}{location}";
        }

        private static string BestSiteReference(IReadOnlyList<JobsiteContextRow> matches, string normalizedQuestion)
        {
            var first = matches.FirstOrDefault();
            if (first == null)
                return "matching";

            var numericTokens = BuildNumericSearchTokens(normalizedQuestion);
            if (numericTokens.Count > 0)
            {
                var text = first.SiteLocation ?? first.Name;
                var parts = text.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                var partWithNumber = parts.FirstOrDefault(part =>
                    numericTokens.Any(token => NumericTokenAppears(NormalizeSearchText(part), token)));
                if (!string.IsNullOrWhiteSpace(partWithNumber))
                    return partWithNumber;
            }

            return first.Name;
        }

        private async Task<ChatResult> RunAgentLoopAsync(
            string question,
            IReadOnlyList<ChatMessage>? history,
            UserInfo currentUser,
            string apiKey,
            string model,
            CancellationToken cancellationToken)
        {
            var today = GetSydneyToday();
            var collectedLinks = new List<AdminAssistantLink>();
            var verifiedEvidence = await BuildVerifiedEvidencePackAsync(question, currentUser, cancellationToken);

            var systemPrompt = $"""
You are Cori, the ESS Design assistant. You work at Erect Safe Scaffolding and know the business inside out — the sites, the crew, the trucks, the designs, everything. You talk like a real person who works here, not a customer service bot.

Today is {today:dddd, MMMM d, yyyy}. The person you're talking to is {currentUser.FullName}.
Current user profile: {FormatUserProfileForPrompt(currentUser)}

ESS Design runs scaffolding projects across Sydney. The app tracks job-sites, builders, employees, inductions, design documents (PDFs), rosters, material deliveries, live truck GPS, and user accounts.
Each job-site also has a scaffold entity: Erect Safe Scaffolding, Maloo Access Group, or Scaff-Technic. Use that field when someone asks which company/entity a site belongs to, or asks about ESS, Maloo, or Scaff-Technic sites.
Project data is site-specific information stored against a builder and job-site. It includes scaff-tags, SWMS PDFs, handover certificates, day labour forms, and project data design-document PDFs. Use the project data tools for questions about those site files, generated form details, the latest site document, or opening/downloading a Project data document.

The ESS yard is at 130 Gilba Road, Girraween NSW 2145. That's what people mean when they say "the yard" or "the depot".

You have tools — use them to look up real data before answering. Never make up names, addresses, dates, or document titles. Chain tool calls as needed to get the full picture.

SITE ROLE ASSIGNMENTS:
- For questions like "who is the site supervisor/project manager/leading hand at a site", use the job-site assignment fields returned by get_jobsites, get_site_details, get_builder_sites, or get_site_health_report first.
- Do not infer assigned site supervisors only from inducted employees. Inducted employees are the worker list for a site; the registered supervisor can be stored separately as siteSupervisor.
- If multiple job-sites match the same address or name, answer for each matching builder/site when the tool result gives more than one match.

DESIGN SEARCH SAFETY:
- If a design-search tool returns correctedFrom or correctionReason, mention the correction before giving the answer.
- Treat design requests as natural descriptions, not exact PDF-title searches. Correct obvious spelling mistakes and common shorthand like demo/demolition when choosing between results.
- Do not call get_design_link unless the returned design clearly matches the corrected query/site/scaffold. If the design result says count is 0, or the site is ambiguous, ask for the builder/site instead of linking a best guess.
- Treat address numbers as important. Never silently answer a design request for a different street number.

PROJECT DATA:
- For SWMS, scaff-tags, handover certificates, day labour forms, and site-specific Project data design PDFs, use search_project_data_documents or get_latest_project_data_document before answering.
- For generated scaff-tags and handover certificates, the project data tools return form details from the stored JSON, so answer questions from those details.
- For uploaded PDFs such as SWMS, day labour, and Project data design-document files, answer from the file metadata/title unless details are returned by the tools.
- When someone wants to view, open, print, or download a Project data document, call get_project_data_document_link with the documentId from the Project data search/latest result and tell them to use the link below.

STAFF PROFILE DETAILS:
- Employee phone numbers, email addresses, personal addresses, dates of birth, and emergency contact details are normal ESS profile fields. Answer these questions directly when the information is returned by your tools.
- Do not refuse profile-detail requests because they involve phone numbers or personal/contact information. Use the database result and keep the answer concise.
- If the tool result does not include the requested profile detail, say that ESS does not have that detail recorded for the person.

When someone wants to open or view a design document, call get_design_link and tell them to use the link below. Never paste raw URLs in your reply.

HOW TO TALK:
- Sound like a real person, not a template. Every response should feel fresh.
- Vary your sentence structure constantly. Some answers short, some longer. Mix it up.
- Never use bullet points, dashes, bold text, numbered lists, tables, or markdown. Just natural flowing sentences.
- Never open with "Sure!", "Of course!", "Great question!", "Absolutely!", "No worries!" or any filler affirmation.
- Never close with "Let me know if you need anything else!", "Just give me a shout!", "Anything else I can help with?" or any robotic sign-off. Just stop talking when you've answered the question.
- Be direct. If you know the answer, say it. Don't pad it out.
- Use casual Aussie-friendly language where it feels natural — relaxed but professional.
- React naturally to what you find. If something is surprising or notable, say so.

WHEN SOMEONE ISN'T FOUND:
- Phone numbers, email addresses, personal addresses, dates of birth, and emergency contact details are stored in ESS profiles when available. Use search_employees, get_employee_details, or get_user_roles before answering questions about them.
- Only provide what the tools return, and do not invent missing phone numbers, addresses, dates of birth, or emergency contacts.
- If an employee search returns suggestions (similar names), say something like "I couldn't find [name] exactly — did you mean [suggestion]?"
- If someone isn't in the employee roster but they're described as an admin, manager, or office user, check get_user_roles — they may be a user account without a field employee profile.
- The current user ({currentUser.FullName}, {currentUser.Email}) is always in the system even if not in the employee roster.

WHEN THINGS GO WRONG:
- If a tool returns an error, try a different approach rather than giving up. For delivery details, use the ID from get_active_deliveries results.
- Never tell the user you're "looking into it" or "hang tight" and then just repeat the same info — actually try again differently.
""";

            var messages = new List<object> { new { role = "system", content = systemPrompt } };
            messages.Add(new
            {
                role = "system",
                content = $"""
VERIFIED ESS DATA FOR THIS QUESTION:
{verifiedEvidence}

Rules for using this data:
- Treat this as database evidence, not a suggestion.
- Prefer exact site, builder, person, document, and date matches from this evidence.
- If multiple records match, either answer each matching record or ask for the missing builder/site detail.
- If this evidence is not enough, call tools before answering.
""",
            });

            foreach (var msg in (history ?? Array.Empty<ChatMessage>()).TakeLast(10))
            {
                if (!string.IsNullOrWhiteSpace(msg.Content))
                    messages.Add(new { role = msg.Role.ToLowerInvariant() == "assistant" ? "assistant" : "user", content = msg.Content });
            }

            messages.Add(new { role = "user", content = question });

            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(120);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

            for (var iteration = 0; iteration < 10; iteration++)
            {
                var payload = new
                {
                    model,
                    temperature = 0.2,
                    messages = messages.ToArray(),
                    tools = GetToolDefinitions(),
                    tool_choice = "auto",
                };

                using var httpRequest = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/chat/completions")
                {
                    Content = new StringContent(JsonSerializer.Serialize(payload, _jsonOptions), Encoding.UTF8, "application/json"),
                };

                using var response = await client.SendAsync(httpRequest, cancellationToken);
                var body = await response.Content.ReadAsStringAsync(cancellationToken);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("OpenAI agent request failed: {StatusCode} {Body}", response.StatusCode, body);
                    return new ChatResult
                    {
                        Reply = "The AI model request failed. Please try again in a moment.",
                        Links = collectedLinks,
                        Sources = new List<string>(),
                    };
                }

                using var doc = JsonDocument.Parse(body);
                var choice = doc.RootElement.GetProperty("choices")[0];
                var finishReason = choice.GetProperty("finish_reason").GetString();
                var message = choice.GetProperty("message");
                var content = message.TryGetProperty("content", out var contentProp) && contentProp.ValueKind != JsonValueKind.Null
                    ? contentProp.GetString()
                    : null;

                var hasToolCalls = message.TryGetProperty("tool_calls", out var toolCallsProp)
                    && toolCallsProp.ValueKind == JsonValueKind.Array
                    && toolCallsProp.GetArrayLength() > 0;

                if (finishReason == "stop" || !hasToolCalls)
                {
                    return new ChatResult
                    {
                        Reply = CleanAssistantReply(content),
                        Links = collectedLinks,
                        Sources = new List<string>(),
                    };
                }

                // Reconstruct assistant message with tool_calls for the conversation
                var toolCallItems = toolCallsProp.EnumerateArray().Select(tc => new
                {
                    id = tc.GetProperty("id").GetString() ?? string.Empty,
                    type = "function",
                    function = new
                    {
                        name = tc.GetProperty("function").GetProperty("name").GetString() ?? string.Empty,
                        arguments = tc.GetProperty("function").GetProperty("arguments").GetString() ?? "{}",
                    }
                }).ToArray();

                messages.Add(new { role = "assistant", content, tool_calls = toolCallItems });

                // Execute each tool call and append results
                foreach (var toolCall in toolCallsProp.EnumerateArray())
                {
                    var toolCallId = toolCall.GetProperty("id").GetString() ?? string.Empty;
                    var functionName = toolCall.GetProperty("function").GetProperty("name").GetString() ?? string.Empty;
                    var argumentsJson = toolCall.GetProperty("function").GetProperty("arguments").GetString() ?? "{}";

                    JsonElement args;
                    try { args = JsonDocument.Parse(argumentsJson).RootElement; }
                    catch { args = JsonDocument.Parse("{}").RootElement; }

                    string toolResult;
                    try
                    {
                        toolResult = await ExecuteToolAsync(functionName, args, collectedLinks, cancellationToken);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Tool execution failed: {ToolName}", functionName);
                        toolResult = JsonSerializer.Serialize(new { error = $"Tool execution failed: {ex.Message}" }, _jsonOptions);
                    }

                    messages.Add(new { role = "tool", tool_call_id = toolCallId, content = toolResult });
                }
            }

            return new ChatResult
            {
                Reply = "I was unable to complete the request. Please try rephrasing your question.",
                Links = collectedLinks,
                Sources = new List<string>(),
            };
        }

        // ── Tool Definitions ──────────────────────────────────────────────────

        private static object[] GetToolDefinitions() => new object[]
        {
            Fn("get_current_date", "Get today's date and time in Sydney, Australia.", new { type = "object", properties = new { }, required = Array.Empty<string>() }),
            Fn("search_employees", "Search and list employees by name, role, or status. Use this to find employees, check who is a leading hand, check verification status, or list all employees.",
                Params(
                    ("name", "string", "Partial or full name to search for. Leave empty to list all."),
                    ("role", "string", "Filter by app role: admin, scaffold_designer, site_supervisor, project_manager, leading_hand, general_scaffolder, transport_management, viewer"),
                    ("leading_hand", "boolean", "If true, return only leading hands"),
                    ("verified", "boolean", "If true, return only verified employees"),
                    ("limit", "integer", "Maximum number of results to return (default 50)"))),
            Fn("get_employee_details", "Get full details about a specific employee including their app role, induction sites, and roster status.",
                Params(("employee_name", "string", "The name of the employee to look up"))),
            Fn("get_jobsites", "Search and list job-sites (scaffolding projects). Use this to find sites by name, builder, or location.",
                Params(
                    ("name", "string", "Partial or full site name to search for"),
                    ("builder", "string", "Filter by builder/company name"),
                    ("location", "string", "Filter by suburb or address"),
                    ("scaffold_entity", "string", "Filter by scaffold entity: Erect Safe Scaffolding, Maloo Access Group, or Scaff-Technic"),
                    ("archived", "boolean", "If true return archived sites, if false return active sites only. Leave unset for all."),
                    ("limit", "integer", "Maximum results (default 30)"))),
            Fn("get_site_details", "Get full details about a specific job-site including assigned project manager, assigned site supervisor, assigned leading hand, inducted employees, builder, and location.",
                Params(("site_name", "string", "The name of the job-site to look up"))),
            Fn("get_builder_sites", "Get all job-sites for a specific builder/company.",
                Params(("builder_name", "string", "The builder or company name"))),
            Fn("get_inducted_employees_for_site", "Get the list of employees inducted at a specific job-site. Do not use this by itself to answer who the assigned site supervisor, project manager, or leading hand is; use get_site_details for assignments.",
                Params(("site_name", "string", "The name of the job-site"))),
            Fn("get_employee_inductions", "Get all job-sites that a specific employee is inducted on.",
                Params(("employee_name", "string", "The name of the employee"))),
            Fn("search_designs", "Search for scaffolding design documents by job-site name, scaffold type, folder name, or any keyword. Returns document names, folder paths, revision numbers, and document IDs for link generation.",
                Params(
                    ("query", "string", "Search terms: site name, scaffold description, builder, or filename"),
                    ("sort_by", "string", "How to sort results: 'relevance' (default) or 'date' (newest first)"))),
            Fn("get_latest_design", "Find the most recently uploaded design document, optionally filtered to a specific site or topic.",
                Params(("query", "string", "Optional: filter to a specific site, scaffold type, or builder"))),
            Fn("get_design_revisions", "Get all design revisions for a specific scaffold or folder — use when the user wants revision history or all versions.",
                Params(("query", "string", "Site name, scaffold name, or folder path to find revisions for"))),
            Fn("get_design_link", "Generate a clickable download link for a specific design document. Call this when the user wants to open, view, or access a document. Pass the document_id from search_designs results.",
                Params(
                    ("document_id", "string", "The document ID (UUID) from search_designs results"),
                    ("type", "string", "Document type: 'ess' for ESS Design Issue, 'third_party' for third-party design. Default is 'ess'."))),
            Fn("get_folder_contents", "List all design documents inside a specific folder by folder path or name.",
                Params(("folder_path", "string", "The folder path or name to list contents of"))),
            Fn("search_project_data_documents", "Search Project data documents for a site, builder, or keyword. Covers scaff-tags, SWMS PDFs, handover certificates, day labour forms, and Project data design-document PDFs.",
                Params(
                    ("query", "string", "Search terms such as site, address, scaffold reference, document name, location, or uploaded-by name"),
                    ("builder", "string", "Optional builder/company filter"),
                    ("project", "string", "Optional project/site filter"),
                    ("kind", "string", "Optional document type: scaff-tags, swms, handover-certificates, day-labour-forms, or design-document"),
                    ("include_archived", "boolean", "Include archived job-sites (default false)"),
                    ("limit", "integer", "Maximum results to return (default 10, max 30)"))),
            Fn("get_latest_project_data_document", "Find the most recently updated Project data document, optionally filtered by site, builder, keyword, or document type.",
                Params(
                    ("query", "string", "Optional search terms such as site, address, scaffold reference, or document name"),
                    ("builder", "string", "Optional builder/company filter"),
                    ("project", "string", "Optional project/site filter"),
                    ("kind", "string", "Optional document type: scaff-tags, swms, handover-certificates, day-labour-forms, or design-document"),
                    ("include_archived", "boolean", "Include archived job-sites (default false)"))),
            Fn("get_project_data_document_link", "Generate a clickable view/download link for a Project data document. Prefer the documentId returned by search_project_data_documents or get_latest_project_data_document. If only a form reference/name was provided, pass it as document_id with optional builder/project/kind filters.",
                Params(
                    ("document_id", "string", "The Project data documentId returned by a Project data search/latest tool, or a form ID/reference/name to resolve"),
                    ("builder", "string", "Optional builder/company filter when resolving a loose document_id"),
                    ("project", "string", "Optional project/site filter when resolving a loose document_id"),
                    ("kind", "string", "Optional document type: scaff-tags, swms, handover-certificates, day-labour-forms, or design-document"))),
            Fn("get_roster", "Get the roster/schedule showing which employees are planned to work on a given date or date range.",
                Params(
                    ("date", "string", "Date in yyyy-MM-dd format. Defaults to today."),
                    ("days", "integer", "Number of days ahead to return (default 1, max 14)"))),
            Fn("get_deliveries", "Get material delivery orders scheduled for a specific date or date range.",
                Params(
                    ("date", "string", "Date in yyyy-MM-dd format. Defaults to today."),
                    ("days", "integer", "Number of days ahead to include (default 1, max 14)"),
                    ("include_archived", "boolean", "Include completed/archived deliveries (default false)"))),
            Fn("get_delivery_detail", "Get full details of a specific material delivery order including all materials requested.",
                Params(("request_id", "string", "The delivery request ID"))),
            Fn("get_active_deliveries", "Get all currently active (unarchived) material delivery orders, including scheduled and unscheduled ones.",
                Params(
                    ("scheduled_only", "boolean", "If true, return only orders that are currently on the schedule"))),
            Fn("get_truck_locations", "Get live GPS locations for ESS trucks. Returns current position, speed, status, and last ping time.",
                Params(("truck", "string", "Specific truck to query: ESS01, ESS02, ESS03, or leave empty for all trucks"))),
            Fn("get_notifications", "Get recent app notifications sent to users.",
                Params(
                    ("user_name", "string", "Filter to a specific user's notifications"),
                    ("limit", "integer", "Number of notifications to return (default 20, max 100)"))),
            Fn("get_user_roles", "Get user accounts, app roles, and profile contact details including phone, address, and emergency contacts.",
                Params(
                    ("role", "string", "Filter by role: admin, scaffold_designer, site_supervisor, project_manager, leading_hand, general_scaffolder, transport_management, viewer"),
                    ("name", "string", "Filter by user name"))),
            Fn("get_app_stats", "Get overall statistics for the ESS app: counts of employees, job-sites, designs, deliveries, and users.",
                new { type = "object", properties = new { }, required = Array.Empty<string>() }),
            Fn("get_site_health_report", "Get a comprehensive overview of a job-site: builder, location, assigned site roles, inducted employees, recent designs, and delivery history.",
                Params(("site_name", "string", "The name of the job-site"))),
            Fn("get_recent_designs", "Get the most recently uploaded or updated design documents.",
                Params(
                    ("days", "integer", "How many days back to look (default 30)"),
                    ("limit", "integer", "Maximum results to return (default 10)"))),
            Fn("find_anything", "Broad keyword search across employees, job-sites, designs, and deliveries. Use this when you are not sure which category the user is asking about.",
                Params(("query", "string", "Search keywords"))),
            Fn("find_sites_near", "Find job-sites closest to a given location, ranked by straight-line distance. Use this for questions like 'what site is closest to the yard', 'nearest site to Parramatta', etc.",
                Params(
                    ("location", "string", "The reference location. Use 'yard' or 'depot' for the ESS yard at Girraween, or provide any Sydney address or suburb."),
                    ("limit", "integer", "Maximum number of sites to return (default 10)"),
                    ("include_archived", "boolean", "Include archived sites (default false)"))),
        };

        private static object Fn(string name, string description, object parameters) =>
            new { type = "function", function = new { name, description, parameters } };

        private static object Params(params (string name, string type, string description)[] props) =>
            new
            {
                type = "object",
                properties = props.ToDictionary(
                    p => p.name,
                    p => (object)new { type = p.type, description = p.description }),
                required = Array.Empty<string>(),
            };

        // ── Tool Dispatcher ───────────────────────────────────────────────────

        private async Task<string> ExecuteToolAsync(
            string name,
            JsonElement args,
            List<AdminAssistantLink> links,
            CancellationToken ct)
        {
            return name switch
            {
                "get_current_date" => await Tool_GetCurrentDate(ct),
                "search_employees" => await Tool_SearchEmployees(args, ct),
                "get_employee_details" => await Tool_GetEmployeeDetails(args, ct),
                "get_jobsites" => await Tool_GetJobsites(args, ct),
                "get_site_details" => await Tool_GetSiteDetails(args, ct),
                "get_builder_sites" => await Tool_GetBuilderSites(args, ct),
                "get_inducted_employees_for_site" => await Tool_GetInductedEmployeesForSite(args, ct),
                "get_employee_inductions" => await Tool_GetEmployeeInductions(args, ct),
                "search_designs" => await Tool_SearchDesigns(args, ct),
                "get_latest_design" => await Tool_GetLatestDesign(args, ct),
                "get_design_revisions" => await Tool_GetDesignRevisions(args, ct),
                "get_design_link" => await Tool_GetDesignLink(args, links, ct),
                "get_folder_contents" => await Tool_GetFolderContents(args, ct),
                "search_project_data_documents" => await Tool_SearchProjectDataDocuments(args, ct),
                "get_latest_project_data_document" => await Tool_GetLatestProjectDataDocument(args, ct),
                "get_project_data_document_link" => await Tool_GetProjectDataDocumentLink(args, links, ct),
                "get_roster" => await Tool_GetRoster(args, ct),
                "get_deliveries" => await Tool_GetDeliveries(args, ct),
                "get_delivery_detail" => await Tool_GetDeliveryDetail(args, ct),
                "get_active_deliveries" => await Tool_GetActiveDeliveries(args, ct),
                "get_truck_locations" => await Tool_GetTruckLocations(args, ct),
                "get_notifications" => await Tool_GetNotifications(args, ct),
                "get_user_roles" => await Tool_GetUserRoles(args, ct),
                "get_app_stats" => await Tool_GetAppStats(ct),
                "get_site_health_report" => await Tool_GetSiteHealthReport(args, ct),
                "get_recent_designs" => await Tool_GetRecentDesigns(args, ct),
                "find_anything" => await Tool_FindAnything(args, ct),
                "find_sites_near" => await Tool_FindSitesNear(args, ct),
                _ => JsonSerializer.Serialize(new { error = $"Unknown tool: {name}" }, _jsonOptions),
            };
        }

        // ── Tool Implementations ──────────────────────────────────────────────

        private Task<string> Tool_GetCurrentDate(CancellationToken ct)
        {
            var today = GetSydneyToday();
            var now = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, GetSydneyTimeZone());
            return Task.FromResult(JsonSerializer.Serialize(new
            {
                date = today.ToString("yyyy-MM-dd"),
                dayOfWeek = today.DayOfWeek.ToString(),
                formattedDate = today.ToString("dddd, MMMM d, yyyy"),
                time = now.ToString("h:mm tt", CultureInfo.InvariantCulture),
                timeZone = "Australia/Sydney",
            }, _jsonOptions));
        }

        private static string FormatDirectoryRole(EmployeeContextRow employee)
        {
            if (!employee.IsRosterEmployee)
                return "User Account";

            return employee.LeadingHand ? "Leading Hand" : "Scaffolder";
        }

        private static object? FormatAssignedSitePerson(EmployeeContextRow? employee)
        {
            if (employee == null)
                return null;

            return new
            {
                employee.Id,
                employee.UserId,
                employee.FullName,
                employee.Email,
                employee.PhoneNumber,
                siteRole = FormatDirectoryRole(employee),
                appRole = employee.AppRole ?? AppRoles.Viewer,
                employee.Verified,
            };
        }

        private static object BuildEmployeeProfileSummary(EmployeeContextRow employee)
        {
            var emergencyContactDetails = FormatEmergencyContactDetails(
                employee.EmergencyContactName,
                employee.EmergencyRelationship,
                employee.EmergencyPhoneNumber,
                employee.EmergencyEmail,
                employee.EmergencyAddress);

            return new
            {
                employee.PhoneNumber,
                employee.PreferredName,
                employee.DateOfBirth,
                employee.Gender,
                address = new
                {
                    employee.PersonalAddress,
                    employee.AddressStreet,
                    employee.AddressCity,
                    employee.AddressState,
                    employee.AddressPostalCode,
                    employee.AddressCountry,
                },
                emergencyContactDetails,
                emergencyContact = new
                {
                    name = employee.EmergencyContactName,
                    relationship = employee.EmergencyRelationship,
                    phoneNumber = employee.EmergencyPhoneNumber,
                    email = employee.EmergencyEmail,
                    address = employee.EmergencyAddress,
                },
            };
        }

        private static string? FormatEmergencyContactDetails(string? name, string? relationship, string? phoneNumber, string? email, string? address)
        {
            var parts = new List<string>();
            if (!string.IsNullOrWhiteSpace(name)) parts.Add($"name={name}");
            if (!string.IsNullOrWhiteSpace(relationship)) parts.Add($"relationship={relationship}");
            if (!string.IsNullOrWhiteSpace(phoneNumber)) parts.Add($"phone={phoneNumber}");
            if (!string.IsNullOrWhiteSpace(email)) parts.Add($"email={email}");
            if (!string.IsNullOrWhiteSpace(address)) parts.Add($"address={address}");
            return parts.Count == 0 ? null : string.Join("; ", parts);
        }

        private static string FormatUserProfileForPrompt(UserInfo user)
        {
            var parts = new List<string> { $"name={user.FullName}", $"email={user.Email}", $"role={user.Role}" };
            if (!string.IsNullOrWhiteSpace(user.PhoneNumber)) parts.Add($"phone={user.PhoneNumber}");
            if (!string.IsNullOrWhiteSpace(user.PreferredName)) parts.Add($"preferredName={user.PreferredName}");
            if (!string.IsNullOrWhiteSpace(user.Gender)) parts.Add($"gender={user.Gender}");
            if (user.DateOfBirth.HasValue) parts.Add($"dateOfBirth={user.DateOfBirth:yyyy-MM-dd}");
            var address = string.Join(", ", new[] { user.AddressStreet, user.AddressCity, user.AddressState, user.AddressPostalCode, user.AddressCountry }.Where(p => !string.IsNullOrWhiteSpace(p)));
            if (!string.IsNullOrWhiteSpace(address)) parts.Add($"address={address}");
            var emergencyContactDetails = FormatEmergencyContactDetails(user.EmergencyContactName, user.EmergencyRelationship, user.EmergencyPhoneNumber, user.EmergencyEmail, user.EmergencyAddress);
            if (!string.IsNullOrWhiteSpace(emergencyContactDetails)) parts.Add($"emergencyContact={emergencyContactDetails}");
            return string.Join("; ", parts);
        }

        private async Task<string> BuildVerifiedEvidencePackAsync(string question, UserInfo currentUser, CancellationToken ct)
        {
            try
            {
                var normalizedQuestion = NormalizeSearchText(question);
                var tokens = BuildBroadSearchTokens(question);
                var flags = BuildQuestionIntentFlags(normalizedQuestion);
                var jobsites = await FetchJobsiteDirectoryAsync(ct);
                var employees = await FetchEmployeeDirectoryAsync(ct);
                var designResolution = ResolveDesignQueryAgainstKnownSites(question, jobsites);
                var evidence = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
                {
                    ["question"] = question,
                    ["currentUser"] = new { currentUser.FullName, currentUser.Email, currentUser.Role },
                    ["sydneyDate"] = GetSydneyToday().ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    ["intent"] = flags,
                    ["correctedQuery"] = designResolution.CorrectedFrom == null ? null : new
                    {
                        searchedQuery = designResolution.Query,
                        designResolution.CorrectedFrom,
                        designResolution.CorrectionReason,
                        designResolution.MatchedSites,
                    },
                };

                var rankedSites = RankMatchingJobsites(jobsites, tokens, normalizedQuestion, includeArchived: flags.IncludeArchived).ToList();
                if (rankedSites.Count == 0 && flags.SiteRelated && flags.WantsList)
                    rankedSites = jobsites.Where(site => flags.IncludeArchived || !site.Archived).OrderBy(site => site.Name).ToList();

                var matchingSites = rankedSites
                    .Take(flags.WantsList ? 20 : 8)
                    .Select(site => new
                    {
                        site.Id,
                        site.Name,
                        builder = site.BuilderName,
                        siteLocation = site.SiteLocation,
                        scaffoldEntity = site.ScaffoldEntity,
                        site.Archived,
                        assignedProjectManager = FormatAssignedSitePerson(site.ProjectManager),
                        assignedSiteSupervisor = FormatAssignedSitePerson(site.SiteSupervisor),
                        assignedLeadingHand = FormatAssignedSitePerson(site.LeadingHand),
                        inductedEmployeeCount = site.InductedEmployees.Count,
                    })
                    .ToList();

                if (matchingSites.Count > 0 || flags.SiteRelated)
                    evidence["matchingSites"] = matchingSites;

                var matchingEmployees = RankMatchingEmployees(employees, tokens, normalizedQuestion)
                    .Take(flags.WantsList ? 20 : 8)
                    .Select(employee => new
                    {
                        employee.Id,
                        employee.FullName,
                        employee.Email,
                        employee.PhoneNumber,
                        siteRole = FormatDirectoryRole(employee),
                        appRole = employee.AppRole ?? AppRoles.Viewer,
                        employee.Verified,
                    })
                    .ToList();

                if (matchingEmployees.Count > 0 || flags.PersonRelated)
                    evidence["matchingEmployees"] = matchingEmployees;

                if (flags.DesignRelated)
                {
                    var (folders, documents) = await FetchDesignDataAsync(ct);
                    var designSearch = SearchDesignDocuments(
                        designResolution.Query,
                        folders,
                        documents,
                        flags.WantsLatest ? "date" : "relevance",
                        limit: flags.WantsList ? 12 : 6,
                        includeIds: true,
                        jobsites: jobsites);
                    evidence["designs"] = JsonSerializer.Deserialize<JsonElement>(designSearch, _jsonOptions);
                }

                if (flags.ProjectDataRelated)
                {
                    var projectData = await FetchProjectDataDocumentsAsync(
                        designResolution.Query,
                        null,
                        null,
                        NormalizeProjectDataKind(question),
                        includeArchived: flags.IncludeArchived,
                        ct);
                    evidence["projectDataDocuments"] = projectData
                        .OrderByDescending(document => flags.WantsLatest
                            ? TryParseDateTimeOffset(document.UploadedAt)?.ToUnixTimeSeconds() ?? 0
                            : document.MatchScore)
                        .ThenByDescending(document => document.UploadedAt)
                        .Take(flags.WantsList ? 15 : 7)
                        .Select(ProjectDataDocumentResponse)
                        .ToList();
                }

                if (flags.RosterRelated)
                    evidence["roster"] = JsonSerializer.Deserialize<JsonElement>(await Tool_GetRoster(JsonSerializer.SerializeToElement(new { days = flags.WantsList ? 7 : 1 }, _jsonOptions), ct), _jsonOptions);

                if (flags.DeliveryRelated)
                    evidence["deliveries"] = JsonSerializer.Deserialize<JsonElement>(await Tool_GetActiveDeliveries(JsonSerializer.SerializeToElement(new { scheduled_only = false }, _jsonOptions), ct), _jsonOptions);

                if (flags.TruckRelated)
                    evidence["truckLocations"] = JsonSerializer.Deserialize<JsonElement>(await Tool_GetTruckLocations(JsonSerializer.SerializeToElement(new { }, _jsonOptions), ct), _jsonOptions);

                evidence["instruction"] = "Answer operational ESS questions only from this verified evidence or from follow-up tool calls. If evidence is empty or ambiguous, say what is missing or ask a focused clarification.";

                var json = JsonSerializer.Serialize(evidence, _jsonOptions);
                return TruncateForPrompt(json, 24000);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to build admin assistant evidence pack");
                return JsonSerializer.Serialize(new
                {
                    warning = "The server could not build the verified evidence pack. The assistant must call tools before answering factual ESS questions.",
                    error = ex.Message,
                }, _jsonOptions);
            }
        }

        private sealed class QuestionIntentFlags
        {
            public bool SiteRelated { get; set; }
            public bool PersonRelated { get; set; }
            public bool DesignRelated { get; set; }
            public bool ProjectDataRelated { get; set; }
            public bool RosterRelated { get; set; }
            public bool DeliveryRelated { get; set; }
            public bool TruckRelated { get; set; }
            public bool WantsLatest { get; set; }
            public bool WantsList { get; set; }
            public bool IncludeArchived { get; set; }
        }

        private static QuestionIntentFlags BuildQuestionIntentFlags(string normalizedQuestion)
        {
            bool HasAny(params string[] terms) => terms.Any(term => normalizedQuestion.Contains(term, StringComparison.OrdinalIgnoreCase));
            return new QuestionIntentFlags
            {
                SiteRelated = HasAny("site", "job", "project", "builder", "address", "supervisor", "manager", "leading hand", "inducted"),
                PersonRelated = HasAny("who", "person", "employee", "user", "phone", "email", "role", "supervisor", "manager", "leading hand"),
                DesignRelated = HasAny("design", "drawing", "revision", "rev", "document", "pdf", "external", "demolition", "scaffold"),
                ProjectDataRelated = HasAny("project data", "scaff tag", "scaffold tag", "tag", "swms", "handover", "certificate", "day labour", "day labor"),
                RosterRelated = HasAny("roster", "on today", "working today", "crew today", "scheduled today"),
                DeliveryRelated = HasAny("delivery", "deliveries", "material", "materials", "transport schedule", "order"),
                TruckRelated = HasAny("truck", "gps", "location", "where is ess"),
                WantsLatest = HasAny("latest", "newest", "most recent", "current"),
                WantsList = HasAny("list", "show", "all", "active", "how many"),
                IncludeArchived = HasAny("archived", "deleted", "inactive"),
            };
        }

        private static IEnumerable<JobsiteContextRow> RankMatchingJobsites(
            IReadOnlyList<JobsiteContextRow> jobsites,
            IReadOnlyList<string> tokens,
            string normalizedQuestion,
            bool includeArchived)
        {
            return jobsites
                .Where(site => includeArchived || !site.Archived)
                .Select(site =>
                {
                    var text = $"{site.Name} {site.BuilderName} {site.SiteLocation} {site.ScaffoldEntity}";
                    var score = tokens.Count == 0 ? 1 : ScoreSearchCandidate(text, tokens, out _);
                    var normalizedSite = NormalizeSearchText(text);
                    var numericBoost = BuildNumericSearchTokens(normalizedQuestion).Count(number => NumericTokenAppears(normalizedSite, number)) * 40;
                    return new { Site = site, Score = score + numericBoost };
                })
                .Where(item => tokens.Count == 0 || item.Score > 0)
                .OrderByDescending(item => item.Score)
                .ThenBy(item => item.Site.Archived)
                .ThenBy(item => item.Site.Name)
                .Select(item => item.Site);
        }

        private static IEnumerable<EmployeeContextRow> RankMatchingEmployees(
            IReadOnlyList<EmployeeContextRow> employees,
            IReadOnlyList<string> tokens,
            string normalizedQuestion)
        {
            return employees
                .Select(employee =>
                {
                    var text = $"{employee.FullName} {employee.Email} {employee.PhoneNumber} {employee.AppRole} {FormatDirectoryRole(employee)}";
                    var score = tokens.Count == 0 ? 0 : ScoreSearchCandidate(text, tokens, out _);
                    if (!string.IsNullOrWhiteSpace(employee.FullName) && normalizedQuestion.Contains(NormalizeSearchText(employee.FullName), StringComparison.OrdinalIgnoreCase))
                        score += 120;
                    return new { Employee = employee, Score = score };
                })
                .Where(item => item.Score > 0)
                .OrderByDescending(item => item.Score)
                .ThenBy(item => item.Employee.FullName)
                .Select(item => item.Employee);
        }

        private static string TruncateForPrompt(string value, int maxChars)
        {
            if (string.IsNullOrEmpty(value) || value.Length <= maxChars)
                return value;
            return $"{value[..maxChars]}\n...TRUNCATED: additional verified records were omitted to keep the AI context focused.";
        }

        private async Task<string> Tool_SearchEmployees(JsonElement args, CancellationToken ct)
        {
            var nameFilter = TryGetString(args, "name");
            var roleFilter = TryGetString(args, "role");
            var leadingHandFilter = args.TryGetProperty("leading_hand", out var lhProp) && lhProp.ValueKind == JsonValueKind.True ? true :
                                    args.TryGetProperty("leading_hand", out var lhProp2) && lhProp2.ValueKind == JsonValueKind.False ? false : (bool?)null;
            var verifiedFilter = args.TryGetProperty("verified", out var vProp) && vProp.ValueKind == JsonValueKind.True ? true :
                                 args.TryGetProperty("verified", out var vProp2) && vProp2.ValueKind == JsonValueKind.False ? false : (bool?)null;
            var limit = TryGetInt(args, "limit") ?? 50;

            var employees = await FetchEmployeeDirectoryAsync(ct);

            var filtered = employees.AsEnumerable();
            if (!string.IsNullOrWhiteSpace(nameFilter))
                filtered = filtered.Where(e => FuzzyNameMatch(e.FullName, nameFilter) > 0
                    || (e.Email ?? string.Empty).Contains(nameFilter, StringComparison.OrdinalIgnoreCase)
                    || (e.PhoneNumber ?? string.Empty).Contains(nameFilter, StringComparison.OrdinalIgnoreCase)
                    || (e.AddressStreet ?? string.Empty).Contains(nameFilter, StringComparison.OrdinalIgnoreCase)
                    || (e.AddressCity ?? string.Empty).Contains(nameFilter, StringComparison.OrdinalIgnoreCase)
                    || (e.EmergencyContactName ?? string.Empty).Contains(nameFilter, StringComparison.OrdinalIgnoreCase)
                    || (e.EmergencyRelationship ?? string.Empty).Contains(nameFilter, StringComparison.OrdinalIgnoreCase)
                    || (e.EmergencyPhoneNumber ?? string.Empty).Contains(nameFilter, StringComparison.OrdinalIgnoreCase)
                    || (e.EmergencyEmail ?? string.Empty).Contains(nameFilter, StringComparison.OrdinalIgnoreCase)
                    || (e.EmergencyAddress ?? string.Empty).Contains(nameFilter, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(roleFilter))
                filtered = filtered.Where(e => string.Equals(e.AppRole, roleFilter, StringComparison.OrdinalIgnoreCase)
                    || (roleFilter.Equals("leading_hand", StringComparison.OrdinalIgnoreCase) && e.LeadingHand));
            if (leadingHandFilter.HasValue)
                filtered = filtered.Where(e => e.LeadingHand == leadingHandFilter.Value);
            if (verifiedFilter.HasValue)
                filtered = filtered.Where(e => e.Verified == verifiedFilter.Value);

            var results = filtered.Take(limit).Select(e => new
            {
                e.Id,
                e.FullName,
                e.Email,
                siteRole = FormatDirectoryRole(e),
                appRole = e.AppRole ?? AppRoles.Viewer,
                e.Verified,
                profile = BuildEmployeeProfileSummary(e),
            }).ToList();

            var suggestions = results.Count == 0 && !string.IsNullOrWhiteSpace(nameFilter)
                ? employees
                    .Select(e => new { e.FullName, Score = FuzzyNameMatch(e.FullName, nameFilter, partial: true) })
                    .Where(x => x.Score > 0)
                    .OrderByDescending(x => x.Score)
                    .Take(5)
                    .Select(x => x.FullName)
                    .ToList()
                : null;

            return JsonSerializer.Serialize(new { count = results.Count, employees = results, suggestions }, _jsonOptions);
        }

        private async Task<string> Tool_GetEmployeeDetails(JsonElement args, CancellationToken ct)
        {
            var name = TryGetString(args, "employee_name") ?? string.Empty;
            var employees = await FetchEmployeeDirectoryAsync(ct);
            var jobsites = await FetchJobsiteDirectoryAsync(ct);

            var employee = employees
                .Select(e => (Employee: e, Score: FuzzyNameMatch(e.FullName, name)))
                .Where(x => x.Score > 0)
                .OrderByDescending(x => x.Score)
                .Select(x => x.Employee)
                .FirstOrDefault();

            if (employee == null)
            {
                // Return closest partial name matches so the AI can suggest them
                var suggestions = employees
                    .Select(e => (Name: e.FullName, Score: FuzzyNameMatch(e.FullName, name, partial: true)))
                    .Where(x => x.Score > 0)
                    .OrderByDescending(x => x.Score)
                    .Take(3)
                    .Select(x => x.Name)
                    .ToList();
                return JsonSerializer.Serialize(new
                {
                    error = $"No employee found matching '{name}'",
                    note = "If the person is an admin, manager, or office user rather than a field employee, try get_user_roles instead.",
                    suggestions = suggestions.Count > 0 ? suggestions : null,
                }, _jsonOptions);
            }

            var inductedSites = jobsites
                .Where(j => j.InductedEmployees.Any(e => e.Id == employee.Id || e.FullName.Equals(employee.FullName, StringComparison.OrdinalIgnoreCase)))
                .Select(j => new { j.Name, j.BuilderName, j.SiteLocation, j.Archived })
                .ToList();

            return JsonSerializer.Serialize(new
            {
                employee.Id,
                employee.FullName,
                employee.Email,
                siteRole = FormatDirectoryRole(employee),
                appRole = employee.AppRole ?? AppRoles.Viewer,
                employee.Verified,
                profile = BuildEmployeeProfileSummary(employee),
                inductedSiteCount = inductedSites.Count,
                inductedSites,
            }, _jsonOptions);
        }

        private async Task<string> Tool_GetJobsites(JsonElement args, CancellationToken ct)
        {
            var nameFilter = TryGetString(args, "name");
            var builderFilter = TryGetString(args, "builder");
            var locationFilter = TryGetString(args, "location");
            var scaffoldEntityFilter = TryGetStringAny(args, "scaffold_entity", "scaffoldEntity");
            var archivedFilter = args.TryGetProperty("archived", out var aProp) && aProp.ValueKind == JsonValueKind.True ? true :
                                 args.TryGetProperty("archived", out var aProp2) && aProp2.ValueKind == JsonValueKind.False ? false : (bool?)null;
            var limit = TryGetInt(args, "limit") ?? 30;

            var jobsites = await FetchJobsiteDirectoryAsync(ct);

            var filtered = jobsites.AsEnumerable();
            if (!string.IsNullOrWhiteSpace(nameFilter))
                filtered = filtered.Where(j => j.Name.Contains(nameFilter, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(builderFilter))
                filtered = filtered.Where(j => j.BuilderName.Contains(builderFilter, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(locationFilter))
                filtered = filtered.Where(j => (j.SiteLocation ?? string.Empty).Contains(locationFilter, StringComparison.OrdinalIgnoreCase)
                    || j.Name.Contains(locationFilter, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(scaffoldEntityFilter))
            {
                var normalizedEntity = NormalizeScaffoldEntity(scaffoldEntityFilter);
                filtered = filtered.Where(j => j.ScaffoldEntity.Equals(normalizedEntity, StringComparison.OrdinalIgnoreCase));
            }
            if (archivedFilter.HasValue)
                filtered = filtered.Where(j => j.Archived == archivedFilter.Value);

            var results = filtered.Take(limit).Select(j => new
            {
                j.Id,
                j.Name,
                builder = j.BuilderName,
                siteLocation = j.SiteLocation,
                scaffoldEntity = j.ScaffoldEntity,
                j.Archived,
                assignedSiteSupervisor = FormatAssignedSitePerson(j.SiteSupervisor),
                assignedProjectManager = FormatAssignedSitePerson(j.ProjectManager),
                assignedLeadingHand = FormatAssignedSitePerson(j.LeadingHand),
                inductedEmployeeCount = j.InductedEmployees.Count,
            }).ToList();

            return JsonSerializer.Serialize(new { count = results.Count, jobsites = results }, _jsonOptions);
        }

        private async Task<string> Tool_GetSiteDetails(JsonElement args, CancellationToken ct)
        {
            var name = TryGetString(args, "site_name") ?? string.Empty;
            var jobsites = await FetchJobsiteDirectoryAsync(ct);

            var site = jobsites.FirstOrDefault(j => j.Name.Equals(name, StringComparison.OrdinalIgnoreCase))
                ?? jobsites.FirstOrDefault(j => j.Name.Contains(name, StringComparison.OrdinalIgnoreCase));

            if (site == null)
                return JsonSerializer.Serialize(new { error = $"No job-site found matching '{name}'" }, _jsonOptions);

            return JsonSerializer.Serialize(new
            {
                site.Id,
                site.Name,
                builder = site.BuilderName,
                siteLocation = site.SiteLocation,
                scaffoldEntity = site.ScaffoldEntity,
                site.Archived,
                site.SiteKey,
                site.InductionSource,
                assignedProjectManager = FormatAssignedSitePerson(site.ProjectManager),
                assignedSiteSupervisor = FormatAssignedSitePerson(site.SiteSupervisor),
                assignedLeadingHand = FormatAssignedSitePerson(site.LeadingHand),
                assignedRoleIds = new
                {
                    site.ProjectManagerEmployeeId,
                    site.ProjectManagerUserId,
                    site.SiteSupervisorEmployeeId,
                    site.SiteSupervisorUserId,
                    site.LeadingHandEmployeeId,
                    site.LeadingHandUserId,
                },
                inductedEmployeeCount = site.InductedEmployees.Count,
                inductedEmployees = site.InductedEmployees.Select(e => new
                {
                    e.FullName,
                    e.Email,
                    siteRole = FormatDirectoryRole(e),
                    appRole = e.AppRole ?? AppRoles.Viewer,
                    e.Verified,
                }).ToList(),
            }, _jsonOptions);
        }

        private async Task<string> Tool_GetBuilderSites(JsonElement args, CancellationToken ct)
        {
            var builderName = TryGetString(args, "builder_name") ?? string.Empty;
            var jobsites = await FetchJobsiteDirectoryAsync(ct);

            var sites = jobsites
                .Where(j => j.BuilderName.Contains(builderName, StringComparison.OrdinalIgnoreCase))
                .Select(j => new
                {
                    j.Name,
                    siteLocation = j.SiteLocation,
                    scaffoldEntity = j.ScaffoldEntity,
                    j.Archived,
                    assignedSiteSupervisor = FormatAssignedSitePerson(j.SiteSupervisor),
                    assignedProjectManager = FormatAssignedSitePerson(j.ProjectManager),
                    assignedLeadingHand = FormatAssignedSitePerson(j.LeadingHand),
                    inductedEmployeeCount = j.InductedEmployees.Count,
                }).ToList();

            return JsonSerializer.Serialize(new { builder = builderName, count = sites.Count, sites }, _jsonOptions);
        }

        private async Task<string> Tool_GetInductedEmployeesForSite(JsonElement args, CancellationToken ct)
        {
            var siteName = TryGetString(args, "site_name") ?? string.Empty;
            var jobsites = await FetchJobsiteDirectoryAsync(ct);

            var site = jobsites.FirstOrDefault(j => j.Name.Equals(siteName, StringComparison.OrdinalIgnoreCase))
                ?? jobsites.FirstOrDefault(j => j.Name.Contains(siteName, StringComparison.OrdinalIgnoreCase));

            if (site == null)
                return JsonSerializer.Serialize(new { error = $"No job-site found matching '{siteName}'" }, _jsonOptions);

            var employees = site.InductedEmployees.Select(e => new
            {
                e.FullName,
                e.Email,
                siteRole = FormatDirectoryRole(e),
                appRole = e.AppRole ?? AppRoles.Viewer,
                e.Verified,
            }).ToList();

            return JsonSerializer.Serialize(new
            {
                site = site.Name,
                builder = site.BuilderName,
                inductionSource = site.InductionSource,
                count = employees.Count,
                employees,
            }, _jsonOptions);
        }

        private async Task<string> Tool_GetEmployeeInductions(JsonElement args, CancellationToken ct)
        {
            var employeeName = TryGetString(args, "employee_name") ?? string.Empty;
            var employees = await FetchEmployeeDirectoryAsync(ct);
            var jobsites = await FetchJobsiteDirectoryAsync(ct);

            var employee = employees
                .Select(e => (Employee: e, Score: FuzzyNameMatch(e.FullName, employeeName)))
                .Where(x => x.Score > 0)
                .OrderByDescending(x => x.Score)
                .Select(x => x.Employee)
                .FirstOrDefault();

            if (employee == null)
                return JsonSerializer.Serialize(new { error = $"No employee found matching '{employeeName}'" }, _jsonOptions);

            var sites = jobsites
                .Where(j => j.InductedEmployees.Any(e => e.Id == employee.Id
                    || e.FullName.Equals(employee.FullName, StringComparison.OrdinalIgnoreCase)))
                .Select(j => new { j.Name, builder = j.BuilderName, j.SiteLocation, j.Archived })
                .ToList();

            return JsonSerializer.Serialize(new
            {
                employee = employee.FullName,
                inductedSiteCount = sites.Count,
                sites,
            }, _jsonOptions);
        }

        private async Task<string> Tool_SearchDesigns(JsonElement args, CancellationToken ct)
        {
            var query = TryGetString(args, "query") ?? string.Empty;
            var sortBy = TryGetString(args, "sort_by") ?? "relevance";

            var designDataTask = FetchDesignDataAsync(ct);
            var jobsitesTask = FetchJobsiteDirectoryAsync(ct);
            await Task.WhenAll(designDataTask, jobsitesTask);
            var (folders, documents) = designDataTask.Result;
            return SearchDesignDocuments(query, folders, documents, sortBy, limit: 10, includeIds: true, jobsites: jobsitesTask.Result);
        }

        private async Task<string> Tool_GetLatestDesign(JsonElement args, CancellationToken ct)
        {
            var query = TryGetString(args, "query") ?? string.Empty;
            var designDataTask = FetchDesignDataAsync(ct);
            var jobsitesTask = FetchJobsiteDirectoryAsync(ct);
            await Task.WhenAll(designDataTask, jobsitesTask);
            var (folders, documents) = designDataTask.Result;
            return SearchDesignDocuments(query, folders, documents, "date", limit: 1, includeIds: true, jobsites: jobsitesTask.Result);
        }

        private async Task<string> Tool_GetDesignRevisions(JsonElement args, CancellationToken ct)
        {
            var query = TryGetString(args, "query") ?? string.Empty;
            var designDataTask = FetchDesignDataAsync(ct);
            var jobsitesTask = FetchJobsiteDirectoryAsync(ct);
            await Task.WhenAll(designDataTask, jobsitesTask);
            var (folders, documents) = designDataTask.Result;
            return SearchDesignDocuments(query, folders, documents, "relevance", limit: 20, includeIds: true, allRevisions: true, jobsites: jobsitesTask.Result);
        }

        private async Task<string> Tool_GetDesignLink(JsonElement args, List<AdminAssistantLink> links, CancellationToken ct)
        {
            var documentIdStr = TryGetString(args, "document_id") ?? string.Empty;
            var type = TryGetString(args, "type") ?? "ess";

            if (!Guid.TryParse(documentIdStr, out var documentId))
                return JsonSerializer.Serialize(new { error = "Invalid document_id — must be a UUID." }, _jsonOptions);

            var info = await TryGetDownloadInfoAsync(documentId, type, ct);
            if (info == null)
            {
                // Try the other type
                var otherType = type == "ess" ? "third_party" : "ess";
                info = await TryGetDownloadInfoAsync(documentId, otherType, ct);
                if (info != null) type = otherType;
            }

            if (info == null)
                return JsonSerializer.Serialize(new { error = "Could not generate a download link for this document. It may not have a file attached." }, _jsonOptions);

            links.Add(new AdminAssistantLink
            {
                Label = "Click here to view",
                Url = info.Url,
                Type = type == "ess" ? "ess-design" : "third-party-design",
            });

            return JsonSerializer.Serialize(new
            {
                success = true,
                fileName = info.FileName,
                type,
                message = "Link generated successfully. Tell the user to click the link below to view the document.",
            }, _jsonOptions);
        }

        private async Task<string> Tool_GetFolderContents(JsonElement args, CancellationToken ct)
        {
            var folderPath = TryGetString(args, "folder_path") ?? string.Empty;
            var (folders, documents) = await FetchDesignDataAsync(ct);

            var folderPaths = BuildFolderPaths(folders);
            var matchingFolderIds = folderPaths
                .Where(kv => kv.Value.Contains(folderPath, StringComparison.OrdinalIgnoreCase))
                .Select(kv => kv.Key)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var docs = documents
                .Where(d => matchingFolderIds.Contains(TryGetString(d, "folder_id") ?? string.Empty))
                .Select(d =>
                {
                    var folderId = TryGetString(d, "folder_id") ?? string.Empty;
                    return new
                    {
                        documentId = TryGetString(d, "id"),
                        name = TryGetString(d, "ess_design_issue_name") ?? TryGetString(d, "third_party_design_name") ?? "Unnamed",
                        revision = TryGetString(d, "revision_number"),
                        description = TryGetString(d, "description"),
                        updatedAt = TryGetString(d, "updated_at"),
                        folderPath = folderPaths.TryGetValue(folderId, out var fp) ? fp : string.Empty,
                        hasEssDesign = !string.IsNullOrWhiteSpace(TryGetString(d, "ess_design_issue_path")),
                        hasThirdPartyDesign = !string.IsNullOrWhiteSpace(TryGetString(d, "third_party_design_path")),
                    };
                })
                .OrderByDescending(d => d.updatedAt)
                .Take(30)
                .ToList();

            return JsonSerializer.Serialize(new { folderPath, count = docs.Count, documents = docs }, _jsonOptions);
        }

        private async Task<string> Tool_SearchProjectDataDocuments(JsonElement args, CancellationToken ct)
        {
            var query = TryGetString(args, "query") ?? string.Empty;
            var builder = TryGetString(args, "builder");
            var project = TryGetString(args, "project");
            var kind = TryGetString(args, "kind");
            var includeArchived = args.TryGetProperty("include_archived", out var iaProp) && iaProp.ValueKind == JsonValueKind.True;
            var limit = Math.Min(Math.Max(TryGetInt(args, "limit") ?? 10, 1), 30);

            var jobsites = await FetchJobsiteDirectoryAsync(ct);
            var queryResolution = ResolveDesignQueryAgainstKnownSites(query, jobsites);
            var documents = await FetchProjectDataDocumentsAsync(
                queryResolution.Query,
                builder,
                project,
                kind,
                includeArchived,
                ct);

            var results = documents
                .OrderByDescending(d => d.MatchScore)
                .ThenByDescending(d => d.UploadedAt)
                .Take(limit)
                .Select(ProjectDataDocumentResponse)
                .ToList();

            return JsonSerializer.Serialize(new
            {
                query,
                searchedQuery = queryResolution.Query,
                correctedFrom = queryResolution.CorrectedFrom,
                correctionReason = queryResolution.CorrectionReason,
                matchedSites = queryResolution.MatchedSites,
                count = results.Count,
                documents = results,
            }, _jsonOptions);
        }

        private async Task<string> Tool_GetLatestProjectDataDocument(JsonElement args, CancellationToken ct)
        {
            var query = TryGetString(args, "query") ?? string.Empty;
            var builder = TryGetString(args, "builder");
            var project = TryGetString(args, "project");
            var kind = TryGetString(args, "kind");
            var includeArchived = args.TryGetProperty("include_archived", out var iaProp) && iaProp.ValueKind == JsonValueKind.True;

            var jobsites = await FetchJobsiteDirectoryAsync(ct);
            var queryResolution = ResolveDesignQueryAgainstKnownSites(query, jobsites);
            var documents = await FetchProjectDataDocumentsAsync(
                queryResolution.Query,
                builder,
                project,
                kind,
                includeArchived,
                ct);

            var latest = documents
                .OrderByDescending(d => TryParseDateTimeOffset(d.UploadedAt) ?? DateTimeOffset.MinValue)
                .ThenByDescending(d => d.MatchScore)
                .FirstOrDefault();

            return JsonSerializer.Serialize(new
            {
                query,
                searchedQuery = queryResolution.Query,
                correctedFrom = queryResolution.CorrectedFrom,
                correctionReason = queryResolution.CorrectionReason,
                matchedSites = queryResolution.MatchedSites,
                count = latest == null ? 0 : 1,
                document = latest == null ? null : ProjectDataDocumentResponse(latest),
            }, _jsonOptions);
        }

        private async Task<string> Tool_GetProjectDataDocumentLink(JsonElement args, List<AdminAssistantLink> links, CancellationToken ct)
        {
            var documentId = TryGetStringAny(args, "document_id", "documentId") ?? string.Empty;
            var builder = TryGetString(args, "builder");
            var project = TryGetString(args, "project");
            var kindFilter = TryGetString(args, "kind");
            var parsed = ParseProjectDataDocumentId(documentId);
            ProjectDataDocumentRow? resolvedDocument = null;

            if (parsed == null)
            {
                resolvedDocument = await ResolveLooseProjectDataDocumentAsync(documentId, builder, project, kindFilter, ct);
                if (resolvedDocument == null)
                    return JsonSerializer.Serialize(new { error = "Could not resolve a Project data document from the supplied document_id/reference." }, _jsonOptions);

                parsed = ParseProjectDataDocumentId(resolvedDocument.DocumentId);
            }
            if (!parsed.HasValue)
                return JsonSerializer.Serialize(new { error = "Could not resolve a valid Project data document_id." }, _jsonOptions);

            var (kind, builderId, projectId, resourceId) = parsed.Value;
            var path = await ResolveProjectDataPdfPathAsync(kind, builderId, projectId, resourceId, ct);
            if (string.IsNullOrWhiteSpace(path))
                path = resolvedDocument?.StoragePath;
            if (string.IsNullOrWhiteSpace(path))
                return JsonSerializer.Serialize(new { error = "Could not find a PDF path for this Project data document." }, _jsonOptions);

            string url;
            try
            {
                url = await _supabaseService.GetSafetyStorageSignedUrlAsync(path, 60 * 60 * 24 * 14);
            }
            catch
            {
                var fallbackPath = await ResolveProjectDataPdfPathFromStorageListingAsync(kind, builderId, projectId, resourceId, path, ct);
                if (string.IsNullOrWhiteSpace(fallbackPath))
                    throw;
                path = fallbackPath;
                url = await _supabaseService.GetSafetyStorageSignedUrlAsync(path, 60 * 60 * 24 * 14);
            }

            links.Add(new AdminAssistantLink
            {
                Label = "Click here to view",
                Url = url,
                Type = $"project-data-{kind}",
            });

            return JsonSerializer.Serialize(new
            {
                success = true,
                documentId = resolvedDocument?.DocumentId ?? documentId,
                kind,
                path,
                message = "Link generated successfully. Tell the user to click the link below to view the Project data document.",
            }, _jsonOptions);
        }

        private async Task<string> Tool_GetRoster(JsonElement args, CancellationToken ct)
        {
            var dateStr = TryGetString(args, "date");
            var days = TryGetInt(args, "days") ?? 1;
            if (days < 1) days = 1;
            if (days > 14) days = 14;

            var today = GetSydneyToday();
            var startDate = string.IsNullOrWhiteSpace(dateStr) ? today : DateOnly.TryParse(dateStr, out var parsed) ? parsed : today;

            var planRows = await GetRestRowsAsync<JsonElement>(
                "ess_rostering_plans?select=*&order=plan_date.desc&limit=365", ct);

            var results = new List<object>();
            for (var i = 0; i < days; i++)
            {
                var date = startDate.AddDays(i);
                var dateKey = date.ToString("yyyy-MM-dd");
                var plan = planRows.FirstOrDefault(p => TryGetStringAny(p, "plan_date", "planDate") == dateKey);

                if (plan.ValueKind == JsonValueKind.Undefined)
                {
                    results.Add(new { date = dateKey, hasRoster = false, note = "No roster plan created for this date." });
                    continue;
                }

                results.Add(new
                {
                    date = dateKey,
                    hasRoster = true,
                    planId = TryGetString(plan, "id"),
                    data = plan,
                });
            }

            return JsonSerializer.Serialize(new { requestedFrom = startDate.ToString("yyyy-MM-dd"), days, roster = results }, _jsonOptions);
        }

        private async Task<string> Tool_GetDeliveries(JsonElement args, CancellationToken ct)
        {
            var dateStr = TryGetString(args, "date");
            var days = TryGetInt(args, "days") ?? 1;
            if (days < 1) days = 1;
            if (days > 14) days = 14;
            var includeArchived = args.TryGetProperty("include_archived", out var iaProp) && iaProp.ValueKind == JsonValueKind.True;

            var today = GetSydneyToday();
            var startDate = string.IsNullOrWhiteSpace(dateStr) ? today : DateOnly.TryParse(dateStr, out var parsed) ? parsed : today;

            var requestRows = await GetRestRowsAsync<JsonElement>(
                $"{MaterialRequestsTable}?select=*&order=submitted_at.desc&limit=5000", ct);

            var dates = Enumerable.Range(0, days).Select(i => startDate.AddDays(i).ToString("yyyy-MM-dd")).ToHashSet();

            var deliveries = requestRows
                .Where(r =>
                {
                    var scheduledDate = NormalizeDateOnlyString(TryGetStringAny(r, "scheduledDate", "scheduled_date"));
                    var scheduleRemovedAt = TryGetStringAny(r, "scheduleRemovedAt", "schedule_removed_at");
                    var archivedAt = TryGetStringAny(r, "archivedAt", "archived_at");
                    var isOnSchedule = !string.IsNullOrWhiteSpace(scheduledDate) && string.IsNullOrWhiteSpace(scheduleRemovedAt);
                    if (!isOnSchedule) return false;
                    if (!includeArchived && !string.IsNullOrWhiteSpace(archivedAt)) return false;
                    return dates.Contains(scheduledDate ?? string.Empty);
                })
                .Select(r =>
                {
                    var scheduledDate = NormalizeDateOnlyString(TryGetStringAny(r, "scheduledDate", "scheduled_date"));
                    var hour = TryGetIntAny(r, "scheduledHour", "scheduled_hour");
                    var minute = TryGetIntAny(r, "scheduledMinute", "scheduled_minute");
                    return new
                    {
                        id = TryGetString(r, "id"),
                        builder = TryGetStringAny(r, "builderName", "builder_name"),
                        site = TryGetStringAny(r, "projectName", "project_name"),
                        scheduledDate,
                        scheduledTime = hour != null ? $"{hour:00}:{minute ?? 0:00}" : null,
                        truck = TryGetStringAny(r, "scheduledTruckLabel", "scheduled_truck_label"),
                        status = TryGetStringAny(r, "deliveryStatus", "delivery_status") ?? "scheduled",
                        archived = !string.IsNullOrWhiteSpace(TryGetStringAny(r, "archivedAt", "archived_at")),
                        materials = BuildRequestedMaterials(r).Count + " material lines",
                    };
                })
                .OrderBy(d => d.scheduledDate)
                .ThenBy(d => d.scheduledTime)
                .Take(100)
                .ToList();

            return JsonSerializer.Serialize(new
            {
                from = startDate.ToString("yyyy-MM-dd"),
                days,
                count = deliveries.Count,
                deliveries,
            }, _jsonOptions);
        }

        private async Task<string> Tool_GetDeliveryDetail(JsonElement args, CancellationToken ct)
        {
            var requestId = TryGetString(args, "request_id") ?? string.Empty;
            var requestRows = await GetRestRowsAsync<JsonElement>(
                $"{MaterialRequestsTable}?select=*&order=submitted_at.desc&limit=5000", ct);

            var request = requestRows.FirstOrDefault(r => string.Equals(TryGetString(r, "id"), requestId, StringComparison.OrdinalIgnoreCase));
            if (request.ValueKind == JsonValueKind.Undefined)
                return JsonSerializer.Serialize(new { error = $"No delivery request found with id '{requestId}'" }, _jsonOptions);

            var materials = BuildRequestedMaterials(request);
            var scheduledDate = NormalizeDateOnlyString(TryGetStringAny(request, "scheduledDate", "scheduled_date"));
            var hour = TryGetIntAny(request, "scheduledHour", "scheduled_hour");
            var minute = TryGetIntAny(request, "scheduledMinute", "scheduled_minute");
            var scheduleRemovedAt = TryGetStringAny(request, "scheduleRemovedAt", "schedule_removed_at");
            var isOnSchedule = !string.IsNullOrWhiteSpace(scheduledDate) && string.IsNullOrWhiteSpace(scheduleRemovedAt);

            return JsonSerializer.Serialize(new
            {
                id = TryGetString(request, "id"),
                builder = TryGetStringAny(request, "builderName", "builder_name"),
                site = TryGetStringAny(request, "projectName", "project_name"),
                requestedBy = TryGetStringAny(request, "requestedByName", "requested_by_name"),
                submittedAt = TryGetStringAny(request, "submittedAt", "submitted_at"),
                isOnSchedule,
                scheduledDate = isOnSchedule ? scheduledDate : null,
                scheduledTime = isOnSchedule && hour != null ? $"{hour:00}:{minute ?? 0:00}" : null,
                truck = isOnSchedule ? TryGetStringAny(request, "scheduledTruckLabel", "scheduled_truck_label") : null,
                archived = !string.IsNullOrWhiteSpace(TryGetStringAny(request, "archivedAt", "archived_at")),
                scheduleRemovedAt,
                scaffoldingSystem = TryGetMaterialMeta(request, "__scaffoldingSystem"),
                details = TryGetMaterialMeta(request, "__details") ?? TryGetString(request, "details"),
                notes = TryGetString(request, "notes"),
                materialCount = materials.Count,
                materials,
            }, _jsonOptions);
        }

        private async Task<string> Tool_GetActiveDeliveries(JsonElement args, CancellationToken ct)
        {
            var scheduledOnly = args.TryGetProperty("scheduled_only", out var soProp) && soProp.ValueKind == JsonValueKind.True;

            var requestRows = await GetRestRowsAsync<JsonElement>(
                $"{MaterialRequestsTable}?select=*&order=submitted_at.desc&limit=5000", ct);

            var active = requestRows
                .Where(r => string.IsNullOrWhiteSpace(TryGetStringAny(r, "archivedAt", "archived_at")))
                .Where(r =>
                {
                    if (!scheduledOnly) return true;
                    var scheduledDate = NormalizeDateOnlyString(TryGetStringAny(r, "scheduledDate", "scheduled_date"));
                    var scheduleRemovedAt = TryGetStringAny(r, "scheduleRemovedAt", "schedule_removed_at");
                    return !string.IsNullOrWhiteSpace(scheduledDate) && string.IsNullOrWhiteSpace(scheduleRemovedAt);
                })
                .Select(r =>
                {
                    var scheduledDate = NormalizeDateOnlyString(TryGetStringAny(r, "scheduledDate", "scheduled_date"));
                    var scheduleRemovedAt = TryGetStringAny(r, "scheduleRemovedAt", "schedule_removed_at");
                    var hour = TryGetIntAny(r, "scheduledHour", "scheduled_hour");
                    var minute = TryGetIntAny(r, "scheduledMinute", "scheduled_minute");
                    var isOnSchedule = !string.IsNullOrWhiteSpace(scheduledDate) && string.IsNullOrWhiteSpace(scheduleRemovedAt);
                    return new
                    {
                        id = TryGetString(r, "id"),
                        builder = TryGetStringAny(r, "builderName", "builder_name"),
                        site = TryGetStringAny(r, "projectName", "project_name"),
                        isOnSchedule,
                        scheduledDate = isOnSchedule ? scheduledDate : null,
                        scheduledTime = isOnSchedule && hour != null ? $"{hour:00}:{minute ?? 0:00}" : null,
                        truck = isOnSchedule ? TryGetStringAny(r, "scheduledTruckLabel", "scheduled_truck_label") : null,
                        status = TryGetStringAny(r, "deliveryStatus", "delivery_status") ?? (isOnSchedule ? "scheduled" : "pending"),
                    };
                })
                .OrderBy(r => r.scheduledDate ?? "9999")
                .ThenBy(r => r.scheduledTime ?? "99:99")
                .Take(100)
                .ToList();

            return JsonSerializer.Serialize(new { count = active.Count, deliveries = active }, _jsonOptions);
        }

        private async Task<string> Tool_GetTruckLocations(JsonElement args, CancellationToken ct)
        {
            var truckFilter = TryGetString(args, "truck");

            var rows = await GetRestRowsAsync<JsonElement>(
                $"{TruckLiveLocationsTable}?select=truck_id,truck_label,role_name,driver_user_id,delivery_request_id,latitude,longitude,accuracy_m,heading_deg,speed_mps,battery_percent,status,recorded_at,updated_at&order=recorded_at.desc&limit=24",
                ct);

            var locations = BuildTruckLiveLocations(rows);

            if (!string.IsNullOrWhiteSpace(truckFilter) && !truckFilter.Equals("all", StringComparison.OrdinalIgnoreCase))
                locations = locations.Where(l =>
                    l.TruckLabel.Contains(truckFilter, StringComparison.OrdinalIgnoreCase) ||
                    l.TruckId.Contains(truckFilter, StringComparison.OrdinalIgnoreCase)).ToList();

            var results = new List<object>();
            foreach (var loc in locations)
            {
                string? address = null;
                try { var geo = await _deliveryAnalysisService.ReverseGeocodeAsync(new DeliveryAnalysisService.ReverseGeocodeRequest { Lat = loc.Latitude, Lon = loc.Longitude }); address = geo?.Label; }
                catch { /* ignore geocode failures */ }

                results.Add(new
                {
                    truck = loc.TruckLabel,
                    status = loc.StatusLabel,
                    location = address ?? loc.Coordinates,
                    coordinates = loc.Coordinates,
                    mapUrl = loc.MapUrl,
                    lastPing = loc.Freshness,
                    lastPingTime = FormatSydneyDateTime(loc.RecordedAt),
                    speed = loc.SpeedMps.HasValue ? $"{Math.Round(loc.SpeedMps.Value * 3.6):F0} km/h" : null,
                    battery = loc.BatteryPercent.HasValue ? $"{loc.BatteryPercent.Value:F0}%" : null,
                    isStale = loc.IsStale,
                    isOffline = loc.IsOffline,
                    driverUserId = loc.DriverUserId,
                    deliveryRequestId = loc.DeliveryRequestId,
                });
            }

            return JsonSerializer.Serialize(new { count = results.Count, trucks = results }, _jsonOptions);
        }

        private async Task<string> Tool_GetNotifications(JsonElement args, CancellationToken ct)
        {
            var userNameFilter = TryGetString(args, "user_name");
            var limit = Math.Min(TryGetInt(args, "limit") ?? 20, 100);

            var notificationRows = await GetRestRowsAsync<JsonElement>(
                "user_notifications?select=id,user_id,title,message,type,folder_id,document_id,read,created_at,updated_at&order=created_at.desc&limit=250",
                ct);

            IEnumerable<JsonElement> filtered = notificationRows;

            if (!string.IsNullOrWhiteSpace(userNameFilter))
            {
                var userNames = await GetRestRowsAsync<JsonElement>(
                    "user_names?select=id,email,full_name,phone_number,preferred_name,date_of_birth,gender,personal_address,address_street,address_city,address_state,address_postal_code,address_country,emergency_contact_name,emergency_relationship,emergency_phone_number,emergency_email,emergency_address&order=full_name.asc&limit=1000", ct);
                var matchedUserIds = userNames
                    .Where(u => (TryGetString(u, "full_name") ?? string.Empty).Contains(userNameFilter, StringComparison.OrdinalIgnoreCase)
                        || (TryGetString(u, "email") ?? string.Empty).Contains(userNameFilter, StringComparison.OrdinalIgnoreCase))
                    .Select(u => TryGetString(u, "id"))
                    .Where(id => id != null)
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);

                filtered = filtered.Where(n => matchedUserIds.Contains(TryGetString(n, "user_id") ?? string.Empty));
            }

            var notifications = filtered.Take(limit).Select(n => new
            {
                id = TryGetString(n, "id"),
                userId = TryGetString(n, "user_id"),
                title = TryGetString(n, "title"),
                message = TryGetString(n, "message"),
                type = TryGetString(n, "type"),
                read = TryGetBool(n, "read"),
                createdAt = TryGetString(n, "created_at"),
            }).ToList();

            return JsonSerializer.Serialize(new { count = notifications.Count, notifications }, _jsonOptions);
        }

        private async Task<string> Tool_GetUserRoles(JsonElement args, CancellationToken ct)
        {
            var roleFilter = TryGetString(args, "role");
            var nameFilter = TryGetString(args, "name");

            var userNames = await GetRestRowsAsync<JsonElement>(
                "user_names?select=id,email,full_name,phone_number,preferred_name,date_of_birth,gender,personal_address,address_street,address_city,address_state,address_postal_code,address_country,emergency_contact_name,emergency_relationship,emergency_phone_number,emergency_email,emergency_address&order=full_name.asc&limit=1000", ct);
            var userRoles = await GetRestRowsAsync<JsonElement>(
                "user_roles?select=user_id,role,updated_at&limit=1000", ct);

            var rolesByUserId = userRoles
                .Select(r => new { UserId = TryGetString(r, "user_id"), Role = TryGetString(r, "role") })
                .Where(r => r.UserId != null)
                .ToDictionary(r => r.UserId!, r => r.Role ?? AppRoles.Viewer, StringComparer.OrdinalIgnoreCase);

            var users = userNames.Select(u =>
            {
                var id = TryGetString(u, "id") ?? string.Empty;
                var role = rolesByUserId.TryGetValue(id, out var r) ? r : AppRoles.Viewer;
                return new
                {
                    id,
                    fullName = TryGetString(u, "full_name"),
                    email = TryGetString(u, "email"),
                    role,
                    profile = new
                    {
                        phoneNumber = TryGetString(u, "phone_number"),
                        preferredName = TryGetString(u, "preferred_name"),
                        dateOfBirth = TryGetString(u, "date_of_birth"),
                        gender = TryGetString(u, "gender"),
                        address = new
                        {
                            personalAddress = TryGetString(u, "personal_address"),
                            street = TryGetString(u, "address_street"),
                            city = TryGetString(u, "address_city"),
                            state = TryGetString(u, "address_state"),
                            postalCode = TryGetString(u, "address_postal_code"),
                            country = TryGetString(u, "address_country"),
                        },
                        emergencyContactDetails = FormatEmergencyContactDetails(
                            TryGetString(u, "emergency_contact_name"),
                            TryGetString(u, "emergency_relationship"),
                            TryGetString(u, "emergency_phone_number"),
                            TryGetString(u, "emergency_email"),
                            TryGetString(u, "emergency_address")),
                        emergencyContact = new
                        {
                            name = TryGetString(u, "emergency_contact_name"),
                            relationship = TryGetString(u, "emergency_relationship"),
                            phoneNumber = TryGetString(u, "emergency_phone_number"),
                            email = TryGetString(u, "emergency_email"),
                            address = TryGetString(u, "emergency_address"),
                        },
                    },
                };
            }).AsEnumerable();

            if (!string.IsNullOrWhiteSpace(roleFilter))
                users = users.Where(u => string.Equals(u.role, roleFilter, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(nameFilter))
                users = users.Where(u => (u.fullName ?? string.Empty).Contains(nameFilter, StringComparison.OrdinalIgnoreCase)
                    || (u.email ?? string.Empty).Contains(nameFilter, StringComparison.OrdinalIgnoreCase)
                    || (u.profile.phoneNumber ?? string.Empty).Contains(nameFilter, StringComparison.OrdinalIgnoreCase)
                    || (u.profile.address.street ?? string.Empty).Contains(nameFilter, StringComparison.OrdinalIgnoreCase)
                    || (u.profile.address.city ?? string.Empty).Contains(nameFilter, StringComparison.OrdinalIgnoreCase)
                    || (u.profile.emergencyContact.name ?? string.Empty).Contains(nameFilter, StringComparison.OrdinalIgnoreCase)
                    || (u.profile.emergencyContact.relationship ?? string.Empty).Contains(nameFilter, StringComparison.OrdinalIgnoreCase)
                    || (u.profile.emergencyContact.phoneNumber ?? string.Empty).Contains(nameFilter, StringComparison.OrdinalIgnoreCase)
                    || (u.profile.emergencyContact.email ?? string.Empty).Contains(nameFilter, StringComparison.OrdinalIgnoreCase)
                    || (u.profile.emergencyContact.address ?? string.Empty).Contains(nameFilter, StringComparison.OrdinalIgnoreCase));

            var results = users.ToList();
            return JsonSerializer.Serialize(new { count = results.Count, users = results }, _jsonOptions);
        }

        private async Task<string> Tool_GetAppStats(CancellationToken ct)
        {
            var employeesTask = GetRestRowsAsync<JsonElement>(
                "ess_rostering_employees?select=id,verified_at&limit=5000", ct);
            var userNamesTask = GetRestRowsAsync<JsonElement>(
                "user_names?select=id&limit=1000", ct);
            var foldersTask = GetRestRowsAsync<JsonElement>(
                "folders?select=id&limit=5000", ct);
            var documentsTask = GetRestRowsAsync<JsonElement>(
                "design_documents?select=id,updated_at&limit=5000", ct);
            var requestsTask = GetRestRowsAsync<JsonElement>(
                $"{MaterialRequestsTable}?select=id,archived_at&limit=5000", ct);
            var projectsTask = ReadStorageJsonAsync(SafetyBucket, SafetyProjectsPath, ct);

            await Task.WhenAll(employeesTask, userNamesTask, foldersTask, documentsTask, requestsTask, projectsTask);

            var employees = employeesTask.Result;
            var projects = projectsTask.Result;

            return JsonSerializer.Serialize(new
            {
                employees = new
                {
                    total = employees.Count,
                    verified = employees.Count(e => !string.IsNullOrWhiteSpace(TryGetString(e, "verified_at"))),
                    unverified = employees.Count(e => string.IsNullOrWhiteSpace(TryGetString(e, "verified_at"))),
                },
                jobsites = new
                {
                    total = CountProjects(projects, null),
                    active = CountProjects(projects, false),
                    archived = CountProjects(projects, true),
                },
                designDocuments = new
                {
                    totalFolders = foldersTask.Result.Count,
                    totalDocuments = documentsTask.Result.Count,
                },
                deliveries = new
                {
                    total = requestsTask.Result.Count,
                    active = requestsTask.Result.Count(r => string.IsNullOrWhiteSpace(TryGetStringAny(r, "archivedAt", "archived_at"))),
                    archived = requestsTask.Result.Count(r => !string.IsNullOrWhiteSpace(TryGetStringAny(r, "archivedAt", "archived_at"))),
                },
                users = new
                {
                    total = userNamesTask.Result.Count,
                },
            }, _jsonOptions);
        }

        private async Task<string> Tool_GetSiteHealthReport(JsonElement args, CancellationToken ct)
        {
            var siteName = TryGetString(args, "site_name") ?? string.Empty;

            var jobsitesTask = FetchJobsiteDirectoryAsync(ct);
            var (folders, documents) = await FetchDesignDataAsync(ct);
            var requestRows = await GetRestRowsAsync<JsonElement>(
                $"{MaterialRequestsTable}?select=*&order=submitted_at.desc&limit=5000", ct);
            var jobsites = await jobsitesTask;

            var site = jobsites.FirstOrDefault(j => j.Name.Equals(siteName, StringComparison.OrdinalIgnoreCase))
                ?? jobsites.FirstOrDefault(j => j.Name.Contains(siteName, StringComparison.OrdinalIgnoreCase));

            if (site == null)
                return JsonSerializer.Serialize(new { error = $"No job-site found matching '{siteName}'" }, _jsonOptions);

            var designSearch = SearchDesignDocuments(site.Name, folders, documents, "date", limit: 5, includeIds: true);
            var projectDataDocuments = await FetchProjectDataDocumentsAsync(site.Name, site.BuilderName, site.Name, null, includeArchived: false, ct);
            var siteDeliveries = requestRows
                .Where(r => (TryGetStringAny(r, "projectName", "project_name") ?? string.Empty)
                    .Contains(site.Name, StringComparison.OrdinalIgnoreCase)
                    || (TryGetStringAny(r, "builderName", "builder_name") ?? string.Empty)
                    .Contains(site.BuilderName, StringComparison.OrdinalIgnoreCase))
                .Select(r => new
                {
                    id = TryGetString(r, "id"),
                    scheduledDate = NormalizeDateOnlyString(TryGetStringAny(r, "scheduledDate", "scheduled_date")),
                    archived = !string.IsNullOrWhiteSpace(TryGetStringAny(r, "archivedAt", "archived_at")),
                    status = TryGetStringAny(r, "deliveryStatus", "delivery_status") ?? "pending",
                })
                .Take(20)
                .ToList();

            return JsonSerializer.Serialize(new
            {
                site = new
                {
                    site.Name,
                    builder = site.BuilderName,
                    siteLocation = site.SiteLocation,
                    scaffoldEntity = site.ScaffoldEntity,
                    site.Archived,
                    assignedProjectManager = FormatAssignedSitePerson(site.ProjectManager),
                    assignedSiteSupervisor = FormatAssignedSitePerson(site.SiteSupervisor),
                    assignedLeadingHand = FormatAssignedSitePerson(site.LeadingHand),
                },
                inductedEmployees = new
                {
                    count = site.InductedEmployees.Count,
                    employees = site.InductedEmployees.Select(e => new
                    {
                        e.FullName,
                        siteRole = FormatDirectoryRole(e),
                        e.Verified,
                    }).ToList(),
                },
                recentDesigns = JsonDocument.Parse(designSearch).RootElement,
                projectData = new
                {
                    count = projectDataDocuments.Count,
                    byKind = projectDataDocuments
                        .GroupBy(d => d.KindLabel)
                        .Select(g => new { kind = g.Key, count = g.Count() })
                        .OrderBy(g => g.kind)
                        .ToList(),
                    latest = projectDataDocuments
                        .OrderByDescending(d => TryParseDateTimeOffset(d.UploadedAt) ?? DateTimeOffset.MinValue)
                        .Take(5)
                        .Select(ProjectDataDocumentResponse)
                        .ToList(),
                },
                deliveries = new { count = siteDeliveries.Count, recent = siteDeliveries },
            }, _jsonOptions);
        }

        private async Task<string> Tool_GetRecentDesigns(JsonElement args, CancellationToken ct)
        {
            var days = TryGetInt(args, "days") ?? 30;
            var limit = Math.Min(TryGetInt(args, "limit") ?? 10, 50);
            var cutoff = DateTime.UtcNow.AddDays(-days);

            var (folders, documents) = await FetchDesignDataAsync(ct);
            var folderPaths = BuildFolderPaths(folders);

            var recent = documents
                .Where(d => TryGetDate(d, "updated_at") >= cutoff || TryGetDate(d, "created_at") >= cutoff)
                .Select(d =>
                {
                    var folderId = TryGetString(d, "folder_id") ?? string.Empty;
                    return new
                    {
                        documentId = TryGetString(d, "id"),
                        name = TryGetString(d, "ess_design_issue_name") ?? TryGetString(d, "third_party_design_name") ?? "Unnamed",
                        revision = TryGetString(d, "revision_number"),
                        description = TryGetString(d, "description"),
                        updatedAt = TryGetString(d, "updated_at"),
                        folderPath = folderPaths.TryGetValue(folderId, out var fp) ? fp : string.Empty,
                        hasEssDesign = !string.IsNullOrWhiteSpace(TryGetString(d, "ess_design_issue_path")),
                        hasThirdPartyDesign = !string.IsNullOrWhiteSpace(TryGetString(d, "third_party_design_path")),
                    };
                })
                .OrderByDescending(d => d.updatedAt)
                .Take(limit)
                .ToList();

            return JsonSerializer.Serialize(new { days, count = recent.Count, designs = recent }, _jsonOptions);
        }

        private async Task<string> Tool_FindAnything(JsonElement args, CancellationToken ct)
        {
            var query = TryGetString(args, "query") ?? string.Empty;
            if (string.IsNullOrWhiteSpace(query))
                return JsonSerializer.Serialize(new { error = "Query is required." }, _jsonOptions);

            var tokens = BuildBroadSearchTokens(query);
            var employees = await FetchEmployeeDirectoryAsync(ct);
            var jobsites = await FetchJobsiteDirectoryAsync(ct);
            var (_, documents) = await FetchDesignDataAsync(ct);
            var projectDataDocuments = await FetchProjectDataDocumentsAsync(query, null, null, null, includeArchived: false, ct);

            var employeeMatches = employees
                .Where(e => tokens.Any(t =>
                    e.FullName.Contains(t, StringComparison.OrdinalIgnoreCase) ||
                    (e.Email ?? string.Empty).Contains(t, StringComparison.OrdinalIgnoreCase)))
                .Take(5)
                .Select(e => new { type = "employee", name = e.FullName, e.Email, role = e.AppRole ?? AppRoles.Viewer })
                .Cast<object>().ToList();

            var siteMatches = jobsites
                .Where(j => tokens.Any(t =>
                    j.Name.Contains(t, StringComparison.OrdinalIgnoreCase) ||
                    j.BuilderName.Contains(t, StringComparison.OrdinalIgnoreCase) ||
                    j.ScaffoldEntity.Contains(t, StringComparison.OrdinalIgnoreCase) ||
                    (j.SiteLocation ?? string.Empty).Contains(t, StringComparison.OrdinalIgnoreCase)))
                .Take(5)
                .Select(j => new { type = "jobsite", name = j.Name, builder = j.BuilderName, scaffoldEntity = j.ScaffoldEntity, j.Archived })
                .Cast<object>().ToList();

            var designMatches = documents
                .Where(d => tokens.Any(t =>
                    (TryGetString(d, "ess_design_issue_name") ?? string.Empty).Contains(t, StringComparison.OrdinalIgnoreCase) ||
                    (TryGetString(d, "third_party_design_name") ?? string.Empty).Contains(t, StringComparison.OrdinalIgnoreCase) ||
                    (TryGetString(d, "description") ?? string.Empty).Contains(t, StringComparison.OrdinalIgnoreCase)))
                .Take(5)
                .Select(d => new
                {
                    type = "design",
                    documentId = TryGetString(d, "id"),
                    name = TryGetString(d, "ess_design_issue_name") ?? TryGetString(d, "third_party_design_name"),
                    revision = TryGetString(d, "revision_number"),
                    updatedAt = TryGetString(d, "updated_at"),
                })
                .Cast<object>().ToList();

            var projectDataMatches = projectDataDocuments
                .OrderByDescending(d => d.MatchScore)
                .ThenByDescending(d => d.UploadedAt)
                .Take(5)
                .Select(d => new
                {
                    type = "project_data",
                    documentId = d.DocumentId,
                    kind = d.KindLabel,
                    name = d.Name,
                    reference = d.Reference,
                    builder = d.BuilderName,
                    project = d.ProjectName,
                    updatedAt = d.UploadedAt,
                })
                .Cast<object>().ToList();

            return JsonSerializer.Serialize(new
            {
                query,
                employees = employeeMatches,
                jobsites = siteMatches,
                designs = designMatches,
                projectData = projectDataMatches,
                tip = "Call more specific tools (get_site_details, search_designs, search_project_data_documents, get_employee_details) for complete information on any of these results.",
            }, _jsonOptions);
        }

        private async Task<string> Tool_FindSitesNear(JsonElement args, CancellationToken ct)
        {
            var locationQuery = TryGetString(args, "location") ?? string.Empty;
            var limit = TryGetInt(args, "limit") ?? 10;
            var includeArchived = args.TryGetProperty("include_archived", out var iaProp) && iaProp.ValueKind == JsonValueKind.True;

            const double YardLat = -33.8122;
            const double YardLon = 150.9354;

            double refLat, refLon;
            string refLabel;

            var isYard = string.IsNullOrWhiteSpace(locationQuery)
                || locationQuery.Equals("yard", StringComparison.OrdinalIgnoreCase)
                || locationQuery.Equals("depot", StringComparison.OrdinalIgnoreCase)
                || locationQuery.Contains("gilba", StringComparison.OrdinalIgnoreCase)
                || locationQuery.Contains("girraween", StringComparison.OrdinalIgnoreCase);

            if (isYard)
            {
                refLat = YardLat;
                refLon = YardLon;
                refLabel = "the ESS yard (130 Gilba Road, Girraween)";
            }
            else
            {
                var coords = await NominatimGeocodeAsync(locationQuery, ct);
                if (coords == null)
                    return JsonSerializer.Serialize(new { error = $"Could not geocode location: '{locationQuery}'. Try a more specific Sydney address or suburb." }, _jsonOptions);
                refLat = coords.Value.Lat;
                refLon = coords.Value.Lon;
                refLabel = locationQuery;
            }

            var jobsites = await FetchJobsiteDirectoryAsync(ct);
            if (!includeArchived)
                jobsites = jobsites.Where(j => !j.Archived).ToList();

            var withDistance = new List<(JobsiteContextRow Site, double DistanceKm, string? GeocodedAddress)>();

            var geocodeTasks = jobsites
                .Where(j => !string.IsNullOrWhiteSpace(j.SiteLocation))
                .Select(async j =>
                {
                    var coords = await NominatimGeocodeAsync(j.SiteLocation!, ct);
                    return (Site: j, Coords: coords);
                });

            var geocoded = await Task.WhenAll(geocodeTasks);

            foreach (var (site, coords) in geocoded)
            {
                if (coords == null) continue;
                var km = HaversineKm(refLat, refLon, coords.Value.Lat, coords.Value.Lon);
                withDistance.Add((site, km, site.SiteLocation));
            }

            var results = withDistance
                .OrderBy(x => x.DistanceKm)
                .Take(limit)
                .Select(x => new
                {
                    rank = withDistance.OrderBy(y => y.DistanceKm).ToList().IndexOf(x) + 1,
                    site = x.Site.Name,
                    builder = x.Site.BuilderName,
                    address = x.GeocodedAddress,
                    distanceKm = Math.Round(x.DistanceKm, 1),
                    distanceLabel = x.DistanceKm < 1 ? $"{(int)(x.DistanceKm * 1000)} m" : $"{x.DistanceKm:F1} km",
                    archived = x.Site.Archived,
                })
                .ToList();

            return JsonSerializer.Serialize(new
            {
                referencePoint = refLabel,
                count = results.Count,
                sites = results,
            }, _jsonOptions);
        }

        private static double HaversineKm(double lat1, double lon1, double lat2, double lon2)
        {
            const double R = 6371.0;
            var dLat = (lat2 - lat1) * Math.PI / 180.0;
            var dLon = (lon2 - lon1) * Math.PI / 180.0;
            var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
                  + Math.Cos(lat1 * Math.PI / 180.0) * Math.Cos(lat2 * Math.PI / 180.0)
                  * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
            return R * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        }

        private async Task<(double Lat, double Lon)?> NominatimGeocodeAsync(string address, CancellationToken ct)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                var url = $"https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=au&q={Uri.EscapeDataString(address)}";
                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                request.Headers.Add("User-Agent", "ESSDesignApp/1.0 (nathanb@erectsafe.com.au)");
                using var response = await client.SendAsync(request, ct);
                if (!response.IsSuccessStatusCode) return null;
                var json = await response.Content.ReadAsStringAsync(ct);
                using var doc = JsonDocument.Parse(json);
                var results = doc.RootElement;
                if (results.ValueKind != JsonValueKind.Array || results.GetArrayLength() == 0) return null;
                var first = results[0];
                if (!first.TryGetProperty("lat", out var latEl) || !first.TryGetProperty("lon", out var lonEl)) return null;
                if (!double.TryParse(latEl.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var lat)) return null;
                if (!double.TryParse(lonEl.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var lon)) return null;
                return (lat, lon);
            }
            catch
            {
                return null;
            }
        }

        // ── Shared Helpers ────────────────────────────────────────────────────

        private async Task<List<EmployeeContextRow>> FetchEmployeeDirectoryAsync(CancellationToken ct)
        {
            var employeesTask = GetRestRowsAsync<JsonElement>(
                "ess_rostering_employees?select=id,first_name,last_name,email,phone_number,leading_hand,linked_auth_user_id,verified_at,preferred_site_1,preferred_site_2,preferred_site_3", ct);
            var userNamesTask = GetRestRowsAsync<JsonElement>(
                "user_names?select=id,email,full_name,phone_number,preferred_name,date_of_birth,gender,personal_address,address_street,address_city,address_state,address_postal_code,address_country,emergency_contact_name,emergency_relationship,emergency_phone_number,emergency_email,emergency_address&order=full_name.asc&limit=1000", ct);
            var userRolesTask = GetRestRowsAsync<JsonElement>(
                "user_roles?select=user_id,role&limit=1000", ct);

            await Task.WhenAll(employeesTask, userNamesTask, userRolesTask);
            return BuildEmployeeDirectory(employeesTask.Result, userNamesTask.Result, userRolesTask.Result);
        }

        private async Task<List<JobsiteContextRow>> FetchJobsiteDirectoryAsync(CancellationToken ct)
        {
            var employees = await FetchEmployeeDirectoryAsync(ct);
            var projectsDoc = await ReadStorageJsonAsync(SafetyBucket, SafetyProjectsPath, ct);
            return BuildJobsiteDirectory(projectsDoc, employees);
        }

        private async Task<(List<JsonElement> folders, List<JsonElement> documents)> FetchDesignDataAsync(CancellationToken ct)
        {
            var foldersTask = GetRestRowsAsync<JsonElement>(
                "folders?select=id,name,parent_folder_id,user_id,total_file_size,created_at,updated_at&limit=5000", ct);
            var documentsTask = GetRestRowsAsync<JsonElement>(
                "design_documents?select=id,folder_id,revision_number,description,ess_design_issue_path,ess_design_issue_name,third_party_design_path,third_party_design_name,user_id,created_at,updated_at&order=updated_at.desc&limit=5000",
                ct);
            await Task.WhenAll(foldersTask, documentsTask);
            return (foldersTask.Result, documentsTask.Result);
        }

        private async Task<List<ProjectDataDocumentRow>> FetchProjectDataDocumentsAsync(
            string query,
            string? builderFilter,
            string? projectFilter,
            string? kindFilter,
            bool includeArchived,
            CancellationToken ct)
        {
            var normalizedKind = NormalizeProjectDataKind(kindFilter);
            var jobsites = await FetchJobsiteDirectoryAsync(ct);
            var tokens = BuildProjectDataSearchTokens(query);
            var numericTokens = BuildNumericSearchTokens(query);
            var rows = new List<ProjectDataDocumentRow>();

            var filteredSites = jobsites
                .Where(site => includeArchived || !site.Archived)
                .Where(site => string.IsNullOrWhiteSpace(builderFilter)
                    || site.BuilderName.Contains(builderFilter, StringComparison.OrdinalIgnoreCase))
                .Where(site => string.IsNullOrWhiteSpace(projectFilter)
                    || site.Name.Contains(projectFilter, StringComparison.OrdinalIgnoreCase)
                    || (site.SiteLocation ?? string.Empty).Contains(projectFilter, StringComparison.OrdinalIgnoreCase))
                .ToList();

            foreach (var site in filteredSites)
            {
                if (string.IsNullOrWhiteSpace(site.BuilderId) || string.IsNullOrWhiteSpace(site.Id))
                    continue;

                if (normalizedKind == null || normalizedKind == "scaff-tags")
                    await AddScaffTagProjectDataDocumentsAsync(site, rows, ct);
                if (normalizedKind == null || normalizedKind == "handover-certificates")
                    await AddHandoverProjectDataDocumentsAsync(site, rows, ct);
                if (normalizedKind == null || normalizedKind == "swms")
                    await AddUploadedProjectDataDocumentsAsync(site, "swms", rows, ct);
                if (normalizedKind == null || normalizedKind == "day-labour-forms")
                    await AddUploadedProjectDataDocumentsAsync(site, "day-labour-forms", rows, ct);
                if (normalizedKind == null || normalizedKind == "design-document")
                    await AddUploadedProjectDataDocumentsAsync(site, "design-document", rows, ct);
            }

            foreach (var row in rows)
            {
                var candidateText = BuildProjectDataCandidateText(row);
                var matchedTerms = new List<string>();
                row.MatchScore = tokens.Count == 0 ? 1 : ScoreSearchCandidate(candidateText, tokens, out matchedTerms);
                row.MatchedTerms = matchedTerms;
            }

            return rows
                .Where(row => tokens.Count == 0 || row.MatchScore > 0)
                .Where(row => numericTokens.Count == 0 || numericTokens.All(token => NumericTokenAppears(NormalizeSearchText(BuildProjectDataCandidateText(row)), token)))
                .ToList();
        }

        private async Task AddUploadedProjectDataDocumentsAsync(JobsiteContextRow site, string kind, List<ProjectDataDocumentRow> rows, CancellationToken ct)
        {
            var prefix = ProjectDataPrefix(site.BuilderId!, site.Id!, kind);
            var objects = await ListSafetyStorageObjectsAsync(prefix, 200, ct);
            var index = 0;
            foreach (var obj in objects)
            {
                var fileName = TryGetString(obj, "name") ?? string.Empty;
                if (string.IsNullOrWhiteSpace(fileName) || !fileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
                    continue;

                var storagePath = $"{prefix}/{fileName}";
                var cleanName = StripTimestampFilePrefix(fileName);
                rows.Add(new ProjectDataDocumentRow
                {
                    DocumentId = BuildProjectDataDocumentId(kind, site.BuilderId!, site.Id!, storagePath),
                    Kind = kind,
                    KindLabel = ProjectDataKindLabel(kind),
                    BuilderId = site.BuilderId!,
                    BuilderName = site.BuilderName,
                    ProjectId = site.Id!,
                    ProjectName = site.Name,
                    SiteLocation = site.SiteLocation,
                    Name = cleanName,
                    Reference = MakeProjectDataReference(kind, index),
                    UploadedAt = TryGetStringAny(obj, "updated_at", "created_at", "last_accessed_at") ?? string.Empty,
                    UploadedBy = "Project data",
                    StoragePath = storagePath,
                    Size = TryGetStorageObjectSize(obj),
                    Details = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                    {
                        ["fileName"] = cleanName,
                        ["storagePath"] = storagePath,
                    },
                });
                index++;
            }
        }

        private async Task AddScaffTagProjectDataDocumentsAsync(JobsiteContextRow site, List<ProjectDataDocumentRow> rows, CancellationToken ct)
        {
            var indexPath = $"{ProjectDataPrefix(site.BuilderId!, site.Id!, "scaff-tags")}/index.json";
            var indexDoc = await ReadStorageJsonAsync(SafetyBucket, indexPath, ct);
            if (indexDoc?.RootElement.ValueKind != JsonValueKind.Object
                || !indexDoc.RootElement.TryGetProperty("forms", out var forms)
                || forms.ValueKind != JsonValueKind.Array)
                return;

            var index = 0;
            foreach (var item in forms.EnumerateArray())
            {
                var formId = TryGetString(item, "id");
                if (string.IsNullOrWhiteSpace(formId))
                    continue;

                var formPath = $"{ProjectDataPrefix(site.BuilderId!, site.Id!, "scaff-tags")}/forms/{formId}.json";
                var formDoc = await ReadStorageJsonAsync(SafetyBucket, formPath, ct);
                var form = formDoc?.RootElement.ValueKind == JsonValueKind.Object ? formDoc.RootElement : item;
                var scaffoldNo = TryGetStringAny(form, "scaffoldNo", "tagNumber") ?? TryGetStringAny(item, "scaffoldNo", "tagNumber") ?? MakeProjectDataReference("scaff-tags", index);
                var latestInspection = TryGetStringAny(form, "latestInspectionDate", "inspectionDate", "inspectionDateTime")
                    ?? TryGetStringAny(item, "latestInspectionDate", "inspectionDate", "inspectionDateTime");
                var updatedAt = TryGetStringAny(form, "updatedAt", "updated_at")
                    ?? TryGetStringAny(item, "updatedAt", "updated_at")
                    ?? latestInspection
                    ?? string.Empty;
                var pdfPath = TryGetStringAny(form, "pdfPath", "pdf_path") ?? $"{ProjectDataPrefix(site.BuilderId!, site.Id!, "scaff-tags")}/pdf/{formId}.pdf";

                rows.Add(new ProjectDataDocumentRow
                {
                    DocumentId = BuildProjectDataDocumentId("scaff-tags", site.BuilderId!, site.Id!, formId),
                    Kind = "scaff-tags",
                    KindLabel = ProjectDataKindLabel("scaff-tags"),
                    BuilderId = site.BuilderId!,
                    BuilderName = site.BuilderName,
                    ProjectId = site.Id!,
                    ProjectName = site.Name,
                    SiteLocation = site.SiteLocation,
                    Name = $"{scaffoldNo}.pdf",
                    Reference = scaffoldNo,
                    Status = GetScaffTagStatus(latestInspection),
                    UploadedAt = updatedAt,
                    UploadedBy = TryGetStringAny(form, "inspectedBy", "competentPerson", "uploadedBy") ?? "Site team",
                    ExpiresAt = AddMonthsIso(latestInspection, 3),
                    Location = TryGetStringAny(form, "jobLocation", "location") ?? TryGetStringAny(item, "jobLocation", "location"),
                    StoragePath = pdfPath,
                    FormId = formId,
                    Details = BuildJsonScalarSummary(form),
                });
                index++;
            }
        }

        private async Task AddHandoverProjectDataDocumentsAsync(JobsiteContextRow site, List<ProjectDataDocumentRow> rows, CancellationToken ct)
        {
            var indexPath = $"{ProjectDataPrefix(site.BuilderId!, site.Id!, "handover-certificates")}/index.json";
            var indexDoc = await ReadStorageJsonAsync(SafetyBucket, indexPath, ct);
            if (indexDoc?.RootElement.ValueKind != JsonValueKind.Object
                || !indexDoc.RootElement.TryGetProperty("forms", out var forms)
                || forms.ValueKind != JsonValueKind.Array)
                return;

            var index = 0;
            foreach (var item in forms.EnumerateArray())
            {
                var formId = TryGetString(item, "id");
                if (string.IsNullOrWhiteSpace(formId))
                    continue;

                var formPath = $"{ProjectDataPrefix(site.BuilderId!, site.Id!, "handover-certificates")}/forms/{formId}.json";
                var formDoc = await ReadStorageJsonAsync(SafetyBucket, formPath, ct);
                var form = formDoc?.RootElement.ValueKind == JsonValueKind.Object ? formDoc.RootElement : item;
                var reference = TryGetStringAny(form, "inspectionNumber", "formReferenceName")
                    ?? TryGetStringAny(item, "inspectionNumber", "formReferenceName")
                    ?? MakeProjectDataReference("handover-certificates", index);
                var name = TryGetStringAny(form, "formReferenceName", "inspectionNumber")
                    ?? TryGetStringAny(item, "formReferenceName", "inspectionNumber")
                    ?? $"Handover certificate {reference}";
                var updatedAt = TryGetStringAny(form, "updatedAt", "updated_at", "inspectionDateTime")
                    ?? TryGetStringAny(item, "updatedAt", "updated_at", "inspectionDateTime")
                    ?? string.Empty;
                var pdfPath = TryGetStringAny(form, "pdfPath", "pdf_path") ?? $"{ProjectDataPrefix(site.BuilderId!, site.Id!, "handover-certificates")}/pdf/{formId}.pdf";

                rows.Add(new ProjectDataDocumentRow
                {
                    DocumentId = BuildProjectDataDocumentId("handover-certificates", site.BuilderId!, site.Id!, formId),
                    Kind = "handover-certificates",
                    KindLabel = ProjectDataKindLabel("handover-certificates"),
                    BuilderId = site.BuilderId!,
                    BuilderName = site.BuilderName,
                    ProjectId = site.Id!,
                    ProjectName = site.Name,
                    SiteLocation = site.SiteLocation,
                    Name = EnsurePdfName(name),
                    Reference = reference,
                    Status = "Current",
                    UploadedAt = updatedAt,
                    UploadedBy = TryGetStringAny(form, "essRepresentativeName", "clientName", "uploadedBy") ?? "Site team",
                    Location = TryGetStringAny(form, "sectionLocation", "projectNumberClient"),
                    StoragePath = pdfPath,
                    FormId = formId,
                    Details = BuildJsonScalarSummary(form),
                });
                index++;
            }
        }

        private object ProjectDataDocumentResponse(ProjectDataDocumentRow row) => new
        {
            documentId = row.DocumentId,
            kind = row.Kind,
            kindLabel = row.KindLabel,
            name = row.Name,
            reference = row.Reference,
            status = row.Status,
            builder = row.BuilderName,
            project = row.ProjectName,
            siteLocation = row.SiteLocation,
            uploadedAt = row.UploadedAt,
            uploadedBy = row.UploadedBy,
            expiresAt = row.ExpiresAt,
            location = row.Location,
            size = row.Size,
            hasPdf = !string.IsNullOrWhiteSpace(row.StoragePath),
            details = row.Details,
            matchScore = row.MatchScore,
            matchedTerms = row.MatchedTerms,
        };

        private string SearchDesignDocuments(
            string query,
            List<JsonElement> folders,
            List<JsonElement> documents,
            string sortBy,
            int limit,
            bool includeIds,
            bool allRevisions = false,
            IReadOnlyList<JobsiteContextRow>? jobsites = null)
        {
            var folderPaths = BuildFolderPaths(folders);
            var queryResolution = ResolveDesignQueryAgainstKnownSites(query, jobsites);
            var searchQuery = queryResolution.Query;
            var tokens = BuildSearchTokens(searchQuery);
            var numericTokens = BuildNumericSearchTokens(searchQuery);

            var candidates = documents.Select(d =>
            {
                var folderId = TryGetString(d, "folder_id") ?? string.Empty;
                var path = folderPaths.TryGetValue(folderId, out var fp) ? fp : string.Empty;
                var essName = TryGetString(d, "ess_design_issue_name") ?? string.Empty;
                var thirdName = TryGetString(d, "third_party_design_name") ?? string.Empty;
                var description = TryGetString(d, "description") ?? string.Empty;
                var revision = TryGetString(d, "revision_number") ?? string.Empty;
                var candidateText = $"{path} {essName} {thirdName} {description} {revision}";
                var matchedTerms = new List<string>();
                var score = tokens.Count > 0
                    ? ScoreSearchCandidate(candidateText, tokens, out matchedTerms)
                    : 1;
                var normalizedCandidate = NormalizeSearchText(candidateText);
                return new
                {
                    documentId = TryGetString(d, "id"),
                    name = string.IsNullOrWhiteSpace(essName) ? thirdName : essName,
                    thirdPartyName = thirdName,
                    folderPath = path,
                    folderId,
                    revision,
                    description,
                    updatedAt = TryGetString(d, "updated_at") ?? TryGetString(d, "created_at") ?? string.Empty,
                    hasEssDesign = !string.IsNullOrWhiteSpace(TryGetString(d, "ess_design_issue_path")),
                    hasThirdPartyDesign = !string.IsNullOrWhiteSpace(TryGetString(d, "third_party_design_path")),
                    score,
                    matchedTerms,
                    normalizedCandidate,
                };
            })
            .Where(c => tokens.Count == 0 || c.score > 0)
            .Where(c => numericTokens.Count == 0 || numericTokens.All(token => NumericTokenAppears(c.normalizedCandidate, token)))
            .ToList();

            IEnumerable<dynamic> sorted = sortBy == "date" && tokens.Count == 0
                ? candidates.OrderByDescending(c => c.updatedAt)
                : candidates.OrderByDescending(c => c.score).ThenByDescending(c => c.updatedAt);

            if (!allRevisions && tokens.Count > 0)
            {
                // Group by folder and take best per folder to avoid listing all revisions
                sorted = sorted
                    .GroupBy(c => (string)c.folderId)
                    .SelectMany(g => g.Take(1))
                    .OrderByDescending(c => (int)c.score)
                    .ThenByDescending(c => (string)c.updatedAt);
            }

            var results = sorted.Take(limit).ToList();

            return JsonSerializer.Serialize(new
            {
                query,
                searchedQuery = searchQuery,
                correctedFrom = queryResolution.CorrectedFrom,
                correctionReason = queryResolution.CorrectionReason,
                matchedSites = queryResolution.MatchedSites,
                count = results.Count,
                designs = results.Select(c => (object)new
                {
                    documentId = includeIds ? c.documentId : null,
                    name = c.name,
                    revision = c.revision,
                    description = c.description,
                    folderPath = c.folderPath,
                    updatedAt = c.updatedAt,
                    matchScore = c.score,
                    matchedTerms = c.matchedTerms,
                    hasEssDesign = c.hasEssDesign,
                    hasThirdPartyDesign = c.hasThirdPartyDesign,
                }).ToList(),
            }, _jsonOptions);
        }

        private static List<EmployeeContextRow> BuildEmployeeDirectory(
            IReadOnlyList<JsonElement> employees,
            IReadOnlyList<JsonElement> userNames,
            IReadOnlyList<JsonElement> userRoles)
        {
            var rolesByUserId = userRoles
                .Select(r => new { UserId = TryGetString(r, "user_id"), Role = TryGetString(r, "role") })
                .Where(r => r.UserId != null)
                .ToDictionary(r => r.UserId!, r => r.Role, StringComparer.OrdinalIgnoreCase);

            var userIdByEmail = userNames
                .Select(u => new { Id = TryGetString(u, "id"), Email = TryGetString(u, "email") })
                .Where(u => u.Id != null && u.Email != null)
                .ToDictionary(u => u.Email!, u => u.Id!, StringComparer.OrdinalIgnoreCase);

            var profileByUserId = userNames
                .Select(u => new { Id = TryGetString(u, "id"), Row = u })
                .Where(u => u.Id != null)
                .ToDictionary(u => u.Id!, u => u.Row, StringComparer.OrdinalIgnoreCase);

            var usedUserIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            EmployeeContextRow BuildFromProfile(JsonElement profile, string? userId, string? fallbackEmail = null, bool isRosterEmployee = false)
            {
                var fullName = TryGetString(profile, "full_name") ?? string.Empty;
                var names = fullName.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                var role = userId != null && rolesByUserId.TryGetValue(userId, out var appRole) ? appRole : null;

                return new EmployeeContextRow
                {
                    Id = null,
                    UserId = userId,
                    IsRosterEmployee = isRosterEmployee,
                    FirstName = names.Length > 0 ? names[0] : fullName,
                    LastName = names.Length > 1 ? names[1] : string.Empty,
                    FullName = fullName,
                    Email = TryGetString(profile, "email") ?? fallbackEmail,
                    PhoneNumber = TryGetString(profile, "phone_number"),
                    PreferredName = TryGetString(profile, "preferred_name"),
                    DateOfBirth = TryGetString(profile, "date_of_birth"),
                    Gender = TryGetString(profile, "gender"),
                    PersonalAddress = TryGetString(profile, "personal_address"),
                    AddressStreet = TryGetString(profile, "address_street"),
                    AddressCity = TryGetString(profile, "address_city"),
                    AddressState = TryGetString(profile, "address_state"),
                    AddressPostalCode = TryGetString(profile, "address_postal_code"),
                    AddressCountry = TryGetString(profile, "address_country"),
                    EmergencyContactName = TryGetString(profile, "emergency_contact_name"),
                    EmergencyRelationship = TryGetString(profile, "emergency_relationship"),
                    EmergencyPhoneNumber = TryGetString(profile, "emergency_phone_number"),
                    EmergencyEmail = TryGetString(profile, "emergency_email"),
                    EmergencyAddress = TryGetString(profile, "emergency_address"),
                    LeadingHand = false,
                    Verified = false,
                    AppRole = role,
                };
            }

            var rosterRows = employees
                .Select(row =>
                {
                    var firstName = TryGetString(row, "first_name") ?? string.Empty;
                    var lastName = TryGetString(row, "last_name") ?? string.Empty;
                    var email = TryGetString(row, "email");
                    var linkedUserId = TryGetString(row, "linked_auth_user_id");
                    var userId = !string.IsNullOrWhiteSpace(linkedUserId)
                        ? linkedUserId
                        : email != null && userIdByEmail.TryGetValue(email, out var uid) ? uid : null;
                    var appRole = userId != null && rolesByUserId.TryGetValue(userId, out var role) ? role : null;
                    JsonElement profile = default;
                    var hasProfile = userId != null && profileByUserId.TryGetValue(userId, out profile);
                    if (userId != null)
                        usedUserIds.Add(userId);

                    return new EmployeeContextRow
                    {
                        Id = TryGetString(row, "id"),
                        UserId = userId,
                        IsRosterEmployee = true,
                        FirstName = firstName,
                        LastName = lastName,
                        FullName = $"{firstName} {lastName}".Trim(),
                        Email = hasProfile ? TryGetString(profile, "email") ?? email : email,
                        PhoneNumber = hasProfile ? TryGetString(profile, "phone_number") ?? TryGetString(row, "phone_number") : TryGetString(row, "phone_number"),
                        PreferredName = hasProfile ? TryGetString(profile, "preferred_name") : null,
                        DateOfBirth = hasProfile ? TryGetString(profile, "date_of_birth") : null,
                        Gender = hasProfile ? TryGetString(profile, "gender") : null,
                        PersonalAddress = hasProfile ? TryGetString(profile, "personal_address") : null,
                        AddressStreet = hasProfile ? TryGetString(profile, "address_street") : null,
                        AddressCity = hasProfile ? TryGetString(profile, "address_city") : null,
                        AddressState = hasProfile ? TryGetString(profile, "address_state") : null,
                        AddressPostalCode = hasProfile ? TryGetString(profile, "address_postal_code") : null,
                        AddressCountry = hasProfile ? TryGetString(profile, "address_country") : null,
                        EmergencyContactName = hasProfile ? TryGetString(profile, "emergency_contact_name") : null,
                        EmergencyRelationship = hasProfile ? TryGetString(profile, "emergency_relationship") : null,
                        EmergencyPhoneNumber = hasProfile ? TryGetString(profile, "emergency_phone_number") : null,
                        EmergencyEmail = hasProfile ? TryGetString(profile, "emergency_email") : null,
                        EmergencyAddress = hasProfile ? TryGetString(profile, "emergency_address") : null,
                        LeadingHand = TryGetBool(row, "leading_hand"),
                        Verified = TryGetString(row, "verified_at") != null,
                        AppRole = appRole,
                        PreferredSites = new[]
                        {
                            TryGetString(row, "preferred_site_1"),
                            TryGetString(row, "preferred_site_2"),
                            TryGetString(row, "preferred_site_3"),
                        }
                        .Where(s => !string.IsNullOrWhiteSpace(s))
                        .Select(s => s!)
                        .ToList(),
                    };
                })
                .Where(e => !string.IsNullOrWhiteSpace(e.FullName) || !string.IsNullOrWhiteSpace(e.Email))
                .ToList();

            var profileOnlyRows = userNames
                .Select(u => new { Id = TryGetString(u, "id"), Email = TryGetString(u, "email"), FullName = TryGetString(u, "full_name"), Row = u })
                .Where(u => u.Id != null && !usedUserIds.Contains(u.Id) && (!string.IsNullOrWhiteSpace(u.FullName) || !string.IsNullOrWhiteSpace(u.Email)))
                .Select(u => BuildFromProfile(u.Row, u.Id, u.Email))
                .ToList();

            return rosterRows
                .Concat(profileOnlyRows)
                .OrderBy(e => e.LastName)
                .ThenBy(e => e.FirstName)
                .ToList();
        }

        private static List<JobsiteContextRow> BuildJobsiteDirectory(
            JsonDocument? projectsDoc,
            IReadOnlyList<EmployeeContextRow> employeeDirectory)
        {
            var jobsites = new List<JobsiteContextRow>();
            var employeesById = employeeDirectory
                .Where(e => !string.IsNullOrWhiteSpace(e.Id))
                .ToDictionary(e => e.Id!, e => e, StringComparer.OrdinalIgnoreCase);
            var employeesByUserId = employeeDirectory
                .Where(e => !string.IsNullOrWhiteSpace(e.UserId))
                .GroupBy(e => e.UserId!, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

            EmployeeContextRow? ResolveAssignedPerson(string? employeeId, string? userId)
            {
                if (!string.IsNullOrWhiteSpace(employeeId) && employeesById.TryGetValue(employeeId, out var byEmployeeId))
                    return byEmployeeId;

                if (!string.IsNullOrWhiteSpace(userId) && employeesByUserId.TryGetValue(userId, out var byUserId))
                    return byUserId;

                return null;
            }

            if (projectsDoc?.RootElement.TryGetProperty("builders", out var builders) != true
                || builders.ValueKind != JsonValueKind.Array)
                return jobsites;

            foreach (var builder in builders.EnumerateArray())
            {
                var builderName = TryGetString(builder, "name") ?? "Unknown builder";
                var builderId = TryGetString(builder, "id");
                if (!builder.TryGetProperty("projects", out var projects) || projects.ValueKind != JsonValueKind.Array)
                    continue;

                foreach (var project in projects.EnumerateArray())
                {
                    var projectId = TryGetString(project, "id");
                    var siteKey = builderId != null && projectId != null ? $"{builderId}:{projectId}" : string.Empty;
                    var hasExplicitInductions = HasStringArray(project, "inductedEmployeeIds") || HasStringArray(project, "inducted_employee_ids");
                    var inductedIds = TryGetStringArrayAny(project, "inductedEmployeeIds", "inducted_employee_ids")
                        .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
                    var projectManagerEmployeeId = TryGetStringAny(project, "projectManagerEmployeeId", "project_manager_employee_id");
                    var projectManagerUserId = TryGetStringAny(project, "projectManagerUserId", "project_manager_user_id");
                    var siteSupervisorEmployeeId = TryGetStringAny(project, "siteSupervisorEmployeeId", "site_supervisor_employee_id");
                    var siteSupervisorUserId = TryGetStringAny(project, "siteSupervisorUserId", "site_supervisor_user_id");
                    var leadingHandEmployeeId = TryGetStringAny(project, "leadingHandEmployeeId", "leading_hand_employee_id");
                    var leadingHandUserId = TryGetStringAny(project, "leadingHandUserId", "leading_hand_user_id");

                    var inductedEmployees = hasExplicitInductions
                        ? inductedIds
                            .Select(id => employeesById.TryGetValue(id, out var e) ? e : null)
                            .Where(e => e != null).Select(e => e!)
                            .OrderBy(e => e.LastName).ThenBy(e => e.FirstName).ToList()
                        : employeeDirectory
                            .Where(e => !string.IsNullOrWhiteSpace(siteKey) && e.PreferredSites.Contains(siteKey, StringComparer.OrdinalIgnoreCase))
                            .OrderBy(e => e.LastName).ThenBy(e => e.FirstName).ToList();

                    jobsites.Add(new JobsiteContextRow
                    {
                        Id = projectId,
                        Name = TryGetString(project, "name") ?? string.Empty,
                        BuilderId = builderId,
                        BuilderName = builderName,
                        SiteLocation = TryGetString(project, "siteLocation"),
                        ScaffoldEntity = NormalizeScaffoldEntity(TryGetStringAny(project, "scaffoldEntity", "scaffold_entity")),
                        Archived = TryGetBool(project, "archived"),
                        SiteKey = siteKey,
                        InductionSource = hasExplicitInductions ? "explicit-inductedEmployeeIds" : "legacy-employee-preferred-site",
                        InductedEmployeeIds = hasExplicitInductions
                            ? inductedIds
                            : inductedEmployees.Select(e => e.Id ?? string.Empty).Where(id => !string.IsNullOrWhiteSpace(id)).ToList(),
                        InductedEmployees = inductedEmployees,
                        ProjectManagerEmployeeId = projectManagerEmployeeId,
                        ProjectManagerUserId = projectManagerUserId,
                        ProjectManager = ResolveAssignedPerson(projectManagerEmployeeId, projectManagerUserId),
                        SiteSupervisorEmployeeId = siteSupervisorEmployeeId,
                        SiteSupervisorUserId = siteSupervisorUserId,
                        SiteSupervisor = ResolveAssignedPerson(siteSupervisorEmployeeId, siteSupervisorUserId),
                        LeadingHandEmployeeId = leadingHandEmployeeId,
                        LeadingHandUserId = leadingHandUserId,
                        LeadingHand = ResolveAssignedPerson(leadingHandEmployeeId, leadingHandUserId),
                    });
                }
            }

            return jobsites.OrderBy(j => j.Archived).ThenBy(j => j.BuilderName).ThenBy(j => j.Name).ToList();
        }

        private async Task<FileDownloadInfo?> TryGetDownloadInfoAsync(Guid documentId, string type, CancellationToken cancellationToken)
        {
            try
            {
                return await _supabaseService.GetDocumentDownloadUrlAsync(documentId, type);
            }
            catch (Exception ex)
            {
                _logger.LogInformation(ex, "Unable to create assistant download link for {DocumentId}", documentId);
                return null;
            }
        }

        // Returns a match score > 0 if the query words all appear, allowing practical name typos.
        // partial: true is used for suggestion lists and allows close single-token matches.
        private static int FuzzyNameMatch(string fullName, string query, bool partial = false)
        {
            if (string.IsNullOrWhiteSpace(query)) return 1;

            var normalizedName = NormalizeNameForMatching(fullName);
            var normalizedQuery = NormalizeNameForMatching(query);
            if (string.IsNullOrWhiteSpace(normalizedName) || string.IsNullOrWhiteSpace(normalizedQuery)) return 0;

            if (normalizedName.Contains(normalizedQuery, StringComparison.OrdinalIgnoreCase)) return 100;

            var nameTokens = normalizedName.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            var queryTokens = normalizedQuery.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            var matchedTokens = 0;
            var editPenalty = 0;

            foreach (var queryToken in queryTokens)
            {
                var bestDistance = nameTokens
                    .Select(nameToken => GetNameTokenDistance(nameToken, queryToken))
                    .Min();

                if (bestDistance <= MaxNameTokenDistance(queryToken))
                {
                    matchedTokens++;
                    editPenalty += bestDistance;
                }
            }

            if (matchedTokens == queryTokens.Length)
                return 80 + matchedTokens * 10 - editPenalty;

            if (partial && matchedTokens > 0)
                return matchedTokens * 10 - editPenalty;

            return 0;
        }

        private static string NormalizeNameForMatching(string value)
        {
            return Regex.Replace(value.ToLowerInvariant(), @"[^a-z0-9]+", " ").Trim();
        }

        private static int GetNameTokenDistance(string nameToken, string queryToken)
        {
            if (nameToken.StartsWith(queryToken, StringComparison.OrdinalIgnoreCase) ||
                queryToken.StartsWith(nameToken, StringComparison.OrdinalIgnoreCase) ||
                (queryToken.Length >= 3 && nameToken.Contains(queryToken, StringComparison.OrdinalIgnoreCase)))
                return 0;

            return LevenshteinDistance(nameToken, queryToken);
        }

        private static int MaxNameTokenDistance(string queryToken)
        {
            if (queryToken.Length <= 3) return 1;
            if (queryToken.Length <= 6) return 2;
            return 3;
        }

        private static int LevenshteinDistance(string a, string b)
        {
            if (a.Length == 0) return b.Length;
            if (b.Length == 0) return a.Length;
            var d = new int[a.Length + 1, b.Length + 1];
            for (var i = 0; i <= a.Length; i++) d[i, 0] = i;
            for (var j = 0; j <= b.Length; j++) d[0, j] = j;
            for (var i = 1; i <= a.Length; i++)
                for (var j = 1; j <= b.Length; j++)
                    d[i, j] = Math.Min(Math.Min(d[i - 1, j] + 1, d[i, j - 1] + 1),
                        d[i - 1, j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1));
            return d[a.Length, b.Length];
        }

        private static string CleanAssistantReply(string? reply)
        {
            if (string.IsNullOrWhiteSpace(reply)) return string.Empty;
            var withoutMarkdownUrls = Regex.Replace(reply, @"\[([^\]]+)\]\(https?://[^\s)]+\)", "$1");
            var withoutBareUrls = Regex.Replace(withoutMarkdownUrls, @"https?://\S+", "the link below");
            var withoutEmphasis = Regex.Replace(withoutBareUrls, @"(?<!\*)\*{1,3}([^*\r\n][^*\r\n]*?)\*{1,3}(?!\*)", "$1");
            return Regex.Replace(withoutEmphasis, @"(?<!_)_{1,3}([^_\r\n][^_\r\n]*?)_{1,3}(?!_)", "$1").Trim();
        }

        private static string FormatTruckLocationAge(int ageMinutes)
        {
            if (ageMinutes <= 0) return "just now";
            if (ageMinutes == 1) return "1 minute ago";
            if (ageMinutes < 60) return $"{ageMinutes} minutes ago";
            var hours = ageMinutes / 60;
            var minutes = ageMinutes % 60;
            return minutes == 0
                ? $"{hours} hour{(hours == 1 ? string.Empty : "s")} ago"
                : $"{hours} hour{(hours == 1 ? string.Empty : "s")} {minutes} min ago";
        }

        private static string FormatSydneyDateTime(string value)
        {
            if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var recordedAt))
                return string.Empty;
            var local = TimeZoneInfo.ConvertTime(recordedAt, GetSydneyTimeZone());
            return local.ToString("d MMM h:mm tt", CultureInfo.InvariantCulture);
        }

        private static List<TruckLiveLocationContext> BuildTruckLiveLocations(IReadOnlyList<JsonElement> rows)
        {
            var latestByTruck = new Dictionary<string, TruckLiveLocationContext>(StringComparer.OrdinalIgnoreCase);
            var now = DateTimeOffset.UtcNow;

            foreach (var row in rows)
            {
                var latitude = TryGetDoubleAny(row, "latitude", "lat");
                var longitude = TryGetDoubleAny(row, "longitude", "lon", "lng");
                if (latitude == null || longitude == null) continue;

                var truckId = TryGetStringAny(row, "truck_id", "truckId") ?? string.Empty;
                var roleName = TryGetStringAny(row, "role_name", "roleName") ?? string.Empty;
                var truckLabel = TryGetStringAny(row, "truck_label", "truckLabel");
                truckLabel = string.IsNullOrWhiteSpace(truckLabel)
                    ? ResolveKnownTruckLabel(truckId, roleName)
                    : truckLabel.Trim();
                if (string.IsNullOrWhiteSpace(truckLabel))
                    truckLabel = !string.IsNullOrWhiteSpace(roleName) ? roleName.Replace('_', ' ')
                        : !string.IsNullOrWhiteSpace(truckId) ? truckId : "Truck";

                var recordedAt = TryParseDateTimeOffset(TryGetStringAny(row, "recorded_at", "recordedAt"))
                    ?? TryParseDateTimeOffset(TryGetStringAny(row, "updated_at", "updatedAt"))
                    ?? now;
                var updatedAt = TryParseDateTimeOffset(TryGetStringAny(row, "updated_at", "updatedAt")) ?? recordedAt;
                var ageMinutes = Math.Max(0, (int)Math.Round((now - recordedAt.ToUniversalTime()).TotalMinutes, MidpointRounding.AwayFromZero));
                var speedMps = TryGetDoubleAny(row, "speed_mps", "speedMps");
                var statusLabel = BuildTruckLocationStatusLabel(TryGetString(row, "status"), speedMps, ageMinutes);

                var context = new TruckLiveLocationContext
                {
                    TruckId = truckId,
                    TruckLabel = truckLabel,
                    RoleName = roleName,
                    DriverUserId = TryGetStringAny(row, "driver_user_id", "driverUserId"),
                    DeliveryRequestId = TryGetStringAny(row, "delivery_request_id", "deliveryRequestId"),
                    Latitude = latitude.Value,
                    Longitude = longitude.Value,
                    AccuracyM = TryGetDoubleAny(row, "accuracy_m", "accuracyM"),
                    HeadingDeg = TryGetDoubleAny(row, "heading_deg", "headingDeg"),
                    SpeedMps = speedMps,
                    BatteryPercent = TryGetDoubleAny(row, "battery_percent", "batteryPercent"),
                    Status = TryGetString(row, "status") ?? string.Empty,
                    RecordedAt = recordedAt.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture),
                    UpdatedAt = updatedAt.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture),
                    AgeMinutes = ageMinutes,
                    IsStale = ageMinutes > 2,
                    IsOffline = ageMinutes > 10,
                    Freshness = FormatTruckLocationAge(ageMinutes),
                    StatusLabel = statusLabel,
                    Coordinates = FormattableString.Invariant($"{latitude.Value:F6}, {longitude.Value:F6}"),
                    MapUrl = FormattableString.Invariant($"https://www.google.com/maps/search/?api=1&query={latitude.Value:F6},{longitude.Value:F6}"),
                };

                var key = !string.IsNullOrWhiteSpace(context.TruckId) ? context.TruckId
                    : !string.IsNullOrWhiteSpace(context.TruckLabel) ? context.TruckLabel
                    : context.RoleName;
                if (string.IsNullOrWhiteSpace(key)) continue;

                if (!latestByTruck.TryGetValue(key, out var existing) ||
                    string.CompareOrdinal(context.RecordedAt, existing.RecordedAt) > 0)
                    latestByTruck[key] = context;
            }

            return latestByTruck.Values
                .OrderBy(l => ResolveKnownTruckSort(l.TruckId, l.TruckLabel, l.RoleName))
                .ThenBy(l => l.TruckLabel)
                .ToList();
        }

        private static string BuildTruckLocationStatusLabel(string? status, double? speedMps, int ageMinutes)
        {
            var s = (status ?? string.Empty).Trim().ToLowerInvariant();
            if (ageMinutes > 10) return "GPS offline";
            if (ageMinutes > 2) return "GPS stale";
            if (s.Contains("stationary")) return "Stationary";
            if (s.Contains("return")) return "Returning to yard";
            if (s.Contains("route") || s.Contains("transit")) return "On route";
            if (s == "idle") return "Idle";
            if (speedMps.HasValue && speedMps.Value * 3.6 > 5) return "Moving";
            if (!string.IsNullOrWhiteSpace(status)) return CultureInfo.InvariantCulture.TextInfo.ToTitleCase(s.Replace('-', ' '));
            return "Idle";
        }

        private static string ResolveKnownTruckLabel(string truckId, string roleName)
        {
            var known = KnownTruckLanes.FirstOrDefault(lane =>
                string.Equals(lane.TruckId, truckId, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(lane.RoleName, roleName, StringComparison.OrdinalIgnoreCase));
            return string.IsNullOrWhiteSpace(known.Label) ? truckId : known.Label;
        }

        private static int ResolveKnownTruckSort(string truckId, string truckLabel, string roleName)
        {
            var index = Array.FindIndex(KnownTruckLanes, lane =>
                string.Equals(lane.TruckId, truckId, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(lane.Label, truckLabel, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(lane.RoleName, roleName, StringComparison.OrdinalIgnoreCase));
            return index < 0 ? 999 : index;
        }

        // ── Utility methods ───────────────────────────────────────────────────

        private async Task<List<T>> GetRestRowsAsync<T>(string relativePath, CancellationToken cancellationToken)
        {
            var supabaseUrl = _configuration["Supabase:Url"] ?? string.Empty;
            var supabaseKey = _configuration["Supabase:ServiceRoleKey"]
                ?? _configuration["Supabase:Key"]
                ?? string.Empty;

            if (string.IsNullOrWhiteSpace(supabaseUrl) || string.IsNullOrWhiteSpace(supabaseKey))
                return new List<T>();

            var client = _httpClientFactory.CreateClient();
            var url = $"{supabaseUrl.TrimEnd('/')}/rest/v1/{relativePath}";
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Add("apikey", supabaseKey);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", supabaseKey);

            using var response = await client.SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode || string.IsNullOrWhiteSpace(body))
                return new List<T>();

            return JsonSerializer.Deserialize<List<T>>(body, _jsonOptions) ?? new List<T>();
        }

        private async Task<JsonDocument?> ReadStorageJsonAsync(string bucket, string path, CancellationToken cancellationToken)
        {
            var supabaseUrl = _configuration["Supabase:Url"] ?? string.Empty;
            var supabaseKey = _configuration["Supabase:ServiceRoleKey"]
                ?? _configuration["Supabase:Key"]
                ?? string.Empty;

            if (string.IsNullOrWhiteSpace(supabaseUrl) || string.IsNullOrWhiteSpace(supabaseKey))
                return null;

            var client = _httpClientFactory.CreateClient();
            var url = $"{supabaseUrl.TrimEnd('/')}/storage/v1/object/{bucket}/{path}";
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Add("apikey", supabaseKey);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", supabaseKey);

            using var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode) return null;

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            return await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        }

        private async Task<List<JsonElement>> ListSafetyStorageObjectsAsync(string prefix, int limit, CancellationToken cancellationToken)
        {
            var supabaseUrl = _configuration["Supabase:Url"] ?? string.Empty;
            var supabaseKey = _configuration["Supabase:ServiceRoleKey"]
                ?? _configuration["Supabase:Key"]
                ?? string.Empty;

            if (string.IsNullOrWhiteSpace(supabaseUrl) || string.IsNullOrWhiteSpace(supabaseKey))
                return new List<JsonElement>();

            var client = _httpClientFactory.CreateClient();
            var url = $"{supabaseUrl.TrimEnd('/')}/storage/v1/object/list/{Uri.EscapeDataString(SafetyBucket)}";
            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Headers.Add("apikey", supabaseKey);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", supabaseKey);
            request.Content = new StringContent(
                JsonSerializer.Serialize(new { prefix, limit, offset = 0 }, _jsonOptions),
                Encoding.UTF8,
                "application/json");

            using var response = await client.SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode || string.IsNullOrWhiteSpace(body))
                return new List<JsonElement>();

            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
                return new List<JsonElement>();

            return doc.RootElement.EnumerateArray().Select(item => item.Clone()).ToList();
        }

        private async Task<string?> ResolveProjectDataPdfPathAsync(string kind, string builderId, string projectId, string resourceId, CancellationToken ct)
        {
            if (kind == "scaff-tags")
            {
                var form = await ReadStorageJsonAsync(SafetyBucket, $"{ProjectDataPrefix(builderId, projectId, kind)}/forms/{resourceId}.json", ct);
                return form?.RootElement.ValueKind == JsonValueKind.Object
                    ? TryGetStringAny(form.RootElement, "pdfPath", "pdf_path") ?? $"{ProjectDataPrefix(builderId, projectId, kind)}/pdf/{resourceId}.pdf"
                    : $"{ProjectDataPrefix(builderId, projectId, kind)}/pdf/{resourceId}.pdf";
            }

            if (kind == "handover-certificates")
            {
                var form = await ReadStorageJsonAsync(SafetyBucket, $"{ProjectDataPrefix(builderId, projectId, kind)}/forms/{resourceId}.json", ct);
                return form?.RootElement.ValueKind == JsonValueKind.Object
                    ? TryGetStringAny(form.RootElement, "pdfPath", "pdf_path") ?? $"{ProjectDataPrefix(builderId, projectId, kind)}/pdf/{resourceId}.pdf"
                    : $"{ProjectDataPrefix(builderId, projectId, kind)}/pdf/{resourceId}.pdf";
            }

            return resourceId.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) ? resourceId : null;
        }

        private async Task<ProjectDataDocumentRow?> ResolveLooseProjectDataDocumentAsync(
            string documentReference,
            string? builder,
            string? project,
            string? kind,
            CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(documentReference))
                return null;

            var documents = await FetchProjectDataDocumentsAsync(documentReference, builder, project, kind, includeArchived: false, ct);
            var normalizedReference = NormalizeSearchText(documentReference);

            return documents
                .OrderByDescending(document =>
                    string.Equals(document.FormId, documentReference, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(document.Reference, documentReference, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(document.Name, documentReference, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(NormalizeSearchText(document.Reference), normalizedReference, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(NormalizeSearchText(document.Name), normalizedReference, StringComparison.OrdinalIgnoreCase)
                        ? 1000
                        : document.MatchScore)
                .ThenByDescending(document => TryParseDateTimeOffset(document.UploadedAt) ?? DateTimeOffset.MinValue)
                .FirstOrDefault();
        }

        private async Task<string?> ResolveProjectDataPdfPathFromStorageListingAsync(
            string kind,
            string builderId,
            string projectId,
            string resourceId,
            string attemptedPath,
            CancellationToken ct)
        {
            if (kind is "swms" or "day-labour-forms" or "design-document")
                return null;

            var pdfPrefix = $"{ProjectDataPrefix(builderId, projectId, kind)}/pdf";
            var objects = await ListSafetyStorageObjectsAsync(pdfPrefix, 200, ct);
            var resourceToken = NormalizeSearchText(resourceId);
            var attemptedName = Path.GetFileName(attemptedPath);

            var match = objects
                .Select(obj => TryGetString(obj, "name") ?? string.Empty)
                .Where(name => name.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(name => string.Equals(name, attemptedName, StringComparison.OrdinalIgnoreCase))
                .ThenByDescending(name => NormalizeSearchText(name).Contains(resourceToken, StringComparison.OrdinalIgnoreCase))
                .ThenByDescending(name => name)
                .FirstOrDefault();

            return string.IsNullOrWhiteSpace(match) ? null : $"{pdfPrefix}/{match}";
        }

        private static string ProjectDataPrefix(string builderId, string projectId, string kind) =>
            $"site-data/{builderId}/{projectId}/{kind}";

        private static string BuildProjectDataDocumentId(string kind, string builderId, string projectId, string resourceId) =>
            $"{kind}|{builderId}|{projectId}|{resourceId}";

        private static (string Kind, string BuilderId, string ProjectId, string ResourceId)? ParseProjectDataDocumentId(string documentId)
        {
            var parts = (documentId ?? string.Empty).Split('|', 4, StringSplitOptions.None);
            if (parts.Length != 4 || parts.Any(string.IsNullOrWhiteSpace))
                return null;

            var kind = NormalizeProjectDataKind(parts[0]);
            return string.IsNullOrWhiteSpace(kind) ? null : (kind, parts[1], parts[2], parts[3]);
        }

        private static string? NormalizeProjectDataKind(string? value)
        {
            var clean = NormalizeSearchText(value ?? string.Empty);
            if (string.IsNullOrWhiteSpace(clean) || clean == "all")
                return null;
            if (clean.Contains("tag")) return "scaff-tags";
            if (clean.Contains("swms") || clean.Contains("safe work") || clean.Contains("method")) return "swms";
            if (clean.Contains("handover") || clean.Contains("certificate")) return "handover-certificates";
            if (clean.Contains("labour") || clean.Contains("labor") || clean.Contains("day")) return "day-labour-forms";
            if (clean.Contains("design") || clean.Contains("drawing")) return "design-document";
            return value switch
            {
                "scaff-tags" => "scaff-tags",
                "swms" => "swms",
                "handover-certificates" => "handover-certificates",
                "day-labour-forms" => "day-labour-forms",
                "design-document" => "design-document",
                _ => null,
            };
        }

        private static string ProjectDataKindLabel(string kind) => kind switch
        {
            "scaff-tags" => "Scaff-tags",
            "swms" => "SWMS",
            "handover-certificates" => "Handover certificates",
            "day-labour-forms" => "Day Labour forms",
            "design-document" => "Design document",
            _ => "Project data",
        };

        private static string MakeProjectDataReference(string kind, int index)
        {
            var prefix = kind switch
            {
                "scaff-tags" => "TAG",
                "swms" => "SWMS",
                "handover-certificates" => "HOC",
                "day-labour-forms" => "DLF",
                "design-document" => "DES",
                _ => "DOC",
            };
            return $"{prefix}-{index + 1:00000}";
        }

        private static string BuildProjectDataCandidateText(ProjectDataDocumentRow row)
        {
            var detailText = string.Join(" ", row.Details.Select(kv => $"{kv.Key} {kv.Value}"));
            return $"{row.KindLabel} {row.Kind} {row.Name} {row.Reference} {row.Status} {row.BuilderName} {row.ProjectName} {row.SiteLocation} {row.UploadedBy} {row.Location} {detailText}";
        }

        private static List<string> BuildProjectDataSearchTokens(string query)
        {
            var stopWords = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "a", "an", "and", "any", "are", "as", "at", "be", "can", "could", "do", "does",
                "for", "from", "give", "have", "how", "i", "in", "is", "it", "latest", "newest",
                "me", "of", "on", "open", "or", "please", "print", "recent", "show", "the",
                "there", "this", "to", "view", "we", "what", "when", "where", "who", "with", "you",
            };
            return NormalizeSearchText(query)
                .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Where(w => w.Length > 1 && !stopWords.Contains(w))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(16)
                .ToList();
        }

        private static Dictionary<string, string> BuildJsonScalarSummary(JsonElement root, int maxFields = 80)
        {
            var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            AddJsonScalarSummary(root, string.Empty, values, maxFields);
            return values;
        }

        private static void AddJsonScalarSummary(JsonElement element, string prefix, Dictionary<string, string> values, int maxFields)
        {
            if (values.Count >= maxFields)
                return;

            switch (element.ValueKind)
            {
                case JsonValueKind.Object:
                    foreach (var property in element.EnumerateObject())
                    {
                        if (ShouldSkipProjectDataDetailField(property.Name))
                            continue;
                        var key = string.IsNullOrWhiteSpace(prefix) ? property.Name : $"{prefix}.{property.Name}";
                        AddJsonScalarSummary(property.Value, key, values, maxFields);
                        if (values.Count >= maxFields)
                            return;
                    }
                    break;
                case JsonValueKind.Array:
                    var scalarItems = element.EnumerateArray()
                        .Where(item => item.ValueKind is JsonValueKind.String or JsonValueKind.Number or JsonValueKind.True or JsonValueKind.False)
                        .Select(item => item.ToString())
                        .Where(text => !string.IsNullOrWhiteSpace(text))
                        .Take(12)
                        .ToList();
                    if (scalarItems.Count > 0 && !string.IsNullOrWhiteSpace(prefix))
                        values[prefix] = string.Join(", ", scalarItems);
                    break;
                case JsonValueKind.String:
                case JsonValueKind.Number:
                case JsonValueKind.True:
                case JsonValueKind.False:
                    var text = element.ToString().Trim();
                    if (!string.IsNullOrWhiteSpace(prefix) && !string.IsNullOrWhiteSpace(text))
                        values[prefix] = text.Length > 300 ? $"{text[..300]}..." : text;
                    break;
            }
        }

        private static bool ShouldSkipProjectDataDetailField(string fieldName)
        {
            var clean = fieldName.ToLowerInvariant();
            return clean.Contains("signature")
                || clean.Contains("photo")
                || clean.Contains("base64")
                || clean.Contains("image")
                || clean.Contains("html")
                || clean.Contains("qr");
        }

        private static long? TryGetStorageObjectSize(JsonElement obj)
        {
            var metadata = TryGetObject(obj, "metadata");
            var size = TryGetDouble(metadata, "size");
            return size.HasValue ? Convert.ToInt64(size.Value) : null;
        }

        private static string StripTimestampFilePrefix(string fileName) =>
            Regex.Replace(fileName ?? string.Empty, @"^\d+[-_]", string.Empty);

        private static string EnsurePdfName(string value)
        {
            var clean = string.IsNullOrWhiteSpace(value) ? "document" : value.Trim();
            return clean.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) ? clean : $"{clean}.pdf";
        }

        private static string GetScaffTagStatus(string? latestInspectionDate)
        {
            var inspectedAt = TryParseDateTimeOffset(latestInspectionDate);
            if (!inspectedAt.HasValue)
                return "Draft";

            return inspectedAt.Value.AddMonths(3) < DateTimeOffset.UtcNow ? "Expired" : "Current";
        }

        private static string? AddMonthsIso(string? value, int months)
        {
            var parsed = TryParseDateTimeOffset(value);
            return parsed.HasValue ? parsed.Value.AddMonths(months).ToString("O", CultureInfo.InvariantCulture) : null;
        }

        private static DateOnly GetSydneyToday()
        {
            try { return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, GetSydneyTimeZone())); }
            catch { return DateOnly.FromDateTime(DateTime.UtcNow); }
        }

        private static TimeZoneInfo GetSydneyTimeZone()
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById("AUS Eastern Standard Time"); }
            catch { return TimeZoneInfo.FindSystemTimeZoneById("Australia/Sydney"); }
        }

        private static List<string> BuildSearchTokens(string question)
        {
            var stopWords = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "can", "you", "please", "provide", "link", "access", "specific", "design", "file",
                "files", "latest", "newest", "recent", "revision", "revisions", "pdf", "download",
                "the", "for", "with", "from", "have", "any", "how", "many", "today", "currently",
                "show", "find", "get", "give", "need", "want", "looking", "available",
            };
            return NormalizeSearchText(question)
                .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Where(w => w.Length > 1 && !stopWords.Contains(w))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(12)
                .ToList();
        }

        private static List<string> BuildNumericSearchTokens(string question) =>
            NormalizeSearchText(question)
                .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Where(token => token.All(char.IsDigit))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(6)
                .ToList();

        private static bool NumericTokenAppears(string normalizedText, string numericToken)
        {
            if (string.IsNullOrWhiteSpace(normalizedText) || string.IsNullOrWhiteSpace(numericToken))
                return false;

            return normalizedText
                .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Any(token => string.Equals(token, numericToken, StringComparison.OrdinalIgnoreCase));
        }

        private static DesignQueryResolution ResolveDesignQueryAgainstKnownSites(
            string query,
            IReadOnlyList<JobsiteContextRow>? jobsites)
        {
            var resolution = new DesignQueryResolution { Query = query };
            if (string.IsNullOrWhiteSpace(query) || jobsites == null || jobsites.Count == 0)
                return resolution;

            var normalizedQueryTokens = NormalizeSearchText(query)
                .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .ToList();
            var queryNumbers = normalizedQueryTokens.Where(token => token.All(char.IsDigit)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            if (queryNumbers.Count == 0)
                return resolution;

            var queryWords = normalizedQueryTokens
                .Where(token => !token.All(char.IsDigit) && token.Length > 2)
                .ToList();

            var likelyMatches = jobsites
                .Where(site => !site.Archived)
                .Select(site =>
                {
                    var siteText = NormalizeSearchText($"{site.Name} {site.SiteLocation} {site.BuilderName}");
                    var siteTokens = siteText.Split(' ', StringSplitOptions.RemoveEmptyEntries).ToList();
                    var siteNumbers = siteTokens.Where(token => token.All(char.IsDigit)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
                    var wordHits = queryWords.Count == 0
                        ? 0
                        : queryWords.Count(word => siteTokens.Any(token => string.Equals(token, word, StringComparison.OrdinalIgnoreCase)));
                    var hasLikelyNumberTypo = queryNumbers.Any(queryNumber =>
                        siteNumbers.Any(siteNumber => IsLikelyAddressNumberTypo(queryNumber, siteNumber)));

                    return new
                    {
                        Site = site,
                        SiteNumbers = siteNumbers,
                        WordHits = wordHits,
                        HasLikelyNumberTypo = hasLikelyNumberTypo,
                    };
                })
                .Where(match => match.HasLikelyNumberTypo && match.WordHits >= Math.Min(2, queryWords.Count))
                .OrderByDescending(match => match.WordHits)
                .ThenBy(match => match.Site.Archived)
                .Take(5)
                .ToList();

            if (likelyMatches.Count == 0)
                return resolution;

            var correctedNumber = likelyMatches
                .SelectMany(match => match.SiteNumbers)
                .FirstOrDefault(siteNumber => queryNumbers.Any(queryNumber => IsLikelyAddressNumberTypo(queryNumber, siteNumber)));

            var originalNumber = queryNumbers.FirstOrDefault(queryNumber =>
                correctedNumber != null && IsLikelyAddressNumberTypo(queryNumber, correctedNumber));

            if (string.IsNullOrWhiteSpace(originalNumber) || string.IsNullOrWhiteSpace(correctedNumber))
                return resolution;

            resolution.Query = Regex.Replace(
                query,
                $@"(?<!\d){Regex.Escape(originalNumber)}(?!\d)",
                correctedNumber,
                RegexOptions.IgnoreCase);
            resolution.CorrectedFrom = query;
            resolution.CorrectionReason = $"Corrected likely address typo from {originalNumber} to {correctedNumber} based on active job-site records.";
            resolution.MatchedSites = likelyMatches.Select(match => (object)new
            {
                match.Site.Name,
                builder = match.Site.BuilderName,
                siteLocation = match.Site.SiteLocation,
                match.Site.Archived,
            }).ToList();

            return resolution;
        }

        private static bool IsLikelyAddressNumberTypo(string queryNumber, string siteNumber)
        {
            if (string.Equals(queryNumber, siteNumber, StringComparison.OrdinalIgnoreCase))
                return false;

            if (queryNumber.Length != siteNumber.Length + 1)
                return false;

            for (var i = 0; i < queryNumber.Length; i++)
            {
                var withoutOneDigit = queryNumber.Remove(i, 1);
                if (string.Equals(withoutOneDigit, siteNumber, StringComparison.OrdinalIgnoreCase))
                    return true;
            }

            return false;
        }

        private static List<string> BuildBroadSearchTokens(string question)
        {
            var stopWords = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "a", "an", "and", "any", "are", "as", "at", "be", "can", "could", "do", "does",
                "for", "from", "give", "have", "how", "i", "in", "is", "it", "me", "named",
                "of", "on", "or", "please", "show", "the", "there", "this", "today", "to",
                "we", "what", "when", "where", "who", "with", "you",
            };
            return NormalizeSearchText(question)
                .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Where(w => w.Length > 1 && !stopWords.Contains(w))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(16)
                .ToList();
        }

        private static int ScoreSearchCandidate(string candidateText, IReadOnlyList<string> tokens, out List<string> matchedTerms)
        {
            matchedTerms = new List<string>();
            if (string.IsNullOrWhiteSpace(candidateText) || tokens.Count == 0) return 0;
            var normalized = NormalizeSearchText(candidateText);
            var candidateTokens = normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            var score = 0;
            foreach (var token in tokens)
            {
                if (normalized.Contains(token, StringComparison.OrdinalIgnoreCase))
                {
                    matchedTerms.Add(token);
                    score += token.Length >= 4 ? 12 : 8;
                    continue;
                }

                if (TryMatchFuzzyDesignToken(token, candidateTokens, out var matchedToken, out var fuzzyScore))
                {
                    matchedTerms.Add($"{token}~{matchedToken}");
                    score += fuzzyScore;
                }
            }
            for (var i = 0; i < tokens.Count - 1; i++)
            {
                if (normalized.Contains($"{tokens[i]} {tokens[i + 1]}", StringComparison.OrdinalIgnoreCase))
                    score += 20;
            }
            for (var i = 0; i < tokens.Count - 2; i++)
            {
                if (normalized.Contains($"{tokens[i]} {tokens[i + 1]} {tokens[i + 2]}", StringComparison.OrdinalIgnoreCase))
                    score += 35;
            }
            if (matchedTerms.Count == tokens.Count) score += 80;
            else if (tokens.Count > 2 && matchedTerms.Count >= (int)Math.Ceiling(tokens.Count * 0.6)) score += 35;
            return score;
        }

        private static bool TryMatchFuzzyDesignToken(
            string token,
            IReadOnlyList<string> candidateTokens,
            out string matchedToken,
            out int score)
        {
            matchedToken = string.Empty;
            score = 0;

            if (IsStrictDesignSearchToken(token))
                return false;

            foreach (var alias in BuildDesignSearchAliases(token))
            {
                var aliasMatch = candidateTokens.FirstOrDefault(candidate =>
                    string.Equals(candidate, alias, StringComparison.OrdinalIgnoreCase)
                    || candidate.StartsWith(alias, StringComparison.OrdinalIgnoreCase)
                    || alias.StartsWith(candidate, StringComparison.OrdinalIgnoreCase));

                if (!string.IsNullOrWhiteSpace(aliasMatch))
                {
                    matchedToken = aliasMatch;
                    score = Math.Max(7, Math.Min(11, token.Length + 2));
                    return true;
                }
            }

            var best = candidateTokens
                .Where(candidate => !IsStrictDesignSearchToken(candidate))
                .Select(candidate => new
                {
                    Candidate = candidate,
                    Distance = GetDesignTokenDistance(candidate, token),
                })
                .OrderBy(item => item.Distance)
                .FirstOrDefault();

            if (best == null || best.Distance > MaxDesignTokenDistance(token))
                return false;

            matchedToken = best.Candidate;
            score = Math.Max(5, (token.Length >= 7 ? 11 : 9) - best.Distance);
            return true;
        }

        private static bool IsStrictDesignSearchToken(string token) =>
            token.Length <= 3 || token.Any(char.IsDigit);

        private static IEnumerable<string> BuildDesignSearchAliases(string token)
        {
            if (token.StartsWith("demol", StringComparison.OrdinalIgnoreCase))
            {
                yield return "demo";
                yield return "demolition";
                yield return "demolish";
                yield return "demolished";
            }
        }

        private static int GetDesignTokenDistance(string candidateToken, string queryToken)
        {
            if (candidateToken.StartsWith(queryToken, StringComparison.OrdinalIgnoreCase)
                || queryToken.StartsWith(candidateToken, StringComparison.OrdinalIgnoreCase))
                return 0;

            if (!string.Equals(candidateToken[..1], queryToken[..1], StringComparison.OrdinalIgnoreCase))
                return int.MaxValue;

            return LevenshteinDistance(candidateToken, queryToken);
        }

        private static int MaxDesignTokenDistance(string queryToken)
        {
            if (queryToken.Length <= 4) return 0;
            if (queryToken.Length <= 7) return 1;
            return 2;
        }

        private static string NormalizeSearchText(string value)
        {
            var chars = value.ToLowerInvariant().Select(ch => char.IsLetterOrDigit(ch) ? ch : ' ').ToArray();
            return string.Join(" ", new string(chars).Split(' ', StringSplitOptions.RemoveEmptyEntries));
        }

        private static string NormalizeScaffoldEntity(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return DefaultScaffoldEntity;

            if (value.Equals("Maloo Access Group", StringComparison.OrdinalIgnoreCase)
                || value.Equals("Maloo access group", StringComparison.OrdinalIgnoreCase))
                return "Maloo Access Group";

            if (value.Equals("Scaff-Technic", StringComparison.OrdinalIgnoreCase)
                || value.Equals("Scaff Technic", StringComparison.OrdinalIgnoreCase)
                || value.Equals("Scafftechnic", StringComparison.OrdinalIgnoreCase))
                return "Scaff-Technic";

            if (value.Equals(DefaultScaffoldEntity, StringComparison.OrdinalIgnoreCase)
                || value.Equals("ESS", StringComparison.OrdinalIgnoreCase)
                || value.Equals("Erect Safe", StringComparison.OrdinalIgnoreCase))
                return DefaultScaffoldEntity;

            return DefaultScaffoldEntity;
        }

        private static Dictionary<string, string> BuildFolderPaths(IReadOnlyList<JsonElement> folders)
        {
            var foldersById = folders
                .Select(f => new { Id = TryGetString(f, "id"), Folder = f })
                .Where(f => f.Id != null)
                .ToDictionary(f => f.Id!, f => f.Folder, StringComparer.OrdinalIgnoreCase);
            var pathCache = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            string BuildPath(string? folderId, HashSet<string>? seen = null)
            {
                if (string.IsNullOrWhiteSpace(folderId) || !foldersById.TryGetValue(folderId, out var folder))
                    return string.Empty;
                if (pathCache.TryGetValue(folderId, out var cached)) return cached;
                seen ??= new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                if (!seen.Add(folderId)) return TryGetString(folder, "name") ?? string.Empty;
                var name = TryGetString(folder, "name") ?? string.Empty;
                var parentPath = BuildPath(TryGetString(folder, "parent_folder_id"), seen);
                var path = string.IsNullOrWhiteSpace(parentPath) ? name : $"{parentPath} / {name}";
                pathCache[folderId] = path;
                return path;
            }

            foreach (var id in foldersById.Keys) BuildPath(id);
            return pathCache;
        }

        private static DateTime TryGetDate(JsonElement element, string propertyName, DateTime fallback = default)
        {
            var value = TryGetString(element, propertyName);
            return DateTime.TryParse(value, out var parsed) ? parsed : fallback;
        }

        private static int ParseRevisionSort(string revision)
        {
            var digits = new string((revision ?? string.Empty).Where(char.IsDigit).ToArray());
            return int.TryParse(digits, out var parsed) ? parsed : 0;
        }

        private static string? NormalizeDateOnlyString(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var trimmed = value.Trim();
            if (trimmed.Length >= 10 && Regex.IsMatch(trimmed[..10], @"^\d{4}-\d{2}-\d{2}$"))
                return trimmed[..10];
            return DateTime.TryParse(trimmed, out var parsed) ? parsed.ToString("yyyy-MM-dd") : trimmed;
        }

        private static int CountProjects(JsonDocument? projectsDoc, bool? archived)
        {
            if (projectsDoc?.RootElement.TryGetProperty("builders", out var builders) != true
                || builders.ValueKind != JsonValueKind.Array)
                return 0;
            var count = 0;
            foreach (var builder in builders.EnumerateArray())
            {
                if (!builder.TryGetProperty("projects", out var projects) || projects.ValueKind != JsonValueKind.Array) continue;
                foreach (var project in projects.EnumerateArray())
                {
                    var isArchived = TryGetBool(project, "archived");
                    if (archived == null || archived.Value == isArchived) count++;
                }
            }
            return count;
        }

        private static List<object> BuildRequestedMaterials(JsonElement request)
        {
            var values = TryGetObject(request, "itemValues");
            if (values.ValueKind != JsonValueKind.Object) values = TryGetObject(request, "item_values");
            if (values.ValueKind != JsonValueKind.Object) return new List<object>();

            return values.EnumerateObject()
                .Where(p => !p.Name.StartsWith("__", StringComparison.OrdinalIgnoreCase))
                .Select(p =>
                {
                    var quantity = TryReadMaterialQuantity(p.Value);
                    if (string.IsNullOrWhiteSpace(quantity)) return null;
                    var hasKnown = MaterialOrderQuantityLabels.TryGetValue(p.Name, out var known);
                    return (object)new
                    {
                        key = p.Name,
                        label = hasKnown ? known.Label : p.Name.Replace("_qty", "").Replace("_", " ").Trim(),
                        spec = hasKnown ? known.Spec : string.Empty,
                        quantity,
                    };
                })
                .Where(m => m != null)
                .Cast<object>()
                .Take(120)
                .ToList();
        }

        private static string? TryGetMaterialMeta(JsonElement request, string propertyName)
        {
            var values = TryGetObject(request, "itemValues");
            if (values.ValueKind != JsonValueKind.Object) values = TryGetObject(request, "item_values");
            return values.ValueKind == JsonValueKind.Object
                && values.TryGetProperty(propertyName, out var value)
                && value.ValueKind != JsonValueKind.Null
                ? value.ToString()
                : null;
        }

        private static string? TryReadMaterialQuantity(JsonElement value)
        {
            if (value.ValueKind == JsonValueKind.Number)
                return value.TryGetDecimal(out var q) && q > 0 ? q.ToString("0.##") : null;
            var text = value.ToString().Trim();
            if (string.IsNullOrWhiteSpace(text)) return null;
            return decimal.TryParse(text, out var p) && p <= 0 ? null : text;
        }

        private static string? TryGetObjectProperty(object value, string propertyName) =>
            value.GetType().GetProperty(propertyName)?.GetValue(value)?.ToString();

        private static JsonElement TryGetObject(JsonElement element, string propertyName) =>
            element.ValueKind == JsonValueKind.Object && element.TryGetProperty(propertyName, out var value)
                ? value : default;

        private static string? TryGetString(JsonElement element, string propertyName) =>
            element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var value)
            && value.ValueKind != JsonValueKind.Null
                ? value.ToString() : null;

        private static string? TryGetStringAny(JsonElement element, params string[] propertyNames)
        {
            foreach (var name in propertyNames)
            {
                var v = TryGetString(element, name);
                if (!string.IsNullOrWhiteSpace(v)) return v;
            }
            return null;
        }

        private static int? TryGetInt(JsonElement element, string propertyName)
        {
            if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(propertyName, out var value)) return null;
            if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var parsed)) return parsed;
            return int.TryParse(value.ToString(), out parsed) ? parsed : null;
        }

        private static int? TryGetIntAny(JsonElement element, params string[] propertyNames)
        {
            foreach (var name in propertyNames) { var v = TryGetInt(element, name); if (v != null) return v; }
            return null;
        }

        private static double? TryGetDouble(JsonElement element, string propertyName)
        {
            if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(propertyName, out var value)) return null;
            if (value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var parsed)) return parsed;
            return double.TryParse(value.ToString(), NumberStyles.Float, CultureInfo.InvariantCulture, out parsed) ? parsed : null;
        }

        private static double? TryGetDoubleAny(JsonElement element, params string[] propertyNames)
        {
            foreach (var name in propertyNames) { var v = TryGetDouble(element, name); if (v != null) return v; }
            return null;
        }

        private static DateTimeOffset? TryParseDateTimeOffset(string? value) =>
            DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed)
                ? parsed : null;

        private static bool TryGetBool(JsonElement element, string propertyName)
        {
            if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(propertyName, out var value)) return false;
            return value.ValueKind switch
            {
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.String => bool.TryParse(value.GetString(), out var p) && p,
                _ => false,
            };
        }

        private static List<string> TryGetStringArray(JsonElement element, string propertyName)
        {
            if (element.ValueKind != JsonValueKind.Object
                || !element.TryGetProperty(propertyName, out var value)
                || value.ValueKind != JsonValueKind.Array)
                return new List<string>();
            return value.EnumerateArray().Select(i => i.ToString()).Where(i => !string.IsNullOrWhiteSpace(i)).ToList();
        }

        private static List<string> TryGetStringArrayAny(JsonElement element, params string[] propertyNames)
        {
            foreach (var name in propertyNames) { var v = TryGetStringArray(element, name); if (v.Count > 0) return v; }
            return new List<string>();
        }

        private static bool HasStringArray(JsonElement element, string propertyName) =>
            element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var value)
            && value.ValueKind == JsonValueKind.Array;
    }
}
