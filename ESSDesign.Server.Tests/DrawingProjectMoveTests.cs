using System.Net;
using System.Text;
using System.Text.Json;
using ESSDesign.Server.Models;
using ESSDesign.Server.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace ESSDesign.Server.Tests;

public class DrawingProjectMoveTests
{
    private sealed class Provider(params string[] replies) : HttpMessageHandler, IHttpClientFactory
    {
        public List<(HttpMethod Method, string Path, string Body)> Requests { get; } = [];
        public HttpClient CreateClient(string name) => new(this, false);
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            Requests.Add((request.Method, request.RequestUri!.PathAndQuery,
                request.Content == null ? "" : await request.Content.ReadAsStringAsync(token)));
            if (request.Method == HttpMethod.Patch)
                Assert.Contains("return=representation", request.Headers.GetValues("Prefer"));
            return new(HttpStatusCode.OK) { Content = new StringContent(replies[Requests.Count - 1], Encoding.UTF8, "application/json") };
        }
    }

    private static string Folder(Guid id, string name, Guid? parent = null) =>
        JsonSerializer.Serialize(new[] { new { id, name, parent_folder_id = parent } });

    private static SupabaseService Service(Provider provider) => new(null!, NullLogger<SupabaseService>.Instance,
        provider, null!, new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
            ["Supabase:Url"] = "https://example.invalid", ["Supabase:Key"] = "test"
        }).Build());

    [Fact]
    public async Task MoveReparentsWholeFolderWithoutChangingDocumentsOrStorageKeys()
    {
        var source = Guid.NewGuid();
        var drawing = Guid.NewGuid();
        var target = Guid.NewGuid();
        var provider = new Provider(Folder(drawing, "SCAFFOLD", source), Folder(target, "NEW PROJECT"),
            "[]", Folder(drawing, "SCAFFOLD", target));
        var result = await Service(provider).MoveDrawingRegisterFolderAsync(new() {
            ProjectFolderId = source, DesignName = "Scaffold", TargetProjectFolderId = target
        });
        Assert.Equal(drawing, result.FolderId);
        var write = Assert.Single(provider.Requests.Where(r => r.Method != HttpMethod.Get));
        Assert.Equal($"/rest/v1/folders?id=eq.{drawing:D}", write.Path);
        using var body = JsonDocument.Parse(write.Body);
        Assert.Equal(target, body.RootElement.GetProperty("parent_folder_id").GetGuid());
        Assert.DoesNotContain(provider.Requests, r => r.Path.Contains("design_documents") || r.Path.Contains("storage"));
    }

    [Fact]
    public async Task DuplicateDestinationNameDoesNotMoveAnything()
    {
        var target = Guid.NewGuid();
        var provider = new Provider(Folder(Guid.NewGuid(), "Scaffold"), Folder(target, "NEW PROJECT"),
            Folder(Guid.NewGuid(), " SCAFFOLD ", target));
        await Assert.ThrowsAsync<InvalidOperationException>(() => Service(provider).MoveDrawingRegisterFolderAsync(new() {
            ProjectFolderId = Guid.NewGuid(), DesignName = "Scaffold", TargetProjectFolderId = target
        }));
        Assert.All(provider.Requests, r => Assert.Equal(HttpMethod.Get, r.Method));
    }

    [Fact]
    public async Task DescendantDestinationDoesNotMoveAnything()
    {
        var drawing = Guid.NewGuid();
        var target = Guid.NewGuid();
        var provider = new Provider(Folder(drawing, "Scaffold"), Folder(target, "CHILD", drawing));
        await Assert.ThrowsAsync<InvalidOperationException>(() => Service(provider).MoveDrawingRegisterFolderAsync(new() {
            ProjectFolderId = Guid.NewGuid(), DesignName = "Scaffold", TargetProjectFolderId = target
        }));
        Assert.All(provider.Requests, r => Assert.Equal(HttpMethod.Get, r.Method));
    }

    [Fact]
    public async Task MissingSourceDoesNotMoveAnything()
    {
        var provider = new Provider("[]");
        await Assert.ThrowsAsync<InvalidOperationException>(() => Service(provider).MoveDrawingRegisterFolderAsync(new() {
            ProjectFolderId = Guid.NewGuid(), DesignName = "Scaffold", TargetProjectFolderId = Guid.NewGuid()
        }));
        Assert.Single(provider.Requests);
    }
}
