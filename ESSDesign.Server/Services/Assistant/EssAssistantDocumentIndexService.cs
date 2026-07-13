using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace ESSDesign.Server.Services.Assistant;

public sealed class EssAssistantDocumentIndexService
{
    private const string ProjectBucket = "project-information";
    private const string DesignBucket = "design-pdfs";
    private readonly EssAssistantSupabaseGateway _gateway;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<EssAssistantDocumentIndexService> _logger;
    private readonly SemaphoreSlim _vectorStoreLock = new(1, 1);
    private string? _cachedVectorStoreId;
    private bool _vectorStoreResolved;

    public EssAssistantDocumentIndexService(
        EssAssistantSupabaseGateway gateway,
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<EssAssistantDocumentIndexService> logger)
    {
        _gateway = gateway;
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<string?> GetVectorStoreIdAsync(CancellationToken cancellationToken)
    {
        var configured = _configuration["OpenAI:AssistantVectorStoreId"];
        if (!string.IsNullOrWhiteSpace(configured))
            return configured;
        if (_vectorStoreResolved)
            return _cachedVectorStoreId;
        if (!string.IsNullOrWhiteSpace(_cachedVectorStoreId))
            return _cachedVectorStoreId;

        if (!await _gateway.ResourceExistsAsync("ess_ai_settings?select=key&limit=1", cancellationToken))
        {
            _vectorStoreResolved = true;
            return null;
        }

        var rows = await _gateway.GetRowsAsync("ess_ai_settings?select=value&key=eq.openai_vector_store_id&limit=1", cancellationToken);
        var value = rows.FirstOrDefault();
        _cachedVectorStoreId = GetString(value, "value");
        _vectorStoreResolved = true;
        return _cachedVectorStoreId;
    }

    public async Task<EssAssistantDocumentSyncResult> SyncAsync(
        int maxDocuments,
        EssAssistantAccessContext? access,
        CancellationToken cancellationToken)
    {
        if (access != null && !access.CanSyncDocumentIndex)
            throw new UnauthorizedAccessException("Only ESS administrators can synchronise the assistant document index.");
        if (!_gateway.HasServiceRoleKey)
            throw new InvalidOperationException("Supabase:ServiceRoleKey is required to synchronise the private ESS document index.");
        if (!await _gateway.ResourceExistsAsync("ess_ai_document_index?select=id&limit=1", cancellationToken))
            throw new InvalidOperationException("Apply migration 033_rebuild_ess_ai_assistant.sql before synchronising documents.");

        var apiKey = _configuration["OpenAI:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new InvalidOperationException("OpenAI:ApiKey is not configured.");

        var vectorStoreId = await GetOrCreateVectorStoreAsync(apiKey, cancellationToken);
        const int discoveryLimit = 20_000;
        var batchSize = Math.Clamp(maxDocuments, 1, 5_000);
        var candidates = await LoadCandidatesAsync(discoveryLimit, cancellationToken);
        var existing = await _gateway.GetRowsAsync("ess_ai_document_index?select=*&limit=20000", cancellationToken);
        var indexedByPath = existing
            .Where(row => !string.IsNullOrWhiteSpace(GetString(row, "storage_bucket")) && !string.IsNullOrWhiteSpace(GetString(row, "storage_path")))
            .GroupBy(row => $"{GetString(row, "storage_bucket")}/{GetString(row, "storage_path")}", StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
        var result = new EssAssistantDocumentSyncResult { VectorStoreId = vectorStoreId, Discovered = candidates.Count };
        var maximumBytes = Math.Clamp(_configuration.GetValue<long?>("OpenAI:AssistantDocumentMaxBytes") ?? 40_000_000, 1_000_000, 100_000_000);
        var processed = 0;

        foreach (var candidate in candidates)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var key = $"{candidate.Bucket}/{candidate.Path}";
            indexedByPath.TryGetValue(key, out var previousIndex);
            if (previousIndex.ValueKind == JsonValueKind.Object &&
                string.Equals(GetString(previousIndex, "fingerprint"), candidate.Fingerprint, StringComparison.Ordinal) &&
                string.Equals(GetString(previousIndex, "status"), "ready", StringComparison.OrdinalIgnoreCase))
            {
                result.Unchanged++;
                continue;
            }

            if (processed >= batchSize)
            {
                result.Deferred++;
                continue;
            }
            processed++;

            if (candidate.Size is > 0 && candidate.Size > maximumBytes)
            {
                result.Skipped++;
                await SaveIndexStatusAsync(candidate, vectorStoreId, null, "skipped", "File exceeds the configured assistant size limit.", cancellationToken);
                continue;
            }

            string? uploadedFileId = null;
            try
            {
                var file = await _gateway.DownloadStorageObjectAsync(candidate.Bucket, candidate.Path, cancellationToken);
                if (file == null || file.Bytes.Length == 0)
                {
                    result.Failed++;
                    await SaveIndexStatusAsync(candidate, vectorStoreId, null, "failed", "Storage object could not be downloaded.", cancellationToken);
                    continue;
                }
                if (file.Bytes.LongLength > maximumBytes)
                {
                    result.Skipped++;
                    await SaveIndexStatusAsync(candidate, vectorStoreId, null, "skipped", "File exceeds the configured assistant size limit.", cancellationToken);
                    continue;
                }

                uploadedFileId = await UploadFileAsync(apiKey, file, candidate.DisplayName, cancellationToken);
                await AttachFileAsync(apiKey, vectorStoreId, uploadedFileId, candidate, cancellationToken);
                await WaitForFileReadyAsync(apiKey, vectorStoreId, uploadedFileId, cancellationToken);
                await SaveIndexStatusAsync(candidate, vectorStoreId, uploadedFileId, "ready", null, cancellationToken);
                var previousFileId = GetString(previousIndex, "openai_file_id");
                if (!string.IsNullOrWhiteSpace(previousFileId) && !string.Equals(previousFileId, uploadedFileId, StringComparison.OrdinalIgnoreCase))
                {
                    try
                    {
                        await DeleteIndexedFileAsync(apiKey, vectorStoreId, previousFileId, cancellationToken);
                    }
                    catch (Exception cleanupException)
                    {
                        _logger.LogWarning(cleanupException, "Unable to clean up stale ESS assistant file {FileId}", previousFileId);
                    }
                }
                result.Indexed++;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                if (!string.IsNullOrWhiteSpace(uploadedFileId))
                {
                    try
                    {
                        await DeleteIndexedFileAsync(apiKey, vectorStoreId, uploadedFileId, CancellationToken.None);
                    }
                    catch (Exception cleanupException)
                    {
                        _logger.LogWarning(cleanupException, "Unable to clean up cancelled ESS assistant file {FileId}", uploadedFileId);
                    }
                }
                throw;
            }
            catch (Exception ex)
            {
                result.Failed++;
                _logger.LogWarning(ex, "Unable to index ESS document {Bucket}/{Path}", candidate.Bucket, candidate.Path);
                if (!string.IsNullOrWhiteSpace(uploadedFileId))
                {
                    try
                    {
                        await DeleteIndexedFileAsync(apiKey, vectorStoreId, uploadedFileId, cancellationToken);
                    }
                    catch (Exception cleanupException)
                    {
                        _logger.LogWarning(cleanupException, "Unable to clean up failed ESS assistant file {FileId}", uploadedFileId);
                    }
                }
                if (string.IsNullOrWhiteSpace(GetString(previousIndex, "openai_file_id")))
                    await SaveIndexStatusAsync(candidate, vectorStoreId, null, "failed", ex.Message, cancellationToken);
            }
        }

        return result;
    }

    private async Task<List<DocumentCandidate>> LoadCandidatesAsync(int limit, CancellationToken cancellationToken)
    {
        var candidates = new List<DocumentCandidate>();
        var designs = await _gateway.GetRowsAsync(
            "design_documents?select=id,updated_at,ess_design_issue_path,ess_design_issue_name,third_party_design_path,third_party_design_name&order=updated_at.desc&limit=10000",
            cancellationToken);
        foreach (var design in designs)
        {
            AddDesignCandidate(design, "ess_design_issue_path", "ess_design_issue_name", "ess_design", candidates);
            AddDesignCandidate(design, "third_party_design_path", "third_party_design_name", "third_party_design", candidates);
        }

        if (candidates.Count < limit)
        {
            var projectFiles = await _gateway.ListStorageObjectsRecursiveAsync(ProjectBucket, "site-data", limit * 2, cancellationToken);
            candidates.AddRange(projectFiles
                .Where(file => file.Path.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
                .Select(file => new DocumentCandidate
                {
                    Bucket = ProjectBucket,
                    Path = file.Path,
                    DisplayName = Path.GetFileName(file.Path),
                    Domain = InferProjectDomain(file.Path),
                    RecordId = file.Path,
                    UpdatedAt = file.UpdatedAt,
                    Fingerprint = file.ETag ?? $"{file.UpdatedAt}:{file.Size}",
                    Size = file.Size,
                }));
        }

        return candidates
            .Where(candidate => !string.IsNullOrWhiteSpace(candidate.Path))
            .GroupBy(candidate => $"{candidate.Bucket}/{candidate.Path}", StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .OrderByDescending(candidate => ParseTimestamp(candidate.UpdatedAt))
            .Take(limit)
            .ToList();
    }

    private static void AddDesignCandidate(
        JsonElement design,
        string pathProperty,
        string nameProperty,
        string domain,
        ICollection<DocumentCandidate> candidates)
    {
        var path = GetString(design, pathProperty);
        if (string.IsNullOrWhiteSpace(path))
            return;
        candidates.Add(new DocumentCandidate
        {
            Bucket = DesignBucket,
            Path = path,
            DisplayName = GetString(design, nameProperty) ?? Path.GetFileName(path),
            Domain = domain,
            RecordId = GetString(design, "id") ?? path,
            UpdatedAt = GetString(design, "updated_at"),
            Fingerprint = GetString(design, "updated_at") ?? path,
        });
    }

    private async Task<string> GetOrCreateVectorStoreAsync(string apiKey, CancellationToken cancellationToken)
    {
        var existing = await GetVectorStoreIdAsync(cancellationToken);
        if (!string.IsNullOrWhiteSpace(existing))
            return existing;

        await _vectorStoreLock.WaitAsync(cancellationToken);
        try
        {
            existing = await GetVectorStoreIdAsync(cancellationToken);
            if (!string.IsNullOrWhiteSpace(existing))
                return existing;

            using var request = CreateOpenAiRequest(apiKey, HttpMethod.Post, "https://api.openai.com/v1/vector_stores");
            request.Content = JsonContent(new { name = "ESS Company Knowledge Base" });
            using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            response.EnsureSuccessStatusCode();
            using var document = JsonDocument.Parse(body);
            existing = GetString(document.RootElement, "id") ?? throw new InvalidOperationException("OpenAI did not return a vector store ID.");
            await _gateway.InsertRowsAsync(
                "ess_ai_settings",
                new { key = "openai_vector_store_id", value = existing, updated_at = DateTimeOffset.UtcNow },
                cancellationToken,
                "key");
            _cachedVectorStoreId = existing;
            return existing;
        }
        finally
        {
            _vectorStoreLock.Release();
        }
    }

    private async Task<string> UploadFileAsync(
        string apiKey,
        EssAssistantStorageObject file,
        string displayName,
        CancellationToken cancellationToken)
    {
        using var request = CreateOpenAiRequest(apiKey, HttpMethod.Post, "https://api.openai.com/v1/files");
        using var content = new MultipartFormDataContent();
        content.Add(new StringContent("assistants"), "purpose");
        var bytes = new ByteArrayContent(file.Bytes);
        bytes.Headers.ContentType = new MediaTypeHeaderValue(file.ContentType);
        content.Add(bytes, "file", SanitiseFileName(displayName));
        request.Content = content;
        using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"OpenAI file upload failed: {(int)response.StatusCode} {Trim(body)}");
        using var document = JsonDocument.Parse(body);
        return GetString(document.RootElement, "id") ?? throw new InvalidOperationException("OpenAI did not return a file ID.");
    }

    private async Task AttachFileAsync(
        string apiKey,
        string vectorStoreId,
        string fileId,
        DocumentCandidate candidate,
        CancellationToken cancellationToken)
    {
        using var request = CreateOpenAiRequest(apiKey, HttpMethod.Post, $"https://api.openai.com/v1/vector_stores/{Uri.EscapeDataString(vectorStoreId)}/files");
        request.Content = JsonContent(new
        {
            file_id = fileId,
            attributes = new
            {
                domain = candidate.Domain,
                record_id = Truncate(candidate.RecordId, 240),
                storage_bucket = candidate.Bucket,
                display_name = Truncate(candidate.DisplayName, 240),
            },
        });
        using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"OpenAI vector-store attachment failed: {(int)response.StatusCode} {Trim(body)}");
    }

    private async Task WaitForFileReadyAsync(
        string apiKey,
        string vectorStoreId,
        string fileId,
        CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 60; attempt++)
        {
            using var request = CreateOpenAiRequest(
                apiKey,
                HttpMethod.Get,
                $"https://api.openai.com/v1/vector_stores/{Uri.EscapeDataString(vectorStoreId)}/files/{Uri.EscapeDataString(fileId)}");
            using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
                throw new InvalidOperationException($"OpenAI vector-store status failed: {(int)response.StatusCode} {Trim(body)}");
            using var document = JsonDocument.Parse(body);
            var status = GetString(document.RootElement, "status");
            if (string.Equals(status, "completed", StringComparison.OrdinalIgnoreCase))
                return;
            if (status is "failed" or "cancelled")
                throw new InvalidOperationException($"OpenAI could not index {fileId}: {status}.");
            await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
        }

        throw new TimeoutException($"OpenAI did not finish indexing file {fileId} within two minutes.");
    }

    private async Task DeleteIndexedFileAsync(
        string apiKey,
        string vectorStoreId,
        string fileId,
        CancellationToken cancellationToken)
    {
        using (var detachRequest = CreateOpenAiRequest(
            apiKey,
            HttpMethod.Delete,
            $"https://api.openai.com/v1/vector_stores/{Uri.EscapeDataString(vectorStoreId)}/files/{Uri.EscapeDataString(fileId)}"))
        using (var detachResponse = await _httpClientFactory.CreateClient().SendAsync(detachRequest, cancellationToken))
        {
            if (!detachResponse.IsSuccessStatusCode && detachResponse.StatusCode != System.Net.HttpStatusCode.NotFound)
                _logger.LogWarning("Unable to remove stale ESS vector file {FileId}: {Status}", fileId, detachResponse.StatusCode);
        }

        using var deleteRequest = CreateOpenAiRequest(apiKey, HttpMethod.Delete, $"https://api.openai.com/v1/files/{Uri.EscapeDataString(fileId)}");
        using var deleteResponse = await _httpClientFactory.CreateClient().SendAsync(deleteRequest, cancellationToken);
        if (!deleteResponse.IsSuccessStatusCode && deleteResponse.StatusCode != System.Net.HttpStatusCode.NotFound)
            _logger.LogWarning("Unable to delete stale ESS OpenAI file {FileId}: {Status}", fileId, deleteResponse.StatusCode);
    }

    private async Task SaveIndexStatusAsync(
        DocumentCandidate candidate,
        string vectorStoreId,
        string? openAiFileId,
        string status,
        string? error,
        CancellationToken cancellationToken) =>
        await _gateway.InsertRowsAsync(
            "ess_ai_document_index",
            new
            {
                id = Guid.NewGuid(),
                domain = candidate.Domain,
                record_id = candidate.RecordId,
                storage_bucket = candidate.Bucket,
                storage_path = candidate.Path,
                display_name = candidate.DisplayName,
                source_updated_at = candidate.UpdatedAt,
                fingerprint = candidate.Fingerprint,
                openai_file_id = openAiFileId,
                vector_store_id = vectorStoreId,
                status,
                error = string.IsNullOrWhiteSpace(error) ? null : Truncate(error, 1_000),
                last_synced_at = DateTimeOffset.UtcNow,
                updated_at = DateTimeOffset.UtcNow,
            },
            cancellationToken,
            "storage_bucket,storage_path");

    private static HttpRequestMessage CreateOpenAiRequest(string apiKey, HttpMethod method, string url)
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        request.Headers.TryAddWithoutValidation("OpenAI-Beta", "assistants=v2");
        return request;
    }

