using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
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
You are the ESS Design admin assistant. Answer questions using only the supplied ESS context.
Be direct, practical, and specific. If the answer is not in the context, say what data is missing.
When useful links are supplied, mention them by label. Never invent counts, schedules, files, users, or URLs.
You can answer about rostered manpower, active job-sites, transport schedules, material requests, users, and design file search results.
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
{JsonSerializer.Serialize(context, _jsonOptions)}
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

            return new ChatResult
            {
                Reply = string.IsNullOrWhiteSpace(reply) ? "I could not form a useful answer from the current ESS context." : reply.Trim(),
                Links = context.Links,
                Sources = context.Sources,
            };
        }

        private async Task<AdminAssistantContext> BuildContextAsync(string question, CancellationToken cancellationToken)
        {
            var today = GetSydneyToday();
            var sources = new List<string>();

            var employeesTask = GetRestRowsAsync<JsonElement>(
                "ess_rostering_employees?select=id,first_name,last_name,email,leading_hand,verified_at,preferred_site_1,preferred_site_2,preferred_site_3",
                cancellationToken);
            var planTask = GetRestRowsAsync<JsonElement>(
                $"ess_rostering_plans?select=*&plan_date=eq.{today:yyyy-MM-dd}&limit=1",
                cancellationToken);
            var projectsTask = ReadStorageJsonAsync(SafetyBucket, SafetyProjectsPath, cancellationToken);
            var materialRequestsTask = ReadStorageJsonAsync(SafetyBucket, MaterialRequestsPath, cancellationToken);
            var searchTask = SearchDesignMatchesAsync(question, cancellationToken);

            await Task.WhenAll(employeesTask, planTask, projectsTask, materialRequestsTask, searchTask);

            sources.Add("ess_rostering_employees");
            sources.Add("ess_rostering_plans");
            sources.Add("project-information/projects.json");
            sources.Add("project-information/material-order-requests/index.json");
            sources.Add("folders/design_documents search");

            var employees = employeesTask.Result;
            var planRows = planTask.Result;
            var projectsDoc = projectsTask.Result;
            var materialRequestsDoc = materialRequestsTask.Result;
            var search = searchTask.Result;

            var roster = BuildRosterSummary(planRows.FirstOrDefault(), today);
            var jobsites = BuildJobsitesSummary(projectsDoc);
            var transport = BuildTransportSummary(materialRequestsDoc, today);

            return new AdminAssistantContext
            {
                Today = today.ToString("yyyy-MM-dd"),
                EmployeeSummary = new
                {
                    totalEmployees = employees.Count,
                    verifiedEmployees = employees.Count(row => TryGetString(row, "verified_at") != null),
                    leadingHands = employees.Count(row => TryGetBool(row, "leading_hand")),
                    sampleNames = employees
                        .Take(12)
                        .Select(row => $"{TryGetString(row, "first_name")} {TryGetString(row, "last_name")}".Trim())
                        .Where(name => !string.IsNullOrWhiteSpace(name))
                        .ToList(),
                },
                RosterSummary = roster,
                JobsiteSummary = jobsites,
                TransportSummary = transport,
                DesignSearchMatches = search.Matches,
                Links = search.Links,
                Sources = sources,
            };
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
            var query = BuildSearchQuery(question);
            if (string.IsNullOrWhiteSpace(query))
            {
                return (new List<object>(), new List<AdminAssistantLink>());
            }

            var results = await _supabaseService.SearchAsync(query);
            var matches = new List<object>();
            var links = new List<AdminAssistantLink>();

            foreach (var result in results.Take(8))
            {
                matches.Add(new
                {
                    result.Name,
                    result.Type,
                    result.Path,
                    result.DocumentCount,
                    folderId = result.Type.Equals("folder", StringComparison.OrdinalIgnoreCase) ? result.Id : result.ParentFolderId,
                });

                foreach (var document in result.Documents.Take(3))
                {
                    if (!string.IsNullOrWhiteSpace(document.EssDesignIssueName))
                    {
                        var info = await TryGetDownloadInfoAsync(document.Id, "ess", cancellationToken);
                        if (info != null)
                        {
                            links.Add(new AdminAssistantLink
                            {
                                Label = $"{result.Name} - ESS revision {document.RevisionNumber}",
                                Url = info.Url,
                                Type = "ess-design",
                            });
                        }
                    }

                    if (!string.IsNullOrWhiteSpace(document.ThirdPartyDesignName))
                    {
                        var info = await TryGetDownloadInfoAsync(document.Id, "third-party", cancellationToken);
                        if (info != null)
                        {
                            links.Add(new AdminAssistantLink
                            {
                                Label = $"{result.Name} - third-party revision {document.RevisionNumber}",
                                Url = info.Url,
                                Type = "third-party-design",
                            });
                        }
                    }
                }
            }

            return (matches, links.Take(8).ToList());
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
            reply.AppendLine("I can access the ESS admin context, but the OpenAI API key is not configured, so I can only give a direct data summary right now.");
            reply.AppendLine();
            reply.AppendLine($"Today: {context.Today}");
            reply.AppendLine($"Employees: {JsonSerializer.Serialize(context.EmployeeSummary, _jsonOptions)}");
            reply.AppendLine($"Roster: {JsonSerializer.Serialize(context.RosterSummary, _jsonOptions)}");
            reply.AppendLine($"Transport: {JsonSerializer.Serialize(context.TransportSummary, _jsonOptions)}");
            reply.AppendLine($"Jobsites: {JsonSerializer.Serialize(context.JobsiteSummary, _jsonOptions)}");
            if (context.Links.Count > 0)
            {
                reply.AppendLine();
                reply.AppendLine("Matching design links:");
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

        private static string BuildSearchQuery(string question)
        {
            var cleaned = new string(question
                .Where(ch => char.IsLetterOrDigit(ch) || char.IsWhiteSpace(ch) || ch == '-' || ch == '_')
                .ToArray())
                .Trim();

            var stopWords = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "can", "you", "please", "provide", "link", "access", "specific", "design", "file",
                "the", "for", "with", "from", "have", "any", "how", "many", "today", "currently",
            };

            var words = cleaned
                .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Where(word => word.Length > 2 && !stopWords.Contains(word))
                .Take(6)
                .ToList();

            return words.Count == 0 ? cleaned : string.Join(' ', words);
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
