using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Caching.Memory;

namespace ESSDesign.Server.Services;

/// <summary>Server-only Deepgram voice. The existing AI still interprets form answers.</summary>
public sealed class PreStartSpeechService(
    IConfiguration configuration,
    IHttpClientFactory clients,
    ILogger<PreStartSpeechService> logger)
{
    public sealed record SpeechResult(string? AudioBase64 = null, string? AudioFormat = null, bool UsesAiVoice = false, JsonElement? Alignment = null);
    // Bounded, process-local cache; restarts and deployments clear it. No transcripts on disk.
    private static readonly MemoryCache Cache = new(new MemoryCacheOptions { SizeLimit = 100 });
    private static readonly SemaphoreSlim[] Gates = Enumerable.Range(0, 16).Select(_ => new SemaphoreSlim(1)).ToArray();

    public async Task<SpeechResult> GenerateAsync(string text, CancellationToken cancellationToken)
    {
        text = Regex.Replace(text.Trim(), @"\bSWMS\b", "swims", RegexOptions.IgnoreCase);
        if (text.Length is 0 or > 600)
            throw new ArgumentException("Speech must contain between 1 and 600 characters.", nameof(text));
        var key = configuration["Deepgram:ApiKey"];
        var model = configuration["Deepgram:ModelId"] ?? "aura-2-hyperion-en";
        if (string.IsNullOrWhiteSpace(key)) return new();
        if (!Regex.IsMatch(model, "^aura-2-[a-z]+-en$"))
            throw new InvalidOperationException("Deepgram voice configuration is invalid.");
        cancellationToken.ThrowIfCancellationRequested();
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes($"{key}\n{model}\n{text}"));
        var cacheKey = Convert.ToHexString(hash);
        var gate = Gates[hash[0] % Gates.Length];
        await gate.WaitAsync(cancellationToken);
        try
        {
            if (Cache.TryGetValue<SpeechResult>(cacheKey, out var cached)) return cached!;
            var result = await GenerateUncached(text, key, model, cancellationToken);
            if (result.UsesAiVoice && result.Alignment is not null)
                Cache.Set(cacheKey, result, new MemoryCacheEntryOptions { Size = 1, AbsoluteExpirationRelativeToNow = TimeSpan.FromDays(1) });
            return result;
        }
        finally { gate.Release(); }
    }

    private async Task<SpeechResult> GenerateUncached(string text, string key, string model, CancellationToken cancellationToken)
    {
        using var client = clients.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(10);
        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"https://api.deepgram.com/v1/speak?model={model}&encoding=mp3&bit_rate=48000&speed=1");
        request.Headers.Authorization = new AuthenticationHeaderValue("Token", key);
        request.Content = JsonContent.Create(new { text });
        try
        {
            using var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Deepgram pre-start speech returned HTTP {StatusCode}", (int)response.StatusCode);
                return new();
            }
            var audio = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            if (audio.Length == 0 || response.Content.Headers.ContentType?.MediaType != "audio/mpeg") return new();
            var alignment = await Align(client, key, text, audio, cancellationToken);
            return new(Convert.ToBase64String(audio), "mp3", true, alignment);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning("Deepgram pre-start speech timed out");
            return new();
        }
        catch (HttpRequestException)
        {
            logger.LogWarning("Deepgram pre-start speech could not connect");
            return new();
        }
    }

    private async Task<JsonElement?> Align(HttpClient client, string key, string text, byte[] audio, CancellationToken token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.deepgram.com/v1/listen?model=nova-3&language=en-AU&smart_format=false");
        request.Headers.Authorization = new AuthenticationHeaderValue("Token", key);
        request.Content = new ByteArrayContent(audio);
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("audio/mpeg");
        try
        {
            using var response = await client.SendAsync(request, token);
            if (!response.IsSuccessStatusCode) return null;
            using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(token), cancellationToken: token);
            return BuildAlignment(text, json.RootElement.GetProperty("results").GetProperty("channels")[0]
                .GetProperty("alternatives")[0].GetProperty("words"));
        }
        catch (OperationCanceledException) when (!token.IsCancellationRequested) { return null; }
        catch (Exception e) when (e is JsonException or KeyNotFoundException or InvalidOperationException or IndexOutOfRangeException or HttpRequestException)
        {
            logger.LogWarning("Deepgram caption timing unavailable");
            return null;
        }
    }

    public static JsonElement? BuildAlignment(string text, JsonElement words)
    {
        var matches = Regex.Matches(text, @"\S+");
        if (words.ValueKind != JsonValueKind.Array || matches.Count != words.GetArrayLength()) return null;
        static string Normalise(string value) => Regex.Replace(value.ToLowerInvariant(), @"[^\p{L}\p{N}]", "");
        var times = new double[text.Length];
        double previous = 0;
        for (var i = 0; i < matches.Count; i++)
        {
            var word = words[i];
            if (!word.TryGetProperty("word", out var spoken) || spoken.ValueKind != JsonValueKind.String ||
                Normalise(spoken.GetString()!) != Normalise(matches[i].Value) ||
                !word.TryGetProperty("start", out var start) || !start.TryGetDouble(out var time) ||
                !double.IsFinite(time) || time < previous) return null;
            var end = i + 1 < matches.Count ? matches[i + 1].Index : text.Length;
            for (var j = matches[i].Index; j < end; j++) times[j] = time;
            previous = time;
        }
        return JsonSerializer.SerializeToElement(new { characters = text.Select(c => c.ToString()).ToArray(), character_start_times_seconds = times });
    }
}
