using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using ESSDesign.Server.Services;

namespace ESSDesign.Server.Services.Assistant;

public sealed class EssAssistantDataService
{
    private const string ProjectBucket = "project-information";
    private const string DesignBucket = "design-pdfs";
    private const string ProjectsPath = "projects.json";
    private static readonly Regex DrawingNumberPattern = new(@"[A-Z0-9]+-[A-Z0-9]+-ESD\d+", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly SemaphoreSlim SitesCacheLock = new(1, 1);
    private static readonly SemaphoreSlim PeopleCacheLock = new(1, 1);
    private static readonly TimeZoneInfo SydneyTimeZone = ResolveSydneyTimeZone();
    private static (List<SiteRecord> Value, DateTimeOffset ExpiresAt)? SitesCache;
    private static (List<PersonRecord> Value, DateTimeOffset ExpiresAt)? PeopleCache;

    private readonly EssAssistantSupabaseGateway _gateway;
    private readonly SupabaseService _supabaseService;
    private readonly DeliveryAnalysisService _deliveryAnalysisService;
    private readonly ILogger<EssAssistantDataService> _logger;

    public EssAssistantDataService(
        EssAssistantSupabaseGateway gateway,
        SupabaseService supabaseService,
        DeliveryAnalysisService deliveryAnalysisService,
        ILogger<EssAssistantDataService> logger)
    {
        _gateway = gateway;
        _supabaseService = supabaseService;
        _deliveryAnalysisService = deliveryAnalysisService;
        _logger = logger;
    }

    public async Task<EssAssistantToolResult> SearchEssAsync(
        string query,
        IReadOnlyCollection<string> domains,
        int limit,
        EssAssistantAccessContext access,
        CancellationToken cancellationToken)
    {
        var requested = domains
            .Select(Normalize)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var searchAll = requested.Count == 0 || requested.Contains("all");
        var perDomainLimit = Math.Clamp(limit, 1, 12);
        var searches = new List<(string Domain, Func<Task<EssAssistantToolResult>> Load)>
        {
            ("sites", () => SearchSitesAsync(query, false, perDomainLimit, cancellationToken)),
            ("people", () => SearchPeopleAsync(query, null, false, perDomainLimit, access, cancellationToken)),
            ("designs", () => SearchDesignsAsync(query, "relevance", false, perDomainLimit, cancellationToken)),
            ("drawing_register", () => SearchDrawingRegisterAsync(query, perDomainLimit, cancellationToken)),
            ("project_data", () => SearchProjectDataAsync(query, null, perDomainLimit, cancellationToken)),
            ("materials", () => SearchMaterialOrdersAsync(query, false, perDomainLimit, cancellationToken)),
            ("news", () => GetNewsAsync(query, perDomainLimit, cancellationToken)),
        };
        if (access.CanSeeTransportOperations)
            searches.Add(("transport", () => GetTransportAsync(query, 24, perDomainLimit, access, cancellationToken)));

        var selected = searches
            .Where(search => searchAll || requested.Contains(Normalize(search.Domain)))
            .ToList();
        var loaded = await Task.WhenAll(selected.Select(async search =>
            (search.Domain, Result: await search.Load())));
        var results = loaded.ToDictionary(item => item.Domain, item => (object?)item.Result.Data);
        var sources = loaded.SelectMany(item => item.Result.Sources).ToList();

        return new EssAssistantToolResult
        {
            Data = new
            {
                query,
                searchedDomains = results.Keys,
                results,
                note = "Use a domain-specific tool when full details or a document link are required.",
            },
            Sources = DedupeSources(sources).Take(40).ToList(),
        };
    }

    public async Task<EssAssistantToolResult> SearchSitesAsync(
        string? query,
        bool includeArchived,
        int limit,
        CancellationToken cancellationToken)
    {
        var sitesTask = LoadSitesAsync(cancellationToken);
        var peopleTask = LoadPeopleAsync(cancellationToken);
        await Task.WhenAll(sitesTask, peopleTask);
        var sites = sitesTask.Result;
        var people = peopleTask.Result;
        var peopleByEmployeeId = people.Where(person => !string.IsNullOrWhiteSpace(person.EmployeeId))
            .ToDictionary(person => person.EmployeeId!, StringComparer.OrdinalIgnoreCase);
        var peopleByUserId = people.Where(person => !string.IsNullOrWhiteSpace(person.UserId))
            .GroupBy(person => person.UserId!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);

        object? Resolve(string? employeeId, string? userId)
        {
            PersonRecord? person = null;
            if (!string.IsNullOrWhiteSpace(employeeId))
                peopleByEmployeeId.TryGetValue(employeeId, out person);
            if (person == null && !string.IsNullOrWhiteSpace(userId))
                peopleByUserId.TryGetValue(userId, out person);
            return person == null ? null : new { person.FullName, person.Role, person.LeadingHand };
        }

        var matches = sites
            .Where(site => includeArchived || !site.Archived)
            .Select(site => new { Site = site, Score = Score(query, site.Name, site.BuilderName, site.SiteLocation, site.ScaffoldEntity, string.Join(' ', site.DrawingNumbers)) })
            .Where(item => string.IsNullOrWhiteSpace(query) || item.Score > 0)
            .OrderByDescending(item => item.Score)
            .ThenBy(item => item.Site.Archived)
            .ThenBy(item => item.Site.BuilderName)
            .ThenBy(item => item.Site.Name)
            .Take(Math.Clamp(limit, 1, 50))
            .ToList();

        var records = matches.Select(item => new
        {
            sourceId = item.Site.SourceId,
            id = item.Site.ProjectId,
            builderId = item.Site.BuilderId,
            builder = item.Site.BuilderName,
            project = item.Site.Name,
            location = item.Site.SiteLocation,
            scaffoldEntity = item.Site.ScaffoldEntity,
            archived = item.Site.Archived,
            assignedProjectManager = Resolve(item.Site.ProjectManagerEmployeeId, item.Site.ProjectManagerUserId),
            assignedSiteSupervisor = Resolve(item.Site.SiteSupervisorEmployeeId, item.Site.SiteSupervisorUserId),
            assignedLeadingHand = Resolve(item.Site.LeadingHandEmployeeId, item.Site.LeadingHandUserId),
            inductedEmployeeCount = item.Site.InductedEmployeeIds.Count,
            drawingNumbers = item.Site.DrawingNumbers,
            updatedAt = item.Site.UpdatedAt,
        }).ToList();

        return new EssAssistantToolResult
        {
            Data = new { query, count = records.Count, sites = records },
            Sources = matches.Select(item => Source(
                item.Site.SourceId,
                "site_registry",
                $"{item.Site.BuilderName} - {item.Site.Name}",
                item.Site.SiteLocation,
                item.Site.UpdatedAt)).ToList(),
        };
    }

    public async Task<EssAssistantToolResult> SearchPeopleAsync(
        string? query,
        string? role,
        bool includePrivateProfile,
        int limit,
        EssAssistantAccessContext access,
        CancellationToken cancellationToken)
    {
        var people = await LoadPeopleAsync(cancellationToken);
        var normalizedRole = Normalize(role);
        var leadingHandFilter = normalizedRole is "leading hand" or "leading hands";
        var privateAllowed = includePrivateProfile && access.CanSeePrivateProfileDetails;
        var matches = people
            .Where(person => PersonMatchesRole(person, normalizedRole, leadingHandFilter))
            .Select(person => new
            {
                Person = person,
                Score = Score(
                    query,
                    person.FullName,
                    access.CanSeeWorkContactDetails ? person.Email : null,
                    access.CanSeeWorkContactDetails ? person.PhoneNumber : null,
                    person.Role,
                    person.EmployeeTitle,
                    person.LeadingHand ? "leading hand leading hands" : null),
            })
            .Where(item => string.IsNullOrWhiteSpace(query) || item.Score > 0)
            .OrderByDescending(item => item.Score)
            .ThenBy(item => item.Person.FullName)
            .Take(Math.Clamp(limit, 1, 100))
            .ToList();

        var records = matches.Select(item => new
        {
            sourceId = item.Person.SourceId,
            employeeId = item.Person.EmployeeId,
            userId = item.Person.UserId,
            name = item.Person.FullName,
            role = item.Person.Role,
            employeeTitle = item.Person.EmployeeTitle,
            leadingHand = item.Person.LeadingHand,
            verified = item.Person.Verified,
            preferredSiteIds = item.Person.PreferredSiteIds,
            email = access.CanSeeWorkContactDetails ? item.Person.Email : null,
            phoneNumber = access.CanSeeWorkContactDetails ? item.Person.PhoneNumber : null,
            privateProfile = privateAllowed ? new
            {
                item.Person.DateOfBirth,
                item.Person.Gender,
                item.Person.PersonalAddress,
                item.Person.EmergencyContactName,
                item.Person.EmergencyRelationship,
                item.Person.EmergencyPhoneNumber,
                item.Person.EmergencyEmail,
                item.Person.EmergencyAddress,
            } : null,
        }).ToList();

        return new EssAssistantToolResult
        {
            Data = new
            {
                query,
                role,
                count = records.Count,
                contactDetailsIncluded = access.CanSeeWorkContactDetails,
                privateProfileIncluded = privateAllowed,
                presentationNote = leadingHandFilter
                    ? "These records come from the employee registry's leadingHand classification. Return a concise name list."
                    : null,
                people = records,
            },
            Sources = matches.Count == 0
                ? new List<EssAssistantSource>()
                : new List<EssAssistantSource>
                {
                    Source(
                        "people-directory:registry",
                        "people_directory",
                        "ESS employee registry",
                        $"{matches.Count} matching people",
                        matches.Select(item => item.Person.UpdatedAt).OrderByDescending(ParseTimestamp).FirstOrDefault()),
                },
        };
    }

    private static bool PersonMatchesRole(PersonRecord person, string normalizedRole, bool leadingHandFilter)
    {
        if (string.IsNullOrWhiteSpace(normalizedRole))
            return true;
        if (leadingHandFilter)
            return person.LeadingHand || Normalize(person.Role) == "leading hand";

        return Normalize(person.Role).Contains(normalizedRole, StringComparison.OrdinalIgnoreCase)
            || Normalize(person.EmployeeTitle).Contains(normalizedRole, StringComparison.OrdinalIgnoreCase);
    }

    public async Task<EssAssistantToolResult> GetRosterAsync(
        DateOnly startDate,
        int days,
        CancellationToken cancellationToken)
    {
        var safeDays = Math.Clamp(days, 1, 31);
        var endDate = startDate.AddDays(safeDays - 1);
        var plansTask = _gateway.GetRowsAsync(
            $"ess_rostering_plans?select=*&plan_date=gte.{startDate:yyyy-MM-dd}&plan_date=lte.{endDate:yyyy-MM-dd}&order=plan_date.asc&limit=31",
            cancellationToken);
        var sitesTask = LoadSitesAsync(cancellationToken);
        var peopleTask = LoadPeopleAsync(cancellationToken);
        var relationshipsTask = _gateway.GetRowsAsync("ess_leading_hand_relationships?select=*&limit=5000", cancellationToken);
        await Task.WhenAll(plansTask, sitesTask, peopleTask, relationshipsTask);

        var sites = sitesTask.Result.ToDictionary(site => site.ProjectId, StringComparer.OrdinalIgnoreCase);
        var people = peopleTask.Result;
        var peopleByEmployeeId = people
            .Where(person => !string.IsNullOrWhiteSpace(person.EmployeeId))
            .ToDictionary(person => person.EmployeeId!, StringComparer.OrdinalIgnoreCase);
        var relationships = relationshipsTask.Result;
        var plans = plansTask.Result.Select(row =>
        {
            var date = GetString(row, "plan_date") ?? string.Empty;
            var activeSiteIds = GetStringArray(row, "active_site_ids");
            var required = GetObject(row, "required_men_by_site");
            var activeSites = activeSiteIds.Select(siteId =>
            {
                sites.TryGetValue(siteId, out var site);
                var requiredCrew = required.HasValue && required.Value.TryGetProperty(siteId, out var crewValue) && crewValue.TryGetInt32(out var crew)
                    ? crew
                    : 0;
                var inductedNames = site?.InductedEmployeeIds
                    .Select(id => peopleByEmployeeId.TryGetValue(id, out var person) ? person.FullName : null)
                    .Where(name => !string.IsNullOrWhiteSpace(name))
                    .ToList() ?? new List<string?>();
                var preferredNames = people
                    .Where(person => person.PreferredSiteIds.Contains(siteId, StringComparer.OrdinalIgnoreCase))
                    .Select(person => person.FullName)
                    .ToList();
                var leadingHandRelationships = string.IsNullOrWhiteSpace(site?.LeadingHandEmployeeId)
                    ? new List<object>()
                    : relationships
                        .Where(row => string.Equals(GetString(row, "leading_hand_employee_id"), site.LeadingHandEmployeeId, StringComparison.OrdinalIgnoreCase))
                        .Select(row =>
                        {
                            var employeeId = GetString(row, "employee_id");
                            peopleByEmployeeId.TryGetValue(employeeId ?? string.Empty, out var employee);
                            return (object)new
                            {
                                employeeId,
                                employee = employee?.FullName,
                                relationship = GetString(row, "relationship_type") ?? "neutral",
                            };
                        })
                        .ToList();
                return new
                {
                    siteId,
                    builder = site?.BuilderName,
                    project = site?.Name,
                    location = site?.SiteLocation,
                    requiredCrew,
                    inductedCrew = inductedNames,
                    preferredCrew = preferredNames,
                    leadingHandRelationships,
                    note = "Induction, preference, and relationship data can guide planning but are not confirmed daily assignments.",
                };
            }).ToList();
            return new
            {
                sourceId = $"roster:{date}",
                date,
                activeSiteCount = activeSites.Count,
                totalRequiredCrew = activeSites.Sum(site => site.requiredCrew),
                activeSites,
                updatedAt = GetString(row, "updated_at"),
            };
        }).ToList();

        return new EssAssistantToolResult
        {
            Data = new { startDate = startDate.ToString("yyyy-MM-dd"), days = safeDays, plans },
            Sources = plans.Select(plan => Source(plan.sourceId, "rostering", $"Roster - {plan.date}", $"{plan.activeSiteCount} active sites", plan.updatedAt)).ToList(),
        };
    }

    public async Task<EssAssistantToolResult> SearchDesignsAsync(
        string? query,
        string sort,
        bool allRevisions,
        int limit,
        CancellationToken cancellationToken)
    {
        var foldersTask = _gateway.GetRowsAsync("folders?select=id,name,parent_folder_id,updated_at&limit=10000", cancellationToken);
        var documentsTask = _gateway.GetRowsAsync(
            "design_documents?select=id,folder_id,revision_number,drawing_status,description,ess_design_issue_path,ess_design_issue_name,third_party_design_path,third_party_design_name,created_at,updated_at&order=updated_at.desc&limit=10000",
            cancellationToken);
        await Task.WhenAll(foldersTask, documentsTask);
        var folderPaths = BuildFolderPaths(foldersTask.Result);

        var candidates = documentsTask.Result.Select(document =>
        {
            var documentId = GetString(document, "id") ?? string.Empty;
            var folderId = GetString(document, "folder_id") ?? string.Empty;
            folderPaths.TryGetValue(folderId, out var folderPath);
            var hierarchy = DescribeDesignHierarchy(folderPath);
            var essName = GetString(document, "ess_design_issue_name");
            var thirdPartyName = GetString(document, "third_party_design_name");
            var score = Score(query, essName, thirdPartyName, GetString(document, "description"), folderPath, GetString(document, "drawing_status"), GetString(document, "revision_number"));
            return new DesignRecord
            {
                SourceId = $"design:{documentId}",
                DocumentId = documentId,
                FolderId = folderId,
                FolderPath = folderPath ?? string.Empty,
                SiteName = hierarchy.SiteName,
                ScaffoldName = hierarchy.ScaffoldName,
                EssName = essName,
                ThirdPartyName = thirdPartyName,
                EssPath = GetString(document, "ess_design_issue_path"),
                ThirdPartyPath = GetString(document, "third_party_design_path"),
                Revision = GetString(document, "revision_number"),
                DrawingStatus = GetString(document, "drawing_status"),
                Description = GetString(document, "description"),
                IssuedAt = GetString(document, "created_at") ?? GetString(document, "updated_at"),
                Score = score,
            };
        })
        .Where(document => string.IsNullOrWhiteSpace(query) || document.Score > 0)
        .ToList();

        candidates = KeepStrongestDesignMatches(candidates, query);

        if (!allRevisions)
        {
            candidates = candidates
                .GroupBy(document => DrawingKey(document.EssName ?? document.ThirdPartyName ?? document.FolderPath), StringComparer.OrdinalIgnoreCase)
                .Select(group => group.OrderByDescending(document => ParseTimestamp(document.IssuedAt)).First())
                .ToList();
        }

        var ordered = Normalize(sort) is "latest" or "date"
            ? candidates.OrderByDescending(document => ParseTimestamp(document.IssuedAt)).ThenByDescending(document => document.Score)
            : candidates.OrderByDescending(document => document.Score).ThenByDescending(document => ParseTimestamp(document.IssuedAt));
        var matches = ordered.Take(Math.Clamp(limit, 1, 100)).ToList();
        var records = matches.Select(document => new
        {
            sourceId = document.SourceId,
            documentId = document.DocumentId,
            folderId = document.FolderId,
            folderPath = document.FolderPath,
            siteName = document.SiteName,
            scaffoldName = document.ScaffoldName,
            essDesignName = document.EssName,
            thirdPartyDesignName = document.ThirdPartyName,
            revision = document.Revision,
            designUse = document.DrawingStatus,
            description = document.Description,
            hasEssDesign = !string.IsNullOrWhiteSpace(document.EssPath),
            hasThirdPartyDesign = !string.IsNullOrWhiteSpace(document.ThirdPartyPath),
            uploadedOn = FormatSydneyDate(document.IssuedAt),
        }).ToList();

        return new EssAssistantToolResult
        {
            Data = new
            {
                query,
                count = records.Count,
                presentationNote = "Lead with scaffoldName and uploadedOn. For one latest result, answer in one natural sentence and omit the raw filename unless it helps distinguish records.",
                designs = records,
            },
            Sources = matches.GroupBy(document => document.FolderId, StringComparer.OrdinalIgnoreCase).Select(group =>
            {
                var document = group.OrderByDescending(item => ParseTimestamp(item.IssuedAt)).First();
                return Source(
                $"design-folder:{document.FolderId}",
                "ess_design",
                document.ScaffoldName,
                document.FolderPath,
                document.IssuedAt);
            }).ToList(),
        };
    }

    public async Task<EssAssistantToolResult> SearchDrawingRegisterAsync(
        string? query,
        int limit,
        CancellationToken cancellationToken)
    {
        using var projects = await _gateway.ReadStorageJsonAsync(ProjectBucket, ProjectsPath, cancellationToken);
        var entries = new List<DrawingRegisterRecord>();
        if (projects?.RootElement.TryGetProperty("drawingRegisterEntries", out var register) == true && register.ValueKind == JsonValueKind.Array)
        {
            foreach (var row in register.EnumerateArray())
            {
                var id = GetString(row, "id") ?? Guid.NewGuid().ToString("N");
                var drawingNo = GetStringAny(row, "drawingNo", "drawing_no") ?? string.Empty;
                entries.Add(new DrawingRegisterRecord
                {
                    SourceId = $"drawing-register:{id}",
                    Id = id,
                    BuilderId = GetStringAny(row, "builderId", "builder_id"),
                    ProjectId = GetStringAny(row, "projectId", "project_id"),
                    Client = GetString(row, "client"),
                    Project = GetString(row, "project"),
                    Design = GetString(row, "design"),
                    DrawingNo = drawingNo,
                    BaseDrawingNo = DrawingNumberPattern.Match(drawingNo).Value.ToUpperInvariant(),
                    DateIssued = GetStringAny(row, "dateIssued", "date_issued"),
                    RevisionNo = GetStringAny(row, "revisionNo", "revision_no"),
                    DesignUse = GetStringAny(row, "designUse", "design_use"),
                    Score = Score(query, drawingNo, GetString(row, "client"), GetString(row, "project"), GetString(row, "design"), GetStringAny(row, "designUse", "design_use")),
                });
            }
        }

        var matches = entries
            .Where(entry => string.IsNullOrWhiteSpace(query) || entry.Score > 0)
            .OrderByDescending(entry => entry.Score)
            .ThenByDescending(entry => ParseDrawingSequence(entry.DrawingNo))
            .Take(Math.Clamp(limit, 1, 200))
            .ToList();

        return new EssAssistantToolResult
        {
            Data = new
            {
                query,
                count = matches.Count,
                entries = matches.Select(entry => new
                {
                    sourceId = entry.SourceId,
                    entry.Id,
                    entry.BuilderId,
                    entry.ProjectId,
                    client = entry.Client,
                    project = entry.Project,
                    design = entry.Design,
                    drawingNumber = entry.DrawingNo,
                    baseDrawingNumber = entry.BaseDrawingNo,
                    dateIssued = entry.DateIssued,
                    revision = entry.RevisionNo,
                    designUse = entry.DesignUse,
                }),
            },
            Sources = matches.Select(entry => Source(
                entry.SourceId,
                "drawing_register",
                string.IsNullOrWhiteSpace(entry.DrawingNo) ? "Drawing register entry" : entry.DrawingNo,
                $"{entry.Client} - {entry.Project}",
                entry.DateIssued)).ToList(),
        };
    }

    public async Task<EssAssistantToolResult> SearchProjectDataAsync(
        string? query,
        string? kind,
        int limit,
        CancellationToken cancellationToken)
    {
        var normalizedKind = NormalizeProjectDataKind(kind);
        var sites = await LoadSitesAsync(cancellationToken);
        var candidateSites = sites
            .Where(site => !site.Archived)
            .Select(site => new { Site = site, Score = Score(query, site.BuilderName, site.Name, site.SiteLocation) })
            .Where(item => string.IsNullOrWhiteSpace(query) || item.Score > 0)
            .OrderByDescending(item => item.Score)
            .Take(string.IsNullOrWhiteSpace(query) ? 8 : 12)
            .Select(item => item.Site)
            .ToList();

        var records = new List<ProjectDataRecord>();
        foreach (var site in candidateSites)
        {
            if (string.IsNullOrWhiteSpace(site.BuilderId) || string.IsNullOrWhiteSpace(site.ProjectId))
                continue;

            if (normalizedKind == null || normalizedKind is "swms" or "design-document")
            {
                var directKinds = normalizedKind == null ? new[] { "swms", "design-document" } : new[] { normalizedKind };
                foreach (var directKind in directKinds)
                    await AddUploadedProjectDocumentsAsync(site, directKind!, records, cancellationToken);
            }

            if (normalizedKind == null || normalizedKind == "scaff-tags")
                await AddGeneratedProjectDocumentsAsync(site, "scaff-tags", records, cancellationToken);
            if (normalizedKind == null || normalizedKind == "handover-certificates")
                await AddGeneratedProjectDocumentsAsync(site, "handover-certificates", records, cancellationToken);
            if (normalizedKind == null || normalizedKind == "day-labour-variations")
                await AddGeneratedProjectDocumentsAsync(site, "day-labour-variations", records, cancellationToken);
        }

        foreach (var record in records)
        {
            record.Score = Score(query, record.BuilderName, record.ProjectName, record.Kind, record.Name, record.Reference, record.StoragePath);
        }

        var matches = records
            .Where(record => string.IsNullOrWhiteSpace(query) || record.Score > 0)
            .OrderByDescending(record => record.Score)
            .ThenByDescending(record => ParseTimestamp(record.UpdatedAt))
            .Take(Math.Clamp(limit, 1, 60))
            .ToList();

        foreach (var record in matches.Where(record => !string.IsNullOrWhiteSpace(record.FormPath)).Take(12))
        {
            using var details = await _gateway.ReadStorageJsonAsync(ProjectBucket, record.FormPath!, cancellationToken);
            record.Details = details?.RootElement.Clone();
            if (record.Details is JsonElement detailElement)
            {
                record.PdfPath = GetStringAny(detailElement, "pdfPath", "pdf_path") ?? record.PdfPath;
            }
        }

        return new EssAssistantToolResult
        {
            Data = new
            {
                query,
                kind = normalizedKind,
                count = matches.Count,
                documents = matches.Select(record => new
                {
                    sourceId = record.SourceId,
                    recordId = record.PdfPath ?? record.StoragePath,
                    builderId = record.BuilderId,
                    projectId = record.ProjectId,
                    builder = record.BuilderName,
                    project = record.ProjectName,
                    kind = record.Kind,
                    name = record.Name,
                    reference = record.Reference,
                    updatedAt = record.UpdatedAt,
                    pdfPath = record.PdfPath,
                    details = record.Details,
                }),
            },
            Sources = matches.Select(record => Source(
                record.SourceId,
                "project_data",
                record.Name,
                $"{record.BuilderName} - {record.ProjectName} - {record.Kind}",
                record.UpdatedAt)).ToList(),
        };
    }

    public async Task<EssAssistantToolResult> SearchMaterialOrdersAsync(
        string? query,
        bool includeArchived,
        int limit,
        CancellationToken cancellationToken)
    {
        var requestsTask = _gateway.GetRowsAsync(
            $"ess_material_order_requests?select=*&{(includeArchived ? string.Empty : "archived_at=is.null&")}order=submitted_at.desc&limit=500",
            cancellationToken);
        var draftsTask = _gateway.GetRowsAsync("ess_material_orders?select=*&order=updated_at.desc&limit=500", cancellationToken);
        await Task.WhenAll(requestsTask, draftsTask);

        var requestMatches = requestsTask.Result
            .Select(row => new
            {
                Row = row,
                Id = GetString(row, "id") ?? string.Empty,
                Score = Score(query,
                    GetString(row, "builder_name"),
                    GetString(row, "project_name"),
                    GetString(row, "requested_by_name"),
                    GetString(row, "details"),
                    GetString(row, "notes"),
                    GetString(row, "scheduled_truck_label"),
                    GetString(row, "delivery_status")),
            })
            .Where(item => string.IsNullOrWhiteSpace(query) || item.Score > 0)
            .OrderByDescending(item => item.Score)
            .ThenByDescending(item => ParseTimestamp(GetString(item.Row, "submitted_at")))
            .Take(Math.Clamp(limit, 1, 100))
            .ToList();

        var draftMatches = draftsTask.Result
            .Select(row => new
            {
                Row = row,
                Id = GetString(row, "id") ?? string.Empty,
                Score = Score(query, GetString(row, "builder_name"), GetString(row, "project_name"), GetString(row, "requested_by_name"), GetString(row, "notes")),
            })
            .Where(item => string.IsNullOrWhiteSpace(query) || item.Score > 0)
            .OrderByDescending(item => item.Score)
            .ThenByDescending(item => ParseTimestamp(GetString(item.Row, "updated_at")))
            .Take(Math.Clamp(limit, 1, 100))
            .ToList();

        var requests = requestMatches.Select(item => new
        {
            sourceId = $"material-request:{item.Id}",
            id = item.Id,
            builder = GetString(item.Row, "builder_name"),
            project = GetString(item.Row, "project_name"),
            requestedBy = GetString(item.Row, "requested_by_name"),
            orderDate = GetString(item.Row, "order_date"),
            submittedAt = GetString(item.Row, "submitted_at"),
            details = GetString(item.Row, "details"),
            notes = GetString(item.Row, "notes"),
            scaffoldingSystem = GetString(item.Row, "scaffolding_system"),
            scheduledAt = GetString(item.Row, "scheduled_at_iso"),
            truck = GetString(item.Row, "scheduled_truck_label") ?? GetString(item.Row, "truck_label"),
            status = GetString(item.Row, "delivery_status"),
            archivedAt = GetString(item.Row, "archived_at"),
            itemValues = GetObject(item.Row, "item_values"),
            secondaryRoute = GetObject(item.Row, "secondary_route"),
            pdfPath = GetString(item.Row, "pdf_path"),
        }).ToList();
        var drafts = draftMatches.Select(item => new
        {
            sourceId = $"material-draft:{item.Id}",
            id = item.Id,
            builder = GetString(item.Row, "builder_name"),
            project = GetString(item.Row, "project_name"),
            requestedBy = GetString(item.Row, "requested_by_name"),
            orderDate = GetString(item.Row, "order_date"),
            notes = GetString(item.Row, "notes"),
            itemValues = GetObject(item.Row, "item_values"),
            updatedAt = GetString(item.Row, "updated_at"),
        }).ToList();

        var sources = requestMatches.Select(item => Source(
            $"material-request:{item.Id}",
            "material_order",
            $"{GetString(item.Row, "builder_name")} - {GetString(item.Row, "project_name")}",
            GetString(item.Row, "delivery_status") ?? "Material request",
            GetString(item.Row, "updated_at") ?? GetString(item.Row, "submitted_at")))
            .Concat(draftMatches.Select(item => Source(
                $"material-draft:{item.Id}",
                "material_order",
                $"Draft - {GetString(item.Row, "builder_name")} - {GetString(item.Row, "project_name")}",
                "Material order draft",
                GetString(item.Row, "updated_at"))))
            .ToList();

        return new EssAssistantToolResult
        {
            Data = new { query, requests, drafts },
            Sources = sources,
        };
    }

    public async Task<EssAssistantToolResult> GetTransportAsync(
        string? query,
        int historyHours,
        int limit,
        EssAssistantAccessContext access,
        CancellationToken cancellationToken)
    {
        if (!access.CanSeeTransportOperations)
        {
            return new EssAssistantToolResult
            {
                Data = new { error = "Your ESS role does not include live transport or truck-history access." },
            };
        }

        var safeLimit = Math.Clamp(limit, 1, 100);
        var cutoff = DateTimeOffset.UtcNow.AddHours(-Math.Clamp(historyHours, 1, 168));
        var liveTask = _gateway.GetRowsAsync("ess_truck_live_locations?select=*&order=recorded_at.desc&limit=20", cancellationToken);
        var historyTask = _gateway.GetRowsAsync(
            $"ess_truck_location_history?select=*&recorded_at=gte.{Uri.EscapeDataString(cutoff.ToString("O"))}&order=recorded_at.desc&limit=500",
            cancellationToken);
        var routesTask = _gateway.GetRowsAsync("ess_transport_route_estimates?select=*&order=updated_at.desc&limit=200", cancellationToken);
        await Task.WhenAll(liveTask, historyTask, routesTask);

        var live = liveTask.Result
            .Where(row => string.IsNullOrWhiteSpace(query) || Score(query, GetString(row, "truck_id"), GetString(row, "truck_label"), GetString(row, "role_name"), GetString(row, "status")) > 0)
            .Take(safeLimit)
            .Select(row => new
            {
                sourceId = $"truck-live:{GetString(row, "truck_id")}",
                truckId = GetString(row, "truck_id"),
                truck = GetString(row, "truck_label"),
                role = GetString(row, "role_name"),
                driverUserId = GetString(row, "driver_user_id"),
                deliveryRequestId = GetString(row, "delivery_request_id"),
                latitude = GetDouble(row, "latitude"),
                longitude = GetDouble(row, "longitude"),
                speedKph = GetDouble(row, "speed_mps") * 3.6,
                batteryPercent = GetDouble(row, "battery_percent"),
                status = GetString(row, "status"),
                recordedAt = GetString(row, "recorded_at"),
                ageMinutes = AgeMinutes(GetString(row, "recorded_at")),
            }).ToList();
        var history = historyTask.Result
            .Where(row => string.IsNullOrWhiteSpace(query) || Score(query, GetString(row, "truck_id"), GetString(row, "truck_label"), GetString(row, "status"), GetString(row, "delivery_request_id")) > 0)
            .Take(safeLimit)
            .Select(row => new
            {
                sourceId = $"truck-history:{GetString(row, "id")}",
                id = GetString(row, "id"),
                truckId = GetString(row, "truck_id"),
                truck = GetString(row, "truck_label"),
                latitude = GetDouble(row, "latitude"),
                longitude = GetDouble(row, "longitude"),
                speedKph = GetDouble(row, "speed_mps") * 3.6,
                status = GetString(row, "status"),
                trackingState = GetString(row, "tracking_state"),
                motionState = GetString(row, "motion_state"),
                recordedAt = GetString(row, "recorded_at"),
            }).ToList();
        var routes = routesTask.Result
            .Where(row => string.IsNullOrWhiteSpace(query) || Score(query, GetString(row, "route_key"), GetString(row, "from_location"), GetString(row, "to_location"), GetString(row, "segment")) > 0)
            .Take(safeLimit)
            .Select(row => new
            {
                sourceId = $"transport-route:{GetString(row, "route_key")}",
                routeKey = GetString(row, "route_key"),
                segment = GetString(row, "segment"),
                from = GetString(row, "from_location"),
                to = GetString(row, "to_location"),
                scheduledDate = GetString(row, "scheduled_date"),
                distanceKm = GetDouble(row, "distance_meters") / 1000,
                durationMinutes = GetDouble(row, "duration_seconds") / 60,
                trafficDelayMinutes = GetDouble(row, "traffic_delay_seconds") / 60,
                hasLiveTraffic = GetBool(row, "has_live_traffic"),
                trafficNote = GetString(row, "traffic_note"),
                lastRefreshedAt = GetString(row, "last_refreshed_at"),
            }).ToList();

        var sources = live.Select(item => Source(item.sourceId, "transport", item.truck ?? item.truckId ?? "Truck", item.status, item.recordedAt))
            .Concat(history.Select(item => Source(item.sourceId, "transport_history", item.truck ?? item.truckId ?? "Truck history", item.status, item.recordedAt)))
            .Concat(routes.Select(item => Source(item.sourceId, "transport_route", $"{item.from} to {item.to}", item.trafficNote, item.lastRefreshedAt)))
            .ToList();

        return new EssAssistantToolResult
        {
            Data = new { query, liveLocations = live, recentHistory = history, routeEstimates = routes },
            Sources = sources,
        };
    }

    public async Task<EssAssistantToolResult> GetNewsAsync(string? query, int limit, CancellationToken cancellationToken)
    {
        var rows = await _gateway.GetRowsAsync("ess_news?select=*&order=created_at.desc&limit=200", cancellationToken);
        var matches = rows
            .Select(row => new { Row = row, Id = GetString(row, "id") ?? string.Empty, Score = Score(query, GetString(row, "title"), GetString(row, "subtitle")) })
            .Where(item => string.IsNullOrWhiteSpace(query) || item.Score > 0)
            .OrderByDescending(item => item.Score)
            .ThenByDescending(item => ParseTimestamp(GetString(item.Row, "created_at")))
            .Take(Math.Clamp(limit, 1, 50))
            .ToList();

        return new EssAssistantToolResult
        {
            Data = new
            {
                query,
                news = matches.Select(item => new
                {
                    sourceId = $"news:{item.Id}",
                    id = item.Id,
                    title = GetString(item.Row, "title"),
                    subtitle = GetString(item.Row, "subtitle"),
                    mediaType = GetString(item.Row, "media_type"),
                    createdAt = GetString(item.Row, "created_at"),
                }),
            },
            Sources = matches.Select(item => Source(
                $"news:{item.Id}",
                "ess_news",
                GetString(item.Row, "title") ?? "ESS News",
                GetString(item.Row, "subtitle"),
                GetString(item.Row, "created_at"))).ToList(),
        };
    }

    public async Task<EssAssistantToolResult> GetNotificationsAsync(
        string? person,
        int limit,
        EssAssistantAccessContext access,
        CancellationToken cancellationToken)
    {
        var userId = access.UserId;
        var allUsers = false;
        var targetLabel = access.UserName;
        if (!string.IsNullOrWhiteSpace(person) && access.CanSeeAllNotifications)
        {
            if (Normalize(person) == "all")
            {
                allUsers = true;
                targetLabel = "all";
            }
            else
            {
                var people = await LoadPeopleAsync(cancellationToken);
                var match = people
                    .Select(candidate => new { Person = candidate, Score = Score(person, candidate.FullName, candidate.Email) })
                    .Where(item => item.Score > 0 && !string.IsNullOrWhiteSpace(item.Person.UserId))
                    .OrderByDescending(item => item.Score)
                    .FirstOrDefault();
                if (match != null)
                {
                    userId = match.Person.UserId!;
                    targetLabel = match.Person.FullName;
                }
            }
        }

        var filter = allUsers ? string.Empty : $"&user_id=eq.{Uri.EscapeDataString(userId)}";
        var rows = await _gateway.GetRowsAsync(
            $"user_notifications?select=id,user_id,title,message,type,actor_name,folder_id,document_id,read,created_at{filter}&order=created_at.desc&limit={Math.Clamp(limit, 1, 100)}",
            cancellationToken);

        var notifications = rows.Select(row => new
        {
            sourceId = $"notification:{GetString(row, "id")}",
            id = GetString(row, "id"),
            userId = GetString(row, "user_id"),
            title = GetString(row, "title"),
            message = GetString(row, "message"),
            type = GetString(row, "type"),
            actor = GetString(row, "actor_name"),
            folderId = GetString(row, "folder_id"),
            documentId = GetString(row, "document_id"),
            read = GetBool(row, "read"),
            createdAt = GetString(row, "created_at"),
        }).ToList();

        return new EssAssistantToolResult
        {
            Data = new { person = targetLabel, count = notifications.Count, notifications },
            Sources = notifications.Select(item => Source(item.sourceId, "notifications", item.title ?? "Notification", item.message, item.createdAt)).ToList(),
        };
    }

    public async Task<EssAssistantToolResult> GetCurrentWeatherAsync(
        string location,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(location))
            return Error("A suburb, postcode, or location is required for live weather.");

        var weather = await _deliveryAnalysisService.GetCurrentWeatherAsync(location, cancellationToken);
        if (weather == null)
            return Error($"Live weather could not be resolved for {location.Trim()}.");

        return new EssAssistantToolResult
        {
            Data = new
            {
                location = weather.Location,
                observedAt = weather.ObservedAt,
                condition = weather.Condition,
                temperatureC = weather.TemperatureC,
                feelsLikeC = weather.ApparentTemperatureC,
                humidityPercent = weather.RelativeHumidityPercent,
                precipitationMm = weather.PrecipitationMm,
                cloudCoverPercent = weather.CloudCoverPercent,
                windSpeedKmh = weather.WindSpeedKmh,
                windGustKmh = weather.WindGustKmh,
                provider = "Open-Meteo",
                presentationNote = "Answer directly in one or two natural sentences. Current conditions are the default; do not ask the user to choose a forecast period.",
            },
            Sources = new List<EssAssistantSource>
            {
                Source(
                    $"weather:{Normalize(weather.Location)}",
                    "live_weather",
                    weather.Location,
                    $"{weather.Condition}, {weather.TemperatureC.ToString("F1", CultureInfo.InvariantCulture)} C",
                    weather.ObservedAt),
            },
        };
    }

