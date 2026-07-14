using System.Threading.Channels;
using System.Diagnostics;

namespace ESSDesign.Server.Services.Assistant;

public sealed class EssAssistantPersistenceQueue
{
    private readonly Channel<EssAssistantCompletedTurn> _channel = Channel.CreateBounded<EssAssistantCompletedTurn>(
        new BoundedChannelOptions(1_000)
        {
            SingleReader = true,
            SingleWriter = false,
            FullMode = BoundedChannelFullMode.Wait,
        });

    public bool TryQueue(EssAssistantCompletedTurn turn) => _channel.Writer.TryWrite(turn);

    public IAsyncEnumerable<EssAssistantCompletedTurn> ReadAllAsync(CancellationToken cancellationToken) =>
        _channel.Reader.ReadAllAsync(cancellationToken);
}

public sealed record EssAssistantCompletedTurn(
    Guid ConversationId,
    Guid? MessageId,
    EssAssistantAccessContext Access,
    string? Reply,
    IReadOnlyList<EssAssistantSource> Sources,
    EssAssistantRunMetrics Metrics);

public sealed class EssAssistantPersistenceWorker : BackgroundService
{
    private readonly EssAssistantPersistenceQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<EssAssistantPersistenceWorker> _logger;

    public EssAssistantPersistenceWorker(
        EssAssistantPersistenceQueue queue,
        IServiceScopeFactory scopeFactory,
        ILogger<EssAssistantPersistenceWorker> logger)
    {
        _queue = queue;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var turn in _queue.ReadAllAsync(stoppingToken))
        {
            try
            {
                await using var scope = _scopeFactory.CreateAsyncScope();
                var store = scope.ServiceProvider.GetRequiredService<EssAssistantConversationStore>();
                var persistenceTimer = Stopwatch.StartNew();
                if (turn.MessageId.HasValue && !string.IsNullOrWhiteSpace(turn.Reply))
                {
                    await store.AppendMessageAsync(
                        turn.ConversationId,
                        turn.Access,
                        "assistant",
                        turn.Reply,
                        turn.Sources,
                        stoppingToken,
                        turn.MessageId);
                }
                persistenceTimer.Stop();
                turn.Metrics.PersistenceMs = persistenceTimer.ElapsedMilliseconds;
                await store.RecordRunAsync(
                    turn.ConversationId,
                    turn.Access,
                    turn.Metrics,
                    stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Unable to persist an ESS assistant turn");
            }
        }
    }
}
