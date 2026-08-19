using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Caching.Memory;
using PDFtoImage;
using SkiaSharp;

namespace ESSDesign.Server.Services;

#pragma warning disable CA1416 // Production runs on Linux and local preview runs on supported macOS.

public sealed class ScaffTagPdfPreviewService
{
    private const long MaximumPdfBytes = 160L * 1024 * 1024;
    private const int MaximumPageCount = 200;
    private const int PreviewLongEdgePixels = 1400;
    private const int PreviewWebpQuality = 80;
    private const int HighQualityLongEdgePixels = 4200;
    private const int HighQualityWebpQuality = 92;

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IMemoryCache _cache;
    private readonly ILogger<ScaffTagPdfPreviewService> _logger;
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _documentLocks = new();
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _pageLocks = new();
    private readonly SemaphoreSlim _renderLock = new(1, 1);

    public ScaffTagPdfPreviewService(
        IHttpClientFactory httpClientFactory,
        IMemoryCache cache,
        ILogger<ScaffTagPdfPreviewService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _cache = cache;
        _logger = logger;
    }

    public static bool IsSupportedDocumentKind(string? documentKind) =>
        string.Equals(documentKind, "design", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(documentKind, "handover", StringComparison.OrdinalIgnoreCase);

    public async Task<ScaffTagPdfPreviewInfo> GetInfoAsync(
        string documentUrl,
        CancellationToken cancellationToken)
    {
        var document = await GetDocumentAsync(documentUrl, cancellationToken);
        return new ScaffTagPdfPreviewInfo(document.Pages);
    }

    public async Task<ScaffTagPdfPreviewPageContent> RenderPageAsync(
        string documentUrl,
        int pageNumber,
        string? quality,
        CancellationToken cancellationToken)
    {
        var document = await GetDocumentAsync(documentUrl, cancellationToken);
        if (pageNumber < 1 || pageNumber > document.Pages.Count)
        {
            throw new ScaffTagPdfPreviewException(
                $"Page {pageNumber} is outside this PDF's {document.Pages.Count} pages.",
                StatusCodes.Status404NotFound);
        }

        var (longEdgePixels, webpQuality) = quality?.Trim().ToLowerInvariant() switch
        {
            "zoom" or "detail" => (HighQualityLongEdgePixels, HighQualityWebpQuality),
            _ => (PreviewLongEdgePixels, PreviewWebpQuality),
        };
        var pageCacheKey = $"scaff-pdf-page:{document.ContentKey}:{pageNumber}:{longEdgePixels}:{webpQuality}";
        if (_cache.TryGetValue<ScaffTagPdfPreviewPageContent>(pageCacheKey, out var cachedPage) &&
            cachedPage != null)
        {
            return cachedPage;
        }

        var pageLock = _pageLocks.GetOrAdd(pageCacheKey, _ => new SemaphoreSlim(1, 1));
        await pageLock.WaitAsync(cancellationToken);
        try
        {
            if (_cache.TryGetValue<ScaffTagPdfPreviewPageContent>(pageCacheKey, out cachedPage) &&
                cachedPage != null)
            {
                return cachedPage;
            }

            await _renderLock.WaitAsync(cancellationToken);
            try
            {
                cancellationToken.ThrowIfCancellationRequested();
                var pageSize = document.Pages[pageNumber - 1];
                var renderOptions = pageSize.Width >= pageSize.Height
                    ? new RenderOptions(
                        Width: longEdgePixels,
                        Height: null,
                        WithAnnotations: true,
                        WithFormFill: true,
                        WithAspectRatio: true,
                        BackgroundColor: SKColors.White,
                        UseTiling: true)
                    : new RenderOptions(
                        Width: null,
                        Height: longEdgePixels,
                        WithAnnotations: true,
                        WithFormFill: true,
                        WithAspectRatio: true,
                        BackgroundColor: SKColors.White,
                        UseTiling: true);

                var renderedPage = await Task.Run(() =>
                {
                    using var bitmap = Conversion.ToImage(
                        document.Content,
                        pageNumber - 1,
                        options: renderOptions);
                    using var image = SKImage.FromBitmap(bitmap);
                    using var encoded = image.Encode(SKEncodedImageFormat.Webp, webpQuality);
                    if (encoded == null)
                    {
                        throw new InvalidOperationException("The rendered PDF page could not be encoded.");
                    }

                    return new ScaffTagPdfPreviewPageContent(encoded.ToArray(), "image/webp");
                });

                _cache.Set(
                    pageCacheKey,
                    renderedPage,
                    new MemoryCacheEntryOptions
                    {
                        SlidingExpiration = TimeSpan.FromMinutes(30),
                        Size = Math.Max(1, renderedPage.Content.LongLength),
                        Priority = CacheItemPriority.High
                    });
                return renderedPage;
            }
            finally
            {
                _renderLock.Release();
            }
        }
        catch (ScaffTagPdfPreviewException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "PDF preview rendering failed for page {PageNumber}", pageNumber);
            throw new ScaffTagPdfPreviewException(
                "This PDF page could not be prepared for mobile preview.",
                StatusCodes.Status422UnprocessableEntity,
                ex);
        }
        finally
        {
            pageLock.Release();
        }
    }

    private async Task<CachedPdfDocument> GetDocumentAsync(
        string documentUrl,
        CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(documentUrl, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp))
        {
            throw new ScaffTagPdfPreviewException(
                "The linked PDF address is invalid.",
                StatusCodes.Status422UnprocessableEntity);
        }

