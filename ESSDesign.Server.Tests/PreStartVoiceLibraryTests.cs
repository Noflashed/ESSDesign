using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ESSDesign.Server.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace ESSDesign.Server.Tests;
public sealed class PreStartVoiceLibraryTests
{
    private sealed class Handler : HttpMessageHandler
    {
        public int Calls;
        public Func<HttpRequestMessage, HttpResponseMessage> Reply = _ => new(HttpStatusCode.OK) { Content = JsonContent.Create(new { audio_base64 = "AQID" }) };
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) { Calls++; return Task.FromResult(Reply(request)); }
    }
    private sealed class Factory(Handler handler) : IHttpClientFactory { public HttpClient CreateClient(string name) => new(handler, false); }
    private sealed class Store : IPreStartVoiceLibrary
    {
        public Dictionary<string, PreStartSpeechService.SpeechResult> Items = new();
        public int Reads;
        public Task<PreStartSpeechService.SpeechResult?> ReadAsync(string id, CancellationToken token) { Reads++; return Task.FromResult(Items.GetValueOrDefault(id)); }
        public Task<bool> WriteAsync(string id, PreStartSpeechService.SpeechResult audio, CancellationToken token) { Items[id] = audio; return Task.FromResult(true); }
    }
    private static IConfiguration Config(string? key = null, string voice = "voice") => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> {
        ["ElevenLabs:ApiKey"] = key ?? Guid.NewGuid().ToString(), ["ElevenLabs:VoiceId"] = voice
    }).Build();
    private static PreStartSpeechService Speech(IConfiguration config, Handler handler, Store store) => new(config,new Factory(handler),NullLogger<PreStartSpeechService>.Instance,store);
    [Fact]
    public async Task StoredAudioSurvivesNewServiceAndCredentialRotationWithoutSynthesis()
    {
        var store = new Store(); var handler = new Handler(); var first = Config();
        var text = "Any issues from the previous day?";
        await Speech(first,handler,store).GenerateAsync(text,default,"elevenlabs");
        Assert.Single(store.Items); Assert.Equal(1,handler.Calls);
        var second = Config(); // Also bypasses the temporary credential-keyed memory cache.
        var replay = await Speech(second,handler,store).GenerateAsync(text,default,"elevenlabs");
        Assert.Equal("AQID",replay.AudioBase64); Assert.Equal(1,handler.Calls); Assert.Equal(2,store.Reads);
        await Speech(Config(voice:"another-voice"),handler,store).GenerateAsync(text,default,"elevenlabs");
        Assert.Equal(2,handler.Calls);
    }
    [Theory]
    [InlineData("Got it, I’ve updated the permit details. Have conditions changed since permit approval?")]
    [InlineData("Of course, I’ve marked no issues from the previous day. What work is planned today?")]
    public async Task CorrectionsAreSharedDurablyWithoutAnotherVoiceCall(string text)
    {
        var store = new Store(); var handler = new Handler();
        await Speech(Config(),handler,store).GenerateAsync(text,default,"elevenlabs");
        Assert.Single(store.Items);
        await Speech(Config(),handler,store).GenerateAsync(text,default,"elevenlabs");
        Assert.Equal(1,handler.Calls);
    }
    [Theory]
    [InlineData("No worries, I’ve changed the foreman to James Smith. What happened at the private site?")]
    [InlineData("No worries, I’ve updated the incident report for Alex. What work is planned today?")]
    [InlineData("No worries, I’ve changed the foreman to James Smith. What are the work area risks and agreed actions?")]
    public void NonstandardCorrectionBodiesAreNotAddedToSharedLibrary(string text) => Assert.False(PreStartVoiceCatalog.IsReusable(text));

    [Theory]
    [InlineData("Were you referring to issues from the previous day?")]
    [InlineData("Just checking, is that about permit details?")]
    [InlineData("Which part of the form were you referring to?")]
    public async Task RevisitClarificationsArePersistedAndReplayed(string text)
    {
        var store = new Store(); var handler = new Handler();
        await Speech(Config(),handler,store).GenerateAsync(text,default,"elevenlabs");
        Assert.Single(store.Items);
        await Speech(Config(),handler,store).GenerateAsync(text,default,"elevenlabs");
        Assert.Equal(1,handler.Calls);
    }

    [Fact]
    public async Task PersonalisedQuestionsNeverEnterThePermanentLibrary()
    {
        var store=new Store(); var handler=new Handler();
        await Speech(Config(),handler,store).GenerateAsync("Which permit did Alex use at Building B?",default,"elevenlabs");
        Assert.Empty(store.Items); Assert.Equal(0,store.Reads);
    }
    [Fact]
    public void ProviderAndSpeedVersionCannotShareAnAudioIdentity()
    {
        var config=Config();
        Assert.NotEqual(PreStartVoiceCatalog.Identity(config,"deepgram","Hi"),PreStartVoiceCatalog.Identity(config,"elevenlabs","Hi"));
        var prior=PreStartVoiceCatalog.Identity(config,"elevenlabs","Hi");
        config["PreStartVoice:LibraryVersion"]="2";
        Assert.NotEqual(prior,PreStartVoiceCatalog.Identity(config,"elevenlabs","Hi"));
    }
    [Fact]
    public async Task StorageRoundTripUsesPrivateServerAuthenticatedObjects()
    {
        var config=Config(); config["Supabase:Url"]="https://test.supabase.co"; config["Supabase:ServiceRoleKey"]="server-secret";
        var handler=new Handler(); string? payload=null;
        handler.Reply=request=> {
            Assert.Equal("server-secret",request.Headers.Authorization!.Parameter);
            Assert.DoesNotContain("server-secret",request.RequestUri!.AbsoluteUri);
            if(request.Method==HttpMethod.Post) {
                Assert.Equal("true",request.Headers.GetValues("x-upsert").Single());
                Assert.Equal("application/json", request.Content!.Headers.ContentType!.ToString());
                Assert.True(request.Content.Headers.ContentLength > 0);
                payload=request.Content!.ReadAsStringAsync().GetAwaiter().GetResult();
                return new(HttpStatusCode.OK);
            }
            Assert.Contains("/object/authenticated/prestart-voice-library/",request.RequestUri.AbsolutePath);
            return new(HttpStatusCode.OK){Content=new StringContent(payload!)};
        };
        var store=new PreStartVoiceLibrary(config,new Factory(handler),NullLogger<PreStartVoiceLibrary>.Instance);
        var id=new string('A',64);
        Assert.True(await store.WriteAsync(id,new("AQID","mp3",true),default));
        Assert.Equal("AQID",(await store.ReadAsync(id,default))!.AudioBase64);
    }
    [Fact]
    public async Task HistoryImportUsesExistingAudioOnlyAndRejectsPersonalOrFastClips()
    {
        var config=Config(); var store=new Store(); var handler=new Handler(); var downloaded=0;
        object Item(string id,string text,double speed=1) => new {history_item_id=id,text,voice_id="voice",model_id="eleven_flash_v2_5",content_type="audio/mpeg",source="TTS",settings=new{speed,stability=.45,similarity_boost=.75,style=0,use_speaker_boost=false}};
        handler.Reply=request=> {
            Assert.Equal(HttpMethod.Get,request.Method); // Absolutely no synthesis POST.
            if(request.RequestUri!.AbsolutePath=="/v1/history") return new(HttpStatusCode.OK){Content=JsonContent.Create(new{history=new[]{Item("good","Any issues from the previous day?"),Item("personal","Which permit did Alex use?"),Item("fast","What work is planned today?",1.2)},has_more=false})};
            Assert.Equal("/v1/history/good/audio",request.RequestUri.AbsolutePath);
            downloaded++; var content=new ByteArrayContent(new byte[]{1,2,3}); content.Headers.ContentType=new("audio/mpeg");
            return new(HttpStatusCode.OK){Content=content};
        };
        var services=new ServiceCollection().AddScoped(_=>Speech(config,handler,store)).BuildServiceProvider();
        var importer=new PreStartVoiceHistoryImport(config,new Factory(handler),store,services.GetRequiredService<IServiceScopeFactory>(),NullLogger<PreStartVoiceHistoryImport>.Instance);
        await importer.ImportAsync(default);
        await importer.ImportAsync(default);
        Assert.Equal(1,downloaded); Assert.Single(store.Items);
    }
}