    public async Task<EssAssistantToolResult> GetOverviewAsync(CancellationToken cancellationToken)
    {
        var sitesTask = LoadSitesAsync(cancellationToken);
        var peopleTask = LoadPeopleAsync(cancellationToken);
        var designsTask = _gateway.GetRowsAsync("design_documents?select=id,updated_at&limit=10000", cancellationToken);
        var requestsTask = _gateway.GetRowsAsync("ess_material_order_requests?select=id,archived_at,delivery_status&limit=10000", cancellationToken);
        var newsTask = _gateway.GetRowsAsync("ess_news?select=id&limit=10000", cancellationToken);
        var plansTask = _gateway.GetRowsAsync("ess_rostering_plans?select=plan_date&order=plan_date.desc&limit=365", cancellationToken);
        await Task.WhenAll(sitesTask, peopleTask, designsTask, requestsTask, newsTask, plansTask);

        using var projects = await _gateway.ReadStorageJsonAsync(ProjectBucket, ProjectsPath, cancellationToken);
        var drawingCount = projects?.RootElement.TryGetProperty("drawingRegisterEntries", out var register) == true && register.ValueKind == JsonValueKind.Array
            ? register.GetArrayLength()
            : 0;
        var sites = sitesTask.Result;
        var requests = requestsTask.Result;
        var generatedAt = DateTimeOffset.UtcNow.ToString("O");

        return new EssAssistantToolResult
        {
            Data = new
            {
                generatedAt,
                sites = new { total = sites.Count, active = sites.Count(site => !site.Archived), archived = sites.Count(site => site.Archived) },
                people = new { total = peopleTask.Result.Count, verifiedEmployees = peopleTask.Result.Count(person => person.Verified) },
                designs = new { documents = designsTask.Result.Count, drawingRegisterEntries = drawingCount },
                materials = new
                {
                    totalRequests = requests.Count,
                    activeRequests = requests.Count(row => string.IsNullOrWhiteSpace(GetString(row, "archived_at"))),
                    scheduledRequests = requests.Count(row => !string.IsNullOrWhiteSpace(GetString(row, "delivery_status"))),
                },
                rosterPlans = plansTask.Result.Count,
                newsItems = newsTask.Result.Count,
            },
            Sources = new List<EssAssistantSource>
            {
                Source("overview:current", "ess_overview", "ESS company data overview", "Live counts from ESS data services", generatedAt),
            },
        };
    }

