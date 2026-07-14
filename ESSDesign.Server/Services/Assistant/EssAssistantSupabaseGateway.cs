using System.Net.Http.Headers;
using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;

namespace ESSDesign.Server.Services.Assistant;

public sealed class EssAssistantSupabaseGateway
{
    private static readonly ConcurrentDictionary<string, CachedJsonObject> JsonObjectCache = new(StringComparer.OrdinalIgnoreCase);
    private static readonly TimeSpan JsonObjectCacheDuration = TimeSpan.FromSeconds(30);
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<EssAssistantSupabaseGateway> _logger;
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web);
    private readonly string _supabaseUrl;
    private readonly string _serviceKey;
    private readonly bool _hasServiceRoleKey;

    public EssAssistantSupabaseGateway(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<EssAssistantSupabaseGateway> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _supabaseUrl = configuration["Supabase:Url"]?.TrimEnd('/') ?? string.Empty;
        var configuredServiceKey = configuration["Supabase:ServiceRoleKey"];
        _hasServiceRoleKey = !string.IsNullOrWhiteSpace(configuredServiceKey);
        _serviceKey = _hasServiceRoleKey
            ? configuredServiceKey!
            : configuration["Supabase:Key"] ?? string.Empty;
    }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_supabaseUrl) && !string.IsNullOrWhiteSpace(_serviceKey);
    public bool HasServiceRoleKey => _hasServiceRoleKey;

    public async Task<bool> ResourceExistsAsync(string relativePath, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
            return false;
        using var request = CreateRequest(HttpMethod.Get, $"{_supabaseUrl}/rest/v1/{relativePath.TrimStart('/')}");
        using var response = await SendAsync(request, cancellationToken);
        return response.IsSuccessStatusCode;
    }

    public async Task<List<JsonElement>> GetRowsAsync(string relativePath, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
            return new List<JsonElement>();

        using var request = CreateRequest(HttpMethod.Get, $"{_supabaseUrl}/rest/v1/{relativePath.TrimStart('/')}");
        using var response = await SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogWarning("ESS assistant database read failed for {Path}: {Status} {Body}", relativePath, response.StatusCode, TrimForLog(body));
            return new List<JsonElement>();
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        return await JsonSerializer.DeserializeAsync<List<JsonElement>>(stream, _jsonOptions, cancellationToken)
            ?? new List<JsonElement>();
    }

    public async Task<List<JsonElement>> InsertRowsAsync(
        string table,
        object payload,
        CancellationToken cancellationToken,
        string? onConflict = null)
    {
        var suffix = string.IsNullOrWhiteSpace(onConflict) ? string.Empty : $"?on_conflict={Uri.EscapeDataString(onConflict)}";
        using var request = CreateRequest(HttpMethod.Post, $"{_supabaseUrl}/rest/v1/{table}{suffix}");
        request.Headers.TryAddWithoutValidation("Prefer", string.IsNullOrWhiteSpace(onConflict)
            ? "return=representation"
            : "resolution=merge-duplicates,return=representation");
        request.Content = JsonContent(payload);
        using var response = await SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"Supabase write failed for {table}: {response.StatusCode} {TrimForLog(body)}");

        return string.IsNullOrWhiteSpace(body)
            ? new List<JsonElement>()
            : JsonSerializer.Deserialize<List<JsonElement>>(body, _jsonOptions) ?? new List<JsonElement>();
    }

    public async Task PatchRowsAsync(string relativePath, object payload, CancellationToken cancellationToken)
    {
        using var request = CreateRequest(HttpMethod.Patch, $"{_supabaseUrl}/rest/v1/{relativePath.TrimStart('/')}");
        request.Headers.TryAddWithoutValidation("Prefer", "return=minimal");
        request.Content = JsonContent(payload);
        using var response = await SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new InvalidOperationException($"Supabase update failed: {response.StatusCode} {TrimForLog(body)}");
        }
    }

    public async Task DeleteRowsAsync(string relativePath, CancellationToken cancellationToken)
    {
        using var request = CreateRequest(HttpMethod.Delete, $"{_supabaseUrl}/rest/v1/{relativePath.TrimStart('/')}");
        using var response = await SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new InvalidOperationException($"Supabase delete failed: {response.StatusCode} {TrimForLog(body)}");
        }
    }

    public async Task<JsonDocument?> ReadStorageJsonAsync(string bucket, string path, CancellationToken cancellationToken)
    {
        var cacheKey = $"{bucket}/{path}";
        if (JsonObjectCache.TryGetValue(cacheKey, out var cached) && cached.ExpiresAt > DateTimeOffset.UtcNow)
            return JsonDocument.Parse(cached.Json);

        using var request = CreateRequest(HttpMethod.Get, BuildStorageObjectUrl(bucket, path));
        using var response = await SendAsync(request, cancellationToken);
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
            return null;
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogWarning("ESS assistant storage read failed for {Bucket}/{Path}: {Status} {Body}", bucket, path, response.StatusCode, TrimForLog(body));
            return null;
        }

        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        JsonObjectCache[cacheKey] = new CachedJsonObject(json, DateTimeOffset.UtcNow.Add(JsonObjectCacheDuration));
        return JsonDocument.Parse(json);
    }

    public async Task<bool> TryAcquireWorkerLeaseAsync(
        string leaseName,
        Guid ownerId,
        int leaseSeconds,
        CancellationToken cancellationToken) =>
        await InvokeBooleanRpcAsync(
            "try_acquire_ess_ai_worker_lease",
            new { p_lease_name = leaseName, p_owner_id = ownerId, p_lease_seconds = leaseSeconds },
            cancellationToken);

    public async Task<bool> RenewWorkerLeaseAsync(
        string leaseName,
        Guid ownerId,
        int leaseSeconds,
        CancellationToken cancellationToken) =>
        await InvokeBooleanRpcAsync(
            "renew_ess_ai_worker_lease",
            new { p_lease_name = leaseName, p_owner_id = ownerId, p_lease_seconds = leaseSeconds },
            cancellationToken);

    public async Task ReleaseWorkerLeaseAsync(
        string leaseName,
        Guid ownerId,
        CancellationToken cancellationToken) =>
        _ = await InvokeBooleanRpcAsync(
            "release_ess_ai_worker_lease",
            new { p_lease_name = leaseName, p_owner_id = ownerId },
            cancellationToken);

    public async Task<List<EssAssistantStorageEntry>> ListStoragePdfObjectsAsync(
        string bucket,
        string prefix,
        int limit,
        CancellationToken cancellationToken)
    {
        using var request = CreateRequest(HttpMethod.Post, $"{_supabaseUrl}/rest/v1/rpc/list_ess_ai_storage_pdfs");
        request.Content = JsonContent(new
        {
            p_bucket = bucket,
            p_prefix = prefix,
            p_limit = Math.Clamp(limit, 1, 20_000),
        });
        using var response = await SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"Supabase PDF manifest lookup failed: {response.StatusCode} {TrimForLog(body)}");

        using var document = JsonDocument.Parse(body);
        if (document.RootElement.ValueKind != JsonValueKind.Array)
            return new List<EssAssistantStorageEntry>();

        return document.RootElement.EnumerateArray().Select(row =>
        {
            var metadata = row.TryGetProperty("metadata", out var metadataValue) ? metadataValue : default;
            return new EssAssistantStorageEntry
            {
                Path = GetString(row, "object_path") ?? string.Empty,
                UpdatedAt = GetString(row, "updated_at") ?? GetString(row, "created_at"),
                ETag = metadata.ValueKind == JsonValueKind.Object ? GetString(metadata, "eTag") ?? GetString(metadata, "etag") : null,
                Size = GetMetadataSize(metadata),
                ContentType = metadata.ValueKind == JsonValueKind.Object ? GetString(metadata, "mimetype") : null,
            };
        }).Where(entry => !string.IsNullOrWhiteSpace(entry.Path)).ToList();
    }

    public async Task<List<JsonElement>> ListStorageObjectsAsync(
        string bucket,
        string prefix,
        int limit,
        CancellationToken cancellationToken)
    {
        using var request = CreateRequest(HttpMethod.Post, $"{_supabaseUrl}/storage/v1/object/list/{Uri.EscapeDataString(bucket)}");
        request.Content = JsonContent(new { prefix, limit = Math.Clamp(limit, 1, 1000), offset = 0, sortBy = new { column = "updated_at", order = "desc" } });
        using var response = await SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            return new List<JsonElement>();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        return await JsonSerializer.DeserializeAsync<List<JsonElement>>(stream, _jsonOptions, cancellationToken)
            ?? new List<JsonElement>();
    }

    public async Task<List<EssAssistantStorageEntry>> ListStorageObjectsRecursiveAsync(
        string bucket,
        string prefix,
        int maxFiles,
        CancellationToken cancellationToken)
    {
        var files = new List<EssAssistantStorageEntry>();
        var pending = new Queue<string>();
        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        pending.Enqueue(prefix.Trim('/'));

        while (pending.Count > 0 && files.Count < Math.Clamp(maxFiles, 1, 20_000))
        {
            var currentPrefix = pending.Dequeue();
            if (!visited.Add(currentPrefix))
                continue;

            var offset = 0;
            while (files.Count < maxFiles)
            {
                using var request = CreateRequest(HttpMethod.Post, $"{_supabaseUrl}/storage/v1/object/list/{Uri.EscapeDataString(bucket)}");
                request.Content = JsonContent(new
                {
                    prefix = currentPrefix,
                    limit = 1000,
                    offset,
                    sortBy = new { column = "name", order = "asc" },
                });
                using var response = await SendAsync(request, cancellationToken);
                if (!response.IsSuccessStatusCode)
                    break;

                await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
                var entries = await JsonSerializer.DeserializeAsync<List<JsonElement>>(stream, _jsonOptions, cancellationToken)
                    ?? new List<JsonElement>();
                foreach (var entry in entries)
                {
                    var name = GetString(entry, "name");
                    if (string.IsNullOrWhiteSpace(name))
                        continue;
                    var path = string.IsNullOrWhiteSpace(currentPrefix) ? name : $"{currentPrefix}/{name}";
                    var id = GetString(entry, "id");
                    var metadata = entry.TryGetProperty("metadata", out var metadataValue) ? metadataValue : default;
                    var isFolder = string.IsNullOrWhiteSpace(id) && metadata.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined;
                    if (isFolder)
                    {
                        pending.Enqueue(path);
                        continue;
                    }

                    files.Add(new EssAssistantStorageEntry
                    {
                        Path = path,
                        UpdatedAt = GetString(entry, "updated_at") ?? GetString(entry, "created_at"),
                        ETag = metadata.ValueKind == JsonValueKind.Object ? GetString(metadata, "eTag") ?? GetString(metadata, "etag") : null,
                        Size = metadata.ValueKind == JsonValueKind.Object && metadata.TryGetProperty("size", out var size) && size.TryGetInt64(out var bytes) ? bytes : null,
                        ContentType = metadata.ValueKind == JsonValueKind.Object ? GetString(metadata, "mimetype") : null,
                    });
                    if (files.Count >= maxFiles)
                        break;
                }

                if (entries.Count < 1000)
                    break;
                offset += entries.Count;
            }
        }

        return files;
    }

    public async Task<EssAssistantStorageObject?> DownloadStorageObjectAsync(
        string bucket,
        string path,
        CancellationToken cancellationToken)
    {
        using var request = CreateRequest(HttpMethod.Get, BuildStorageObjectUrl(bucket, path));
        using var response = await SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            return null;

        var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
        var cacheStatus = response.Headers.TryGetValues("cf-cache-status", out var cacheValues)
            ? cacheValues.FirstOrDefault()
            : null;
        _logger.LogInformation(
            "ESS assistant downloaded {ByteCount} bytes from {Bucket}/{Path}; CDN cache {CacheStatus}",
            bytes.LongLength,
            bucket,
            path,
            cacheStatus ?? "unknown");
        return new EssAssistantStorageObject
        {
            Bytes = bytes,
            ContentType = response.Content.Headers.ContentType?.MediaType ?? "application/octet-stream",
            FileName = Path.GetFileName(path),
        };
    }

    private HttpRequestMessage CreateRequest(HttpMethod method, string url)
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.TryAddWithoutValidation("apikey", _serviceKey);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _serviceKey);
        return request;
    }

    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
            throw new InvalidOperationException("Supabase is not configured for the ESS assistant.");
        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(45);
        return await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
    }

    private StringContent JsonContent(object payload) =>
        new(JsonSerializer.Serialize(payload, _jsonOptions), Encoding.UTF8, "application/json");

    private async Task<bool> InvokeBooleanRpcAsync(
        string functionName,
        object payload,
        CancellationToken cancellationToken)
    {
        using var request = CreateRequest(HttpMethod.Post, $"{_supabaseUrl}/rest/v1/rpc/{Uri.EscapeDataString(functionName)}");
        request.Content = JsonContent(payload);
        using var response = await SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"Supabase RPC {functionName} failed: {response.StatusCode} {TrimForLog(body)}");
        return bool.TryParse(body.Trim(), out var value) && value;
    }

    private string BuildStorageObjectUrl(string bucket, string path)
    {
        var escapedPath = string.Join('/', path.Split('/', StringSplitOptions.RemoveEmptyEntries).Select(Uri.EscapeDataString));
        return $"{_supabaseUrl}/storage/v1/object/{Uri.EscapeDataString(bucket)}/{escapedPath}";
    }

    private static string TrimForLog(string value) => value.Length <= 500 ? value : value[..500];

    private static long? GetMetadataSize(JsonElement metadata)
    {
        if (metadata.ValueKind != JsonValueKind.Object || !metadata.TryGetProperty("size", out var value))
            return null;
        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out var number))
            return number;
        return value.ValueKind == JsonValueKind.String && long.TryParse(value.GetString(), out number)
            ? number
            : null;
    }

    private static string? GetString(JsonElement element, string property)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(property, out var value) || value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            return null;
        return value.ValueKind == JsonValueKind.String ? value.GetString() : value.ToString();
    }

    private sealed record CachedJsonObject(string Json, DateTimeOffset ExpiresAt);
}

public sealed class EssAssistantStorageObject
{
    public byte[] Bytes { get; init; } = Array.Empty<byte>();
    public string ContentType { get; init; } = string.Empty;
    public string FileName { get; init; } = string.Empty;
}

public sealed class EssAssistantStorageEntry
{
    public string Path { get; init; } = string.Empty;
    public string? UpdatedAt { get; init; }
    public string? ETag { get; init; }
    public long? Size { get; init; }
    public string? ContentType { get; init; }
}
