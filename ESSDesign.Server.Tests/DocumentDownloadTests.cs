using System.Net;
using System.Text;
using System.Text.Json;
using ESSDesign.Server.Controllers;
using ESSDesign.Server.Models;
using ESSDesign.Server.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace ESSDesign.Server.Tests;

public class DocumentDownloadTests
{
    private sealed class Documents : SupabaseService
    {
        public string CurrentVersion = "first";
        public int Reads;
        public Documents() : base(null!, NullLogger<SupabaseService>.Instance, null!, null!, new ConfigurationBuilder().Build()) { }
        public override Task<FileDownloadInfo> GetDocumentDownloadUrlAsync(Guid id, string type)
        {
            Reads++;
            return Task.FromResult(new FileDownloadInfo {
                Url = $"https://storage.test/{type}/{CurrentVersion}.pdf",
                FileName = $"Drawing {CurrentVersion}.pdf", Version = CurrentVersion,
            });
        }
        public override Task<UserInfo?> GetAuthUserInfoFromAccessTokenAsync(string token) => Task.FromResult<UserInfo?>(new() {Id = "test-user"});
    }

    private sealed class Storage : HttpMessageHandler, IHttpClientFactory
    {
        public readonly List<string> Requests = new();
        public HttpClient CreateClient(string name) => new(this, false);
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request.RequestUri!.AbsolutePath);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) {
                Content = new StringContent($"PDF bytes: {request.RequestUri.AbsolutePath}", Encoding.UTF8, "application/pdf"),
            });
        }
    }

    private static FoldersController Controller(Documents documents, Storage storage)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["AppSettings:FrontendUrl"] = "https://ess.test" }).Build();
        return new(documents, null!, null!, config, NullLogger<FoldersController>.Instance, storage) {
            ControllerContext = new ControllerContext {HttpContext = new DefaultHttpContext()},
        };
    }

    [Theory]
    [InlineData("ess", false)]
    [InlineData("thirdparty", false)]
    [InlineData("ess", true)]
    [InlineData("thirdparty", true)]
    public async Task AnExistingDownloadLinkServesReplacementBytes(string type, bool legacyRedirect)
    {
        var id = Guid.NewGuid(); var documents = new Documents(); var storage = new Storage();
        foreach (var version in new[] {"first", "replacement", "second-replacement"})
        {
            documents.CurrentVersion = version;
            var controller = Controller(documents, storage);
            // An old client cache key is a hint only, never a request for an old file.
            controller.Request.QueryString = new QueryString("?v=first");
            var result = legacyRedirect
                ? await controller.DownloadDocument(id, type, redirect: true)
                : await controller.DownloadDocumentFromEmail(id, type);
            var file = Assert.IsType<FileStreamResult>(result);
            using var reader = new StreamReader(file.FileStream);
            Assert.Equal($"PDF bytes: /{type}/{version}.pdf", await reader.ReadToEndAsync());
            Assert.Contains("no-store", controller.Response.Headers.CacheControl.ToString());
            Assert.DoesNotContain("max-age=3600", controller.Response.Headers.CacheControl.ToString());
            Assert.Contains(Uri.EscapeDataString($"Drawing {version}.pdf"), controller.Response.Headers.ContentDisposition.ToString());
        }
        Assert.Equal(3, documents.Reads);
    }

    [Fact]
    public async Task AuthenticatedLookupReturnsALastingDocumentLinkWithCurrentCacheIdentity()
    {
        var id = Guid.NewGuid(); var documents = new Documents(); var storage = new Storage();
        foreach (var version in new[] {"first", "replacement"})
        {
            documents.CurrentVersion = version;
            var controller = Controller(documents, storage);
            controller.Request.Headers.Authorization = "Bearer test-token";
            var result = Assert.IsType<OkObjectResult>(await controller.DownloadDocument(id, "ess"));
            var value = JsonSerializer.SerializeToElement(result.Value);
            Assert.Equal($"https://ess.test/api/folders/documents/{id:D}/public-download/ess?v={version}", value.GetProperty("url").GetString());
            Assert.Equal($"Drawing {version}.pdf", value.GetProperty("fileName").GetString());
            Assert.Contains("no-store", controller.Response.Headers.CacheControl.ToString());
        }
        Assert.Empty(storage.Requests); // Resolving metadata doesn't download a PDF.
    }

    [Fact]
    public async Task DownloadLookupStillRequiresAuthenticationAndFolderLinksStillRequireTheirToken()
    {
        var documents = new Documents(); var controller = Controller(documents, new Storage());
        Assert.IsType<UnauthorizedObjectResult>(await controller.DownloadDocument(Guid.NewGuid(), "ess"));
        var forbidden = Assert.IsType<ObjectResult>(await controller.DownloadSharedFolderDocument(Guid.NewGuid(), Guid.NewGuid(), "ess", "invalid"));
        Assert.Equal(403, forbidden.StatusCode);
        Assert.Equal(0, documents.Reads);
    }
}