    public async Task<EssAssistantToolResult> OpenRecordAsync(
        string recordType,
        string recordId,
        string? fileType,
        CancellationToken cancellationToken)
    {
        var normalizedType = Normalize(recordType);
        if (normalizedType == "design")
        {
            if (!Guid.TryParse(recordId, out var documentId))
                return Error("A valid design document ID is required.");

            var requestedType = Normalize(fileType) == "third party" ? "thirdparty" : "ess";
            try
            {
                var download = await _supabaseService.GetDocumentDownloadUrlAsync(documentId, requestedType);
                var link = new EssAssistantLink
                {
                    Label = download.FileName,
                    Url = download.Url,
                    Type = requestedType == "ess" ? "ess-design" : "third-party-design",
                };
                return new EssAssistantToolResult
                {
                    Data = new { success = true, recordType = "design", documentId, fileName = download.FileName },
                    Links = new List<EssAssistantLink> { link },
                    Sources = new List<EssAssistantSource> { Source($"design:{documentId:D}", "ess_design", download.FileName, "Opened design document", null, download.Url) },
                };
            }
            catch (Exception ex)
            {
                _logger.LogInformation(ex, "Unable to open ESS design document {DocumentId}", documentId);
                return Error("The design record exists, but its file could not be opened.");
            }
        }

        string? storagePath = null;
        var label = "ESS document";
        if (normalizedType == "project data")
        {
            storagePath = Uri.UnescapeDataString(recordId);
            if (!IsAllowedProjectDataPath(storagePath))
                return Error("The Project data record does not contain a valid PDF path.");
            label = Path.GetFileName(storagePath);
        }
        else if (normalizedType == "material order")
        {
            var rows = await _gateway.GetRowsAsync(
                $"ess_material_order_requests?select=id,pdf_path,builder_name,project_name&id=eq.{Uri.EscapeDataString(recordId)}&limit=1",
                cancellationToken);
            var row = rows.FirstOrDefault();
            storagePath = row.ValueKind == JsonValueKind.Object ? GetString(row, "pdf_path") : null;
            if (string.IsNullOrWhiteSpace(storagePath) || !storagePath.StartsWith("material-order-requests/", StringComparison.OrdinalIgnoreCase))
                return Error("The material order does not have an available PDF.");
            label = $"{GetString(row, "builder_name")} - {GetString(row, "project_name")}".Trim(' ', '-');
        }
        else
        {
            return Error("Unsupported record type. Use design, project_data, or material_order.");
        }

        try
        {
            var url = await _supabaseService.GetSafetyStorageSignedUrlAsync(storagePath!, 60 * 60 * 24 * 14);
            var link = new EssAssistantLink { Label = label, Url = url, Type = normalizedType };
            return new EssAssistantToolResult
            {
                Data = new { success = true, recordType = normalizedType, recordId, fileName = label },
                Links = new List<EssAssistantLink> { link },
                Sources = new List<EssAssistantSource> { Source($"{normalizedType}:{recordId}", normalizedType, label, "Opened ESS document", null, url) },
            };
        }
        catch (Exception ex)
        {
            _logger.LogInformation(ex, "Unable to open ESS assistant storage record {RecordId}", recordId);
            return Error("The record was found, but its PDF could not be opened.");
        }
    }