    private static StringContent JsonContent(object value) =>
        new(JsonSerializer.Serialize(value), Encoding.UTF8, "application/json");

    private static string InferProjectDomain(string path)
    {
        if (path.Contains("/swms/", StringComparison.OrdinalIgnoreCase)) return "swms";
        if (path.Contains("/scaff-tags/", StringComparison.OrdinalIgnoreCase)) return "scaffold_tag";
        if (path.Contains("/handover-certificates/", StringComparison.OrdinalIgnoreCase)) return "handover_certificate";
        if (path.Contains("/day-labour-variations/", StringComparison.OrdinalIgnoreCase)) return "day_labour_variation";
        if (path.Contains("/design-document/", StringComparison.OrdinalIgnoreCase)) return "project_design";
        return "project_document";
    }

    private static DateTimeOffset ParseTimestamp(string? value) =>
        DateTimeOffset.TryParse(value, out var timestamp) ? timestamp : DateTimeOffset.MinValue;

    private static string SanitiseFileName(string value)
    {
        var fileName = Path.GetFileName(value);
        if (string.IsNullOrWhiteSpace(fileName))
            fileName = $"ess-document-{Guid.NewGuid():N}.pdf";
        if (fileName.Length <= 240)
            return fileName;
        var extension = Path.GetExtension(fileName);
        var stem = Path.GetFileNameWithoutExtension(fileName);
        var stemLength = Math.Max(1, 240 - extension.Length);
        return $"{stem[..Math.Min(stem.Length, stemLength)]}{extension[..Math.Min(extension.Length, 239)]}";
    }

