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
            return Regex.Replace(withoutMarkdownUrls, @"https?://\S+", "the link below");
        }

        private object BuildModelContext(AdminAssistantContext context)
        {
            return new
            {
                context.Today,
                context.EmployeeSummary,
                context.RosterSummary,
                context.JobsiteSummary,
                context.TransportSummary,
                context.DesignSearchMatches,
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
            var planTask = GetRestRowsAsync<JsonElement>(
                $"ess_rostering_plans?select=*&plan_date=eq.{today:yyyy-MM-dd}&limit=1",
                cancellationToken);
            var projectsTask = ReadStorageJsonAsync(SafetyBucket, SafetyProjectsPath, cancellationToken);
            var materialRequestsTask = ReadStorageJsonAsync(SafetyBucket, MaterialRequestsPath, cancellationToken);
            Task<(List<object> Matches, List<AdminAssistantLink> Links)> searchTask = shouldSearchDesigns
                ? SearchDesignMatchesAsync(question, cancellationToken)
                : Task.FromResult((new List<object>(), new List<AdminAssistantLink>()));

            await Task.WhenAll(employeesTask, planTask, projectsTask, materialRequestsTask, searchTask);

            sources.Add("ess_rostering_employees");
            sources.Add("ess_rostering_plans");
            sources.Add("project-information/projects.json");
            sources.Add("project-information/material-order-requests/index.json");
            if (shouldSearchDesigns)
            {
                sources.Add("folders/design_documents search");
            }

            var employees = employeesTask.Result;
            var planRows = planTask.Result;
            var projectsDoc = projectsTask.Result;
            var materialRequestsDoc = materialRequestsTask.Result;
            var search = searchTask.Result;

            var roster = BuildRosterSummary(planRows.FirstOrDefault(), today);
            var jobsites = BuildJobsitesSummary(projectsDoc);
            var transport = BuildTransportSummary(materialRequestsDoc, today);
            var employeeSummary = BuildEmployeeSummary(employees, question);

            return new AdminAssistantContext
            {
                Today = today.ToString("yyyy-MM-dd"),
                EmployeeSummary = employeeSummary,
                RosterSummary = roster,
                JobsiteSummary = jobsites,
                TransportSummary = transport,
                DesignSearchMatches = search.Matches,
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

        private object BuildRosterSummary(JsonElement planRow, DateOnly today)
        {
            if (planRow.ValueKind != JsonValueKind.Object)
            {
                return new
                {
                    date = today.ToString("yyyy-MM-dd"),
                    hasPlan = false,
                    scheduledMen = 0,
                    activeSiteCount = 0,
                    sites = Array.Empty<object>(),
                };
            }

            var activeSiteIds = TryGetStringArray(planRow, "active_site_ids");
            var requiredBySite = TryGetObject(planRow, "required_men_by_site");
            var siteCounts = new List<object>();
            var total = 0;

            foreach (var siteId in activeSiteIds)
            {
                var required = 0;
                if (requiredBySite.ValueKind == JsonValueKind.Object &&
                    requiredBySite.TryGetProperty(siteId, out var requiredElement) &&
                    requiredElement.TryGetInt32(out var parsed))
                {
                    required = parsed;
                }
                total += Math.Max(0, required);
                siteCounts.Add(new { siteId, requiredMen = required });
            }

            return new
            {
                date = today.ToString("yyyy-MM-dd"),
                hasPlan = true,
                scheduledMen = total,
                activeSiteCount = activeSiteIds.Count,
                sites = siteCounts,
                updatedAt = TryGetString(planRow, "updated_at"),
            };
        }

        private object BuildJobsitesSummary(JsonDocument? projectsDoc)
        {
            var builders = new List<object>();
            var activeCount = 0;
            var archivedCount = 0;

            if (projectsDoc?.RootElement.TryGetProperty("builders", out var builderRows) == true &&
                builderRows.ValueKind == JsonValueKind.Array)
            {
                foreach (var builder in builderRows.EnumerateArray())
                {
                    var builderName = TryGetString(builder, "name") ?? "Unknown builder";
                    var activeProjects = new List<object>();
                    if (builder.TryGetProperty("projects", out var projects) && projects.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var project in projects.EnumerateArray())
                        {
                            var archived = TryGetBool(project, "archived");
                            if (archived)
                            {
                                archivedCount += 1;
                                continue;
                            }

                            activeCount += 1;
                            activeProjects.Add(new
                            {
                                id = TryGetString(project, "id"),
                                name = TryGetString(project, "name"),
                                siteLocation = TryGetString(project, "siteLocation"),
                            });
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
            };
        }

        private object BuildTransportSummary(JsonDocument? requestsDoc, DateOnly today)
        {
            var todayKey = today.ToString("yyyy-MM-dd");
            var todayRequests = new List<object>();
            var sevenAmRequests = new List<object>();
            var activeRequests = 0;

            if (requestsDoc?.RootElement.TryGetProperty("requests", out var requests) == true &&
                requests.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in requests.EnumerateArray())
                {
                    if (!string.IsNullOrWhiteSpace(TryGetString(item, "archivedAt")))
                    {
                        continue;
                    }

                    activeRequests += 1;
                    var scheduledDate = TryGetString(item, "scheduledDate");
                    if (scheduledDate != todayKey)
                    {
                        continue;
                    }

                    var hour = TryGetInt(item, "scheduledHour");
                    var minute = TryGetInt(item, "scheduledMinute");
                    var row = new
                    {
                        id = TryGetString(item, "id"),
                        builderName = TryGetString(item, "builderName"),
                        projectName = TryGetString(item, "projectName"),
                        truck = TryGetString(item, "scheduledTruckLabel") ?? TryGetString(item, "truckLabel") ?? TryGetString(item, "scheduledTruckId"),
                        scheduledTime = hour == null ? null : $"{hour:00}:{minute ?? 0:00}",
                        deliveryStatus = TryGetString(item, "deliveryStatus") ?? "scheduled",
                    };

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
                scheduledTodayCount = todayRequests.Count,
                sevenAmTodayCount = sevenAmRequests.Count,
                sevenAmToday = sevenAmRequests,
                scheduledToday = todayRequests.Take(30).ToList(),
            };
        }

        private async Task<(List<object> Matches, List<AdminAssistantLink> Links)> SearchDesignMatchesAsync(string question, CancellationToken cancellationToken)
        {
            var tokens = BuildSearchTokens(question);
            if (tokens.Count == 0)
            {
                return (new List<object>(), new List<AdminAssistantLink>());
            }
            var wantsMultipleLinks = WantsMultipleDesignLinks(question);
            var wantsFolderLink = NormalizeSearchText(question).Split(' ', StringSplitOptions.RemoveEmptyEntries).Contains("folder");
            var preferThirdPartyDesign = NormalizeSearchText(question).Contains("third party", StringComparison.OrdinalIgnoreCase);

            var foldersTask = GetRestRowsAsync<JsonElement>(
                "folders?select=id,name,parent_folder_id,updated_at&limit=5000",
                cancellationToken);
            var documentsTask = GetRestRowsAsync<JsonElement>(
                "design_documents?select=id,folder_id,revision_number,description,ess_design_issue_path,ess_design_issue_name,third_party_design_path,third_party_design_name,updated_at,created_at&order=updated_at.desc&limit=5000",
                cancellationToken);

            await Task.WhenAll(foldersTask, documentsTask);

            var folders = foldersTask.Result;
            var documents = documentsTask.Result;
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

                if (!wantsFolderLink && candidate.DocumentId is Guid documentId && links.Count < (wantsMultipleLinks ? 8 : 1))
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

                if (!string.IsNullOrWhiteSpace(candidate.FolderId) &&
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

            return (matches, links);
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
            reply.AppendLine($"Employees: {JsonSerializer.Serialize(context.EmployeeSummary, _jsonOptions)}");
            reply.AppendLine($"Roster: {JsonSerializer.Serialize(context.RosterSummary, _jsonOptions)}");
            reply.AppendLine($"Transport: {JsonSerializer.Serialize(context.TransportSummary, _jsonOptions)}");
            reply.AppendLine($"Jobsites: {JsonSerializer.Serialize(context.JobsiteSummary, _jsonOptions)}");
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
            public object EmployeeSummary { get; set; } = new();
            public object RosterSummary { get; set; } = new();
            public object JobsiteSummary { get; set; } = new();
            public object TransportSummary { get; set; } = new();
            public List<object> DesignSearchMatches { get; set; } = new();
            public List<AdminAssistantLink> Links { get; set; } = new();
            public List<string> Sources { get; set; } = new();
        }
    }
}