    private async Task<List<SiteRecord>> LoadSitesAsync(CancellationToken cancellationToken)
    {
        if (SitesCache is { } cached && cached.ExpiresAt > DateTimeOffset.UtcNow)
            return cached.Value;
        await SitesCacheLock.WaitAsync(cancellationToken);
        try
        {
            if (SitesCache is { } refreshed && refreshed.ExpiresAt > DateTimeOffset.UtcNow)
                return refreshed.Value;
            var sites = await LoadSitesUncachedAsync(cancellationToken);
            SitesCache = (sites, DateTimeOffset.UtcNow.AddSeconds(30));
            return sites;
        }
        finally
        {
            SitesCacheLock.Release();
        }
    }

    private async Task<List<SiteRecord>> LoadSitesUncachedAsync(CancellationToken cancellationToken)
    {
        using var projects = await _gateway.ReadStorageJsonAsync(ProjectBucket, ProjectsPath, cancellationToken);
        var sites = new List<SiteRecord>();
        if (projects?.RootElement.TryGetProperty("builders", out var builders) != true || builders.ValueKind != JsonValueKind.Array)
            return sites;

        foreach (var builder in builders.EnumerateArray())
        {
            var builderId = GetString(builder, "id") ?? string.Empty;
            var builderName = GetString(builder, "name") ?? "Unknown builder";
            if (!builder.TryGetProperty("projects", out var projectsArray) || projectsArray.ValueKind != JsonValueKind.Array)
                continue;

            foreach (var project in projectsArray.EnumerateArray())
            {
                var projectId = GetString(project, "id") ?? string.Empty;
                sites.Add(new SiteRecord
                {
                    SourceId = $"site:{builderId}:{projectId}",
                    BuilderId = builderId,
                    BuilderName = builderName,
                    ProjectId = projectId,
                    Name = GetString(project, "name") ?? string.Empty,
                    SiteLocation = GetStringAny(project, "siteLocation", "site_location"),
                    ScaffoldEntity = GetStringAny(project, "scaffoldEntity", "scaffold_entity") ?? "Erect Safe Scaffolding",
                    Archived = GetBool(project, "archived"),
                    ProjectManagerEmployeeId = GetStringAny(project, "projectManagerEmployeeId", "project_manager_employee_id"),
                    ProjectManagerUserId = GetStringAny(project, "projectManagerUserId", "project_manager_user_id"),
                    SiteSupervisorEmployeeId = GetStringAny(project, "siteSupervisorEmployeeId", "site_supervisor_employee_id"),
                    SiteSupervisorUserId = GetStringAny(project, "siteSupervisorUserId", "site_supervisor_user_id"),
                    LeadingHandEmployeeId = GetStringAny(project, "leadingHandEmployeeId", "leading_hand_employee_id"),
                    LeadingHandUserId = GetStringAny(project, "leadingHandUserId", "leading_hand_user_id"),
                    InductedEmployeeIds = GetStringArrayAny(project, "inductedEmployeeIds", "inducted_employee_ids"),
                    DrawingNumbers = GetStringArrayAny(project, "drawingNumbers", "drawing_numbers"),
                    UpdatedAt = GetStringAny(project, "updatedAt", "updated_at") ?? GetStringAny(builder, "updatedAt", "updated_at"),
                });
            }
        }

        return sites;
    }