    private static string? GetString(JsonElement element, string property) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(property, out var value) && value.ValueKind != JsonValueKind.Null
            ? value.ValueKind == JsonValueKind.String ? value.GetString() : value.ToString()
            : null;

    private static string Trim(string value) => Truncate(value, 600);
    private static string Truncate(string value, int length) => value.Length <= length ? value : value[..length];

    private sealed class DocumentCandidate
    {
        public string Bucket { get; init; } = string.Empty;
        public string Path { get; init; } = string.Empty;
        public string DisplayName { get; init; } = string.Empty;
        public string Domain { get; init; } = string.Empty;
        public string RecordId { get; init; } = string.Empty;
        public string? UpdatedAt { get; init; }
        public string Fingerprint { get; init; } = string.Empty;
        public long? Size { get; init; }
    }
}

public sealed class EssAssistantDocumentSyncResult
{
    public string VectorStoreId { get; init; } = string.Empty;
    public int Discovered { get; set; }
    public int Indexed { get; set; }
    public int Unchanged { get; set; }
    public int Skipped { get; set; }
    public int Failed { get; set; }
    public int Deferred { get; set; }
}

public sealed class EssAssistantDocumentIndexWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<EssAssistantDocumentIndexWorker> _logger;

    public EssAssistantDocumentIndexWorker(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        ILogger<EssAssistantDocumentIndexWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_configuration.GetValue("OpenAI:AssistantDocumentIndexingEnabled", true))
            return;

        await Task.Delay(TimeSpan.FromSeconds(90), stoppingToken);
        var interval = TimeSpan.FromMinutes(Math.Clamp(_configuration.GetValue("OpenAI:AssistantDocumentSyncMinutes", 60), 15, 1440));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = _scopeFactory.CreateAsyncScope();
                var service = scope.ServiceProvider.GetRequiredService<EssAssistantDocumentIndexService>();
                var result = await service.SyncAsync(_configuration.GetValue("OpenAI:AssistantDocumentSyncBatchSize", 100), null, stoppingToken);
                _logger.LogInformation(
                    "ESS assistant document sync completed: {Indexed} indexed, {Unchanged} unchanged, {Failed} failed",
                    result.Indexed,
                    result.Unchanged,
                    result.Failed);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "ESS assistant document sync was not completed");
            }

            await Task.Delay(interval, stoppingToken);
        }
    }
}
