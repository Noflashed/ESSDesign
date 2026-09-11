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
            settings["Deepgram:ApiKey"] = Guid.NewGuid().ToString();

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
            Assert.Equal("api.deepgram.com", request.RequestUri!.Host);
            Assert.Equal("Token", request.Headers.Authorization!.Scheme);
            if (request.RequestUri.AbsolutePath == "/v1/listen")
                return new(HttpStatusCode.OK) { Content = JsonContent.Create(new { results = new { channels = new[] { new { alternatives = new[] { new { words = new[] {
                    new { word = "any", start = 0.0 }, new { word = "issues", start = 0.2 }, new { word = "yesterday", start = 0.5 }
                } } } } } } }) };
            Assert.Contains("model=aura-2-hyperion-en", request.RequestUri.Query);
            Assert.Contains("speed=1", request.RequestUri.Query);
            // Deepgram MP3 accepts 32000 or 48000, not ElevenLabs' 128000 bitrate.
            Assert.Contains("encoding=mp3&bit_rate=48000", request.RequestUri.Query);
            var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync()).RootElement;
            Assert.Equal("Any issues yesterday?", body.GetProperty("text").GetString());
            var content = new ByteArrayContent(new byte[] { 1, 2, 3 });
            content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("audio/mpeg");
            return new(HttpStatusCode.OK) { Content = content };
        };
        var service = Create(handler);
        var result = await service.GenerateAsync(" Any issues yesterday? ", default);
        Assert.Equal(result, await service.GenerateAsync("Any issues yesterday?", default));
        Assert.Equal(2, handler.Calls);
        Assert.Equal("AQID", result.AudioBase64);
        Assert.Equal("mp3", result.AudioFormat);
        Assert.True(result.UsesAiVoice);
        Assert.Equal(0.2, result.Alignment!.Value.GetProperty("character_start_times_seconds")[4].GetDouble());
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

    [Theory]
    [InlineData("[{\"word\":\"wrong\",\"start\":0},{\"word\":\"team\",\"start\":1}]")]
    [InlineData("[{\"word\":\"hi\",\"start\":1},{\"word\":\"team\",\"start\":0}]")]
    [InlineData("[{\"word\":\"hi\",\"start\":-1},{\"word\":\"team\",\"start\":0}]")]
    [InlineData("[]")]
    public void InvalidTimingIsNotPresentedAsAccurate(string json)
    {
        using var words = JsonDocument.Parse(json);
        Assert.Null(PreStartSpeechService.BuildAlignment("Hi team", words.RootElement));
    }

    [Fact]
    public void TimingPreservesWrittenPunctuation()
    {
        using var words = JsonDocument.Parse("[{\"word\":\"hi\",\"start\":0.1},{\"word\":\"team\",\"start\":0.5}]");
        var result = PreStartSpeechService.BuildAlignment("Hi, team!", words.RootElement)!.Value;
        Assert.Equal("Hi, team!", string.Concat(result.GetProperty("characters").EnumerateArray().Select(c => c.GetString())));
        Assert.Equal(0.5, result.GetProperty("character_start_times_seconds")[4].GetDouble());
    }

    [Fact]
    public async Task PronunciationAndTimingFailureStillReturnAudio()
    {
        var handler = new StubHandler();
        handler.Reply = async (request, _) =>
        {
            if (request.RequestUri!.AbsolutePath == "/v1/listen") return new(HttpStatusCode.ServiceUnavailable);
            var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync()).RootElement;
            Assert.Equal("Is a swims ready?", body.GetProperty("text").GetString());
            var content = new ByteArrayContent(new byte[] { 1, 2, 3 });
            content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("audio/mpeg");
            return new(HttpStatusCode.OK) { Content = content };
        };
        var result = await Create(handler).GenerateAsync("Is a SWMS ready?", default);
        Assert.True(result.UsesAiVoice);
        Assert.Null(result.Alignment);
    }
}