    private async Task<List<PersonRecord>> LoadPeopleAsync(CancellationToken cancellationToken)
    {
        if (PeopleCache is { } cached && cached.ExpiresAt > DateTimeOffset.UtcNow)
            return cached.Value;
        await PeopleCacheLock.WaitAsync(cancellationToken);
        try
        {
            if (PeopleCache is { } refreshed && refreshed.ExpiresAt > DateTimeOffset.UtcNow)
                return refreshed.Value;
            var people = await LoadPeopleUncachedAsync(cancellationToken);
            PeopleCache = (people, DateTimeOffset.UtcNow.AddSeconds(30));
            return people;
        }
        finally
        {
            PeopleCacheLock.Release();
        }
    }

    private async Task<List<PersonRecord>> LoadPeopleUncachedAsync(CancellationToken cancellationToken)
    {
        var employeesTask = _gateway.GetRowsAsync("ess_rostering_employees?select=*&order=last_name.asc,first_name.asc&limit=2000", cancellationToken);
        var profilesTask = _gateway.GetRowsAsync("user_names?select=*&order=full_name.asc&limit=2000", cancellationToken);
        var rolesTask = _gateway.GetRowsAsync("user_roles?select=user_id,role,updated_at&limit=2000", cancellationToken);
        await Task.WhenAll(employeesTask, profilesTask, rolesTask);

        var profilesById = profilesTask.Result
            .Where(row => !string.IsNullOrWhiteSpace(GetString(row, "id")))
            .ToDictionary(row => GetString(row, "id")!, StringComparer.OrdinalIgnoreCase);
        var profilesByEmail = profilesTask.Result
            .Where(row => !string.IsNullOrWhiteSpace(GetString(row, "email")))
            .GroupBy(row => GetString(row, "email")!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
        var roles = rolesTask.Result
            .Where(row => !string.IsNullOrWhiteSpace(GetString(row, "user_id")))
            .ToDictionary(row => GetString(row, "user_id")!, row => GetString(row, "role") ?? "viewer", StringComparer.OrdinalIgnoreCase);

        var people = new List<PersonRecord>();
        var usedProfiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var employee in employeesTask.Result)
        {
            var employeeId = GetString(employee, "id") ?? string.Empty;
            var userId = GetStringAny(employee, "linked_auth_user_id", "linkedAuthUserId");
            var email = GetString(employee, "email");
            JsonElement? profile = null;
            if (!string.IsNullOrWhiteSpace(userId) && profilesById.TryGetValue(userId, out var byId))
                profile = byId;
            else if (!string.IsNullOrWhiteSpace(email) && profilesByEmail.TryGetValue(email, out var byEmail))
                profile = byEmail;
            if (profile.HasValue && !string.IsNullOrWhiteSpace(GetString(profile.Value, "id")))
                usedProfiles.Add(GetString(profile.Value, "id")!);

            var firstName = GetString(employee, "first_name") ?? string.Empty;
            var lastName = GetString(employee, "last_name") ?? string.Empty;
            var fullName = string.Join(' ', new[] { firstName, lastName }.Where(value => !string.IsNullOrWhiteSpace(value)));
            if (string.IsNullOrWhiteSpace(fullName) && profile.HasValue)
                fullName = GetString(profile.Value, "full_name") ?? GetString(profile.Value, "email") ?? "Unknown user";
            var leadingHand = GetBool(employee, "leading_hand");
            var person = BuildPerson(employeeId, userId, fullName, email, GetString(employee, "phone_number"), leadingHand, GetString(employee, "verified_at"), profile, roles);
            person.PreferredSiteIds = new[]
                {
                    GetString(employee, "preferred_site_1"),
                    GetString(employee, "preferred_site_2"),
                    GetString(employee, "preferred_site_3"),
                }
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Select(value => value!)
                .ToList();
            people.Add(person);
        }

        foreach (var profile in profilesTask.Result)
        {
            var profileId = GetString(profile, "id") ?? string.Empty;
            if (usedProfiles.Contains(profileId))
                continue;
            var fullName = GetString(profile, "full_name") ?? GetString(profile, "email") ?? "Unknown user";
            people.Add(BuildPerson(null, profileId, fullName, GetString(profile, "email"), GetString(profile, "phone_number"), false, null, profile, roles));
        }

        return people.OrderBy(person => person.FullName).ToList();
    }

