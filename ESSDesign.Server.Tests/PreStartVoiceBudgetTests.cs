using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ESSDesign.Server.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace ESSDesign.Server.Tests;
public sealed class PreStartVoiceBudgetTests
{
    private sealed class Registry : IPreStartVoiceRegistry
    {
        public string Reservation = "acquired";
        public bool Approved;
        public bool Unavailable;
        public int Reservations, Finishes, Hits;
        public List<PreStartPhrase> Phrases = [];
        public Task<List<PreStartPhrase>> PhrasesAsync(string field, CancellationToken token) => Task.FromResult(Phrases);
        public Task<bool> ApproveAsync(PreStartPhrase phrase, CancellationToken token) { Phrases.Add(phrase); return Task.FromResult(true); }
        public Task<bool> IsApprovedAsync(string text, CancellationToken token) => Unavailable ? throw new PreStartVoiceStorageUnavailableException() : Task.FromResult(Approved);
        public Task<string> ReserveAsync(string id, string attemptId, string provider, int characters, int limit, CancellationToken token) { Reservations++; return Task.FromResult(Reservation); }
        public Task FinishAsync(string id, bool generated, bool stored, CancellationToken token) { Finishes++; return Task.CompletedTask; }
        public Task MetricAsync(string provider, string metric, CancellationToken token) { Hits++; return Task.CompletedTask; }
        public Task<JsonElement?> UsageAsync(CancellationToken token) => Task.FromResult<JsonElement?>(null);
    }
    private sealed class Store : IPreStartVoiceLibrary
    {
        public Dictionary<string, PreStartSpeechService.SpeechResult> Items = new();
        public bool Unavailable;
        public Task<PreStartSpeechService.SpeechResult?> ReadAsync(string id, CancellationToken token) => Unavailable ? throw new PreStartVoiceStorageUnavailableException() : Task.FromResult(Items.GetValueOrDefault(id));
        public int FailedWrites, Writes;
        public TaskCompletionSource<bool> Saved = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public Task<bool> WriteAsync(string id, PreStartSpeechService.SpeechResult audio, CancellationToken token) {
            token.ThrowIfCancellationRequested();
            Writes++;
            if (Writes <= FailedWrites) return Task.FromResult(false);
            Items[id] = audio; Saved.TrySetResult(true); return Task.FromResult(true);
        }
    }
    private sealed class Handler : HttpMessageHandler, IHttpClientFactory
    {
        public int Calls;
        public string? Review;
        public HttpClient CreateClient(string name) => new(this, false);
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) {
            Calls++;
            object body = Review is null ? new { audio_base64 = "AQID" } : new { choices = new[] { new { finish_reason = "stop", message = new { content = Review } } } };
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(body) });
        }
    }
    private static IConfiguration Config() => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
        ["ElevenLabs:ApiKey"] = Guid.NewGuid().ToString(), ["ElevenLabs:VoiceId"] = "voice", ["OpenAI:ApiKey"] = "test"
    }).Build();
    [Theory]
    [InlineData("budget")]
    [InlineData("unavailable")]
    [InlineData("busy")]
    [InlineData("generated")]
    public async Task DeniedOrUncertainReservationsNeverCallElevenLabs(string reason)
    {
        var handler = new Handler(); var registry = new Registry { Reservation = reason };
        var service = new PreStartSpeechService(Config(), handler, NullLogger<PreStartSpeechService>.Instance, registry: registry);
        var result = await service.GenerateAsync("Could you explain that?", default, "elevenlabs");
        Assert.Equal(reason, result.FallbackReason); Assert.Equal(0, handler.Calls);
    }
    [Fact]
    public async Task PrefetchOnlyReadsCacheAndNeverReservesOrGenerates()
    {
        var handler = new Handler(); var registry = new Registry();
        var service = new PreStartSpeechService(Config(), handler, NullLogger<PreStartSpeechService>.Instance, new Store(), registry);
        Assert.Null((await service.GenerateAsync("What work is planned today?", default, "elevenlabs", true)).AudioBase64);
        Assert.Equal(0, handler.Calls); Assert.Equal(0, registry.Reservations);
    }
    [Fact]
    public async Task ApprovedNewGenericAudioIsPersistedAndReusedAcrossServiceInstances()
    {
        var handler = new Handler(); var store = new Store(); var registry = new Registry { Approved = true };
        var first = new PreStartSpeechService(Config(), handler, NullLogger<PreStartSpeechService>.Instance, store, registry);
        await first.GenerateAsync("Which activity does that relate to?", default, "elevenlabs");
        var second = new PreStartSpeechService(Config(), handler, NullLogger<PreStartSpeechService>.Instance, store, registry);
        var result = await second.GenerateAsync("Which activity does that relate to?", default, "elevenlabs");
        Assert.Equal("shared", result.CacheSource); Assert.Equal(1, handler.Calls); Assert.Equal(1, registry.Reservations); Assert.Single(store.Items);
    }
    [Fact]
    public async Task PrivateSpeechIsNotAddedToTheSharedLibrary()
    {
        var store = new Store(); var handler = new Handler(); var registry = new Registry();
        await new PreStartSpeechService(Config(), handler, NullLogger<PreStartSpeechService>.Instance, store, registry).GenerateAsync("Did Alex mean permit 123?", default, "elevenlabs");
        Assert.Empty(store.Items); Assert.Equal(1, handler.Calls);
    }
    [Fact]
    public async Task PaidAudioRetriesStorageAfterThePlaybackRequestIsCancelled()
    {
        var store = new Store { FailedWrites = 1 }; var handler = new Handler(); var registry = new Registry();
        using var worker = new PreStartVoicePersistence(store, registry, NullLogger<PreStartVoicePersistence>.Instance);
        await worker.StartAsync(default);
        using var playback = new CancellationTokenSource();
        try {
            var service = new PreStartSpeechService(Config(), handler, NullLogger<PreStartSpeechService>.Instance, store, registry, worker);
            Assert.True((await service.GenerateAsync("What work is planned today?", playback.Token, "elevenlabs")).UsesAiVoice);
            playback.Cancel();
            await store.Saved.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.Equal(2, store.Writes); Assert.Single(store.Items); Assert.Equal(1, handler.Calls);
        } finally { await worker.StopAsync(default); }
    }
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task UnknownCacheAvailabilityDoesNotSpendOnReplacementSpeech(bool phraseRegistryUnavailable)
    {
        var store = new Store { Unavailable = !phraseRegistryUnavailable };
        var registry = new Registry { Approved = true, Unavailable = phraseRegistryUnavailable };
        var handler = new Handler();
        var result = await new PreStartSpeechService(Config(), handler, NullLogger<PreStartSpeechService>.Instance, store, registry)
            .GenerateAsync("Which scaffold activity does that relate to?", default, "elevenlabs");
        Assert.Equal("cache_unavailable", result.FallbackReason);
        Assert.Equal(0, handler.Calls); Assert.Equal(0, registry.Reservations);
    }
    [Theory]
    [InlineData("approve", true)]
    [InlineData("private", false)]
    [InlineData("reject", false)]
    public async Task IndependentReviewControlsSharedEligibility(string decision, bool shared)
    {
        var registry = new Registry(); var handler = new Handler { Review = JsonSerializer.Serialize(new { decision, existingId = (string?)null }) };
        var model = new PreStartAnswerService(Config(), handler, NullLogger<PreStartAnswerService>.Instance);
        var service = new PreStartDialogueService(model, registry, NullLogger<PreStartDialogueService>.Instance);
        await service.ResolveNewAsync("Which activity does that relate to?", "plannedActivities", [], new PreStartTurnRequest(), default);
        Assert.Equal(shared ? 1 : 0, registry.Phrases.Count);
    }
    [Fact]
    public async Task AParaphraseReusesExistingSpeechInsteadOfGrowingTheLibrary()
    {
        var registry = new Registry(); var handler = new Handler { Review = "{\"decision\":\"reuse\",\"existingId\":\"clarify.section\"}" };
        var service = new PreStartDialogueService(new PreStartAnswerService(Config(), handler, NullLogger<PreStartAnswerService>.Instance), registry, NullLogger<PreStartDialogueService>.Instance);
        var result = await service.ResolveNewAsync("What section are you referring to?", "risks", PreStartDialogueService.BuiltIn, new(), default);
        Assert.Equal(PreStartDialogueService.Standard("clarify.section"), result); Assert.Empty(registry.Phrases);
    }
    [Fact]
    public async Task IdentifiersAreNotSharedEvenIfTheReviewerIncorrectlyApprovesThem()
    {
        var registry = new Registry(); var handler = new Handler { Review = "{\"decision\":\"approve\",\"existingId\":null}" };
        var service = new PreStartDialogueService(new PreStartAnswerService(Config(), handler, NullLogger<PreStartAnswerService>.Instance), registry, NullLogger<PreStartDialogueService>.Instance);
        Assert.Equal(PreStartDialogueService.Standard("clarify.answer"), await service.ResolveNewAsync("Did you mean permit 123?", "permitDetails", [], new(), default));
        Assert.Empty(registry.Phrases);
    }
    [Fact]
    public async Task KnownNamesAreNotSharedEvenIfTheReviewerIncorrectlyApprovesThem()
    {
        var registry = new Registry(); var handler = new Handler { Review = "{\"decision\":\"approve\",\"existingId\":null}" };
        var service = new PreStartDialogueService(new PreStartAnswerService(Config(), handler, NullLogger<PreStartAnswerService>.Instance), registry, NullLogger<PreStartDialogueService>.Instance);
        var context = new PreStartTurnRequest { Fields = new() { ["areaForeman"] = JsonSerializer.SerializeToElement("Alex Smith") } };
        Assert.Equal(PreStartDialogueService.Standard("clarify.answer"), await service.ResolveNewAsync("Did Alex explain which permit was required?", "permitDetails", [], context, default));
        Assert.Empty(registry.Phrases);
    }
}
