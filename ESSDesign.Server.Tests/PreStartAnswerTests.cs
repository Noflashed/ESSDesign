using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ESSDesign.Server.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace ESSDesign.Server.Tests;
public sealed class PreStartAnswerTests
{
    private sealed class Handler : HttpMessageHandler, IHttpClientFactory
    {
        public int Calls;
        public string Finish = "stop";
        public string Reply = "VALUE: Erect scaffolding.";
        public int ExpectedMessages = 2;
        public JsonElement Payload;
        public HttpClient CreateClient(string name) => new(this, false);
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            token.ThrowIfCancellationRequested();
            Calls++;
            Assert.Equal("https://api.openai.com/v1/chat/completions", request.RequestUri!.ToString());
            Assert.Equal("Bearer", request.Headers.Authorization!.Scheme);
            using var json = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(token));
            var body = json.RootElement;
            Payload = body.Clone();
            Assert.Equal("gpt-4.1-mini", body.GetProperty("model").GetString());
            Assert.Equal(1000, body.GetProperty("max_completion_tokens").GetInt32());
            Assert.False(body.TryGetProperty("tools", out _));
            Assert.False(body.GetProperty("store").GetBoolean());
            Assert.Equal(ExpectedMessages, body.GetProperty("messages").GetArrayLength());
            return new(HttpStatusCode.OK) { Content = JsonContent.Create(new { choices = new[] { new { finish_reason = Finish, message = new { content = Reply } } } }) };
        }
    }
    private static PreStartAnswerService Service(Handler handler) => new(
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> { ["OpenAI:ApiKey"] = "test-key" }).Build(),
        handler, NullLogger<PreStartAnswerService>.Instance);

    [Fact]
    public async Task SingleBoundedCallReturnsAnswerWithoutCompanyTools()
    {
        var handler = new Handler();
        Assert.Equal("VALUE: Erect scaffolding.", await Service(handler).InterpretAsync("Rewrite these notes", default));
        Assert.Equal(1, handler.Calls);
    }
    [Theory]
    [InlineData("length", "truncated")]
    [InlineData("stop", "")]
    [InlineData("content_filter", "blocked")]
    public async Task IncompleteAnswersAreNeverApplied(string finish, string reply)
    {
        var handler = new Handler { Finish = finish, Reply = reply };
        await Assert.ThrowsAsync<HttpRequestException>(() => Service(handler).InterpretAsync("Question", default));
    }
    [Fact]
    public async Task LimitsAndCancellationPreventUnnecessarySpend()
    {
        var handler = new Handler();
        await Assert.ThrowsAsync<ArgumentException>(() => Service(handler).InterpretAsync(new string('x', 4001), default));
        using var source = new CancellationTokenSource(); source.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => Service(handler).InterpretAsync("Question", source.Token));
        Assert.Equal(0, handler.Calls);
    }
    [Fact]
    public async Task ContextIsSuppliedWithoutChangingTheExistingResponseOrModel()
    {
        var handler = new Handler { ExpectedMessages = 4 };
        var context = new PreStartHistoryContext {
            History = [new("assistant", "What work is planned today?", "plannedActivities"), new("user", "Erect scaffold", "plannedActivities")],
            Answers = new() { ["plannedActivities"] = "Erect scaffold." },
            Question = "Which permits apply?",
            Edit = new("plannedActivities", "append")
        };
        Assert.Equal(handler.Reply, await Service(handler).InterpretAsync("Extract the additional scaffold work.", default, context));
        Assert.Equal(1, handler.Calls);
        var messages = handler.Payload.GetProperty("messages");
        Assert.Contains("extract ONLY the new information", messages[1].GetProperty("content").GetString());
        Assert.Contains("Erect scaffold.", messages[2].GetProperty("content").GetString());
        Assert.Equal("Extract the additional scaffold work.", messages[3].GetProperty("content").GetString());
    }
    [Theory]
    [InlineData("system", "plannedActivities", "append")]
    [InlineData("user", "signatures", "append")]
    [InlineData("user", "plannedActivities", "execute")]
    public async Task InvalidContextIsRejectedBeforeCallingTheProvider(string role, string field, string mode)
    {
        var handler = new Handler();
        var context = new PreStartHistoryContext { History = [new(role, "Content", field)], Edit = new("plannedActivities", mode) };
        await Assert.ThrowsAsync<ArgumentException>(() => Service(handler).InterpretAsync("Question", default, context));
        Assert.Equal(0, handler.Calls);
    }
    [Fact]
    public async Task ExcessHistoryAndProtectedSnapshotFieldsAreRejected()
    {
        var handler = new Handler();
        await Assert.ThrowsAsync<ArgumentException>(() => Service(handler).InterpretAsync("Question", default, new() { History = Enumerable.Repeat(new PreStartHistoryMessage("user", "Hello", "plannedActivities"), 13).ToList() }));
        await Assert.ThrowsAsync<ArgumentException>(() => Service(handler).InterpretAsync("Question", default, new() { Answers = new() { ["signatures"] = "Signed" } }));
        Assert.Equal(0, handler.Calls);
    }
    [Fact]
    public async Task EndpointRequiresAuthenticationBeforeModelCall()
    {
        var handler = new Handler();
        var controller = new ESSDesign.Server.Controllers.AssistantController(null!, null!, null!, null!, null!, NullLogger<ESSDesign.Server.Controllers.AssistantController>.Instance) {
            ControllerContext = new Microsoft.AspNetCore.Mvc.ControllerContext { HttpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext() }
        };
        var result = await controller.PreStartAnswer(new() { Message = "Question" }, Service(handler), default);
        Assert.IsType<Microsoft.AspNetCore.Mvc.UnauthorizedObjectResult>(result);
        Assert.Equal(0, handler.Calls);
    }
}