    private static PersonRecord BuildPerson(
        string? employeeId,
        string? userId,
        string fullName,
        string? email,
        string? phoneNumber,
        bool leadingHand,
        string? verifiedAt,
        JsonElement? profile,
        IReadOnlyDictionary<string, string> roles)
    {
        if (string.IsNullOrWhiteSpace(userId) && profile.HasValue)
            userId = GetString(profile.Value, "id");

        var role = !string.IsNullOrWhiteSpace(userId) && roles.TryGetValue(userId, out var assignedRole)
            ? assignedRole
            : GetStringAny(profile, "role", "app_role") ?? "viewer";

        return new PersonRecord
        {
            SourceId = $"person:{userId ?? employeeId ?? Normalize(fullName)}",
            EmployeeId = employeeId,
            UserId = userId,
            FullName = fullName,
            Email = email ?? GetString(profile, "email"),
            PhoneNumber = phoneNumber ?? GetStringAny(profile, "phone_number", "phoneNumber"),
            Role = role,
            EmployeeTitle = GetStringAny(profile, "employee_title", "employeeTitle", "job_title", "jobTitle"),
            LeadingHand = leadingHand,
            Verified = !string.IsNullOrWhiteSpace(verifiedAt) || GetBool(profile, "verified"),
            DateOfBirth = GetStringAny(profile, "date_of_birth", "dateOfBirth"),
            Gender = GetString(profile, "gender"),
            PersonalAddress = GetStringAny(profile, "personal_address", "personalAddress", "address"),
            EmergencyContactName = GetStringAny(profile, "emergency_contact_name", "emergencyContactName"),
            EmergencyRelationship = GetStringAny(profile, "emergency_relationship", "emergencyRelationship"),
            EmergencyPhoneNumber = GetStringAny(profile, "emergency_phone_number", "emergencyPhoneNumber"),
            EmergencyEmail = GetStringAny(profile, "emergency_email", "emergencyEmail"),
            EmergencyAddress = GetStringAny(profile, "emergency_address", "emergencyAddress"),
            UpdatedAt = GetStringAny(profile, "updated_at", "updatedAt") ?? verifiedAt,
        };
    }

