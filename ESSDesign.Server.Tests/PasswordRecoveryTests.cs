using System.Net;
using System.Text;
using ESSDesign.Server.Controllers;
using ESSDesign.Server.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace ESSDesign.Server.Tests;

public class PasswordRecoveryTests
{
    private sealed class Provider(params (HttpStatusCode Status, string Body)[] replies) : HttpMessageHandler, IHttpClientFactory
    {
        public List<(string Path, string Body, string? Bearer)> Requests { get; } = [];
        public HttpClient CreateClient(string name) => new(this, false);
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add((request.RequestUri!.PathAndQuery, request.Content == null ? "" : await request.Content.ReadAsStringAsync(cancellationToken), request.Headers.Authorization?.Parameter));
            var reply = replies[Requests.Count - 1];
            return new(reply.Status) { Content = new StringContent(reply.Body, Encoding.UTF8, "application/json") };
        }
    }

    private static PasswordRecoveryController Controller(Provider provider)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
            ["Supabase:Url"] = "https://example.invalid", ["Supabase:Key"] = "public-test-key", ["Supabase:ServiceRoleKey"] = "admin-test-key"
        }).Build();
        return new(provider, config, new EmailService(null, config, NullLogger<EmailService>.Instance), NullLogger<PasswordRecoveryController>.Instance)
        { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() } };
    }

    [Fact]
    public async Task InvalidRecoveryNeverUpdatesPassword()
    {
        var provider = new Provider((HttpStatusCode.Forbidden, "{}"));
        Assert.IsType<BadRequestObjectResult>(await Controller(provider).Reset(new("expired", "new-password")));
        Assert.Single(provider.Requests);
        Assert.Contains("\"type\":\"recovery\"", provider.Requests[0].Body);
    }

    [Fact]
    public async Task UpdateUsesVerifiedSessionAndRevokesSessions()
    {
        var provider = new Provider((HttpStatusCode.OK, "{\"access_token\":\"verified-session\"}"), (HttpStatusCode.OK, "{}"), (HttpStatusCode.NoContent, ""));
        Assert.IsType<OkObjectResult>(await Controller(provider).Reset(new("one-use-token", "new-password")));
        Assert.Equal("/auth/v1/user", provider.Requests[1].Path);
        Assert.Equal("verified-session", provider.Requests[1].Bearer);
        Assert.Equal("/auth/v1/logout?scope=global", provider.Requests[2].Path);
    }

    [Fact]
    public async Task UnknownEmailAndDeliveryFailureReturnSameResponse()
    {
        var absent = new Provider((HttpStatusCode.NotFound, "{}"));
        var deliveryFailure = new Provider((HttpStatusCode.OK, "{\"hashed_token\":\"test-token\"}"));
        var first = Assert.IsType<OkObjectResult>(await Controller(absent).Forgot(new("nobody@example.com")));
        var second = Assert.IsType<OkObjectResult>(await Controller(deliveryFailure).Forgot(new("somebody@example.com")));
        Assert.Equal(first.Value!.ToString(), second.Value!.ToString());
    }
}
