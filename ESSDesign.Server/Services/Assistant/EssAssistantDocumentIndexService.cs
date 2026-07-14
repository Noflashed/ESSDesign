using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace ESSDesign.Server.Services.Assistant;

public sealed class EssAssistantDocumentIndexService
{
    private const string ProjectBucket = "project-information";
    private const string DesignBucket = "design-pdfs";
    private const string SyncLeaseName = "ess-assistant-document-index";
    private const int SyncLeaseSeconds = 900;
    private const string PermanentErrorPrefix = "Permanent indexing failure: ";
    private static readonly SemaphoreSlim SyncGate = new(1, 1);
    private static readonly SemaphoreSlim VectorStoreLock = new(1, 1);
    private static string? CachedVectorStoreId;
    private static DateTimeOffset VectorStoreCacheExpiresAt;
    private readonly EssAssistantSupabaseGateway _gateway;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<EssAssistantDocumentIndexService> _logger;

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
        if (VectorStoreCacheExpiresAt > DateTimeOffset.UtcNow)
            return CachedVectorStoreId;

        if (!await _gateway.ResourceExistsAsync("ess_ai_settings?select=key&limit=1", cancellationToken))
        {
            CachedVectorStoreId = null;
            VectorStoreCacheExpiresAt = DateTimeOffset.UtcNow.AddMinutes(1);
            return null;
        }