        var documentKey = CreateDocumentKey(documentUrl);
        var cacheKey = $"scaff-pdf-document:{documentKey}";
        if (_cache.TryGetValue<CachedPdfDocument>(cacheKey, out var cachedDocument) &&
            cachedDocument != null)
        {
            return cachedDocument;
        }

        var documentLock = _documentLocks.GetOrAdd(cacheKey, _ => new SemaphoreSlim(1, 1));
        await documentLock.WaitAsync(cancellationToken);
        try
        {
            if (_cache.TryGetValue<CachedPdfDocument>(cacheKey, out cachedDocument) &&
                cachedDocument != null)
            {
                return cachedDocument;
            }

            var client = _httpClientFactory.CreateClient();
            using var request = new HttpRequestMessage(HttpMethod.Get, uri);
            request.Headers.CacheControl = new System.Net.Http.Headers.CacheControlHeaderValue
            {
                NoCache = true,
                NoStore = true,
                MaxAge = TimeSpan.Zero
            };
            request.Headers.Pragma.ParseAdd("no-cache");
            using var response = await client.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                throw new ScaffTagPdfPreviewException(
                    "The linked PDF could not be downloaded.",
                    StatusCodes.Status502BadGateway);
            }

            if (response.Content.Headers.ContentLength is > MaximumPdfBytes)
            {
                throw new ScaffTagPdfPreviewException(
                    "This PDF is too large to prepare for mobile preview.",
                    StatusCodes.Status413PayloadTooLarge);
            }

            await using var sourceStream = await response.Content.ReadAsStreamAsync(cancellationToken);
            var content = await ReadWithLimitAsync(sourceStream, MaximumPdfBytes, cancellationToken);
            if (content.Length == 0)
            {
                throw new ScaffTagPdfPreviewException(
                    "The linked PDF is empty.",
                    StatusCodes.Status422UnprocessableEntity);
            }

            IReadOnlyList<ScaffTagPdfPreviewPage> pages;
            try
            {
                pages = await Task.Run(() =>
                    Conversion.GetPageSizes(content)
                        .Select(size => new ScaffTagPdfPreviewPage(
                            Math.Max(1, size.Width),
                            Math.Max(1, size.Height)))
                        .ToArray());
            }
            catch (Exception ex)
            {
                throw new ScaffTagPdfPreviewException(
                    "The linked file is not a readable PDF.",
                    StatusCodes.Status422UnprocessableEntity,
                    ex);
            }

            if (pages.Count == 0 || pages.Count > MaximumPageCount)
            {
                throw new ScaffTagPdfPreviewException(
                    pages.Count == 0
                        ? "The linked PDF has no pages."
                        : $"This PDF has more than the supported {MaximumPageCount} preview pages.",
                    StatusCodes.Status422UnprocessableEntity);
            }

            var contentKey = Convert.ToHexString(SHA256.HashData(content));
            var document = new CachedPdfDocument(contentKey, content, pages);
            _cache.Set(
                cacheKey,
                document,
                new MemoryCacheEntryOptions
                {
                    SlidingExpiration = TimeSpan.FromMinutes(10),
                    Size = Math.Max(1, content.LongLength + (pages.Count * 16L)),
                    Priority = CacheItemPriority.High
                });
            return document;
        }
        finally
        {
            documentLock.Release();
        }
    }

    private static string CreateDocumentKey(string documentUrl)
    {
        var stableAddress = documentUrl;
        if (Uri.TryCreate(documentUrl, UriKind.Absolute, out var uri))
        {
            stableAddress = uri.GetLeftPart(UriPartial.Path);

            // Signed Supabase URLs change whenever they are issued, so their token
            // cannot be part of the cache key. The explicit version is different:
            // it comes from ess_safety_forms.updated_at and changes whenever a
            // mutable handover PDF is rebuilt. Retaining it prevents an edited
            // handover from reusing the previously rendered PDF bytes/pages.
            var versionParameter = uri.Query
                .TrimStart('?')
                .Split('&', StringSplitOptions.RemoveEmptyEntries)
                .FirstOrDefault(parameter =>
                    parameter.StartsWith("v=", StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(versionParameter))
            {
                stableAddress = $"{stableAddress}?{versionParameter}";
            }
        }

        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(stableAddress)));
    }

    private static async Task<byte[]> ReadWithLimitAsync(
        Stream source,
        long maximumBytes,
        CancellationToken cancellationToken)
    {
        using var destination = new MemoryStream();
        var buffer = new byte[81_920];
        while (true)
        {
            var bytesRead = await source.ReadAsync(buffer, cancellationToken);
            if (bytesRead == 0)
            {
                break;
            }

            if (destination.Length + bytesRead > maximumBytes)
            {
                throw new ScaffTagPdfPreviewException(
                    "This PDF is too large to prepare for mobile preview.",
                    StatusCodes.Status413PayloadTooLarge);
            }

            await destination.WriteAsync(buffer.AsMemory(0, bytesRead), cancellationToken);
        }

        return destination.ToArray();
    }

    private sealed record CachedPdfDocument(
        string ContentKey,
        byte[] Content,
        IReadOnlyList<ScaffTagPdfPreviewPage> Pages);
}

public sealed record ScaffTagPdfPreviewInfo(IReadOnlyList<ScaffTagPdfPreviewPage> Pages);

public sealed record ScaffTagPdfPreviewPage(float Width, float Height);

public sealed record ScaffTagPdfPreviewPageContent(byte[] Content, string ContentType);

public sealed class ScaffTagPdfPreviewException : Exception
{
    public ScaffTagPdfPreviewException(string message, int statusCode, Exception? innerException = null)
        : base(message, innerException)
    {
        StatusCode = statusCode;
    }

    public int StatusCode { get; }
}

#pragma warning restore CA1416
