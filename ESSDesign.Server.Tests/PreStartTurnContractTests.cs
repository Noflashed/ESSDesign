using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ESSDesign.Server.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace ESSDesign.Server.Tests;
public sealed class PreStartTurnContractTests
{
    private const string Valid = """{"action":"updates","updates":[{"key":"previousIssues","mode":"answer","value":true,"evidence":"A fall from height","replaceEntire":true}],"target":null,"editMode":null,"question":null}""";
    private sealed class Provider : HttpMessageHandler, IHttpClientFactory
    {
        public JsonElement Payload;
        public int Calls;
        public string Reply = Valid;
        public string Finish = "stop";
        public string? Refusal;
        public HttpClient CreateClient(string name) => new(this, false);
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            token.ThrowIfCancellationRequested(); Calls++;
            using var json = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(token));
            Payload = json.RootElement.Clone();
            return new(HttpStatusCode.OK) {Content = JsonContent.Create(new {choices = new[] {new {finish_reason = Finish, message = new {content = Reply, refusal = Refusal}}}})};
        }
    }
    private static PreStartAnswerService Service(Provider provider) => new(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {["OpenAI:ApiKey"] = "stub-only"}).Build(), provider, NullLogger<PreStartAnswerService>.Instance);
    private static string Input(params string[] fields) => JsonSerializer.Serialize(new {currentField = fields[0], allowedFields = fields.Select(key => new {key}), transcript = "A fall from height", priorAnswers = Array.Empty<string>(), followUp = ""});
    [Fact]
    public async Task ModernTurnsUseStrictFieldTypedSchemaAndKeepTheExistingModel()
    {
        var provider = new Provider();
        Assert.Equal(Valid, await Service(provider).InterpretAsync(Input("previousIssues", "previousIssuesDetails", "risks", "workGroupCount"), default, new(), PreStartTurnContract.Version));
        Assert.Equal(1, provider.Calls);
        Assert.Equal("gpt-4.1-mini", provider.Payload.GetProperty("model").GetString());
        Assert.Equal(1600, provider.Payload.GetProperty("max_completion_tokens").GetInt32());
        Assert.False(provider.Payload.GetProperty("store").GetBoolean());
        var format = provider.Payload.GetProperty("response_format");
        Assert.Equal("json_schema", format.GetProperty("type").GetString());
        var schema = format.GetProperty("json_schema");
        Assert.True(schema.GetProperty("strict").GetBoolean());
        var root = schema.GetProperty("schema");
        Assert.False(root.GetProperty("additionalProperties").GetBoolean());
        var variants = root.GetProperty("properties").GetProperty("updates").GetProperty("items").GetProperty("anyOf").EnumerateArray().ToArray();
        Assert.Equal(4, variants.Length);
        var risk = variants.Single(variant => variant.GetProperty("properties").GetProperty("key").GetProperty("enum").EnumerateArray().Any(field => field.GetString() == "risks"));
        Assert.Equal("array", risk.GetProperty("properties").GetProperty("value").GetProperty("type").GetString());
        Assert.Equal(6, risk.GetProperty("properties").GetProperty("value").GetProperty("maxItems").GetInt32());
        Assert.DoesNotContain("signatures", root.GetRawText());
        Assert.DoesNotContain("attendees", root.GetRawText()); // Allowed fields are constrained per request.
    }
    [Fact]
    public async Task PendingProposalAndHistoryAreDataAndNotFreshInstructions()
    {
        var provider = new Provider {Reply = """{"action":"confirm","updates":[],"target":null,"editMode":null,"question":null}"""};
        var context = new PreStartHistoryContext {Pending = new() {["previousIssuesDetails"] = "A fall from heights."}, Answers = new() {["previousIssuesDetails"] = "Old incident"}};
        await Service(provider).InterpretAsync(Input("previousIssues", "previousIssuesDetails"), default, context, PreStartTurnContract.Version);
        var messages = provider.Payload.GetProperty("messages").EnumerateArray().ToArray();
        Assert.Equal(4, messages.Length);
        Assert.Contains("pending proposal is UNAPPLIED", messages[1].GetProperty("content").GetString());
        Assert.Contains("never output them as fresh answers", messages[1].GetProperty("content").GetString());
        Assert.Contains("A fall from heights.", messages[2].GetProperty("content").GetString());
    }
    [Theory]
    [InlineData("other-contract")]
    [InlineData("prestart-turn-v3")]
    public async Task UnknownContractsAreRejectedBeforeSpend(string contract)
    {
        var provider = new Provider();
        await Assert.ThrowsAsync<ArgumentException>(() => Service(provider).InterpretAsync(Input("previousIssues"), default, null, contract));
        Assert.Equal(0, provider.Calls);
    }
    [Theory]
    [InlineData("signatures")]
    [InlineData("representativeName")]
    public async Task ProtectedFieldsCannotEnterTheSchema(string field)
    {
        var provider = new Provider();
        await Assert.ThrowsAsync<ArgumentException>(() => Service(provider).InterpretAsync(Input(field), default, null, PreStartTurnContract.Version));
        Assert.Equal(0, provider.Calls);
    }
    [Theory]
    [InlineData("length")]
    [InlineData("content_filter")]
    public async Task IncompleteDecisionsAreRejected(string finish)
    {
        var provider = new Provider {Finish = finish};
        await Assert.ThrowsAsync<HttpRequestException>(() => Service(provider).InterpretAsync(Input("previousIssues"), default, null, PreStartTurnContract.Version));
    }
    [Fact]
    public async Task RefusalIsHandledWithoutTryingToParseOrApplyIt()
    {
        var provider = new Provider {Refusal = "Declined"};
        await Assert.ThrowsAsync<HttpRequestException>(() => Service(provider).InterpretAsync(Input("previousIssues"), default, null, PreStartTurnContract.Version));
    }
    [Theory]
    [InlineData("{\"plannedActivities\":\"Wrong shape\"}")]
    [InlineData("{\"action\":\"updates\",\"updates\":[]}")]
    [InlineData("{\"action\":\"updates\",\"updates\":[{\"key\":\"previousIssues\",\"mode\":\"answer\",\"value\":\"Yes\",\"evidence\":\"Yes\",\"replaceEntire\":true}]}")]
    [InlineData("{\"action\":\"updates\",\"updates\":[{\"key\":\"risks\",\"mode\":\"answer\",\"value\":\"Wet floors — Mop up\",\"evidence\":\"Wet floors\",\"replaceEntire\":true}]}")]
    public void InvalidProviderBodiesDoNotReachTheForm(string reply) => Assert.Throws<HttpRequestException>(() => PreStartTurnContract.ValidateReply(reply));
    [Theory]
    [InlineData("previousIssues", "\"Yes\"")]
    [InlineData("risks", "\"Wet floors — Mop up\"")]
    [InlineData("workGroupCount", "\"1.5\"")]
    [InlineData("workGroupCount", "\"1000\"")]
    [InlineData("cleanupWorkerCount", "\"two\"")]
    public void FieldTypesAreValidatedEvenWithACompleteEnvelope(string key, string value)
    {
        var reply = Valid.Replace("\"key\":\"previousIssues\"", $"\"key\":\"{key}\"").Replace("\"value\":true", $"\"value\":{value}");
        Assert.Throws<HttpRequestException>(() => PreStartTurnContract.ValidateReply(reply));
    }
    [Fact]
    public async Task PendingContextLimitsAreCheckedBeforeProviderCall()
    {
        var provider = new Provider();
        await Assert.ThrowsAsync<ArgumentException>(() => Service(provider).InterpretAsync(Input("previousIssues"), default, new() {Pending = new() {["signatures"] = "Signed"}}, PreStartTurnContract.Version));
        Assert.Equal(0, provider.Calls);
    }
}
