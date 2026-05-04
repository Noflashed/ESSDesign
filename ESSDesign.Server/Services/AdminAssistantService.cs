using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using ESSDesign.Server.Models;

namespace ESSDesign.Server.Services
{
    public sealed class AdminAssistantService
    {
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

        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;
        private readonly SupabaseService _supabaseService;
        private readonly ILogger<AdminAssistantService> _logger;
        private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web);

        private const string SafetyBucket = "project-information";
        private const string SafetyProjectsPath = "projects.json";
        private const string MaterialRequestsPath = "material-order-requests/index.json";
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

        private sealed class ScoredDesignCandidate
        {
            public Guid? DocumentId { get; set; }
            public string? FolderId { get; set; }
            public string CandidateType { get; set; } = "document";
            public string Name { get; set; } = string.Empty;
            public string Path { get; set; } = string.Empty;
            public string RevisionNumber { get; set; } = string.Empty;
            public int RevisionSort { get; set; }
            public DateTime UpdatedAt { get; set; } = DateTime.MinValue;
            public bool HasEssDesign { get; set; }
            public bool HasThirdPartyDesign { get; set; }
            public int Score { get; set; }
            public List<string> MatchedTerms { get; set; } = new();
        }

        private sealed class EmployeeContextRow
        {
            public string? Id { get; set; }
            public string FirstName { get; set; } = string.Empty;
            public string LastName { get; set; } = string.Empty;
            public string FullName { get; set; } = string.Empty;
            public string? Email { get; set; }
            public bool LeadingHand { get; set; }
            public bool Verified { get; set; }
            public List<string> PreferredSites { get; set; } = new();
            public int Score { get; set; }
            public List<string> MatchedTerms { get; set; } = new();
        }

        private sealed class DesignSearchData
        {
            public List<object> Matches { get; set; } = new();
            public List<AdminAssistantLink> Links { get; set; } = new();
        }

        public AdminAssistantService(
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            SupabaseService supabaseService,
            ILogger<AdminAssistantService> logger)
        {
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
            _supabaseService = supabaseService;
            _logger = logger;
        }

        public async Task<ChatResult> AskAsync(
            string question,
            IReadOnlyList<ChatMessage>? history,
            UserInfo currentUser,
            CancellationToken cancellationToken)
        {
            var cleanQuestion = (question ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(cleanQuestion))
            {
                throw new InvalidOperationException("Question is required.");
            }

            var context = await BuildContextAsync(cleanQuestion, cancellationToken);
            var apiKey = _configuration["OpenAI:ApiKey"];
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                return BuildFallbackResult(cleanQuestion, context);
            }

            var model = _configuration["OpenAI:Model"] ?? "gpt-4.1-mini";
            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(35);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

            var messages = new List<object>
            {
                new
                {
                    role = "system",
                    content = """
You are the ESS Design admin assistant for admin users. Think like a skilled, practical human problem-solver who understands the ESS Design app.

Use the supplied ESS context as the source of truth for live operational facts such as counts, schedules, rosters, users, job-sites, file records, and URLs. Do not fabricate live data, URLs, people, files, or schedules.
The ESS context is a broad app snapshot, not a narrow answer template. Start with datasetCatalogue to understand what data was loaded, then use the detailed sections and their match lists to answer confidently. Do not assume a record is missing unless you have checked the relevant full directory/list in the context.

Your goal is to always provide a thoughtful, useful answer:
- Interpret the user's intent, even when the wording is vague, misspelled, incomplete, or conversational.
- Make reasonable assumptions and answer the most likely question first.
- Break complex questions into smaller parts and address each part.
- If exact certainty is not possible, give the best supported answer and clearly label the assumption.
- Offer the closest matches, useful next steps, or alternative interpretations instead of ending with "I can't answer."
- Ask a follow-up question only when it is truly required to proceed. If a follow-up would help but is not required, answer first and then mention what extra detail would improve the result.

For design-file questions, use ranked designSearchMatches and links. Treat "latest" as the newest or highest-confidence available match unless revision details in the context show otherwise. If there is no exact match but related folders/documents exist, answer with "best match" or "closest match", explain why it appears relevant, and include any available links.
The app renders links separately below your message. Never paste raw URLs or markdown links in your written answer. For a single design drawing, say something like "I found the best match. Click here to view it." and let the link button carry the URL.

For employee questions, use employeeSummary.employeeMatches first, then employeeSummary.employeeDirectory. Do not conclude that an employee does not exist from counts or samples. If there is a close name match, say yes and include the matched full name.

For counts or schedules, give the exact number from context when present. If the context only supports a partial answer, state the partial answer and what data would be needed for certainty.

For material order questions, use transportSummary.requestMatches, activeRequests, scheduledToday, and archivedRequests. Each request may include requestedMaterials with item names, specs, and quantities; list those materials when the user asks what was requested or what is in a material list/order.

Write like a natural chat message, not a report. Do not use Markdown emphasis markers such as **bold**, ***bold italic***, underscores, tables, headings, or code fences. Plain sentences and short bullet-like lines are fine, but avoid decorative formatting.

Be concise, direct, and specific. Avoid generic refusal language and avoid repeating that the answer is "not available in the provided context" unless there is genuinely no related ESS data at all.
"""
                },
            };

            foreach (var item in (history ?? Array.Empty<ChatMessage>()).TakeLast(8))
            {
                var role = item.Role.Equals("assistant", StringComparison.OrdinalIgnoreCase) ? "assistant" : "user";
                var content = (item.Content ?? string.Empty).Trim();
                if (!string.IsNullOrWhiteSpace(content))
                {
                    messages.Add(new { role, content });
                }
            }

            messages.Add(new
            {
                role = "user",
                content = $"""
Admin user: {currentUser.FullName} ({currentUser.Email})
Question: {cleanQuestion}

ESS context JSON:
{JsonSerializer.Serialize(BuildModelContext(context), _jsonOptions)}
"""
            });

            var payload = new
            {
                model,
                temperature = 0.15,
                messages = messages.ToArray()
            };

            using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/chat/completions")
            {
                Content = new StringContent(JsonSerializer.Serialize(payload, _jsonOptions), Encoding.UTF8, "application/json")
            };

