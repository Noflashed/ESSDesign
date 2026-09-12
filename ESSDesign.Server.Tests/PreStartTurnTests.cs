using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ESSDesign.Server.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace ESSDesign.Server.Tests;

public sealed class PreStartTurnTests
{
    private static JsonElement Value(object? value) => JsonSerializer.SerializeToElement(value);
    private static PreStartTurnRequest Request(string text = "Add delayed delivery to yesterday's issues.") => new() {
        FormId = "form-1", CurrentKey = "permitDetails", Transcript = text,
        Fields = new() { ["permitDetails"] = Value(""), ["previousIssues"] = Value(true), ["previousIssuesDetails"] = Value("Damaged board."), ["risks"] = Value("Falling objects — Barricade below\nVehicles — Spotter"), ["workGroupCount"] = Value("4"), ["swmsInPlace"] = Value(null) }
    };
    private static PreStartOperation Op(string key, object? value, string evidence, string mode = "set", string status = "answered", int? row = null) => new() { Key = key, Value = Value(value), Evidence = evidence, Mode = mode, Status = status, Row = row };

    [Fact]
    public void EarlierAdditionPreservesExistingTextAndDoesNotRequireCurrentAnswer()
    {
        var request = Request();
        var result = PreStartTurnService.ValidateDecision(request, new() { Action = "continue", Operations = [Op("previousIssuesDetails", "Delayed delivery.", request.Transcript, "append")] });
        var patch = Assert.Single(result);
        Assert.Equal("Damaged board.\nDelayed delivery.", patch.Value.GetString());
        Assert.Equal("Damaged board.", patch.Expected.GetString());
    }
    [Fact]
    public void AControlUpdatesOnlyItsExistingRiskRow()
    {
        var request = Request("For falling objects, use an exclusion zone below.");
        var result = PreStartTurnService.ValidateDecision(request, new() { Action = "continue", Operations = [Op("risks", "Falling objects — Exclusion zone below", request.Transcript, "replace_row", row: 1)] });
        Assert.Equal("Falling objects — Exclusion zone below\nVehicles — Spotter\n\n\n\n", result[0].Value.GetString());
    }
    [Fact]
    public void PartialFactsCanBeRetainedAlongsideAClarification()
    {
        var request = Request("There's a permit for access, but I don't know the number.");
        var result = PreStartTurnService.ValidateDecision(request, new() { Action = "clarify", SpeechId = "permit.number", Operations = [Op("permitDetails", "Access permit; number unconfirmed.", request.Transcript, status: "partial")] });
        Assert.Equal("partial", result[0].Status);
    }
    [Fact]
    public void UncertaintyDoesNotBecomeANegativeOrCompletedCheck()
    {
        var request = Request("I don't know.");
        var result = PreStartTurnService.ValidateDecision(request, new() { Action = "defer", Operations = [Op("swmsInPlace", null, request.Transcript, "status", "unconfirmed")] });
        Assert.Equal(JsonValueKind.Null, result[0].Value.ValueKind);
        Assert.Equal("unconfirmed", result[0].Status);
    }
    [Fact]
    public void ParentNoClearsObsoleteDetails()
    {
        var request = Request("Actually no issues occurred.");
        var result = PreStartTurnService.ValidateDecision(request, new() { Action = "continue", Operations = [Op("previousIssues", false, request.Transcript)] });
        Assert.Equal("", result.Single(p => p.Key == "previousIssuesDetails").Value.GetString());
    }
    [Theory]
    [InlineData("signatures", "set", "signed", "answered")]
    [InlineData("workGroupCount", "append", "2", "answered")]
    [InlineData("workGroupCount", "set", "many", "answered")]
    [InlineData("permitDetails", "set", "ASK: Which permit?", "answered")]
    public void InvalidOperationsAreRejectedBeforeAnyPatchIsReturned(string key, string mode, string value, string status)
    {
        var request = Request();
        Assert.Throws<JsonException>(() => PreStartTurnService.ValidateDecision(request, new() { Operations = [Op("previousIssuesDetails", "Delivery", request.Transcript, "append"), Op(key, value, request.Transcript, mode, status)] }));
        Assert.Equal("Damaged board.", request.Fields["previousIssuesDetails"].GetString());
    }
    [Fact]
    public void AssistantQuestionsCannotBeUsedAsEvidence()
    {
        var request = Request("Not sure.");
        request.History = [new("assistant", "The check was completed.")];
        Assert.Throws<JsonException>(() => PreStartTurnService.ValidateDecision(request, new() { Operations = [Op("swmsInPlace", true, "The check was completed.")] }));
    }
    [Fact]
    public void NoSilentRiskOverflowOrMissingRowReplacement()
    {
        var request = Request("Add another risk.");
        Assert.Throws<JsonException>(() => PreStartTurnService.ValidateDecision(request, new() { Operations = [Op("risks", "A\nB\nC\nD\nE", request.Transcript, "append")] }));
        Assert.Throws<JsonException>(() => PreStartTurnService.ValidateDecision(request, new() { Operations = [Op("risks", "A", request.Transcript, "replace_row", row: 6)] }));
    }
    private sealed class Handler : HttpMessageHandler, IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(this, false);
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) {
            var json = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(token)).RootElement;
            Assert.True(json.GetProperty("response_format").GetProperty("json_schema").GetProperty("strict").GetBoolean());
            Assert.False(json.GetProperty("store").GetBoolean());
            Assert.Equal("gpt-4.1-mini", json.GetProperty("model").GetString());
            return new(HttpStatusCode.OK) { Content = JsonContent.Create(new { choices = new[] { new { finish_reason = "stop", message = new { content = "{\"ok\":true}" } } } }) };
        }
    }
    [Fact]
    public async Task StructuredCallsEnforceASchemaWithoutChangingTheConfiguredModel()
    {
        var handler = new Handler();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["OpenAI:ApiKey"] = "test" }).Build();
        var model = new PreStartAnswerService(config, handler, NullLogger<PreStartAnswerService>.Instance);
        Assert.Equal("{\"ok\":true}", await model.StructuredAsync("Instructions", Request(), PreStartTurnService.Schema, default));
    }
}
