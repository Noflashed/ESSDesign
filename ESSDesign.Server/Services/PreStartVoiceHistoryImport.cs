using System.Net.Http.Json;
using System.Text.Json;

namespace ESSDesign.Server.Services;

/// <summary>Seeds the allowlisted library from existing ElevenLabs audio; never calls synthesis.</summary>
public sealed class PreStartVoiceHistoryImport(
    IConfiguration configuration, IHttpClientFactory clients, IPreStartVoiceLibrary library,
    IServiceScopeFactory scopes, ILogger<PreStartVoiceHistoryImport> logger) : BackgroundService
{
    public static bool MatchesSettings(JsonElement item, IConfiguration config)
    {
        static string? String(JsonElement value, string key) => value.TryGetProperty(key, out var field) && field.ValueKind == JsonValueKind.String ? field.GetString() : null;
        if (String(item, "voice_id") != config["ElevenLabs:VoiceId"] ||
            String(item, "model_id") != (config["ElevenLabs:ModelId"] ?? "eleven_flash_v2_5") ||
            String(item, "content_type") != "audio/mpeg" || String(item, "source") != "TTS" ||
            !item.TryGetProperty("settings", out var settings) || settings.ValueKind != JsonValueKind.Object) return false;
        static bool Number(JsonElement settings, string key, double expected, bool optional = false) =>
            !settings.TryGetProperty(key, out var value) ? optional : value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var actual) && Math.Abs(actual - expected) < 0.0001;
        return Number(settings, "speed", 1, true) && Number(settings, "stability", 0.45) &&
            Number(settings, "similarity_boost", 0.75) && Number(settings, "style", 0) &&
            settings.TryGetProperty("use_speaker_boost", out var boost) && boost.ValueKind == JsonValueKind.False;
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield(); // Do not delay server readiness.
        try { await ImportAsync(stoppingToken); }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
        catch (Exception e) { logger.LogWarning("Pre-start history import unavailable ({ErrorType})", e.GetType().Name); }
    }
    public async Task ImportAsync(CancellationToken token)
    {
        var key = configuration["ElevenLabs:ApiKey"];
        var voice = configuration["ElevenLabs:VoiceId"];
        if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(voice)) return;
        using var client = clients.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(15);
        client.DefaultRequestHeaders.Add("xi-api-key", key);
        string? cursor = null;
        var imported = 0;
        var scanned = 0;
        var seen = new HashSet<string>();
        for (var page = 0; page < 20; page++)
        {
            var url = $"https://api.elevenlabs.io/v1/history?page_size=100&voice_id={Uri.EscapeDataString(voice)}&source=TTS";
            if (cursor is not null) url += $"&start_after_history_item_id={Uri.EscapeDataString(cursor)}";
            using var response = await client.GetAsync(url, token);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Pre-start history import returned HTTP {StatusCode}; History read access may be required", (int)response.StatusCode);
                return;
            }
            using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(token), cancellationToken: token);
            var root = document.RootElement;
            foreach (var item in root.GetProperty("history").EnumerateArray())
            {
                scanned++;
                if (!MatchesSettings(item, configuration) || !item.TryGetProperty("text", out var textField) || textField.ValueKind != JsonValueKind.String) continue;
                var text = PreStartVoiceCatalog.Normalise(textField.GetString()!);
                if (!PreStartVoiceCatalog.Texts.Contains(text)) continue;
                var id = PreStartVoiceCatalog.Identity(configuration, "elevenlabs", text);
                if (!seen.Add(id) || await library.ReadAsync(id, token) is not null) continue;
                var historyId = item.GetProperty("history_item_id").GetString()!;
                using var audioResponse = await client.GetAsync($"https://api.elevenlabs.io/v1/history/{Uri.EscapeDataString(historyId)}/audio", token);
                if (!audioResponse.IsSuccessStatusCode || audioResponse.Content.Headers.ContentType?.MediaType != "audio/mpeg") continue;
                var audio = await audioResponse.Content.ReadAsByteArrayAsync(token);
                if (audio.Length == 0) continue;
                // Recover caption timing once from the saved audio; no ElevenLabs regeneration.
                using var scope = scopes.CreateScope();
                var alignment = await scope.ServiceProvider.GetRequiredService<PreStartSpeechService>().AlignImportedAsync(text, audio, token);
                if (await library.WriteAsync(id, new(Convert.ToBase64String(audio), "mp3", true, alignment), token)) imported++;
            }
            if (!root.GetProperty("has_more").GetBoolean()) break;
            var next = root.GetProperty("last_history_item_id").GetString();
            if (string.IsNullOrWhiteSpace(next) || next == cursor) break;
            cursor = next;
        }
        logger.LogInformation("Pre-start history import finished: scanned {Scanned}, imported {Imported} reusable recordings", scanned, imported);
    }
}
