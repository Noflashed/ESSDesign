using System.Net.Http.Json;
using System.Text.RegularExpressions;

namespace ESSDesign.Server.Services;

/// <summary>Server-only ElevenLabs voice for the pre-start interview. OpenAI still interprets form answers.</summary>
public sealed class PreStartSpeechService(
    IConfiguration configuration,
    IHttpClientFactory clients,
    ILogger<PreStartSpeechService> logger)
{
    public sealed record SpeechResult(string? AudioBase64 = null, string? AudioFormat = null, bool UsesAiVoice = false);

    public async Task<SpeechResult> GenerateAsync(string text, CancellationToken cancellationToken)
    {
        text = text.Trim();
        if (text.Length is 0 or > 600)
            throw new ArgumentException("Speech must contain between 1 and 600 characters.", nameof(text));

        var key = configuration["ElevenLabs:ApiKey"];
        var voice = configuration["ElevenLabs:VoiceId"];
        if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(voice))
            return new(); // The app can use device speech until server configuration is complete.
        if (!Regex.IsMatch(voice, "^[A-Za-z0-9_-]{1,100}$"))
            throw new InvalidOperationException("ElevenLabs voice configuration is invalid.");

        using var client = clients.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(10);
        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128");
        request.Headers.Add("xi-api-key", key);
        request.Content = JsonContent.Create(new
        {
            text,
            model_id = configuration["ElevenLabs:ModelId"] ?? "eleven_flash_v2_5",
            language_code = "en",
            voice_settings = new
            {
                stability = 0.45,
                similarity_boost = 0.75,
                style = 0,
                use_speaker_boost = false,
                // iOS already applies a 1.12 playback rate; don't speed it up twice.
                speed = 1.0
            }
        });
        try
        {
            using var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                // Never log the API key, generated text or upstream response body.
                logger.LogWarning("ElevenLabs pre-start speech returned HTTP {StatusCode}", (int)response.StatusCode);
                return new();
            }
            var audio = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            return audio.Length == 0 ? new() : new(Convert.ToBase64String(audio), "mp3", true);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning("ElevenLabs pre-start speech timed out");
            return new();
        }
        catch (HttpRequestException)
        {
            logger.LogWarning("ElevenLabs pre-start speech could not connect");
            return new();
        }
    }
}
