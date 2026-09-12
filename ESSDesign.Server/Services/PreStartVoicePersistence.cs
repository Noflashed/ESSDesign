using System.Collections.Concurrent;
using System.Threading.Channels;

namespace ESSDesign.Server.Services;

/// <summary>Finish storing paid audio independently of playback cancellation, without delaying first playback.</summary>
public sealed class PreStartVoicePersistence(IPreStartVoiceLibrary library, IPreStartVoiceRegistry registry, ILogger<PreStartVoicePersistence> logger) : BackgroundService
{
    private readonly Channel<(string Id, PreStartSpeechService.SpeechResult Audio, string Attempt)> queue = Channel.CreateBounded<(string, PreStartSpeechService.SpeechResult, string)>(100);
    private readonly ConcurrentDictionary<string, byte> pending = new();
    public bool Enqueue(string id, PreStartSpeechService.SpeechResult audio, string attempt)
    {
        if (!pending.TryAdd(id, 0)) return true;
        if (queue.Writer.TryWrite((id, audio, attempt))) return true;
        pending.TryRemove(id, out _);
        logger.LogWarning("Pre-start audio persistence queue is full");
        return false;
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try {
            await foreach (var item in queue.Reader.ReadAllAsync(stoppingToken)) {
                try {
                    var stored = false;
                    for (var attempt = 0; attempt < 3 && !stored; attempt++) {
                        if (attempt > 0) await Task.Delay(TimeSpan.FromSeconds(attempt * 2), stoppingToken);
                        stored = await library.WriteAsync(item.Id, item.Audio, stoppingToken);
                    }
                    await registry.FinishAsync(item.Attempt, true, stored, stoppingToken);
                    if (!stored) logger.LogWarning("Pre-start paid audio persistence exhausted retries {AudioId}", item.Id);
                } catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
                catch (Exception e) { logger.LogWarning("Pre-start audio persistence failed: {ErrorType}", e.GetType().Name); }
                finally { pending.TryRemove(item.Id, out _); }
            }
        } catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }
}