            using var response = await client.SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Admin assistant OpenAI request failed: {StatusCode} {Body}", response.StatusCode, body);
                return BuildFallbackResult(cleanQuestion, context);
            }

            using var document = JsonDocument.Parse(body);
            var reply = document.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString();
            var cleanReply = CleanAssistantReply(reply);

            return new ChatResult
            {
                Reply = string.IsNullOrWhiteSpace(cleanReply) ? "I could not form a useful answer from the current ESS context." : cleanReply.Trim(),
                Links = context.Links,
                Sources = context.Sources,
            };
        }

        private static string CleanAssistantReply(string? reply)
        {
            if (string.IsNullOrWhiteSpace(reply))
            {
                return string.Empty;
            }

            var withoutMarkdownUrls = Regex.Replace(reply, @"\[([^\]]+)\]\(https?://[^\s)]+\)", "$1");
            var withoutBareUrls = Regex.Replace(withoutMarkdownUrls, @"https?://\S+", "the link below");
            var withoutEmphasis = Regex.Replace(withoutBareUrls, @"(?<!\*)\*{1,3}([^*\r\n][^*\r\n]*?)\*{1,3}(?!\*)", "$1");
            withoutEmphasis = Regex.Replace(withoutEmphasis, @"(?<!_)_{1,3}([^_\r\n][^_\r\n]*?)_{1,3}(?!_)", "$1");
            return withoutEmphasis;
        }

        private object BuildModelContext(AdminAssistantContext context)
        {
            return new
            {
                context.Today,
                context.DatasetCatalogue,
                context.EmployeeSummary,
                context.UserSummary,
                context.RosterSummary,
                context.JobsiteSummary,
                context.TransportSummary,
                context.DesignCatalogue,
                context.DesignSearchMatches,
                context.NotificationSummary,
                Links = context.Links.Select(link => new
                {
                    link.Label,
                    link.Type,
                }).ToList(),
                context.Sources,
            };
        }

        private async Task<AdminAssistantContext> BuildContextAsync(string question, CancellationToken cancellationToken)
        {
            var today = GetSydneyToday();
            var sources = new List<string>();
            var shouldSearchDesigns = IsDesignLookupQuestion(question);

            var employeesTask = GetRestRowsAsync<JsonElement>(
                "ess_rostering_employees?select=id,first_name,last_name,email,leading_hand,verified_at,preferred_site_1,preferred_site_2,preferred_site_3",
                cancellationToken);
            var plansTask = GetRestRowsAsync<JsonElement>(
                "ess_rostering_plans?select=*&order=plan_date.desc&limit=365",
                cancellationToken);
            var userNamesTask = GetRestRowsAsync<JsonElement>(
                "user_names?select=id,email,full_name,phone_number&order=full_name.asc&limit=1000",
                cancellationToken);
            var userRolesTask = GetRestRowsAsync<JsonElement>(
                "user_roles?select=user_id,role,updated_at&limit=1000",
                cancellationToken);
            var notificationsTask = GetRestRowsAsync<JsonElement>(
                "user_notifications?select=id,user_id,title,message,type,folder_id,document_id,read,created_at,updated_at&order=created_at.desc&limit=250",
                cancellationToken);
            var foldersTask = GetRestRowsAsync<JsonElement>(
                "folders?select=id,name,parent_folder_id,user_id,total_file_size,created_at,updated_at&limit=5000",
                cancellationToken);
            var documentsTask = GetRestRowsAsync<JsonElement>(
                "design_documents?select=id,folder_id,revision_number,description,ess_design_issue_path,ess_design_issue_name,third_party_design_path,third_party_design_name,user_id,created_at,updated_at&order=updated_at.desc&limit=5000",
                cancellationToken);
            var projectsTask = ReadStorageJsonAsync(SafetyBucket, SafetyProjectsPath, cancellationToken);
            var materialRequestsTask = ReadStorageJsonAsync(SafetyBucket, MaterialRequestsPath, cancellationToken);

            await Task.WhenAll(
                employeesTask,
                plansTask,
                userNamesTask,
                userRolesTask,
                notificationsTask,
                foldersTask,
                documentsTask,
                projectsTask,
                materialRequestsTask);

            sources.Add("ess_rostering_employees");
            sources.Add("ess_rostering_plans");
            sources.Add("user_names");
            sources.Add("user_roles");
            sources.Add("user_notifications");
            sources.Add("project-information/projects.json");
            sources.Add("project-information/material-order-requests/index.json");
            sources.Add("folders");
            sources.Add("design_documents");

            var employees = employeesTask.Result;
            var planRows = plansTask.Result;
            var userNames = userNamesTask.Result;
            var userRoles = userRolesTask.Result;
            var notifications = notificationsTask.Result;
            var folders = foldersTask.Result;
            var documents = documentsTask.Result;
            var projectsDoc = projectsTask.Result;
            var materialRequestsDoc = materialRequestsTask.Result;
            var search = await SearchDesignMatchesAsync(question, folders, documents, shouldSearchDesigns, cancellationToken);

            var roster = BuildRosterSummary(planRows, today);
            var jobsites = BuildJobsitesSummary(projectsDoc, question);
            var transport = BuildTransportSummary(materialRequestsDoc, today, question);
            var employeeSummary = BuildEmployeeSummary(employees, question);
            var userSummary = BuildUserSummary(userNames, userRoles, question);
            var designCatalogue = BuildDesignCatalogue(folders, documents, question);
            var notificationSummary = BuildNotificationSummary(notifications, question);
            var datasetCatalogue = BuildDatasetCatalogue(
                employees,
                planRows,
                userNames,
                userRoles,
                notifications,
                projectsDoc,
                materialRequestsDoc,
                folders,
                documents);

            return new AdminAssistantContext
            {
                Today = today.ToString("yyyy-MM-dd"),
                DatasetCatalogue = datasetCatalogue,
                EmployeeSummary = employeeSummary,
                UserSummary = userSummary,
                RosterSummary = roster,
                JobsiteSummary = jobsites,
                TransportSummary = transport,
                DesignCatalogue = designCatalogue,
                DesignSearchMatches = search.Matches,
                NotificationSummary = notificationSummary,
                Links = search.Links,
                Sources = sources,
            };
        }

        private static bool IsDesignLookupQuestion(string question)
        {
            var normalized = NormalizeSearchText(question);
            if (string.IsNullOrWhiteSpace(normalized))
            {
                return false;
            }

            var designPhrases = new[]
            {
                "design file",
                "design files",
                "design folder",
                "design folders",
                "design document",
                "design documents",
                "ess design",
                "third party design",
                "edge protection",
                "loading platform",
                "perimeter scaffold",
                "internal scaffold",
                "external scaffold",
            };

            if (designPhrases.Any(phrase => normalized.Contains(phrase, StringComparison.OrdinalIgnoreCase)))
            {
                return true;
            }

            var words = normalized
                .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var designWords = new[]
            {
                "design",
                "designs",
                "drawing",
                "drawings",
                "pdf",
                "file",
                "files",
                "folder",
                "folders",
                "document",
                "documents",
                "revision",
                "revisions",
                "rev",
                "scaffold",
                "scaffolds",
                "scaffolding",
            };

            return designWords.Any(words.Contains);
        }

        private static bool WantsMultipleDesignLinks(string question)
        {
            var normalized = NormalizeSearchText(question);
            if (string.IsNullOrWhiteSpace(normalized))
            {
                return false;
            }

            var phrases = new[]
            {
                "all revisions",
                "all versions",
                "available revisions",
                "previous revisions",
                "revision history",
                "list revisions",
                "show revisions",
            };

            if (phrases.Any(phrase => normalized.Contains(phrase, StringComparison.OrdinalIgnoreCase)))
            {
                return true;
            }

            var words = normalized
                .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            return words.Contains("all") &&
                   (words.Contains("revisions") || words.Contains("versions") || words.Contains("drawings") || words.Contains("files"));
        }

        private object BuildEmployeeSummary(IReadOnlyList<JsonElement> employees, string question)
        {
            var directory = employees
                .Select(row =>
                {
                    var firstName = TryGetString(row, "first_name") ?? string.Empty;
                    var lastName = TryGetString(row, "last_name") ?? string.Empty;
                    return new EmployeeContextRow
                    {
                        Id = TryGetString(row, "id"),
                        FirstName = firstName,
                        LastName = lastName,
                        FullName = $"{firstName} {lastName}".Trim(),
                        Email = TryGetString(row, "email"),
                        LeadingHand = TryGetBool(row, "leading_hand"),
                        Verified = TryGetString(row, "verified_at") != null,
                        PreferredSites = new[]
                            {
                                TryGetString(row, "preferred_site_1"),
                                TryGetString(row, "preferred_site_2"),
                                TryGetString(row, "preferred_site_3"),
                            }
                            .Where(site => !string.IsNullOrWhiteSpace(site))
                            .Select(site => site!)
                            .ToList(),
                    };
                })
                .Where(row => !string.IsNullOrWhiteSpace(row.FullName) || !string.IsNullOrWhiteSpace(row.Email))
                .OrderBy(row => row.LastName)
                .ThenBy(row => row.FirstName)
                .ToList();

            var lookupTokens = BuildEmployeeLookupTokens(question);
            var matches = directory
                .Select(row =>
                {
                    row.Score = ScoreEmployeeCandidate(row, lookupTokens, out var matchedTerms);
                    row.MatchedTerms = matchedTerms;
                    return row;
                })
                .Where(row => row.Score > 0)
                .OrderByDescending(row => row.Score)
                .ThenBy(row => row.LastName)
                .ThenBy(row => row.FirstName)
                .Take(8)
                .Select(row => new
                {
                    row.Id,
                    row.FullName,
                    row.Email,
                    row.LeadingHand,
                    row.Verified,
                    row.PreferredSites,
                    row.Score,
                    row.MatchedTerms,
                })
                .ToList();

            return new
            {
                totalEmployees = employees.Count,
                verifiedEmployees = directory.Count(row => row.Verified),
                leadingHands = directory.Count(row => row.LeadingHand),
                employeeMatches = matches,
                employeeDirectory = directory
                    .Take(250)
                    .Select(row => new
                    {
                        row.Id,
                        row.FullName,
                        row.Email,
                        row.LeadingHand,
                        row.Verified,
                    })
                    .ToList(),
            };
        }

        private static List<string> BuildEmployeeLookupTokens(string question)
        {
            var stopWords = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "do", "we", "have", "an", "a", "employee", "employees", "named", "name",
                "called", "person", "worker", "staff", "member", "is", "there", "any",
                "with", "the", "please", "can", "you", "find", "search", "look", "up",
            };

            return NormalizeSearchText(question)
                .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Where(word => word.Length > 1 && !stopWords.Contains(word))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(8)
                .ToList();
        }

        private static int ScoreEmployeeCandidate(EmployeeContextRow employee, IReadOnlyList<string> tokens, out List<string> matchedTerms)
        {
            matchedTerms = new List<string>();
            if (tokens.Count == 0)
            {
                return 0;
            }

            var firstName = NormalizeSearchText(employee.FirstName);
            var lastName = NormalizeSearchText(employee.LastName);
            var fullName = NormalizeSearchText(employee.FullName);
            var email = NormalizeSearchText(employee.Email ?? string.Empty);
            var score = 0;

            foreach (var token in tokens)
            {
                var matched = false;
                if (firstName.Equals(token, StringComparison.OrdinalIgnoreCase) ||
                    lastName.Equals(token, StringComparison.OrdinalIgnoreCase))
                {
                    score += 40;
                    matched = true;
                }
                else if (fullName.Split(' ', StringSplitOptions.RemoveEmptyEntries)
                         .Any(namePart => namePart.StartsWith(token, StringComparison.OrdinalIgnoreCase) ||
                                          token.StartsWith(namePart, StringComparison.OrdinalIgnoreCase)))
                {
                    score += 24;
                    matched = true;
                }
                else if (email.Contains(token, StringComparison.OrdinalIgnoreCase))
                {
                    score += 12;
                    matched = true;
                }

                if (matched)
                {
                    matchedTerms.Add(token);
                }
            }

            if (tokens.Count > 1 && matchedTerms.Count == tokens.Count)
            {
                score += 80;
            }
            else if (matchedTerms.Count > 0)
            {
                score += 10;
            }

            return score;
        }

        private object BuildUserSummary(IReadOnlyList<JsonElement> userRows, IReadOnlyList<JsonElement> roleRows, string question)
        {
            var rolesByUserId = roleRows
                .Select(row => new { UserId = TryGetString(row, "user_id"), Role = TryGetString(row, "role"), UpdatedAt = TryGetString(row, "updated_at") })
                .Where(row => !string.IsNullOrWhiteSpace(row.UserId))
                .ToDictionary(row => row.UserId!, row => row, StringComparer.OrdinalIgnoreCase);

            var users = userRows
                .Select(row =>
                {
                    var id = TryGetString(row, "id");
                    rolesByUserId.TryGetValue(id ?? string.Empty, out var role);
                    return new
                    {
                        id,
                        fullName = TryGetString(row, "full_name"),
                        email = TryGetString(row, "email"),
                        phoneNumber = TryGetString(row, "phone_number"),
                        role = role?.Role ?? AppRoles.Viewer,
                        roleUpdatedAt = role?.UpdatedAt,
                    };
                })
                .Where(row => !string.IsNullOrWhiteSpace(row.fullName) || !string.IsNullOrWhiteSpace(row.email))
                .OrderBy(row => row.fullName)
                .Take(1000)
                .ToList();

            var searchableUsers = users.Select(user => new
            {
                source = "user",
                title = user.fullName ?? user.email ?? "User",
                summary = string.Join(" ", new[] { user.fullName, user.email, user.phoneNumber, user.role }.Where(value => !string.IsNullOrWhiteSpace(value))),
                data = user,
            });

            return new
            {
                totalUsers = users.Count,
                roleCounts = users
                    .GroupBy(user => user.role ?? AppRoles.Viewer, StringComparer.OrdinalIgnoreCase)
                    .Select(group => new { role = group.Key, count = group.Count() })
                    .OrderByDescending(group => group.count)
                    .ToList(),
                users,
                userMatches = BuildQuestionMatches(question, searchableUsers, 12),
            };
        }

        private object BuildDesignCatalogue(IReadOnlyList<JsonElement> folders, IReadOnlyList<JsonElement> documents, string question)
        {
            var folderPaths = BuildFolderPaths(folders);
            var folderRecords = folders
                .Select(folder =>
                {
                    var id = TryGetString(folder, "id");
                    folderPaths.TryGetValue(id ?? string.Empty, out var path);
                    return new
                    {
                        id,
                        name = TryGetString(folder, "name"),
                        parentFolderId = TryGetString(folder, "parent_folder_id"),
                        path = path ?? TryGetString(folder, "name"),
                        updatedAt = TryGetString(folder, "updated_at"),
                    };
                })
                .Where(row => !string.IsNullOrWhiteSpace(row.id))
                .ToList();

            var documentRecords = documents
                .Select(document =>
                {
                    var folderId = TryGetString(document, "folder_id");
                    folderPaths.TryGetValue(folderId ?? string.Empty, out var folderPath);
                    return new
                    {
                        id = TryGetString(document, "id"),
                        folderId,
                        folderPath,
                        revisionNumber = TryGetString(document, "revision_number"),
                        description = TryGetString(document, "description"),
                        essDesignIssueName = TryGetString(document, "ess_design_issue_name"),
                        thirdPartyDesignName = TryGetString(document, "third_party_design_name"),
                        hasEssDesign = !string.IsNullOrWhiteSpace(TryGetString(document, "ess_design_issue_path")),
                        hasThirdPartyDesign = !string.IsNullOrWhiteSpace(TryGetString(document, "third_party_design_path")),
                        updatedAt = TryGetString(document, "updated_at"),
                    };
                })
                .Where(row => !string.IsNullOrWhiteSpace(row.id))
                .ToList();

            var searchableDesigns = folderRecords.Select(folder => new
                {
                    source = "design-folder",
                    title = folder.path ?? folder.name ?? "Design folder",
                    summary = string.Join(" ", new[] { folder.name, folder.path }.Where(value => !string.IsNullOrWhiteSpace(value))),
                    data = (object)folder,
                })
                .Concat(documentRecords.Select(document => new
                {
                    source = "design-document",
                    title = document.essDesignIssueName ?? document.thirdPartyDesignName ?? document.folderPath ?? "Design document",
                    summary = string.Join(" ", new[]
                    {
                        document.folderPath,
                        document.revisionNumber,
                        document.description,
                        document.essDesignIssueName,
                        document.thirdPartyDesignName,
                    }.Where(value => !string.IsNullOrWhiteSpace(value))),
                    data = (object)document,
                }));

            return new
            {
                folderCount = folderRecords.Count,
                documentCount = documentRecords.Count,
                folders = folderRecords.Take(1000).ToList(),
                documents = documentRecords.Take(1000).ToList(),
                designMatches = BuildQuestionMatches(question, searchableDesigns, 12),
            };
        }

        private object BuildNotificationSummary(IReadOnlyList<JsonElement> notifications, string question)
        {
            var rows = notifications
                .Select(row => new
                {
                    id = TryGetString(row, "id"),
                    userId = TryGetString(row, "user_id"),
                    title = TryGetString(row, "title"),
                    message = TryGetString(row, "message"),
                    type = TryGetString(row, "type"),
                    read = TryGetBool(row, "read"),
                    folderId = TryGetString(row, "folder_id"),
                    documentId = TryGetString(row, "document_id"),
                    createdAt = TryGetString(row, "created_at"),
                })
                .ToList();

            var searchableNotifications = rows.Select(row => new
            {
                source = "notification",
                title = row.title ?? "Notification",
                summary = string.Join(" ", new[] { row.title, row.message, row.type, row.createdAt }.Where(value => !string.IsNullOrWhiteSpace(value))),
                data = row,
            });

            return new
            {
                recentNotificationCount = rows.Count,
                unreadNotificationCount = rows.Count(row => !row.read),
                recentNotifications = rows.Take(100).ToList(),
                notificationMatches = BuildQuestionMatches(question, searchableNotifications, 8),
            };
        }

        private object BuildDatasetCatalogue(
            IReadOnlyList<JsonElement> employees,
            IReadOnlyList<JsonElement> planRows,
            IReadOnlyList<JsonElement> userNames,
            IReadOnlyList<JsonElement> userRoles,
            IReadOnlyList<JsonElement> notifications,
            JsonDocument? projectsDoc,
            JsonDocument? materialRequestsDoc,
            IReadOnlyList<JsonElement> folders,
            IReadOnlyList<JsonElement> documents)
        {
            var projectCount = CountProjects(projectsDoc, archived: null);
            var activeProjectCount = CountProjects(projectsDoc, archived: false);
            var archivedProjectCount = CountProjects(projectsDoc, archived: true);
            var materialRequestCount = CountStorageRows(materialRequestsDoc, "requests", includeArchived: true);
            var activeMaterialRequestCount = CountStorageRows(materialRequestsDoc, "requests", includeArchived: false);

            return new
            {
                description = "Loaded ESS web-app data available to answer admin questions. Use these sources before saying data is missing.",
                sources = new[]
                {
                    new { name = "ess_rostering_employees", rows = employees.Count, coverage = "employee directory, emails, leading hand flags, verification, preferred sites" },
                    new { name = "ess_rostering_plans", rows = planRows.Count, coverage = "roster plans and required men by site by date" },
                    new { name = "user_names", rows = userNames.Count, coverage = "web-app users and contact details" },
                    new { name = "user_roles", rows = userRoles.Count, coverage = "web-app user roles and permissions" },
                    new { name = "user_notifications", rows = notifications.Count, coverage = "recent app notifications" },
                    new { name = "project-information/projects.json", rows = projectCount, coverage = $"{activeProjectCount} active projects, {archivedProjectCount} archived projects" },
                    new { name = "project-information/material-order-requests/index.json", rows = materialRequestCount, coverage = $"{activeMaterialRequestCount} active material/transport requests" },
                    new { name = "folders", rows = folders.Count, coverage = "design folder hierarchy" },
                    new { name = "design_documents", rows = documents.Count, coverage = "design document revisions and file metadata" },
                },
            };
        }

        private object BuildRosterSummary(IReadOnlyList<JsonElement> planRows, DateOnly today)
        {
            var todayKey = today.ToString("yyyy-MM-dd");
            var planRow = planRows.FirstOrDefault(row => string.Equals(TryGetString(row, "plan_date"), todayKey, StringComparison.OrdinalIgnoreCase));
            var indexedPlans = planRows
                .Where(row => row.ValueKind == JsonValueKind.Object)
                .Select(row =>
                {
                    var activeSiteIds = TryGetStringArray(row, "active_site_ids");
                    var requiredBySite = TryGetObject(row, "required_men_by_site");
                    var scheduledMen = activeSiteIds.Sum(siteId => TryGetSiteRequiredMen(requiredBySite, siteId));
                    return new
                    {
                        date = TryGetString(row, "plan_date"),
                        scheduledMen,
                        activeSiteCount = activeSiteIds.Count,
                        activeSiteIds,
                        updatedAt = TryGetString(row, "updated_at"),
                    };
                })
                .Where(row => !string.IsNullOrWhiteSpace(row.date))
                .OrderByDescending(row => row.date)
                .Take(120)
                .ToList();

            if (planRow.ValueKind != JsonValueKind.Object)
            {
                return new
                {
                    date = todayKey,
                    hasPlan = false,
                    scheduledMen = 0,
                    activeSiteCount = 0,
                    sites = Array.Empty<object>(),
                    availablePlans = indexedPlans,
                };
            }

            var activeSiteIds = TryGetStringArray(planRow, "active_site_ids");
            var requiredBySite = TryGetObject(planRow, "required_men_by_site");
            var siteCounts = new List<object>();
            var total = 0;

            foreach (var siteId in activeSiteIds)
            {
                var required = TryGetSiteRequiredMen(requiredBySite, siteId);
                total += Math.Max(0, required);
                siteCounts.Add(new { siteId, requiredMen = required });
            }

            return new
            {
                date = todayKey,
                hasPlan = true,
                scheduledMen = total,
                activeSiteCount = activeSiteIds.Count,
                sites = siteCounts,
                updatedAt = TryGetString(planRow, "updated_at"),
                availablePlans = indexedPlans,
            };
        }

        private object BuildJobsitesSummary(JsonDocument? projectsDoc, string question)
        {
            var builders = new List<object>();
            var allProjects = new List<object>();
            var searchableProjects = new List<object>();
            var activeCount = 0;
            var archivedCount = 0;

            if (projectsDoc?.RootElement.TryGetProperty("builders", out var builderRows) == true &&
                builderRows.ValueKind == JsonValueKind.Array)
            {
                foreach (var builder in builderRows.EnumerateArray())
                {
                    var builderName = TryGetString(builder, "name") ?? "Unknown builder";
                    var builderId = TryGetString(builder, "id");
                    var activeProjects = new List<object>();
                    if (builder.TryGetProperty("projects", out var projects) && projects.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var project in projects.EnumerateArray())
                        {
                            var archived = TryGetBool(project, "archived");
                            var projectName = TryGetString(project, "name");
                            var projectId = TryGetString(project, "id");
                            var siteLocation = TryGetString(project, "siteLocation");
                            var projectRow = new
                            {
                                id = projectId,
                                name = projectName,
                                builder = builderName,
                                builderId,
                                siteLocation,
                                archived,
                            };
                            allProjects.Add(projectRow);
                            searchableProjects.Add(new
                            {
                                source = "project",
                                title = $"{builderName} / {projectName}",
                                summary = string.Join(" ", new[] { builderName, projectName, siteLocation, archived ? "archived" : "active" }.Where(value => !string.IsNullOrWhiteSpace(value))),
                                data = projectRow,
                            });

                            if (archived)
                            {
                                archivedCount += 1;
                                continue;
                            }

                            activeCount += 1;
                            activeProjects.Add(projectRow);
                        }
                    }

                    if (activeProjects.Count > 0)
                    {
                        builders.Add(new { builder = builderName, activeProjects = activeProjects.Take(12).ToList() });
                    }
                }
            }

            return new
            {
                activeJobsiteCount = activeCount,
                archivedJobsiteCount = archivedCount,
                builders = builders.Take(20).ToList(),
                allProjects = allProjects.Take(500).ToList(),
                projectMatches = BuildQuestionMatches(question, searchableProjects, 12),
            };
        }

        private object BuildTransportSummary(JsonDocument? requestsDoc, DateOnly today, string question)
        {
            var todayKey = today.ToString("yyyy-MM-dd");
            var todayRequests = new List<object>();
            var sevenAmRequests = new List<object>();
            var allActiveRequests = new List<object>();
            var allArchivedRequests = new List<object>();
            var searchableRequests = new List<object>();
            var activeRequests = 0;
            var archivedRequests = 0;

            if (requestsDoc?.RootElement.TryGetProperty("requests", out var requests) == true &&
                requests.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in requests.EnumerateArray())
                {
                    var hour = TryGetInt(item, "scheduledHour");
                    var minute = TryGetInt(item, "scheduledMinute");
                    var scheduledDate = TryGetString(item, "scheduledDate");
                    var truck = TryGetString(item, "scheduledTruckLabel") ?? TryGetString(item, "truckLabel") ?? TryGetString(item, "scheduledTruckId") ?? TryGetString(item, "truckId");
                    var requestedMaterials = BuildRequestedMaterials(item);
                    var materialSummary = string.Join(
                        " ",
                        requestedMaterials.Select(material => string.Join(" ", new[]
                        {
                            TryGetObjectProperty(material, "quantity"),
                            TryGetObjectProperty(material, "label"),
                            TryGetObjectProperty(material, "spec"),
                        }.Where(value => !string.IsNullOrWhiteSpace(value)))));
                    var row = new
                    {
                        id = TryGetString(item, "id"),
                        builderName = TryGetString(item, "builderName"),
                        projectName = TryGetString(item, "projectName"),
                        requestedByName = TryGetString(item, "requestedByName"),
                        requestedByEmail = TryGetString(item, "requestedByEmail"),
                        orderDate = TryGetString(item, "orderDate"),
                        submittedAt = TryGetString(item, "submittedAt"),
                        scheduledDate,
                        scheduledTime = hour == null ? null : $"{hour:00}:{minute ?? 0:00}",
                        truck,
                        deliveryStatus = TryGetString(item, "deliveryStatus") ?? "pending",
                        archivedAt = TryGetString(item, "archivedAt"),
                        scaffoldingSystem = TryGetMaterialMeta(item, "__scaffoldingSystem") ?? TryGetString(item, "scaffoldingSystem"),
                        details = TryGetMaterialMeta(item, "__details") ?? TryGetString(item, "details"),
                        notes = TryGetString(item, "notes"),
                        requestedMaterials,
                    };
                    searchableRequests.Add(new
                    {
                        source = "material-request",
                        title = $"{row.builderName} / {row.projectName}",
                        summary = string.Join(" ", new[]
                        {
                            row.builderName,
                            row.projectName,
                            row.requestedByName,
                            row.requestedByEmail,
                            row.orderDate,
                            row.submittedAt,
                            row.scheduledDate,
                            row.scheduledTime,
                            row.truck,
                            row.deliveryStatus,
                            row.scaffoldingSystem,
                            row.details,
                            row.notes,
                            materialSummary,
                        }.Where(value => !string.IsNullOrWhiteSpace(value))),
                        data = row,
                    });

                    if (!string.IsNullOrWhiteSpace(TryGetString(item, "archivedAt")))
                    {
                        archivedRequests += 1;
                        allArchivedRequests.Add(row);
                        continue;
                    }

                    activeRequests += 1;
                    allActiveRequests.Add(row);
                    if (scheduledDate != todayKey)
                    {
                        continue;
                    }

                    todayRequests.Add(row);
                    if (hour == 7 && (minute ?? 0) == 0)
                    {
                        sevenAmRequests.Add(row);
                    }
                }
            }

            return new
            {
                activeMaterialRequests = activeRequests,
                archivedMaterialRequests = archivedRequests,
                scheduledTodayCount = todayRequests.Count,
                sevenAmTodayCount = sevenAmRequests.Count,
                sevenAmToday = sevenAmRequests,
                scheduledToday = todayRequests.Take(30).ToList(),
                activeRequests = allActiveRequests
                    .OrderBy(row => TryGetObjectProperty(row, "scheduledDate"))
                    .ThenBy(row => TryGetObjectProperty(row, "scheduledTime"))
                    .Take(500)
                    .ToList(),
                archivedRequests = allArchivedRequests.Take(100).ToList(),
                requestMatches = BuildQuestionMatches(question, searchableRequests, 12),
            };
        }

        private async Task<DesignSearchData> SearchDesignMatchesAsync(
            string question,
            IReadOnlyList<JsonElement> folders,
            IReadOnlyList<JsonElement> documents,
            bool includeLinks,
            CancellationToken cancellationToken)
        {
            var tokens = BuildSearchTokens(question);
            if (tokens.Count == 0)
            {
                return new DesignSearchData();
            }
            var wantsMultipleLinks = WantsMultipleDesignLinks(question);
            var wantsFolderLink = NormalizeSearchText(question).Split(' ', StringSplitOptions.RemoveEmptyEntries).Contains("folder");
            var preferThirdPartyDesign = NormalizeSearchText(question).Contains("third party", StringComparison.OrdinalIgnoreCase);
            var foldersById = folders
                .Select(folder => new { Id = TryGetString(folder, "id"), Folder = folder })
                .Where(item => !string.IsNullOrWhiteSpace(item.Id))
                .ToDictionary(item => item.Id!, item => item.Folder, StringComparer.OrdinalIgnoreCase);
            var pathCache = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            string BuildFolderPath(string? folderId, HashSet<string>? seen = null)
            {
                if (string.IsNullOrWhiteSpace(folderId) || !foldersById.TryGetValue(folderId, out var folder))
                {
                    return string.Empty;
                }

                if (pathCache.TryGetValue(folderId, out var cachedPath))
                {
                    return cachedPath;
                }

                seen ??= new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                if (!seen.Add(folderId))
                {
                    return TryGetString(folder, "name") ?? string.Empty;
                }

                var name = TryGetString(folder, "name") ?? string.Empty;
                var parentId = TryGetString(folder, "parent_folder_id");
                var parentPath = BuildFolderPath(parentId, seen);
                var path = string.IsNullOrWhiteSpace(parentPath) ? name : $"{parentPath} / {name}";
                pathCache[folderId] = path;
                return path;
            }

            var candidates = new List<ScoredDesignCandidate>();

            foreach (var folder in folders)
            {
                var folderId = TryGetString(folder, "id");
                var folderPath = BuildFolderPath(folderId);
                var score = ScoreSearchCandidate(folderPath, tokens, out var matchedTerms);
                if (score <= 0)
                {
                    continue;
                }

                candidates.Add(new ScoredDesignCandidate
                {
                    FolderId = folderId,
                    CandidateType = "folder",
                    Name = TryGetString(folder, "name") ?? folderPath,
                    Path = folderPath,
                    UpdatedAt = TryGetDate(folder, "updated_at"),
                    Score = score,
                    MatchedTerms = matchedTerms,
                });
            }

            foreach (var document in documents)
            {
                var folderId = TryGetString(document, "folder_id");
                var folderPath = BuildFolderPath(folderId);
                var revision = TryGetString(document, "revision_number") ?? string.Empty;
                var essPath = TryGetString(document, "ess_design_issue_path");
                var essName = TryGetString(document, "ess_design_issue_name");
                var thirdPartyPath = TryGetString(document, "third_party_design_path");
                var thirdPartyName = TryGetString(document, "third_party_design_name");
                var description = TryGetString(document, "description");
                var candidateText = string.Join(
                    " ",
                    new[]
                    {
                        folderPath,
                        revision,
                        essName,
                        thirdPartyName,
                        description,
                    }.Where(value => !string.IsNullOrWhiteSpace(value)));
                var score = ScoreSearchCandidate(candidateText, tokens, out var matchedTerms);
                var minimumMatchedTerms = tokens.Count <= 1 ? 1 : Math.Min(2, tokens.Count);
                if (score <= 0 || matchedTerms.Count < minimumMatchedTerms)
                {
                    continue;
                }

                candidates.Add(new ScoredDesignCandidate
                {
                    DocumentId = Guid.TryParse(TryGetString(document, "id"), out var documentId) ? documentId : null,
                    FolderId = folderId,
                    CandidateType = "document",
                    Name = essName ?? thirdPartyName ?? $"Revision {revision}",
                    Path = folderPath,
                    RevisionNumber = revision,
                    RevisionSort = ParseRevisionSort(revision),
                    UpdatedAt = TryGetDate(document, "updated_at", TryGetDate(document, "created_at")),
                    HasEssDesign = !string.IsNullOrWhiteSpace(essPath),
                    HasThirdPartyDesign = !string.IsNullOrWhiteSpace(thirdPartyPath),
                    Score = score,
                    MatchedTerms = matchedTerms,
                });
            }

            var ranked = candidates
                .OrderByDescending(candidate => candidate.Score)
                .ThenBy(candidate => candidate.CandidateType.Equals("document", StringComparison.OrdinalIgnoreCase) ? 0 : 1)
                .ThenByDescending(candidate => candidate.RevisionSort)
                .ThenByDescending(candidate => candidate.UpdatedAt)
                .Take(12)
                .ToList();
            var matches = new List<object>();
            var links = new List<AdminAssistantLink>();
            var topPath = ranked.FirstOrDefault()?.Path;
            var responseCandidates = wantsMultipleLinks && !string.IsNullOrWhiteSpace(topPath)
                ? ranked.Where(candidate => candidate.Path.Equals(topPath, StringComparison.OrdinalIgnoreCase)).Take(8).ToList()
                : wantsMultipleLinks
                    ? ranked.Take(8).ToList()
                    : ranked.Take(1).ToList();

            foreach (var candidate in responseCandidates)
            {
                matches.Add(new
                {
                    candidate.CandidateType,
                    candidate.Name,
                    candidate.Path,
                    candidate.FolderId,
                    candidate.RevisionNumber,
                    candidate.UpdatedAt,
                    candidate.Score,
                    candidate.MatchedTerms,
                    candidate.HasEssDesign,
                    candidate.HasThirdPartyDesign,
                });

                if (includeLinks && !wantsFolderLink && candidate.DocumentId is Guid documentId && links.Count < (wantsMultipleLinks ? 8 : 1))
                {
                    var preferredTypes = preferThirdPartyDesign
                        ? new[] { "third-party", "ess" }
                        : new[] { "ess", "third-party" };

                    foreach (var type in preferredTypes)
                    {
                        if (links.Count >= (wantsMultipleLinks ? 8 : 1))
                        {
                            break;
                        }

                        if (type == "ess" && candidate.HasEssDesign)
                        {
                            var info = await TryGetDownloadInfoAsync(documentId, "ess", cancellationToken);
                            if (info != null)
                            {
                                links.Add(new AdminAssistantLink
                                {
                                    Label = wantsMultipleLinks ? $"ESS revision {candidate.RevisionNumber}" : "Click here to view",
                                    Url = info.Url,
                                    Type = "ess-design",
                                });
                            }
                        }

                        if (type == "third-party" && candidate.HasThirdPartyDesign)
                        {
                            var info = await TryGetDownloadInfoAsync(documentId, "third-party", cancellationToken);
                            if (info != null)
                            {
                                links.Add(new AdminAssistantLink
                                {
                                    Label = wantsMultipleLinks ? $"Third-party revision {candidate.RevisionNumber}" : "Click here to view",
                                    Url = info.Url,
                                    Type = "third-party-design",
                                });
                            }
                        }

                        if (!wantsMultipleLinks && links.Count > 0)
                        {
                            break;
                        }
                    }
                }

                if (includeLinks &&
                    !string.IsNullOrWhiteSpace(candidate.FolderId) &&
                    links.Count == 0)
                {
                    links.Add(new AdminAssistantLink
                    {
                        Label = "Click here to view",
                        Url = $"/?page=design&folder={Uri.EscapeDataString(candidate.FolderId)}",
                        Type = "design-folder",
                    });
                }
            }

            if (matches.Count == 0)
            {
                var fallbackQuery = string.Join(" ", tokens.Take(4));
                var fallbackResults = await _supabaseService.SearchAsync(fallbackQuery);
                foreach (var result in fallbackResults.Take(5))
                {
                    matches.Add(new
                    {
                        CandidateType = "folder-rpc",
                        result.Name,
                        result.Path,
                        result.DocumentCount,
                    });
                }
            }

            return new DesignSearchData { Matches = matches, Links = links };
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

        private ChatResult BuildFallbackResult(string question, AdminAssistantContext context)
        {
            var reply = new StringBuilder();
            reply.AppendLine("I can access the ESS admin context, but the OpenAI API key is not configured, so I am giving the best direct summary from the available data.");
            reply.AppendLine();
            reply.AppendLine($"Question interpreted as: {question}");
            reply.AppendLine($"Today: {context.Today}");
            reply.AppendLine($"Dataset catalogue: {JsonSerializer.Serialize(context.DatasetCatalogue, _jsonOptions)}");
            reply.AppendLine($"Employees: {JsonSerializer.Serialize(context.EmployeeSummary, _jsonOptions)}");
            reply.AppendLine($"Users: {JsonSerializer.Serialize(context.UserSummary, _jsonOptions)}");
            reply.AppendLine($"Roster: {JsonSerializer.Serialize(context.RosterSummary, _jsonOptions)}");
            reply.AppendLine($"Transport: {JsonSerializer.Serialize(context.TransportSummary, _jsonOptions)}");
            reply.AppendLine($"Jobsites: {JsonSerializer.Serialize(context.JobsiteSummary, _jsonOptions)}");
            reply.AppendLine($"Design catalogue: {JsonSerializer.Serialize(context.DesignCatalogue, _jsonOptions)}");
            reply.AppendLine($"Notifications: {JsonSerializer.Serialize(context.NotificationSummary, _jsonOptions)}");
            if (context.DesignSearchMatches.Count > 0)
            {
                reply.AppendLine($"Design matches: {JsonSerializer.Serialize(context.DesignSearchMatches.Take(5), _jsonOptions)}");
            }
            if (context.Links.Count > 0)
            {
                reply.AppendLine();
                reply.AppendLine("Best available links:");
                foreach (var link in context.Links)
                {
                    reply.AppendLine($"- {link.Label}: {link.Url}");
                }
            }

            return new ChatResult
            {
                Reply = reply.ToString().Trim(),
                Links = context.Links,
                Sources = context.Sources,
            };
        }

        private async Task<List<T>> GetRestRowsAsync<T>(string relativePath, CancellationToken cancellationToken)
        {
            var supabaseUrl = _configuration["Supabase:Url"] ?? string.Empty;
            var supabaseKey = _configuration["Supabase:ServiceRoleKey"]
                ?? _configuration["Supabase:Key"]
                ?? string.Empty;

            if (string.IsNullOrWhiteSpace(supabaseUrl) || string.IsNullOrWhiteSpace(supabaseKey))
            {
                return new List<T>();
            }

            var client = _httpClientFactory.CreateClient();
            var url = $"{supabaseUrl.TrimEnd('/')}/rest/v1/{relativePath}";
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Add("apikey", supabaseKey);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", supabaseKey);

            using var response = await client.SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode || string.IsNullOrWhiteSpace(body))
            {
                return new List<T>();
            }

            return JsonSerializer.Deserialize<List<T>>(body, _jsonOptions) ?? new List<T>();
        }

        private async Task<JsonDocument?> ReadStorageJsonAsync(string bucket, string path, CancellationToken cancellationToken)
        {
            var supabaseUrl = _configuration["Supabase:Url"] ?? string.Empty;
            var supabaseKey = _configuration["Supabase:ServiceRoleKey"]
                ?? _configuration["Supabase:Key"]
                ?? string.Empty;

            if (string.IsNullOrWhiteSpace(supabaseUrl) || string.IsNullOrWhiteSpace(supabaseKey))
            {
                return null;
            }

            var client = _httpClientFactory.CreateClient();
            var url = $"{supabaseUrl.TrimEnd('/')}/storage/v1/object/{bucket}/{path}";
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Add("apikey", supabaseKey);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", supabaseKey);

            using var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            return await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        }

        private static DateOnly GetSydneyToday()
        {
            try
            {
                var zone = TimeZoneInfo.FindSystemTimeZoneById("AUS Eastern Standard Time");
                return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, zone));
            }
            catch
            {
                return DateOnly.FromDateTime(DateTime.UtcNow);
            }
        }

        private static List<string> BuildSearchTokens(string question)
        {
            var cleaned = NormalizeSearchText(question);

            var stopWords = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "can", "you", "please", "provide", "link", "access", "specific", "design", "file",
                "files", "latest", "newest", "recent", "revision", "revisions", "pdf", "download",
                "the", "for", "with", "from", "have", "any", "how", "many", "today", "currently",
                "show", "find", "get", "give", "need", "want", "looking", "available", "provide",
            };

            return cleaned
                .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Select(word => word.Trim().ToLowerInvariant())
                .Where(word => word.Length > 1 && !stopWords.Contains(word))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(12)
                .ToList();
        }

        private static int ScoreSearchCandidate(string candidateText, IReadOnlyList<string> tokens, out List<string> matchedTerms)
        {
            matchedTerms = new List<string>();
            if (string.IsNullOrWhiteSpace(candidateText) || tokens.Count == 0)
            {
                return 0;
            }

            var normalized = NormalizeSearchText(candidateText);
            var score = 0;

            foreach (var token in tokens)
            {
                if (normalized.Contains(token, StringComparison.OrdinalIgnoreCase))
                {
                    matchedTerms.Add(token);
                    score += token.Length >= 4 ? 12 : 8;
                }
            }

            for (var index = 0; index < tokens.Count - 1; index += 1)
            {
                var phrase = $"{tokens[index]} {tokens[index + 1]}";
                if (normalized.Contains(phrase, StringComparison.OrdinalIgnoreCase))
                {
                    score += 20;
                }
            }

            for (var index = 0; index < tokens.Count - 2; index += 1)
            {
                var phrase = $"{tokens[index]} {tokens[index + 1]} {tokens[index + 2]}";
                if (normalized.Contains(phrase, StringComparison.OrdinalIgnoreCase))
                {
                    score += 35;
                }
            }

            if (matchedTerms.Count == tokens.Count)
            {
                score += 80;
            }
            else if (tokens.Count > 2 && matchedTerms.Count >= Math.Ceiling(tokens.Count * 0.6))
            {
                score += 35;
            }

            return score;
        }

        private static string NormalizeSearchText(string value)
        {
            var chars = value
                .ToLowerInvariant()
                .Select(ch => char.IsLetterOrDigit(ch) ? ch : ' ')
                .ToArray();
            return string.Join(" ", new string(chars).Split(' ', StringSplitOptions.RemoveEmptyEntries));
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

        private List<object> BuildQuestionMatches(string question, IEnumerable<object> records, int limit)
        {
            var tokens = BuildBroadSearchTokens(question);
            if (tokens.Count == 0)
            {
                return new List<object>();
            }

            return records
                .Select(record =>
                {
                    var json = JsonSerializer.Serialize(record, _jsonOptions);
                    var score = ScoreSearchCandidate(json, tokens, out var matchedTerms);
                    return new { record, score, matchedTerms };
                })
                .Where(item => item.score > 0)
                .OrderByDescending(item => item.score)
                .Take(limit)
                .Select(item => new
                {
                    item.score,
                    item.matchedTerms,
                    item.record,
                })
                .Cast<object>()
                .ToList();
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
                .Where(word => word.Length > 1 && !stopWords.Contains(word))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(16)
                .ToList();
        }

        private static Dictionary<string, string> BuildFolderPaths(IReadOnlyList<JsonElement> folders)
        {
            var foldersById = folders
                .Select(folder => new { Id = TryGetString(folder, "id"), Folder = folder })
                .Where(item => !string.IsNullOrWhiteSpace(item.Id))
                .ToDictionary(item => item.Id!, item => item.Folder, StringComparer.OrdinalIgnoreCase);
            var pathCache = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            string BuildPath(string? folderId, HashSet<string>? seen = null)
            {
                if (string.IsNullOrWhiteSpace(folderId) || !foldersById.TryGetValue(folderId, out var folder))
                {
                    return string.Empty;
                }

                if (pathCache.TryGetValue(folderId, out var cachedPath))
                {
                    return cachedPath;
                }

                seen ??= new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                if (!seen.Add(folderId))
                {
                    return TryGetString(folder, "name") ?? string.Empty;
                }

                var name = TryGetString(folder, "name") ?? string.Empty;
                var parentId = TryGetString(folder, "parent_folder_id");
                var parentPath = BuildPath(parentId, seen);
                var path = string.IsNullOrWhiteSpace(parentPath) ? name : $"{parentPath} / {name}";
                pathCache[folderId] = path;
                return path;
            }

            foreach (var id in foldersById.Keys)
            {
                BuildPath(id);
            }

            return pathCache;
        }

        private static int TryGetSiteRequiredMen(JsonElement requiredBySite, string siteId)
        {
            if (requiredBySite.ValueKind == JsonValueKind.Object &&
                requiredBySite.TryGetProperty(siteId, out var requiredElement) &&
                requiredElement.TryGetInt32(out var parsed))
            {
                return parsed;
            }

            return 0;
        }

        private static int CountProjects(JsonDocument? projectsDoc, bool? archived)
        {
            if (projectsDoc?.RootElement.TryGetProperty("builders", out var builders) != true ||
                builders.ValueKind != JsonValueKind.Array)
            {
                return 0;
            }

            var count = 0;
            foreach (var builder in builders.EnumerateArray())
            {
                if (!builder.TryGetProperty("projects", out var projects) || projects.ValueKind != JsonValueKind.Array)
                {
                    continue;
                }

                foreach (var project in projects.EnumerateArray())
                {
                    var isArchived = TryGetBool(project, "archived");
                    if (archived == null || archived.Value == isArchived)
                    {
                        count += 1;
                    }
                }
            }

            return count;
        }

        private static int CountStorageRows(JsonDocument? document, string propertyName, bool includeArchived)
        {
            if (document?.RootElement.TryGetProperty(propertyName, out var rows) != true ||
                rows.ValueKind != JsonValueKind.Array)
            {
                return 0;
            }

            return rows.EnumerateArray()
                .Count(row => includeArchived || string.IsNullOrWhiteSpace(TryGetString(row, "archivedAt")));
        }

        private static List<object> BuildRequestedMaterials(JsonElement request)
        {
            var values = TryGetObject(request, "itemValues");
            if (values.ValueKind != JsonValueKind.Object)
            {
                values = TryGetObject(request, "item_values");
            }

            if (values.ValueKind != JsonValueKind.Object)
            {
                return new List<object>();
            }

            return values.EnumerateObject()
                .Where(property => !property.Name.StartsWith("__", StringComparison.OrdinalIgnoreCase))
                .Select(property =>
                {
                    var quantity = TryReadMaterialQuantity(property.Value);
                    if (string.IsNullOrWhiteSpace(quantity))
                    {
                        return null;
                    }

                    var hasKnownLabel = MaterialOrderQuantityLabels.TryGetValue(property.Name, out var known);
                    var fallbackLabel = property.Name
                        .Replace("_qty", "", StringComparison.OrdinalIgnoreCase)
                        .Replace("_", " ", StringComparison.OrdinalIgnoreCase)
                        .Trim();

                    return new
                    {
                        key = property.Name,
                        label = hasKnownLabel ? known.Label : fallbackLabel,
                        spec = hasKnownLabel ? known.Spec : string.Empty,
                        quantity,
                    };
                })
                .Where(item => item != null)
                .Cast<object>()
                .Take(120)
                .ToList();
        }

        private static string? TryGetMaterialMeta(JsonElement request, string propertyName)
        {
            var values = TryGetObject(request, "itemValues");
            if (values.ValueKind != JsonValueKind.Object)
            {
                values = TryGetObject(request, "item_values");
            }

            return values.ValueKind == JsonValueKind.Object &&
                   values.TryGetProperty(propertyName, out var value) &&
                   value.ValueKind != JsonValueKind.Null
                ? value.ToString()
                : null;
        }

        private static string? TryReadMaterialQuantity(JsonElement value)
        {
            if (value.ValueKind == JsonValueKind.Number)
            {
                return value.TryGetDecimal(out var numericQuantity) && numericQuantity > 0
                    ? numericQuantity.ToString("0.##")
                    : null;
            }

            var text = value.ToString().Trim();
            if (string.IsNullOrWhiteSpace(text))
            {
                return null;
            }

            return decimal.TryParse(text, out var parsedQuantity) && parsedQuantity <= 0 ? null : text;
        }

        private static string? TryGetObjectProperty(object value, string propertyName)
        {
            return value.GetType().GetProperty(propertyName)?.GetValue(value)?.ToString();
        }

        private static JsonElement TryGetObject(JsonElement element, string propertyName)
        {
            return element.ValueKind == JsonValueKind.Object && element.TryGetProperty(propertyName, out var value)
                ? value
                : default;
        }

        private static string? TryGetString(JsonElement element, string propertyName)
        {
            return element.ValueKind == JsonValueKind.Object &&
                   element.TryGetProperty(propertyName, out var value) &&
                   value.ValueKind != JsonValueKind.Null
                ? value.ToString()
                : null;
        }

        private static int? TryGetInt(JsonElement element, string propertyName)
        {
            if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(propertyName, out var value))
            {
                return null;
            }

            if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var parsed))
            {
                return parsed;
            }

            return int.TryParse(value.ToString(), out parsed) ? parsed : null;
        }

        private static bool TryGetBool(JsonElement element, string propertyName)
        {
            if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(propertyName, out var value))
            {
                return false;
            }

            return value.ValueKind switch
            {
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.String => bool.TryParse(value.GetString(), out var parsed) && parsed,
                _ => false,
            };
        }

        private static List<string> TryGetStringArray(JsonElement element, string propertyName)
        {
            if (element.ValueKind != JsonValueKind.Object ||
                !element.TryGetProperty(propertyName, out var value) ||
                value.ValueKind != JsonValueKind.Array)
            {
                return new List<string>();
            }

            return value.EnumerateArray()
                .Select(item => item.ToString())
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .ToList();
        }

        private sealed class AdminAssistantContext
        {
            public string Today { get; set; } = string.Empty;
            public object DatasetCatalogue { get; set; } = new();
            public object EmployeeSummary { get; set; } = new();
            public object UserSummary { get; set; } = new();
            public object RosterSummary { get; set; } = new();
            public object JobsiteSummary { get; set; } = new();
            public object TransportSummary { get; set; } = new();
            public object DesignCatalogue { get; set; } = new();
            public List<object> DesignSearchMatches { get; set; } = new();
            public object NotificationSummary { get; set; } = new();
            public List<AdminAssistantLink> Links { get; set; } = new();
            public List<string> Sources { get; set; } = new();
        }
    }
}
