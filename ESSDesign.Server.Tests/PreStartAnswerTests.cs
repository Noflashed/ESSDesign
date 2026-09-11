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
        public HttpClient CreateClient(string name) => new(this, false);
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            token.ThrowIfCancellationRequested();
            Calls++;
            Assert.Equal("https://api.openai.com/v1/chat/completions", request.RequestUri!.ToString());
            Assert.Equal("Bearer", request.Headers.Authorization!.Scheme);
            var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(token)).RootElement;
            Assert.Equal("gpt-4.1-mini", body.GetProperty("model").GetString());
            Assert.Equal(1000, body.GetProperty("max_completion_tokens").GetInt32());
            Assert.False(body.TryGetProperty("tools", out _));
            Assert.False(body.GetProperty("store").GetBoolean());
            Assert.Equal(2, body.GetProperty("messages").GetArrayLength());
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
