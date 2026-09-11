using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ESSDesign.Server.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace ESSDesign.Server.Tests;

public sealed class PreStartSpeechTests
{
    private sealed class StubHandler : HttpMessageHandler
    {
        public int Calls;
        public Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> Reply =
            (_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { audio_base64 = "AQID", alignment = new { characters = new[] { "H", "i" }, character_start_times_seconds = new[] { 0.0, 0.1 } } }) });
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            Calls++;
            return Reply(request, token);
        }
    }
    private sealed class Factory(StubHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, false);
    }
    private static PreStartSpeechService Create(StubHandler handler, bool configured = true)
    {
        var settings = new Dictionary<string, string?>();
        if (configured)
        {
            settings["ElevenLabs:ApiKey"] = "test-server-key";
            settings["ElevenLabs:VoiceId"] = "test-voice";
        }
        return new(new ConfigurationBuilder().AddInMemoryCollection(settings).Build(),
            new Factory(handler), NullLogger<PreStartSpeechService>.Instance);
    }

    [Fact]
    public async Task EndpointRequiresAuthenticationBeforeGeneratingAudio()
    {
        var handler = new StubHandler();
        var controller = new ESSDesign.Server.Controllers.MaterialOrderingController(null!, null!,
            NullLogger<ESSDesign.Server.Controllers.MaterialOrderingController>.Instance)
        {
            ControllerContext = new Microsoft.AspNetCore.Mvc.ControllerContext
            {
                HttpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext()
            }
        };
        var result = await controller.PreStartVoice(new() { Text = "Question?" }, Create(handler), default);
        Assert.IsType<Microsoft.AspNetCore.Mvc.UnauthorizedObjectResult>(result.Result);
        Assert.Equal(0, handler.Calls);
    }

    [Fact]
    public async Task SendsOnlyQuestionWithServerKeyAndReturnsPlayableAudio()
    {
        var handler = new StubHandler();
        handler.Reply = async (request, _) =>
        {
            Assert.Equal("api.elevenlabs.io", request.RequestUri!.Host);
            Assert.Contains("test-voice/with-timestamps", request.RequestUri.AbsolutePath);
            Assert.Equal("test-server-key", request.Headers.GetValues("xi-api-key").Single());
            var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync()).RootElement;
            Assert.Equal("Any issues yesterday?", body.GetProperty("text").GetString());
            Assert.Equal("eleven_flash_v2_5", body.GetProperty("model_id").GetString());
            Assert.Equal(1.0, body.GetProperty("voice_settings").GetProperty("speed").GetDouble());
            return new(HttpStatusCode.OK) { Content = JsonContent.Create(new { audio_base64 = "AQID", alignment = new { characters = new[] { "H", "i" }, character_start_times_seconds = new[] { 0.0, 0.1 } } }) };
        };
        var result = await Create(handler).GenerateAsync(" Any issues yesterday? ", default);
        Assert.Equal("AQID", result.AudioBase64);
        Assert.Equal("mp3", result.AudioFormat);
        Assert.True(result.UsesAiVoice);
        Assert.Equal(0.1, result.Alignment!.Value.GetProperty("character_start_times_seconds")[1].GetDouble());
    }

    [Fact]
    public async Task MissingConfigurationDoesNotCallProvider()
    {
        var handler = new StubHandler();
        Assert.False((await Create(handler, false).GenerateAsync("Question?", default)).UsesAiVoice);
        Assert.Equal(0, handler.Calls);
    }

    [Theory]
    [InlineData(401)]
    [InlineData(429)]
    [InlineData(500)]
    public async Task ProviderFailureAllowsDeviceFallback(int status)
    {
        var handler = new StubHandler { Reply = (_, _) => Task.FromResult(new HttpResponseMessage((HttpStatusCode)status)) };
        Assert.Null((await Create(handler).GenerateAsync("Question?", default)).AudioBase64);
    }

    [Fact]
    public async Task RejectsOversizedTextBeforeSpendingCredits()
    {
        var handler = new StubHandler();
        await Assert.ThrowsAsync<ArgumentException>(() => Create(handler).GenerateAsync(new string('x', 601), default));
        Assert.Equal(0, handler.Calls);
    }

    [Fact]
    public async Task CancellationIsNotSwallowedAsFallback()
    {
        var handler = new StubHandler { Reply = (_, token) => Task.FromCanceled<HttpResponseMessage>(token) };
        using var cancel = new CancellationTokenSource();
        cancel.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => Create(handler).GenerateAsync("Question?", cancel.Token));
    }
}
