using System.Threading.Channels;

namespace ESSDesign.Server.Services.Assistant;

public sealed class EssAssistantUploadQueue
{
    public const string TempFilePrefix = "ess-assistant-upload-";
    private readonly Channel<EssAssistantPendingUpload> _channel;
    private readonly bool _enabled;

    public EssAssistantUploadQueue(IConfiguration configuration)
    {
        _enabled = configuration.GetValue("OpenAI:AssistantDocumentIndexingEnabled", true) &&
            !string.IsNullOrWhiteSpace(configuration["OpenAI:ApiKey"]) &&
            !string.IsNullOrWhiteSpace(configuration["Supabase:ServiceRoleKey"]);
        MaximumBytes = Math.Clamp(
            configuration.GetValue<long?>("OpenAI:AssistantDocumentMaxBytes") ?? 40_000_000,
            1_000_000,
            100_000_000);
        _channel = Channel.CreateBounded<EssAssistantPendingUpload>(new BoundedChannelOptions(50)
        {
            SingleReader = true,
            SingleWriter = false,
            FullMode = BoundedChannelFullMode.Wait,
        });
    }

    public long MaximumBytes { get; }

    public bool TryQueue(EssAssistantPendingUpload upload) =>
        _enabled && upload.Size <= MaximumBytes && _channel.Writer.TryWrite(upload);

    public IAsyncEnumerable<EssAssistantPendingUpload> ReadAllAsync(CancellationToken cancellationToken) =>
        _channel.Reader.ReadAllAsync(cancellationToken);
}

public sealed class EssAssistantPendingUpload
{
    public string Bucket { get; init; } = "design-pdfs";
    public string StoragePath { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public string ContentType { get; init; } = "application/pdf";
    public string Domain { get; init; } = string.Empty;
    public string RecordId { get; init; } = string.Empty;
    public string? SourceUpdatedAt { get; init; }
    public string Fingerprint { get; init; } = string.Empty;
    public long Size { get; init; }
    public string TempFilePath { get; init; } = string.Empty;
}

public sealed class EssAssistantUploadWorker : BackgroundService
{
    private readonly EssAssistantUploadQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<EssAssistantUploadWorker> _logger;

    public EssAssistantUploadWorker(
        EssAssistantUploadQueue queue,
        IServiceScopeFactory scopeFactory,
        ILogger<EssAssistantUploadWorker> logger)
    {
        _queue = queue;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        DeleteStaleTempFiles();
        await foreach (var upload in _queue.ReadAllAsync(stoppingToken))
        {
            try
            {
                var completed = false;
                for (var attempt = 0; attempt < 20 && !completed && !stoppingToken.IsCancellationRequested; attempt++)
                {
                    await using var scope = _scopeFactory.CreateAsyncScope();
                    var index = scope.ServiceProvider.GetRequiredService<EssAssistantDocumentIndexService>();
                    completed = await index.IndexUploadedDocumentAsync(upload, stoppingToken);
                    if (!completed)
                        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
                }

                if (!completed)
                    _logger.LogWarning("Upload-time indexing was deferred for {StoragePath}; scheduled reconciliation will retry it", upload.StoragePath);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Upload-time indexing failed for {StoragePath}", upload.StoragePath);
            }
            finally
            {
                TryDelete(upload.TempFilePath);
            }
        }
    }

    private void DeleteStaleTempFiles()
    {
        try
        {
            foreach (var path in Directory.EnumerateFiles(Path.GetTempPath(), $"{EssAssistantUploadQueue.TempFilePrefix}*"))
            {
                if (File.GetLastWriteTimeUtc(path) < DateTime.UtcNow.AddHours(-24))
                    TryDelete(path);
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Unable to clean stale ESS assistant upload files");
        }
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
                File.Delete(path);
        }
        catch
        {
            // The next process start will retry stale temporary-file cleanup.
        }
    }
}
