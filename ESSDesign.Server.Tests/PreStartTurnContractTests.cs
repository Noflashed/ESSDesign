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
    private static string PermitInput(string transcript, string field = "permitDetails", string followUp = "", string[]? priorAnswers = null) =>
        JsonSerializer.Serialize(new {currentField = field, allowedFields = new[] {new {key = field}}, transcript, priorAnswers = priorAnswers ?? [], followUp});

    [Theory]
    [InlineData("No permits apply")]
    [InlineData("No permits are required.")]
    [InlineData("There are no permits")]
    [InlineData("No")]
    [InlineData("None")]
    [InlineData("None apply")]
    [InlineData("No permits today")]
    public async Task ClearNoPermitsAnswersReturnOnlyPermitTextWithoutCallingTheProvider(string transcript)
    {
        var provider = new Provider();
        // Clear answers do not depend on provider availability/configuration.
        var service = new PreStartAnswerService(new ConfigurationBuilder().Build(), provider, NullLogger<PreStartAnswerService>.Instance);
        var reply = await service.InterpretAsync(PermitInput(transcript), default, new(), PreStartTurnContract.Version);
        PreStartTurnContract.ValidateReply(reply);
        using var json = JsonDocument.Parse(reply);
        Assert.Equal("updates", json.RootElement.GetProperty("action").GetString());
        var update = Assert.Single(json.RootElement.GetProperty("updates").EnumerateArray());
        Assert.Equal("permitDetails", update.GetProperty("key").GetString());
        Assert.Equal("No permits apply.", update.GetProperty("value").GetString());
        Assert.Equal("answer", update.GetProperty("mode").GetString());
        Assert.Equal(transcript, update.GetProperty("evidence").GetString());
        Assert.Equal(0, provider.Calls);
    }

    [Theory]
    [InlineData("No permits yet")]
    [InlineData("No permits except hot works")]
    [InlineData("No hot work permits apply")]
    [InlineData("No permits apply, but change yesterday")]
    [InlineData("I am not sure")]
    [InlineData("Permit 17")]
    [InlineData("Yes")]
    public async Task QualifiedAndCompoundAnswersStillReachTheModel(string transcript)
    {
        var provider = new Provider {Reply = """{"action":"clarify","updates":[],"target":null,"editMode":null,"question":"Which permits apply?"}"""};
        await Service(provider).InterpretAsync(PermitInput(transcript), default, new(), PreStartTurnContract.Version);
        Assert.Equal(1, provider.Calls);
        Assert.Contains("permitDetails is text, not a yes/no checkbox", provider.Payload.GetProperty("messages")[1].GetProperty("content").GetString());
    }

    [Fact]
    public void NoPermitsShortcutDoesNotInterpretAnotherQuestionOrAnEditOrClarification()
    {
        Assert.Null(PreStartTurnContract.TryNoPermits(PermitInput("No", "permitConditionsChanged"), new()));
        Assert.Null(PreStartTurnContract.TryNoPermits(PermitInput("No", followUp: "Do you mean there are no permits?"), new()));
        Assert.Null(PreStartTurnContract.TryNoPermits(PermitInput("No", priorAnswers: ["Hot works"]), new()));
        Assert.Null(PreStartTurnContract.TryNoPermits(PermitInput("No"), new() {Edit = new("permitDetails", "append")}));
        Assert.Null(PreStartTurnContract.TryNoPermits(PermitInput("No"), new() {Pending = new() {["permitDetails"] = "Permit 17"}}));
    }

    [Fact]
    public async Task LocalNoPermitsPathStillHonoursCancellationAndFieldRestrictions()
    {
        var provider = new Provider();
        using var source = new CancellationTokenSource(); source.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => Service(provider).InterpretAsync(PermitInput("No"), source.Token, new(), PreStartTurnContract.Version));
        await Assert.ThrowsAsync<ArgumentException>(() => Service(provider).InterpretAsync(PermitInput("No").Replace("\"key\":\"permitDetails\"", "\"key\":\"signatures\""), default, new(), PreStartTurnContract.Version));
        Assert.Equal(0, provider.Calls);
    }

    [Theory]
    [InlineData("\"\"")]
    [InlineData("null")]
    [InlineData("false")]
    public async Task SuccessfulProviderHttpResponseWithInvalidPermitValueReportsTheValidationCategory(string value)
    {
        var provider = new Provider {Reply = Valid.Replace("\"previousIssues\"", "\"permitDetails\"").Replace("\"value\":true", $"\"value\":{value}")};
        var failure = await Assert.ThrowsAsync<PreStartAnswerFailure>(() => Service(provider).InterpretAsync(PermitInput("No work permits for this job"), default, new(), PreStartTurnContract.Version));
        Assert.Equal(1, provider.Calls);
        Assert.Equal("model_answer_invalid", failure.Code);
        Assert.Equal("field_value", failure.ValidationStep);
        Assert.Equal("permitDetails", failure.Field);
        Assert.DoesNotContain("A fall from height", failure.ToString());
    }

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
        var failure = await Assert.ThrowsAsync<PreStartAnswerFailure>(() => Service(provider).InterpretAsync(Input("previousIssues"), default, null, PreStartTurnContract.Version));
        Assert.Equal("model_incomplete", failure.Code);
    }
    [Fact]
    public async Task RefusalIsHandledWithoutTryingToParseOrApplyIt()
    {
        var provider = new Provider {Refusal = "Declined"};
        var failure = await Assert.ThrowsAsync<PreStartAnswerFailure>(() => Service(provider).InterpretAsync(Input("previousIssues"), default, null, PreStartTurnContract.Version));
        Assert.Equal("model_refused", failure.Code);
    }
    [Theory]
    [InlineData("{\"plannedActivities\":\"Wrong shape\"}")]
    [InlineData("{\"action\":\"updates\",\"updates\":[]}")]
    [InlineData("{\"action\":\"updates\",\"updates\":[{\"key\":\"previousIssues\",\"mode\":\"answer\",\"value\":\"Yes\",\"evidence\":\"Yes\",\"replaceEntire\":true}]}")]
    [InlineData("{\"action\":\"updates\",\"updates\":[{\"key\":\"risks\",\"mode\":\"answer\",\"value\":\"Wet floors — Mop up\",\"evidence\":\"Wet floors\",\"replaceEntire\":true}]}")]
    public void InvalidProviderBodiesDoNotReachTheForm(string reply) => Assert.Equal("model_answer_invalid", Assert.Throws<PreStartAnswerFailure>(() => PreStartTurnContract.ValidateReply(reply)).Code);
    [Theory]
    [InlineData("previousIssues", "\"Yes\"")]
    [InlineData("risks", "\"Wet floors — Mop up\"")]
    [InlineData("workGroupCount", "\"1.5\"")]
    [InlineData("workGroupCount", "\"1000\"")]
    [InlineData("cleanupWorkerCount", "\"two\"")]
    public void FieldTypesAreValidatedEvenWithACompleteEnvelope(string key, string value)
    {
        var reply = Valid.Replace("\"key\":\"previousIssues\"", $"\"key\":\"{key}\"").Replace("\"value\":true", $"\"value\":{value}");
        var failure = Assert.Throws<PreStartAnswerFailure>(() => PreStartTurnContract.ValidateReply(reply));
        Assert.Equal("model_answer_invalid", failure.Code);
        Assert.Equal("field_value", failure.ValidationStep);
        Assert.Equal(key, failure.Field);
    }
    [Fact]
    public async Task PendingContextLimitsAreCheckedBeforeProviderCall()
    {
        var provider = new Provider();
        await Assert.ThrowsAsync<ArgumentException>(() => Service(provider).InterpretAsync(Input("previousIssues"), default, new() {Pending = new() {["signatures"] = "Signed"}}, PreStartTurnContract.Version));
        Assert.Equal(0, provider.Calls);
    }
}
