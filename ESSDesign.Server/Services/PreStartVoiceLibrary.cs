using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace ESSDesign.Server.Services;

public static class PreStartVoiceCatalog
{
    public static readonly HashSet<string> Texts = Load();
    public static string Normalise(string text) => Regex.Replace(text.Trim(), @"\bSWMS\b", "swims", RegexOptions.IgnoreCase);
    private static HashSet<string> Load()
    {
        using var stream = typeof(PreStartVoiceCatalog).Assembly.GetManifestResourceStream("ESSDesign.Server.Services.PreStartVoiceCatalog.json")!;
        return JsonSerializer.Deserialize<string[]>(stream)!.ToHashSet(StringComparer.Ordinal);
    }
    // Identity includes every synthesis setting, but never credentials: rotating a key keeps usable audio.
    public static string Identity(IConfiguration config, string provider, string text)
    {
        var settings = provider == "elevenlabs"
            ? $"{config["ElevenLabs:VoiceId"]}\n{config["ElevenLabs:ModelId"] ?? "eleven_flash_v2_5"}\nmp3_44100_128\nen\n0.45\n0.75\n0\nfalse\n1"
            : $"{config["Deepgram:ModelId"] ?? "aura-2-hyperion-en"}\nmp3\n48000\n1";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"v1\n{config["PreStartVoice:LibraryVersion"] ?? "1"}\n{provider}\n{settings}\n{Normalise(text)}")));
    }
}

public interface IPreStartVoiceLibrary
{
    Task<PreStartSpeechService.SpeechResult?> ReadAsync(string id, CancellationToken token);
    Task<bool> WriteAsync(string id, PreStartSpeechService.SpeechResult audio, CancellationToken token);
}

/// <summary>Private Supabase objects; only allowlisted standard questions reach this store.</summary>
public sealed class PreStartVoiceLibrary(IConfiguration config, IHttpClientFactory clients, ILogger<PreStartVoiceLibrary> logger) : IPreStartVoiceLibrary
{
    public const string Bucket = "prestart-voice-library";
    private HttpRequestMessage Request(HttpMethod method, string id)
    {
        if (!Regex.IsMatch(id, "^[A-F0-9]{64}$")) throw new ArgumentException("Invalid audio identity.");
        var key = config["Supabase:ServiceRoleKey"] ?? config["Supabase:Key"];
        if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(config["Supabase:Url"])) throw new InvalidOperationException("Voice storage is not configured.");
        var path = method == HttpMethod.Get ? "object/authenticated" : "object";
        var request = new HttpRequestMessage(method, $"{config["Supabase:Url"]!.TrimEnd('/')}/storage/v1/{path}/{Bucket}/{id}.json");
        request.Headers.Add("apikey", key);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
        return request;
    }
    public async Task<PreStartSpeechService.SpeechResult?> ReadAsync(string id, CancellationToken token)
    {
        try
        {
            using var client = clients.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(3);
            using var request = Request(HttpMethod.Get, id);
            using var response = await client.SendAsync(request, token);
            // Storage may represent a missing object as 400 rather than 404.
            if (response.StatusCode == HttpStatusCode.NotFound) return null;
            if (response.StatusCode == HttpStatusCode.BadRequest)
            {
                var body = await response.Content.ReadAsStringAsync(token);
                if (body.Contains("not_found", StringComparison.OrdinalIgnoreCase) || body.Contains("not found", StringComparison.OrdinalIgnoreCase)) return null;
            }
            response.EnsureSuccessStatusCode();
            var value = await response.Content.ReadFromJsonAsync<PreStartSpeechService.SpeechResult>(cancellationToken: token);
            if (value?.UsesAiVoice != true || value.AudioFormat != "mp3" || string.IsNullOrWhiteSpace(value.AudioBase64)) return null;
            if (Convert.FromBase64String(value.AudioBase64).Length == 0) return null;
            return value;
        }
        catch (Exception e) when (e is HttpRequestException or JsonException or FormatException or InvalidOperationException || e is OperationCanceledException && !token.IsCancellationRequested)
        {
            logger.LogWarning("Pre-start voice library read unavailable ({ErrorType}, HTTP {StatusCode})", e.GetType().Name, (e as HttpRequestException)?.StatusCode);
            return null;
        }
    }
    public async Task<bool> WriteAsync(string id, PreStartSpeechService.SpeechResult audio, CancellationToken token)
    {
        if (!audio.UsesAiVoice || string.IsNullOrEmpty(audio.AudioBase64)) return false;
        try
        {
            using var client = clients.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(3);
            using var request = Request(HttpMethod.Post, id);
            request.Headers.Add("x-upsert", "true");
            // Storage uploads are files, not a JSON API request: send a known-length body
            // and an exact bucket-approved MIME type (without JsonContent's charset suffix).
            request.Content = new ByteArrayContent(JsonSerializer.SerializeToUtf8Bytes(audio, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
            request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
            using var response = await client.SendAsync(request, token);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(token);
                string? code = null;
                try
                {
                    using var error = JsonDocument.Parse(body);
                    if (error.RootElement.TryGetProperty("error", out var value) && value.ValueKind == JsonValueKind.String &&
                        Regex.IsMatch(value.GetString()!, "^[A-Za-z_ ]{1,80}$")) code = value.GetString();
                }
                catch (JsonException) { }
                logger.LogWarning("Pre-start voice library upload rejected: HTTP {StatusCode}, code {ErrorCode}", (int)response.StatusCode, code ?? "unknown");
                return false;
            }
            logger.LogInformation("Pre-start voice library stored audio {AudioId}", id);
            return true;
        }
        catch (Exception e) when (e is HttpRequestException or InvalidOperationException || e is OperationCanceledException && !token.IsCancellationRequested)
        {
            logger.LogWarning("Pre-start voice library write unavailable ({ErrorType}, HTTP {StatusCode})", e.GetType().Name, (e as HttpRequestException)?.StatusCode);
            return false;
        }
    }
}
