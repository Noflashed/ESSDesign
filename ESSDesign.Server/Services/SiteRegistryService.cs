using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace ESSDesign.Server.Services;

public sealed class SiteRegistryService
{
    private const string LegacyBucket = "project-information";
    private const string LegacyPath = "projects.json";
    private static readonly SemaphoreSlim ImportLock = new(1, 1);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<SiteRegistryService> _logger;
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web);
    private readonly string _supabaseUrl;
    private readonly string _serviceRoleKey;

    public SiteRegistryService(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<SiteRegistryService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _supabaseUrl = configuration["Supabase:Url"]?.TrimEnd('/') ?? string.Empty;
        _serviceRoleKey = configuration["Supabase:ServiceRoleKey"] ?? string.Empty;
    }

    public async Task<JsonElement> GetDocumentAsync(
        bool includeArchived = true,
        CancellationToken cancellationToken = default)
    {
        EnsureConfigured();
        var document = await InvokeRpcAsync(
            "ess_get_site_registry",
            new { p_include_archived = includeArchived },
            cancellationToken);

        if (IsMigrationCompleted(document))
        {
            return document;
        }

        await EnsureLegacyImportedAsync(cancellationToken);
        return await InvokeRpcAsync(
            "ess_get_site_registry",
            new { p_include_archived = includeArchived },
            cancellationToken);
    }

    public async Task<JsonElement> ApplyChangeAsync(
        string operation,
        JsonElement payload,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(operation))
        {
            throw new ArgumentException("A Site Registry operation is required.", nameof(operation));
        }

        await GetDocumentAsync(true, cancellationToken);
        var normalizedOperation = operation.Trim();
        var isRowLevelDrawingOperation =
            normalizedOperation.Equals("upsert_drawing_entry", StringComparison.OrdinalIgnoreCase)
            || normalizedOperation.Equals("upsert_drawing_entries", StringComparison.OrdinalIgnoreCase)
            || normalizedOperation.Equals("delete_drawing_entry", StringComparison.OrdinalIgnoreCase);
        return await InvokeRpcAsync(
            isRowLevelDrawingOperation
                ? "ess_apply_drawing_register_change"
                : "ess_apply_site_registry_change",
            new
            {
                p_operation = normalizedOperation,
                p_payload = payload.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null
                    ? JsonSerializer.SerializeToElement(new { }, _jsonOptions)
                    : payload
            },
            cancellationToken,
            isRowLevelDrawingOperation
                ? "database/migrations/039_add_row_level_drawing_register_writes.sql"
                : "database/migrations/038_migrate_site_registry_to_relational.sql");
    }

    private async Task EnsureLegacyImportedAsync(CancellationToken cancellationToken)
    {
        await ImportLock.WaitAsync(cancellationToken);
        try
        {
            var current = await InvokeRpcAsync(
                "ess_get_site_registry",
                new { p_include_archived = true },
                cancellationToken);
            if (IsMigrationCompleted(current))
            {
                return;
            }

            var legacyDocument = await ReadLegacyDocumentAsync(cancellationToken);
            if (legacyDocument.ValueKind == JsonValueKind.Array)
            {
                legacyDocument = JsonSerializer.SerializeToElement(
                    new
                    {
                        builders = legacyDocument,
                        drawingRegisterEntries = Array.Empty<object>(),
                        updatedAt = DateTimeOffset.UtcNow
                    },
                    _jsonOptions);
            }
            if (legacyDocument.ValueKind != JsonValueKind.Object
                || !legacyDocument.TryGetProperty("builders", out var builders)
                || builders.ValueKind != JsonValueKind.Array)
            {
                throw new SiteRegistryUnavailableException(
                    "The existing projects.json backup is missing or invalid. The relational import was not started.");
            }

            var imported = await InvokeRpcAsync(
                "ess_import_site_registry",
                new { p_document = legacyDocument },
                cancellationToken);

            _logger.LogInformation(
                "Imported {BuilderCount} Site Registry builders from {Bucket}/{Path}",
                imported.TryGetProperty("builders", out var importedBuilders)
                    && importedBuilders.ValueKind == JsonValueKind.Array
                        ? importedBuilders.GetArrayLength()
                        : 0,
                LegacyBucket,
                LegacyPath);
        }
        finally
        {
            ImportLock.Release();
        }
    }

    private async Task<JsonElement> ReadLegacyDocumentAsync(CancellationToken cancellationToken)
    {
        var escapedPath = string.Join(
            '/',
            LegacyPath.Split('/', StringSplitOptions.RemoveEmptyEntries).Select(Uri.EscapeDataString));
        var url = $"{_supabaseUrl}/storage/v1/object/{Uri.EscapeDataString(LegacyBucket)}/{escapedPath}";

        using var request = CreateRequest(HttpMethod.Get, url);
        request.Headers.CacheControl = new CacheControlHeaderValue
        {
            NoCache = true,
            NoStore = true
        };
        using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new SiteRegistryUnavailableException(
                $"Unable to read the existing Site Registry backup ({(int)response.StatusCode}).");
        }

        try
        {
            using var document = JsonDocument.Parse(body);
            return document.RootElement.Clone();
        }
        catch (JsonException ex)
        {
            throw new SiteRegistryUnavailableException(
                "The existing projects.json backup is not valid JSON.",
                ex);
        }
    }

    private async Task<JsonElement> InvokeRpcAsync(
        string functionName,
        object payload,
        CancellationToken cancellationToken,
        string requiredMigration = "database/migrations/038_migrate_site_registry_to_relational.sql")
    {
        var url = $"{_supabaseUrl}/rest/v1/rpc/{Uri.EscapeDataString(functionName)}";
        using var request = CreateRequest(HttpMethod.Post, url);
        request.Content = new StringContent(
            JsonSerializer.Serialize(payload, _jsonOptions),
            Encoding.UTF8,
            "application/json");

        using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            if (body.Contains("SITE_REGISTRY_CONFLICT:", StringComparison.OrdinalIgnoreCase))
            {
                throw new SiteRegistryConflictException(ExtractDatabaseMessage(body));
            }
            if (body.Contains("SITE_REGISTRY_NOT_FOUND:", StringComparison.OrdinalIgnoreCase))
            {
                throw new KeyNotFoundException(ExtractDatabaseMessage(body));
            }
            if (body.Contains("SITE_REGISTRY_INVALID:", StringComparison.OrdinalIgnoreCase))
            {
                throw new ArgumentException(ExtractDatabaseMessage(body));
            }

            var migrationHint = response.StatusCode == System.Net.HttpStatusCode.NotFound
                || body.Contains("Could not find the function", StringComparison.OrdinalIgnoreCase)
                || body.Contains("schema cache", StringComparison.OrdinalIgnoreCase);
            if (migrationHint)
            {
                throw new SiteRegistryUnavailableException(
                    $"The required Site Registry database migration has not been installed. Run {requiredMigration} in Supabase.");
            }

            throw new InvalidOperationException(
                $"Site Registry database operation failed ({(int)response.StatusCode}): {TrimForLog(body)}");
        }

        try
        {
            using var document = JsonDocument.Parse(body);
            return document.RootElement.Clone();
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException("Supabase returned an invalid Site Registry response.", ex);
        }
    }

    private HttpRequestMessage CreateRequest(HttpMethod method, string url)
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.TryAddWithoutValidation("apikey", _serviceRoleKey);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _serviceRoleKey);
        return request;
    }

    private void EnsureConfigured()
    {
        if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_serviceRoleKey))
        {
            throw new SiteRegistryUnavailableException(
                "Supabase:Url and Supabase:ServiceRoleKey are required for the relational Site Registry.");
        }
    }

    private static bool IsMigrationCompleted(JsonElement document) =>
        document.ValueKind == JsonValueKind.Object
        && document.TryGetProperty("migrationCompleted", out var completed)
        && completed.ValueKind == JsonValueKind.True;

    private static string ExtractDatabaseMessage(string body)
    {
        try
        {
            using var document = JsonDocument.Parse(body);
            if (document.RootElement.TryGetProperty("message", out var message))
            {
                var text = message.GetString() ?? body;
                var separator = text.IndexOf(':');
                return separator >= 0 ? text[(separator + 1)..].Trim() : text;
            }
        }
        catch (JsonException)
        {
            // Fall through to the bounded raw response.
        }

        return TrimForLog(body);
    }

    private static string TrimForLog(string value) =>
        value.Length <= 500 ? value : value[..500];
}

public sealed class SiteRegistryConflictException : Exception
{
    public SiteRegistryConflictException(string message) : base(message)
    {
    }
}

public sealed class SiteRegistryUnavailableException : Exception
{
    public SiteRegistryUnavailableException(string message) : base(message)
    {
    }

    public SiteRegistryUnavailableException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