        var rows = await _gateway.GetRowsAsync("ess_ai_settings?select=value&key=eq.openai_vector_store_id&limit=1", cancellationToken);
        var value = rows.FirstOrDefault();
        CachedVectorStoreId = GetString(value, "value");
        VectorStoreCacheExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10);
        return CachedVectorStoreId;
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

        if (!await SyncGate.WaitAsync(0, cancellationToken))
            return new EssAssistantDocumentSyncResult { ConcurrentRunSkipped = true };

        var leaseOwner = Guid.NewGuid();
        var leaseAcquired = false;
        try
        {
            leaseAcquired = await _gateway.TryAcquireWorkerLeaseAsync(
                SyncLeaseName,
                leaseOwner,
                SyncLeaseSeconds,
                cancellationToken);
            if (!leaseAcquired)
                return new EssAssistantDocumentSyncResult { ConcurrentRunSkipped = true };

            return await SyncCoreAsync(apiKey, leaseOwner, maxDocuments, cancellationToken);
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("try_acquire_ess_ai_worker_lease", StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Apply migration 034_reduce_storage_egress.sql before synchronising documents.", ex);
        }
        finally
        {
            if (leaseAcquired)
            {
                try
                {
                    await _gateway.ReleaseWorkerLeaseAsync(SyncLeaseName, leaseOwner, CancellationToken.None);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Unable to release ESS assistant indexing lease {LeaseOwner}", leaseOwner);
                }
            }
            SyncGate.Release();
        }
    }

    public async Task<bool> IndexUploadedDocumentAsync(
        EssAssistantPendingUpload upload,
        CancellationToken cancellationToken)
    {
        if (!_gateway.HasServiceRoleKey || !File.Exists(upload.TempFilePath))
            return false;
        var apiKey = _configuration["OpenAI:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
            return false;

        await SyncGate.WaitAsync(cancellationToken);
        var leaseOwner = Guid.NewGuid();
        var leaseAcquired = false;
        try
        {
            leaseAcquired = await _gateway.TryAcquireWorkerLeaseAsync(
                SyncLeaseName,
                leaseOwner,
                SyncLeaseSeconds,
                cancellationToken);
            if (!leaseAcquired)
                return false;

            var vectorStoreId = await GetOrCreateVectorStoreAsync(apiKey, cancellationToken);
            var candidate = new DocumentCandidate
            {
                Bucket = upload.Bucket,
                Path = upload.StoragePath,
                DisplayName = upload.DisplayName,
                Domain = upload.Domain,
                RecordId = upload.RecordId,
                UpdatedAt = upload.SourceUpdatedAt,
                Fingerprint = upload.Fingerprint,
                Size = upload.Size,
            };
            var bucketFilter = Uri.EscapeDataString(upload.Bucket);
            var pathFilter = Uri.EscapeDataString(upload.StoragePath);
            var rows = await _gateway.GetRowsAsync(
                $"ess_ai_document_index?select=*&storage_bucket=eq.{bucketFilter}&storage_path=eq.{pathFilter}&limit=1",
                cancellationToken);
            var previousIndex = rows.FirstOrDefault();
            var maximumBytes = GetMaximumDocumentBytes();
            var sizeLimitError = BuildSizeLimitError(maximumBytes);
            var result = new EssAssistantDocumentSyncResult();
            if (ShouldDeferCandidate(candidate, previousIndex, sizeLimitError, result))
                return true;

            if (upload.Size > maximumBytes)
            {
                await SaveIndexStatusAsync(
                    candidate,
                    vectorStoreId,
                    GetString(previousIndex, "openai_file_id"),
                    "skipped",
                    sizeLimitError,
                    0,
                    null,
                    0,
                    cancellationToken);
                return true;
            }

            var bytes = await File.ReadAllBytesAsync(upload.TempFilePath, cancellationToken);
            var file = new EssAssistantStorageObject
            {
                Bytes = bytes,
                ContentType = upload.ContentType,
                FileName = upload.DisplayName,
            };
            var outcome = await ProcessCandidateAsync(
                candidate,
                previousIndex,
                apiKey,
                vectorStoreId,
                maximumBytes,
                sizeLimitError,
                file,
                cancellationToken);
            return outcome.Status is CandidateStatus.Indexed or CandidateStatus.Skipped;
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("try_acquire_ess_ai_worker_lease", StringComparison.Ordinal))
        {
            _logger.LogWarning("Upload-time assistant indexing is waiting for migration 034_reduce_storage_egress.sql");
            return false;
        }
        finally
        {
            if (leaseAcquired)
            {
                try
                {
                    await _gateway.ReleaseWorkerLeaseAsync(SyncLeaseName, leaseOwner, CancellationToken.None);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Unable to release upload-time indexing lease {LeaseOwner}", leaseOwner);
                }
            }
            SyncGate.Release();
        }
    }

    private async Task<EssAssistantDocumentSyncResult> SyncCoreAsync(
        string apiKey,
        Guid leaseOwner,
        int maxDocuments,
        CancellationToken cancellationToken)
    {

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
        var maximumBytes = GetMaximumDocumentBytes();
        var sizeLimitError = BuildSizeLimitError(maximumBytes);
        var processed = 0;
        var nextLeaseRenewal = DateTimeOffset.UtcNow.AddMinutes(5);

        foreach (var candidate in candidates)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (DateTimeOffset.UtcNow >= nextLeaseRenewal)
            {
                var renewed = await _gateway.RenewWorkerLeaseAsync(
                    SyncLeaseName,
                    leaseOwner,
                    SyncLeaseSeconds,
                    cancellationToken);
                if (!renewed)
                    throw new InvalidOperationException("The ESS assistant indexing lease expired during synchronisation.");
                nextLeaseRenewal = DateTimeOffset.UtcNow.AddMinutes(5);
            }

            var key = $"{candidate.Bucket}/{candidate.Path}";
            indexedByPath.TryGetValue(key, out var previousIndex);
            if (ShouldDeferCandidate(candidate, previousIndex, sizeLimitError, result))
                continue;

            if (processed >= batchSize)
            {
                result.Deferred++;
                continue;
            }
            processed++;
            var outcome = await ProcessCandidateAsync(
                candidate,
                previousIndex,
                apiKey,
                vectorStoreId,
                maximumBytes,
                sizeLimitError,
                null,
                cancellationToken);
            result.DownloadedBytes += outcome.DownloadedBytes;
            if (outcome.DownloadedBytes > 0)
                result.DownloadedDocuments++;
            if (outcome.Status == CandidateStatus.Indexed) result.Indexed++;
            if (outcome.Status == CandidateStatus.Skipped) result.Skipped++;
            if (outcome.Status == CandidateStatus.Failed) result.Failed++;
        }

        return result;
    }

    private static bool ShouldDeferCandidate(
        DocumentCandidate candidate,
        JsonElement previousIndex,
        string sizeLimitError,
        EssAssistantDocumentSyncResult result)
    {
        if (previousIndex.ValueKind != JsonValueKind.Object ||
            !string.Equals(GetString(previousIndex, "fingerprint"), candidate.Fingerprint, StringComparison.Ordinal))
            return false;

        var status = GetString(previousIndex, "status");
        var error = GetString(previousIndex, "error");
        if (string.Equals(status, "ready", StringComparison.OrdinalIgnoreCase) ||
            (string.Equals(status, "skipped", StringComparison.OrdinalIgnoreCase) &&
             (string.Equals(error, sizeLimitError, StringComparison.Ordinal) ||
              error?.StartsWith(PermanentErrorPrefix, StringComparison.Ordinal) == true)))
        {
            result.Unchanged++;
            return true;
        }

        if (string.Equals(status, "failed", StringComparison.OrdinalIgnoreCase) &&
            GetTimestamp(previousIndex, "next_retry_at") is { } retryAt && retryAt > DateTimeOffset.UtcNow)
        {
            result.BackedOff++;
            return true;
        }

        if (string.Equals(status, "pending", StringComparison.OrdinalIgnoreCase) &&
            GetTimestamp(previousIndex, "updated_at") is { } pendingAt && pendingAt > DateTimeOffset.UtcNow.AddMinutes(-20))
        {
            result.BackedOff++;
            return true;
        }

        return false;
    }

    private async Task<CandidateProcessOutcome> ProcessCandidateAsync(
        DocumentCandidate candidate,
        JsonElement previousIndex,
        string apiKey,
        string vectorStoreId,
        long maximumBytes,
        string sizeLimitError,
        EssAssistantStorageObject? providedFile,
        CancellationToken cancellationToken)
    {
        var sameFingerprint = previousIndex.ValueKind == JsonValueKind.Object &&
            string.Equals(GetString(previousIndex, "fingerprint"), candidate.Fingerprint, StringComparison.Ordinal);
        var attemptCount = sameFingerprint ? GetInt32(previousIndex, "attempt_count") : 0;
        var previousFileId = GetString(previousIndex, "openai_file_id");

        if (candidate.Size is > 0 && candidate.Size > maximumBytes)
        {
            await SaveIndexStatusAsync(
                candidate,
                vectorStoreId,
                previousFileId,
                "skipped",
                sizeLimitError,
                0,
                null,
                0,
                cancellationToken);
            return new CandidateProcessOutcome(CandidateStatus.Skipped, 0);
        }

        await SaveIndexStatusAsync(
            candidate,
            vectorStoreId,
            previousFileId,
            "pending",
            null,
            attemptCount,
            null,
            0,
            cancellationToken);

        string? uploadedFileId = null;
        long downloadedBytes = 0;
        try
        {
            var file = providedFile;
            if (file == null)
            {
                file = await _gateway.DownloadStorageObjectAsync(candidate.Bucket, candidate.Path, cancellationToken);
                downloadedBytes = file?.Bytes.LongLength ?? 0;
            }

            if (file == null || file.Bytes.Length == 0)
            {
                var nextAttempt = attemptCount + 1;
                await SaveIndexStatusAsync(
                    candidate,
                    vectorStoreId,
                    previousFileId,
                    "failed",
                    "Storage object could not be downloaded.",
                    nextAttempt,
                    CalculateNextRetry(nextAttempt),
                    downloadedBytes,
                    cancellationToken);
                return new CandidateProcessOutcome(CandidateStatus.Failed, downloadedBytes);
            }

            if (file.Bytes.LongLength > maximumBytes)
            {
                await SaveIndexStatusAsync(
                    candidate,
                    vectorStoreId,
                    previousFileId,
                    "skipped",
                    sizeLimitError,
                    0,
                    null,
                    downloadedBytes,
                    cancellationToken);
                return new CandidateProcessOutcome(CandidateStatus.Skipped, downloadedBytes);
            }

            uploadedFileId = await UploadFileAsync(apiKey, file, candidate.DisplayName, cancellationToken);
            await AttachFileAsync(apiKey, vectorStoreId, uploadedFileId, candidate, cancellationToken);
            await WaitForFileReadyAsync(apiKey, vectorStoreId, uploadedFileId, cancellationToken);
            await SaveIndexStatusAsync(
                candidate,
                vectorStoreId,
                uploadedFileId,
                "ready",
                null,
                0,
                null,
                downloadedBytes,
                cancellationToken);

            if (!string.IsNullOrWhiteSpace(previousFileId) &&
                !string.Equals(previousFileId, uploadedFileId, StringComparison.OrdinalIgnoreCase))
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

            return new CandidateProcessOutcome(CandidateStatus.Indexed, downloadedBytes);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            if (!string.IsNullOrWhiteSpace(uploadedFileId))
                await TryDeleteUploadedFileAsync(apiKey, vectorStoreId, uploadedFileId, CancellationToken.None, "cancelled");
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unable to index ESS document {Bucket}/{Path}", candidate.Bucket, candidate.Path);
            if (!string.IsNullOrWhiteSpace(uploadedFileId))
                await TryDeleteUploadedFileAsync(apiKey, vectorStoreId, uploadedFileId, cancellationToken, "failed");

            var nextAttempt = attemptCount + 1;
            var permanent = ex is OpenAiIndexException { IsPermanent: true };
            await SaveIndexStatusAsync(
                candidate,
                vectorStoreId,
                previousFileId,
                permanent ? "skipped" : "failed",
                permanent ? $"{PermanentErrorPrefix}{ex.Message}" : ex.Message,
                nextAttempt,
                permanent ? null : CalculateNextRetry(nextAttempt),
                downloadedBytes,
                cancellationToken);
            return new CandidateProcessOutcome(permanent ? CandidateStatus.Skipped : CandidateStatus.Failed, downloadedBytes);
        }
    }

    private async Task TryDeleteUploadedFileAsync(
        string apiKey,
        string vectorStoreId,
        string uploadedFileId,
        CancellationToken cancellationToken,
        string reason)
    {
        try
        {
            await DeleteIndexedFileAsync(apiKey, vectorStoreId, uploadedFileId, cancellationToken);
        }
        catch (Exception cleanupException)
        {
            _logger.LogWarning(cleanupException, "Unable to clean up {Reason} ESS assistant file {FileId}", reason, uploadedFileId);
        }
    }

    private static DateTimeOffset CalculateNextRetry(int attemptCount) => attemptCount switch
    {
        <= 1 => DateTimeOffset.UtcNow.AddHours(1),
        2 => DateTimeOffset.UtcNow.AddHours(6),
        _ => DateTimeOffset.UtcNow.AddHours(24),
    };

    private long GetMaximumDocumentBytes() =>
        Math.Clamp(_configuration.GetValue<long?>("OpenAI:AssistantDocumentMaxBytes") ?? 40_000_000, 1_000_000, 100_000_000);

    private async Task<List<DocumentCandidate>> LoadCandidatesAsync(int limit, CancellationToken cancellationToken)
    {
        var candidates = new List<DocumentCandidate>();
        var designs = await _gateway.GetRowsAsync(
            "design_documents?select=id,updated_at,ess_design_issue_path,ess_design_issue_name,ess_design_file_size,ess_design_file_fingerprint,third_party_design_path,third_party_design_name,third_party_design_file_size,third_party_design_file_fingerprint&order=updated_at.desc&limit=10000",
            cancellationToken);
        foreach (var design in designs)
        {
            AddDesignCandidate(design, "ess_design_issue_path", "ess_design_issue_name", "ess_design_file_size", "ess_design_file_fingerprint", "ess_design", candidates);
            AddDesignCandidate(design, "third_party_design_path", "third_party_design_name", "third_party_design_file_size", "third_party_design_file_fingerprint", "third_party_design", candidates);
        }

        if (candidates.Count < limit)
        {
            var projectFiles = await _gateway.ListStoragePdfObjectsAsync(ProjectBucket, "site-data", limit, cancellationToken);
            candidates.AddRange(projectFiles
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
        string sizeProperty,
        string fingerprintProperty,
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
            Fingerprint = GetString(design, fingerprintProperty)
                ?? $"legacy:{path}:{GetInt64(design, sizeProperty)?.ToString() ?? "unknown"}",
            Size = GetInt64(design, sizeProperty),
        });
    }

    private async Task<string> GetOrCreateVectorStoreAsync(string apiKey, CancellationToken cancellationToken)
    {
        var existing = await GetVectorStoreIdAsync(cancellationToken);
        if (!string.IsNullOrWhiteSpace(existing))
            return existing;

        await VectorStoreLock.WaitAsync(cancellationToken);
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
            CachedVectorStoreId = existing;
            VectorStoreCacheExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10);
            return existing;
        }
        finally
        {
            VectorStoreLock.Release();
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
            throw new OpenAiIndexException(
                $"OpenAI file upload failed: {(int)response.StatusCode} {Trim(body)}",
                IsPermanentDocumentError(response.StatusCode));
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
            throw new OpenAiIndexException(
                $"OpenAI vector-store attachment failed: {(int)response.StatusCode} {Trim(body)}",
                IsPermanentDocumentError(response.StatusCode));
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
                throw new OpenAiIndexException(
                    $"OpenAI vector-store status failed: {(int)response.StatusCode} {Trim(body)}",
                    IsPermanentDocumentError(response.StatusCode));
            using var document = JsonDocument.Parse(body);
            var status = GetString(document.RootElement, "status");
            if (string.Equals(status, "completed", StringComparison.OrdinalIgnoreCase))
                return;
            if (string.Equals(status, "failed", StringComparison.OrdinalIgnoreCase))
            {
                var lastError = document.RootElement.TryGetProperty("last_error", out var errorValue)
                    ? GetString(errorValue, "message") ?? GetString(errorValue, "code")
                    : null;
                throw new OpenAiIndexException(
                    $"OpenAI could not index {fileId}: {lastError ?? status}.",
                    true);
            }
            if (string.Equals(status, "cancelled", StringComparison.OrdinalIgnoreCase))
                throw new OpenAiIndexException($"OpenAI indexing was cancelled for {fileId}.", false);
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
        int attemptCount,
        DateTimeOffset? nextRetryAt,
        long lastDownloadBytes,
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
                attempt_count = Math.Max(0, attemptCount),
                next_retry_at = nextRetryAt,
                last_download_bytes = Math.Max(0, lastDownloadBytes),
                last_synced_at = DateTimeOffset.UtcNow,
                updated_at = DateTimeOffset.UtcNow,
            },
            cancellationToken,
            "storage_bucket,storage_path");

    private static bool IsPermanentDocumentError(System.Net.HttpStatusCode statusCode) =>
        (int)statusCode is 400 or 413 or 415 or 422;

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

    private static long? GetInt64(JsonElement element, string property)
    {
        if (element.ValueKind != JsonValueKind.Object ||
            !element.TryGetProperty(property, out var value) ||
            value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            return null;

        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out var numericValue))
            return numericValue;
        return value.ValueKind == JsonValueKind.String && long.TryParse(value.GetString(), out var stringValue)
            ? stringValue
            : null;
    }

    private static int GetInt32(JsonElement element, string property) =>
        element.ValueKind == JsonValueKind.Object &&
        element.TryGetProperty(property, out var value) &&
        value.TryGetInt32(out var number)
            ? number
            : 0;

    private static DateTimeOffset? GetTimestamp(JsonElement element, string property) =>
        DateTimeOffset.TryParse(GetString(element, property), out var timestamp) ? timestamp : null;

    private static string BuildSizeLimitError(long maximumBytes) =>
        $"File exceeds the configured assistant size limit of {maximumBytes} bytes.";

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

    private enum CandidateStatus
    {
        Indexed,
        Skipped,
        Failed,
    }

    private sealed record CandidateProcessOutcome(CandidateStatus Status, long DownloadedBytes);

    private sealed class OpenAiIndexException : Exception
    {
        public OpenAiIndexException(string message, bool isPermanent)
            : base(message)
        {
            IsPermanent = isPermanent;
        }

        public bool IsPermanent { get; }
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
    public int BackedOff { get; set; }
    public int DownloadedDocuments { get; set; }
    public long DownloadedBytes { get; set; }
    public bool ConcurrentRunSkipped { get; set; }
}

public sealed class EssAssistantDocumentIndexWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _configuration;
    private readonly IHostEnvironment _environment;
    private readonly ILogger<EssAssistantDocumentIndexWorker> _logger;

    public EssAssistantDocumentIndexWorker(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        IHostEnvironment environment,
        ILogger<EssAssistantDocumentIndexWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _configuration = configuration;
        _environment = environment;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_configuration.GetValue("OpenAI:AssistantDocumentIndexingEnabled", true))
            return;
        if (!_environment.IsProduction() &&
            !_configuration.GetValue("OpenAI:AssistantDocumentIndexWorkerEnabledOutsideProduction", false))
            return;

        await Task.Delay(TimeSpan.FromSeconds(90), stoppingToken);
        var interval = TimeSpan.FromMinutes(Math.Clamp(_configuration.GetValue("OpenAI:AssistantDocumentSyncMinutes", 360), 15, 1440));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = _scopeFactory.CreateAsyncScope();
                var service = scope.ServiceProvider.GetRequiredService<EssAssistantDocumentIndexService>();
                var result = await service.SyncAsync(_configuration.GetValue("OpenAI:AssistantDocumentSyncBatchSize", 100), null, stoppingToken);
                _logger.LogInformation(
                    "ESS assistant document sync completed: {Indexed} indexed, {Unchanged} unchanged, {BackedOff} backed off, {Failed} failed, {DownloadedBytes} storage bytes downloaded, concurrent skip {ConcurrentRunSkipped}",
                    result.Indexed,
                    result.Unchanged,
                    result.BackedOff,
                    result.Failed,
                    result.DownloadedBytes,
                    result.ConcurrentRunSkipped);
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