    private async Task AddUploadedProjectDocumentsAsync(
        SiteRecord site,
        string kind,
        ICollection<ProjectDataRecord> records,
        CancellationToken cancellationToken)
    {
        var prefix = $"site-data/{site.BuilderId}/{site.ProjectId}/{kind}";
        var objects = await _gateway.ListStorageObjectsAsync(ProjectBucket, prefix, 1000, cancellationToken);
        foreach (var item in objects)
        {
            var name = GetString(item, "name");
            if (string.IsNullOrWhiteSpace(name) || name.EndsWith(".emptyFolderPlaceholder", StringComparison.OrdinalIgnoreCase))
                continue;

            var storagePath = name.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)
                ? name
                : $"{prefix}/{name.TrimStart('/')}";
            if (!storagePath.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
                continue;

            records.Add(new ProjectDataRecord
            {
                SourceId = $"project-data:{site.BuilderId}:{site.ProjectId}:{kind}:{storagePath}",
                BuilderId = site.BuilderId,
                ProjectId = site.ProjectId,
                BuilderName = site.BuilderName,
                ProjectName = site.Name,
                Kind = kind,
                Name = Path.GetFileNameWithoutExtension(storagePath),
                Reference = DrawingNumberPattern.Match(storagePath).Value,
                StoragePath = storagePath,
                PdfPath = storagePath,
                UpdatedAt = GetStringAny(item, "updated_at", "updatedAt", "created_at", "createdAt"),
            });
        }
    }

    private async Task AddGeneratedProjectDocumentsAsync(
        SiteRecord site,
        string kind,
        ICollection<ProjectDataRecord> records,
        CancellationToken cancellationToken)
    {
        var prefix = $"site-data/{site.BuilderId}/{site.ProjectId}/{kind}";
        using var index = await _gateway.ReadStorageJsonAsync(ProjectBucket, $"{prefix}/index.json", cancellationToken);
        if (index == null)
            return;

        var root = index.RootElement;
        var forms = root.ValueKind == JsonValueKind.Array
            ? root
            : root.TryGetProperty("forms", out var formArray) && formArray.ValueKind == JsonValueKind.Array
                ? formArray
                : default;
        if (forms.ValueKind != JsonValueKind.Array)
            return;

        foreach (var form in forms.EnumerateArray())
        {
            var id = GetStringAny(form, "id", "formId", "form_id");
            if (string.IsNullOrWhiteSpace(id))
                continue;

            var name = GetStringAny(form,
                "formReferenceName", "form_reference_name", "scaffoldName", "scaffold_name",
                "title", "variationNumber", "variation_number", "inspectionNumber", "inspection_number",
                "scaffoldNo", "scaffold_no") ?? $"{kind} {id}";
            var reference = GetStringAny(form,
                "reference", "formReference", "form_reference", "variationNumber", "variation_number",
                "inspectionNumber", "inspection_number", "scaffoldNo", "scaffold_no");
            var formPath = GetStringAny(form, "formPath", "form_path") ?? $"{prefix}/forms/{id}.json";
            var pdfPath = GetStringAny(form, "pdfPath", "pdf_path") ?? $"{prefix}/pdf/{id}.pdf";

            records.Add(new ProjectDataRecord
            {
                SourceId = $"project-data:{site.BuilderId}:{site.ProjectId}:{kind}:{id}",
                FormId = id,
                BuilderId = site.BuilderId,
                ProjectId = site.ProjectId,
                BuilderName = site.BuilderName,
                ProjectName = site.Name,
                Kind = kind,
                Name = name,
                Reference = reference,
                StoragePath = pdfPath,
                FormPath = formPath,
                PdfPath = pdfPath,
                UpdatedAt = GetStringAny(form, "updatedAt", "updated_at", "createdAt", "created_at"),
            });
        }
    }

    private static string? NormalizeProjectDataKind(string? kind)
    {
        var normalized = Normalize(kind).Replace(' ', '-');
        return normalized switch
        {
            "" or "all" => null,
            "swms" => "swms",
            "design" or "design-document" or "design-documents" => "design-document",
            "scaff-tag" or "scaff-tags" or "scaffold-tag" or "scaffold-tags" => "scaff-tags",
            "handover" or "handover-certificate" or "handover-certificates" => "handover-certificates",
            "day-labour" or "day-labour-form" or "day-labour-forms" or "day-labour-variation" or "day-labour-variations" => "day-labour-variations",
            _ => normalized,
        };
    }

    private static Dictionary<string, string> BuildFolderPaths(IEnumerable<JsonElement> folders)
    {
        var folderMap = folders
            .Where(folder => !string.IsNullOrWhiteSpace(GetString(folder, "id")))
            .ToDictionary(
                folder => GetString(folder, "id")!,
                folder => (Name: GetString(folder, "name") ?? "Unnamed folder", ParentId: GetString(folder, "parent_folder_id")),
                StringComparer.OrdinalIgnoreCase);
        var paths = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        string Resolve(string id, HashSet<string> visiting)
        {
            if (paths.TryGetValue(id, out var cached))
                return cached;
            if (!folderMap.TryGetValue(id, out var folder))
                return string.Empty;
            if (!visiting.Add(id))
                return folder.Name;

            var parent = string.IsNullOrWhiteSpace(folder.ParentId) ? string.Empty : Resolve(folder.ParentId, visiting);
            visiting.Remove(id);
            var path = string.IsNullOrWhiteSpace(parent) ? folder.Name : $"{parent} / {folder.Name}";
            paths[id] = path;
            return path;
        }

        foreach (var id in folderMap.Keys)
            Resolve(id, new HashSet<string>(StringComparer.OrdinalIgnoreCase));
        return paths;
    }

    private static DesignHierarchy DescribeDesignHierarchy(string? folderPath)
    {
        var segments = (folderPath ?? string.Empty)
            .Split(" / ", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToList();
        while (segments.Count > 0 && IsDesignContainerFolder(segments[^1]))
            segments.RemoveAt(segments.Count - 1);

        var scaffoldName = segments.Count > 0 ? HumanizeFolderName(segments[^1]) : "Design document";
        var siteName = segments.Count > 1 ? segments[^2] : string.Empty;
        return new DesignHierarchy(siteName, scaffoldName);
    }

    private static bool IsDesignContainerFolder(string name)
    {
        var normalized = Normalize(name);
        return normalized is "design pdf" or "design pdfs" or "design drawing" or "design drawings"
            or "design document" or "design documents" or "designs" or "pdf" or "pdfs" or "revisions";
    }

    private static List<DesignRecord> KeepStrongestDesignMatches(List<DesignRecord> candidates, string? query)
    {
        if (candidates.Count < 2 || string.IsNullOrWhiteSpace(query))
            return candidates;

        var bestScore = candidates.Max(document => document.Score);
        if (bestScore < 100)
            return candidates;

        var threshold = bestScore - 40;
        return candidates.Where(document => document.Score >= threshold).ToList();
    }

    private static string HumanizeFolderName(string name)
    {
        var hasLetters = name.Any(char.IsLetter);
        var isAllCaps = hasLetters && !name.Any(char.IsLower);
        return isAllCaps
            ? CultureInfo.GetCultureInfo("en-AU").TextInfo.ToTitleCase(name.ToLowerInvariant())
            : name;
    }

    private static string? FormatSydneyDate(string? value)
    {
        var timestamp = ParseTimestamp(value);
        return timestamp == DateTimeOffset.MinValue
            ? null
            : TimeZoneInfo.ConvertTime(timestamp, SydneyTimeZone).ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
    }

    private static TimeZoneInfo ResolveSydneyTimeZone()
    {
        foreach (var id in new[] { "Australia/Sydney", "AUS Eastern Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (TimeZoneNotFoundException)
            {
                // Try the platform-specific alternative.
            }
        }
        return TimeZoneInfo.Local;
    }

    private static int Score(string? query, params string?[] candidates)
    {
        var normalizedQuery = Normalize(query);
        if (string.IsNullOrWhiteSpace(normalizedQuery))
            return 1;

        var haystack = Normalize(string.Join(' ', candidates.Where(value => !string.IsNullOrWhiteSpace(value))));
        if (string.IsNullOrWhiteSpace(haystack))
            return 0;
        if (haystack.Equals(normalizedQuery, StringComparison.OrdinalIgnoreCase))
            return 200;

        var tokens = normalizedQuery.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var numericTokens = tokens.Where(token => token.Any(char.IsDigit)).ToArray();
        if (numericTokens.Any(token => !haystack.Contains(token, StringComparison.OrdinalIgnoreCase)))
            return 0;

        var matched = tokens.Count(token => haystack.Contains(token, StringComparison.OrdinalIgnoreCase));
        if (matched == 0)
            return 0;
        var score = matched * 20;
        if (matched == tokens.Length)
            score += 60;
        if (haystack.Contains(normalizedQuery, StringComparison.OrdinalIgnoreCase))
            score += 80;
        return score;
    }

    private static string Normalize(string? value) => Regex.Replace(
        (value ?? string.Empty).ToLowerInvariant(),
        @"[^a-z0-9]+",
        " ").Trim();

    private static string DrawingKey(string? value)
    {
        var match = DrawingNumberPattern.Match(value ?? string.Empty);
        return match.Success ? match.Value.ToUpperInvariant() : Normalize(value);
    }

    private static long ParseDrawingSequence(string? value)
    {
        var match = Regex.Match(value ?? string.Empty, @"ESD(?<number>\d+)", RegexOptions.IgnoreCase);
        return match.Success && long.TryParse(match.Groups["number"].Value, out var number) ? number : 0;
    }

    private static DateTimeOffset ParseTimestamp(string? value) =>
        DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var timestamp)
            ? timestamp
            : DateTimeOffset.MinValue;

    private static double AgeMinutes(string? value)
    {
        var timestamp = ParseTimestamp(value);
        return timestamp == DateTimeOffset.MinValue ? -1 : Math.Max(0, (DateTimeOffset.UtcNow - timestamp).TotalMinutes);
    }

    private static bool IsAllowedProjectDataPath(string path) =>
        path.StartsWith("site-data/", StringComparison.OrdinalIgnoreCase) &&
        !path.Contains("..", StringComparison.Ordinal) &&
        path.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase);

    private static EssAssistantToolResult Error(string message) => new() { Data = new { error = message } };

    private static EssAssistantSource Source(
        string id,
        string domain,
        string label,
        string? detail,
        string? updatedAt,
        string? url = null) => new()
        {
            Id = id,
            Domain = domain,
            Label = label,
            Detail = detail,
            UpdatedAt = updatedAt,
            Url = url,
        };

    private static IEnumerable<EssAssistantSource> DedupeSources(IEnumerable<EssAssistantSource> sources) =>
        sources.GroupBy(source => source.Id, StringComparer.OrdinalIgnoreCase).Select(group => group.First());

    private static string? GetString(JsonElement? element, string propertyName)
    {
        if (!element.HasValue || element.Value.ValueKind != JsonValueKind.Object ||
            !element.Value.TryGetProperty(propertyName, out var value) || value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            return null;
        return value.ValueKind == JsonValueKind.String ? value.GetString() : value.ToString();
    }

    private static string? GetString(JsonElement element, string propertyName) => GetString((JsonElement?)element, propertyName);

    private static string? GetStringAny(JsonElement? element, params string[] propertyNames)
    {
        foreach (var propertyName in propertyNames)
        {
            var value = GetString(element, propertyName);
            if (!string.IsNullOrWhiteSpace(value))
                return value;
        }
        return null;
    }

    private static string? GetStringAny(JsonElement element, params string[] propertyNames) => GetStringAny((JsonElement?)element, propertyNames);

    private static List<string> GetStringArray(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value) || value.ValueKind != JsonValueKind.Array)
            return new List<string>();
        return value.EnumerateArray()
            .Select(item => item.ValueKind == JsonValueKind.String ? item.GetString() : item.ToString())
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Select(item => item!)
            .ToList();
    }

    private static List<string> GetStringArrayAny(JsonElement element, params string[] propertyNames)
    {
        foreach (var propertyName in propertyNames)
        {
            var values = GetStringArray(element, propertyName);
            if (values.Count > 0)
                return values;
        }
        return new List<string>();
    }

    private static JsonElement? GetObject(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value) || value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            return null;
        return value.Clone();
    }

    private static double GetDouble(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value))
            return 0;
        if (value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number))
            return number;
        return double.TryParse(value.ToString(), NumberStyles.Any, CultureInfo.InvariantCulture, out number) ? number : 0;
    }

    private static bool GetBool(JsonElement? element, string propertyName)
    {
        if (!element.HasValue || element.Value.ValueKind != JsonValueKind.Object || !element.Value.TryGetProperty(propertyName, out var value))
            return false;
        if (value.ValueKind is JsonValueKind.True or JsonValueKind.False)
            return value.GetBoolean();
        return bool.TryParse(value.ToString(), out var parsed) && parsed;
    }

    private static bool GetBool(JsonElement element, string propertyName) => GetBool((JsonElement?)element, propertyName);

    private sealed class SiteRecord
    {
        public string SourceId { get; init; } = string.Empty;
        public string BuilderId { get; init; } = string.Empty;
        public string BuilderName { get; init; } = string.Empty;
        public string ProjectId { get; init; } = string.Empty;
        public string Name { get; init; } = string.Empty;
        public string? SiteLocation { get; init; }
        public string ScaffoldEntity { get; init; } = string.Empty;
        public bool Archived { get; init; }
        public string? ProjectManagerEmployeeId { get; init; }
        public string? ProjectManagerUserId { get; init; }
        public string? SiteSupervisorEmployeeId { get; init; }
        public string? SiteSupervisorUserId { get; init; }
        public string? LeadingHandEmployeeId { get; init; }
        public string? LeadingHandUserId { get; init; }
        public List<string> InductedEmployeeIds { get; init; } = new();
        public List<string> DrawingNumbers { get; init; } = new();
        public string? UpdatedAt { get; init; }
    }

    private sealed class PersonRecord
    {
        public string SourceId { get; init; } = string.Empty;
        public string? EmployeeId { get; init; }
        public string? UserId { get; init; }
        public string FullName { get; init; } = string.Empty;
        public string? Email { get; init; }
        public string? PhoneNumber { get; init; }
        public string Role { get; init; } = string.Empty;
        public string? EmployeeTitle { get; init; }
        public List<string> PreferredSiteIds { get; set; } = new();
        public bool LeadingHand { get; init; }
        public bool Verified { get; init; }
        public string? DateOfBirth { get; init; }
        public string? Gender { get; init; }
        public string? PersonalAddress { get; init; }
        public string? EmergencyContactName { get; init; }
        public string? EmergencyRelationship { get; init; }
        public string? EmergencyPhoneNumber { get; init; }
        public string? EmergencyEmail { get; init; }
        public string? EmergencyAddress { get; init; }
        public string? UpdatedAt { get; init; }
    }

    private sealed class DesignRecord
    {
        public string SourceId { get; init; } = string.Empty;
        public string DocumentId { get; init; } = string.Empty;
        public string FolderId { get; init; } = string.Empty;
        public string FolderPath { get; init; } = string.Empty;
        public string SiteName { get; init; } = string.Empty;
        public string ScaffoldName { get; init; } = string.Empty;
        public string? EssName { get; init; }
        public string? ThirdPartyName { get; init; }
        public string? EssPath { get; init; }
        public string? ThirdPartyPath { get; init; }
        public string? Revision { get; init; }
        public string? DrawingStatus { get; init; }
        public string? Description { get; init; }
        public string? IssuedAt { get; init; }
        public int Score { get; init; }
    }

    private sealed record DesignHierarchy(string SiteName, string ScaffoldName);

    private sealed class DrawingRegisterRecord
    {
        public string SourceId { get; init; } = string.Empty;
        public string Id { get; init; } = string.Empty;
        public string? BuilderId { get; init; }
        public string? ProjectId { get; init; }
        public string? Client { get; init; }
        public string? Project { get; init; }
        public string? Design { get; init; }
        public string DrawingNo { get; init; } = string.Empty;
        public string BaseDrawingNo { get; init; } = string.Empty;
        public string? DateIssued { get; init; }
        public string? RevisionNo { get; init; }
        public string? DesignUse { get; init; }
        public int Score { get; init; }
    }

    private sealed class ProjectDataRecord
    {
        public string SourceId { get; init; } = string.Empty;
        public string? FormId { get; init; }
        public string BuilderId { get; init; } = string.Empty;
        public string ProjectId { get; init; } = string.Empty;
        public string BuilderName { get; init; } = string.Empty;
        public string ProjectName { get; init; } = string.Empty;
        public string Kind { get; init; } = string.Empty;
        public string Name { get; init; } = string.Empty;
        public string? Reference { get; init; }
        public string StoragePath { get; init; } = string.Empty;
        public string? FormPath { get; init; }
        public string? PdfPath { get; set; }
        public string? UpdatedAt { get; init; }
        public JsonElement? Details { get; set; }
        public int Score { get; set; }
    }
}
