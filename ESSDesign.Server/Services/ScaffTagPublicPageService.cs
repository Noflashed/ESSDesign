using System.Text.Json;
using System.Text.Json.Serialization;

namespace ESSDesign.Server.Services;

public sealed class ScaffTagPublicPageService
{
    private readonly SupabaseService _supabaseService;
    private readonly ILogger<ScaffTagPublicPageService> _logger;

    public ScaffTagPublicPageService(
        SupabaseService supabaseService,
        ILogger<ScaffTagPublicPageService> logger)
    {
        _supabaseService = supabaseService;
        _logger = logger;
    }

    public async Task<ScaffTagPublicViewModel?> GetAsync(string tagRef)
    {
        if (!TryParseReference(tagRef, out var builderId, out var projectId, out var formId))
        {
            return null;
        }

        var details = await _supabaseService.GetScaffTagFormDetailsAsync(builderId, projectId, formId);
        if (details == null || string.IsNullOrWhiteSpace(details.PdfPath))
        {
            return null;
        }

        var pdfUrlTask = _supabaseService.GetSafetyStorageSignedUrlAsync(details.PdfPath, 60 * 60 * 24 * 14);
        var photoUrlTasks = details.PhotoPaths
            .Take(2)
            .Select(path => _supabaseService.GetSafetyStorageSignedUrlAsync(path, 60 * 60 * 24 * 7))
            .ToArray();
        var linkedDocumentsTask = _supabaseService.GetScaffTagLinkedDocumentsAsync(
            builderId,
            projectId,
            formId,
            details.HandoverFormId);
        var photoUrls = await Task.WhenAll(photoUrlTasks);

        var linkedDocuments = new ScaffTagLinkedDocuments();
        try
        {
            linkedDocuments = await linkedDocumentsTask;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Scaff-Tag {FormId} opened without linked-document navigation",
                formId);
        }

        var resolvedTagRef = Uri.EscapeDataString($"{builderId}:{projectId}:{formId}");
        var designUrl = linkedDocuments.DesignDocument == null
            ? string.Empty
            : $"/t/{resolvedTagRef}/design";
        var handoverUrl = string.IsNullOrWhiteSpace(linkedDocuments.HandoverPdfPath)
            ? string.Empty
            : $"/t/{resolvedTagRef}/handover";

        return ScaffTagPublicViewModel.From(
            details,
            await pdfUrlTask,
            photoUrls,
            designUrl,
            handoverUrl);
    }

    public async Task<string?> GetLatestDesignUrlAsync(string tagRef)
    {
        if (!TryParseReference(tagRef, out var builderId, out var projectId, out var formId))
        {
            return null;
        }

        var details = await _supabaseService.GetScaffTagFormDetailsAsync(builderId, projectId, formId);
        if (details == null)
        {
            return null;
        }

        var linkedDocuments = await _supabaseService.GetScaffTagLinkedDocumentsAsync(
            builderId,
            projectId,
            formId,
            details.HandoverFormId);
        if (linkedDocuments.DesignDocument == null)
        {
            return null;
        }

        var download = await _supabaseService.GetDocumentDownloadUrlAsync(
            linkedDocuments.DesignDocument.DocumentId,
            linkedDocuments.DesignDocument.DocumentType);
        return download.Url;
    }

    public async Task<string?> GetLatestHandoverUrlAsync(string tagRef)
    {
        if (!TryParseReference(tagRef, out var builderId, out var projectId, out var formId))
        {
            return null;
        }

        var details = await _supabaseService.GetScaffTagFormDetailsAsync(builderId, projectId, formId);
        if (details == null)
        {
            return null;
        }

        var linkedDocuments = await _supabaseService.GetScaffTagLinkedDocumentsAsync(
            builderId,
            projectId,
            formId,
            details.HandoverFormId);
        return string.IsNullOrWhiteSpace(linkedDocuments.HandoverPdfPath)
            ? null
            : await _supabaseService.GetSafetyStorageSignedUrlAsync(
                linkedDocuments.HandoverPdfPath,
                60 * 60 * 24 * 14);
    }

    public async Task<ScaffTagLinkedDocumentViewModel?> GetLinkedDocumentViewAsync(
        string tagRef,
        string documentKind)
    {
        if (!TryParseReference(tagRef, out var builderId, out var projectId, out var formId))
        {
            return null;
        }

        var details = await _supabaseService.GetScaffTagFormDetailsAsync(builderId, projectId, formId);
        if (details == null)
        {
            return null;
        }

        var linkedDocuments = await _supabaseService.GetScaffTagLinkedDocumentsAsync(
            builderId,
            projectId,
            formId,
            details.HandoverFormId);
        var resolvedTagRef = Uri.EscapeDataString($"{builderId}:{projectId}:{formId}");
        var scaffTagUrl = $"/t/{resolvedTagRef}";

        if (string.Equals(documentKind, "design", StringComparison.OrdinalIgnoreCase))
        {
            if (linkedDocuments.DesignDocument == null)
            {
                return null;
            }

            var download = await _supabaseService.GetDocumentDownloadUrlAsync(
                linkedDocuments.DesignDocument.DocumentId,
                linkedDocuments.DesignDocument.DocumentType);
            return new ScaffTagLinkedDocumentViewModel
            {
                CompanyEntityId = NormalizeCompanyEntityId(details.CompanyEntityId),
                PageTitle = "Design Drawing",
                DocumentName = download.FileName,
                DocumentUrl = download.Url,
                RightUrl = scaffTagUrl,
                RightLabel = "Scaff-Tag"
            };
        }

        if (!string.Equals(documentKind, "handover", StringComparison.OrdinalIgnoreCase) ||
            string.IsNullOrWhiteSpace(linkedDocuments.HandoverPdfPath))
        {
            return null;
        }

        return new ScaffTagLinkedDocumentViewModel
        {
            CompanyEntityId = NormalizeCompanyEntityId(details.CompanyEntityId),
            PageTitle = "Handover Form",
            DocumentName = string.IsNullOrWhiteSpace(details.ScaffoldName)
                ? "Latest linked handover"
                : details.ScaffoldName,
            DocumentUrl = await _supabaseService.GetSafetyStorageSignedUrlAsync(
                linkedDocuments.HandoverPdfPath,
                60 * 60 * 24 * 14),
            LeftUrl = scaffTagUrl,
            LeftLabel = "Scaff-Tag"
        };
    }

    private static string NormalizeCompanyEntityId(string? companyEntityId) =>
        string.Equals(companyEntityId, "maloo", StringComparison.OrdinalIgnoreCase)
            ? "maloo"
            : "ess";

    public static bool TryParseReference(
        string tagRef,
        out string builderId,
        out string projectId,
        out string formId)
    {
        builderId = string.Empty;
        projectId = string.Empty;
        formId = string.Empty;
        if (string.IsNullOrWhiteSpace(tagRef))
        {
            return false;
        }

        string decodedRef;
        try
        {
            decodedRef = Uri.UnescapeDataString(tagRef);
        }
        catch (UriFormatException)
        {
            return false;
        }

        var parts = decodedRef.Split(':', StringSplitOptions.TrimEntries);
        if (parts.Length != 3 || parts.Any(string.IsNullOrWhiteSpace))
        {
            return false;
        }

        builderId = parts[0];
        projectId = parts[1];
        formId = parts[2];
        return true;
    }
}

public sealed class ScaffTagLinkedDocumentViewModel
{
    public string CompanyEntityId { get; init; } = "ess";
    public string PageTitle { get; init; } = string.Empty;
    public string DocumentName { get; init; } = string.Empty;
    public string DocumentUrl { get; init; } = string.Empty;
    public string LeftUrl { get; init; } = string.Empty;
    public string LeftLabel { get; init; } = string.Empty;
    public string RightUrl { get; init; } = string.Empty;
    public string RightLabel { get; init; } = string.Empty;
}

public static class ScaffTagLinkedDocumentPageRenderer
{
    public static string Render(ScaffTagLinkedDocumentViewModel model)
    {
        var isMaloo = string.Equals(model.CompanyEntityId, "maloo", StringComparison.OrdinalIgnoreCase);
        var brandLogoUrl = isMaloo
            ? "https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/MALOO%20LOGO.png"
            : "https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png";
        var brandName = isMaloo ? "Maloo Access Group" : "Erect Safe Scaffolding";
        var pageTitle = System.Net.WebUtility.HtmlEncode(model.PageTitle);
        var documentName = System.Net.WebUtility.HtmlEncode(model.DocumentName);
        var documentUrl = System.Net.WebUtility.HtmlEncode(model.DocumentUrl);
        var leftUrl = System.Net.WebUtility.HtmlEncode(model.LeftUrl);
        var leftLabel = System.Net.WebUtility.HtmlEncode(model.LeftLabel);
        var rightUrl = System.Net.WebUtility.HtmlEncode(model.RightUrl);
        var rightLabel = System.Net.WebUtility.HtmlEncode(model.RightLabel);
        var leftNavigation = string.IsNullOrWhiteSpace(model.LeftUrl)
            ? string.Empty
            : $"""
              <a class="document-nav document-nav-left" href="{leftUrl}" data-direction="left" aria-label="Open {leftLabel}">
                <span class="document-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"></path></svg></span>
                <span class="document-nav-label">{leftLabel}</span>
              </a>
              """;
        var rightNavigation = string.IsNullOrWhiteSpace(model.RightUrl)
            ? string.Empty
            : $"""
              <a class="document-nav document-nav-right" href="{rightUrl}" data-direction="right" aria-label="Open {rightLabel}">
                <span class="document-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"></path></svg></span>
                <span class="document-nav-label">{rightLabel}</span>
              </a>
              """;

        return $$"""
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover" />
  <title>{{pageTitle}} · ESS</title>
  <style>
    * { box-sizing:border-box; }
    html, body { width:100%; height:100%; margin:0; }
    body { min-height:100dvh; overflow:hidden; background:rgba(32,35,39,.96); color:#fff; font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif; }
    .viewer { position:relative; width:100%; height:100dvh; overflow:hidden; background:rgba(32,35,39,.96); }
    .viewer-heading { position:fixed; top:max(8px,calc(env(safe-area-inset-top) + 6px)); left:50%; z-index:30; max-width:68vw; padding:6px 11px; border:1px solid rgba(255,255,255,.16); border-radius:999px; background:rgba(7,12,18,.42); -webkit-backdrop-filter:blur(7px); backdrop-filter:blur(7px); opacity:.68; transform:translateX(-50%); text-align:center; pointer-events:none; }
    .viewer-title { font-size:10px; line-height:1.15; font-weight:850; letter-spacing:1.1px; text-transform:uppercase; }
    .viewer-name { max-width:52vw; margin-top:2px; overflow:hidden; color:rgba(255,255,255,.82); font-size:8px; line-height:1.1; font-weight:650; text-overflow:ellipsis; white-space:nowrap; }
    .pdf-viewport { position:absolute; inset:0; overflow:auto; overscroll-behavior:contain; background:transparent; touch-action:pan-x pan-y; -webkit-overflow-scrolling:touch; scrollbar-width:none; scroll-snap-type:y mandatory; transition:opacity .18s ease,transform .18s ease; }
    .pdf-viewport::-webkit-scrollbar { width:0; height:0; display:none; }
    .pdf-viewport.is-zoomed,.pdf-viewport.is-pinching,.pdf-viewport.is-adjusting,.pdf-viewport.is-fit-width { scroll-snap-type:none; }
    .pdf-pages { min-width:100%; min-height:100%; transform-origin:center center; }
    .pdf-page-slot { min-width:100%; min-height:100%; display:flex; align-items:center; justify-content:center; scroll-snap-align:center; scroll-snap-stop:always; }
    .pdf-viewport.is-zoomed .pdf-page-slot:not(.is-current-page),.pdf-viewport.is-pinching .pdf-page-slot:not(.is-current-page) { visibility:hidden; }
    .pdf-page { display:block; flex:0 0 auto; border:1px solid rgba(255,255,255,.72); border-radius:3px; background:#fff; box-shadow:0 16px 48px rgba(0,0,0,.42); }
    .pdf-page-placeholder { width:58px; height:58px; display:grid; flex:0 0 auto; place-items:center; }
    .pdf-page-failure { display:flex; flex-direction:column; align-items:center; gap:9px; padding:14px 16px; border:1px solid rgba(255,255,255,.18); border-radius:12px; background:rgba(7,12,18,.58); color:rgba(255,255,255,.82); font-size:10px; font-weight:750; letter-spacing:.25px; text-align:center; }
    .pdf-page-failure button { min-height:32px; padding:0 13px; border:1px solid rgba(255,255,255,.28); border-radius:999px; background:rgba(255,255,255,.1); color:#fff; font:inherit; font-weight:850; }
    .pdf-page-failure button:active { background:rgba(255,255,255,.2); }
    .pdf-status { position:absolute; inset:0; z-index:3; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; padding:24px; color:rgba(255,255,255,.82); font-size:11px; font-weight:750; letter-spacing:.45px; text-align:center; }
    .pdf-status[hidden] { display:none; }
    .brand-loader { position:relative; width:104px; height:104px; display:grid; flex:0 0 auto; place-items:center; }
    .brand-loader-ring { position:absolute; inset:0; border:7px solid rgba(246,114,0,.2); border-top-color:#f67200; border-radius:50%; animation:viewer-spin .9s linear infinite; }
    .brand-loader-core { position:absolute; inset:10px; display:grid; place-items:center; overflow:hidden; padding:4px; border-radius:50%; background:#fff; box-shadow:0 8px 24px rgba(0,0,0,.28); }
    .brand-loader-logo { width:100%; height:100%; display:block; object-fit:contain; }
    .brand-loader.compact { width:52px; height:52px; }
    .brand-loader.compact .brand-loader-ring { border-width:4px; }
    .brand-loader.compact .brand-loader-core { inset:6px; padding:3px; }
    .pdf-error a { display:inline-block; margin-top:10px; color:#fff; font-weight:850; text-underline-offset:3px; }
    .pdf-toolbar { position:fixed; bottom:max(7px,env(safe-area-inset-bottom)); left:50%; z-index:35; height:36px; display:flex; align-items:center; gap:3px; padding:3px; border:1px solid rgba(255,255,255,.14); border-radius:999px; background:rgba(7,12,18,.48); opacity:.68; transform:translateX(-50%); -webkit-backdrop-filter:blur(8px); backdrop-filter:blur(8px); }
    .pdf-toolbar button { width:30px; height:28px; display:grid; place-items:center; padding:0; border:0; border-radius:50%; background:transparent; color:#fff; font-size:18px; line-height:1; font-weight:650; }
    .pdf-toolbar button:disabled { opacity:.28; }
    .pdf-toolbar button:active { background:rgba(255,255,255,.14); }
    .pdf-toolbar .pdf-toolbar-compact { font-size:10px; font-weight:800; }
    .pdf-toolbar .pdf-fit-mode { width:auto; min-width:39px; padding:0 7px; border-radius:999px; font-size:8px; font-weight:800; letter-spacing:.1px; }
    .pdf-toolbar-label { min-width:36px; color:rgba(255,255,255,.86); font-size:8px; line-height:1; font-weight:800; text-align:center; }
    .pdf-page-indicator { min-width:34px; padding:0 5px; border-left:1px solid rgba(255,255,255,.14); color:rgba(255,255,255,.72); font-size:8px; line-height:1; font-weight:750; text-align:center; }
    .document-navigation { position:fixed; inset:0; z-index:40; pointer-events:none; }
    .document-nav { position:absolute; top:50%; width:64px; display:flex; flex-direction:column; align-items:center; gap:5px; color:#fff; opacity:.62; text-decoration:none; pointer-events:auto; -webkit-tap-highlight-color:transparent; transition:opacity .16s ease; }
    .document-nav:hover,.document-nav:focus-visible,.document-nav:active { opacity:.94; }
    .document-nav:focus-visible { outline:0; }
    .document-nav-icon { width:44px; height:44px; display:grid; place-items:center; border:1px solid rgba(255,255,255,.68); border-radius:50%; background:rgba(7,18,31,.58); box-shadow:0 7px 22px rgba(0,0,0,.24); -webkit-backdrop-filter:blur(7px); backdrop-filter:blur(7px); }
    .document-nav svg { width:25px; height:25px; fill:none; stroke:currentColor; stroke-width:2.35; stroke-linecap:round; stroke-linejoin:round; }
    .document-nav-label { max-width:64px; padding:4px 6px; overflow:hidden; border:1px solid rgba(255,255,255,.14); border-radius:999px; background:rgba(7,12,18,.5); font-size:8px; line-height:1; font-weight:800; letter-spacing:.35px; text-align:center; text-overflow:ellipsis; white-space:nowrap; -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px); }
    .document-nav-left { left:max(1px,env(safe-area-inset-left)); animation:document-nudge-left 2.3s ease-in-out infinite; }
    .document-nav-right { right:max(1px,env(safe-area-inset-right)); animation:document-nudge-right 2.3s ease-in-out infinite; }
    @keyframes document-nudge-left { 0%,100% { transform:translateY(-50%) translateX(0); } 50% { transform:translateY(-50%) translateX(-3px); } }
    @keyframes document-nudge-right { 0%,100% { transform:translateY(-50%) translateX(0); } 50% { transform:translateY(-50%) translateX(3px); } }
    @keyframes viewer-spin { to { transform:rotate(360deg); } }
    body.is-leaving-left .pdf-viewport { opacity:0; transform:translateX(22px) scale(.985); }
    body.is-leaving-right .pdf-viewport { opacity:0; transform:translateX(-22px) scale(.985); }
    .navigation-loading { position:fixed; inset:0; z-index:90; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:13px; background:rgba(18,21,24,.78); color:rgba(255,255,255,.9); font-size:11px; font-weight:800; letter-spacing:.5px; opacity:0; visibility:hidden; pointer-events:none; transition:opacity .14s ease,visibility 0s linear .14s; -webkit-backdrop-filter:blur(5px); backdrop-filter:blur(5px); }
    .navigation-loading.is-visible { opacity:1; visibility:visible; pointer-events:auto; transition-delay:0s; }
    @media (min-width:700px) {
      .pdf-toolbar { height:42px; padding:4px; }
      .pdf-toolbar button { width:36px; height:32px; font-size:20px; }
      .pdf-toolbar .pdf-toolbar-compact { font-size:11px; }
      .pdf-toolbar .pdf-fit-mode { min-width:46px; padding:0 9px; font-size:9px; }
      .pdf-toolbar-label,.pdf-page-indicator { font-size:9px; }
      .document-nav { width:76px; }
      .document-nav-icon { width:52px; height:52px; }
      .document-nav svg { width:29px; height:29px; }
      .document-nav-label { max-width:76px; padding:5px 8px; font-size:9px; }
      .document-nav-left { left:max(5px,env(safe-area-inset-left)); }
      .document-nav-right { right:max(5px,env(safe-area-inset-right)); }
    }
    @media (prefers-reduced-motion:reduce) {
      .document-nav { animation:none; transform:translateY(-50%); }
      .pdf-viewport,.navigation-loading { transition:none; }
      .brand-loader-ring { animation:none; }
    }
  </style>
</head>
<body>
  <header class="viewer-heading" aria-label="Current document">
    <div class="viewer-title">{{pageTitle}}</div>
    <div class="viewer-name">{{documentName}}</div>
  </header>
  <nav id="documentNavigation" class="document-navigation" aria-label="Linked scaffold documents">
    {{leftNavigation}}
    {{rightNavigation}}
  </nav>
  <main class="viewer">
    <section id="pdfViewer" class="pdf-viewport" data-pdf-url="{{documentUrl}}" data-loader-logo="{{brandLogoUrl}}" data-loader-name="{{brandName}}" aria-label="{{pageTitle}} preview">
      <div id="pdfPages" class="pdf-pages" aria-live="polite" aria-busy="true"></div>
      <div id="pdfLoading" class="pdf-status" role="status"><span class="brand-loader" aria-hidden="true"><span class="brand-loader-ring"></span><span class="brand-loader-core"><img class="brand-loader-logo" src="{{brandLogoUrl}}" alt="" /></span></span><span>Preparing PDF preview</span></div>
      <div id="pdfError" class="pdf-status pdf-error" hidden><span>We could not render this PDF preview.</span><a href="{{documentUrl}}">Open the PDF directly</a></div>
    </section>
  </main>
  <div class="pdf-toolbar" aria-label="PDF zoom controls">
    <button id="pdfZoomOut" type="button" aria-label="Zoom out">&minus;</button>
    <span id="pdfZoomIndicator" class="pdf-toolbar-label">100%</span>
    <button id="pdfZoomFit" class="pdf-toolbar-compact" type="button" aria-label="Reset zoom to fitted size" title="Reset zoom">1&times;</button>
    <button id="pdfZoomIn" type="button" aria-label="Zoom in">+</button>
    <button id="pdfFitMode" class="pdf-fit-mode" type="button" aria-label="Fit PDF to screen width" title="Fit width">Page</button>
    <button id="pdfRotate" type="button" aria-label="Rotate PDF clockwise" title="Rotate clockwise">&#8635;</button>
    <span id="pdfPageIndicator" class="pdf-page-indicator" aria-live="polite">1 / 1</span>
  </div>
  <div id="navigationLoading" class="navigation-loading" role="status" aria-live="polite"><span class="brand-loader" aria-hidden="true"><span class="brand-loader-ring"></span><span class="brand-loader-core"><img class="brand-loader-logo" src="{{brandLogoUrl}}" alt="" /></span></span><span id="navigationLoadingLabel">Opening document</span></div>
  <script>
    document.getElementById('documentNavigation').addEventListener('click', event => {
      const link = event.target.closest('a.document-nav');
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const label = link.querySelector('.document-nav-label')?.textContent?.trim() || 'document';
      document.getElementById('navigationLoadingLabel').textContent = `Opening ${label}`;
      document.getElementById('navigationLoading').classList.add('is-visible');
      document.body.classList.add(`is-leaving-${link.dataset.direction}`);
      const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 140;
      window.setTimeout(() => window.location.assign(link.href), delay);
    });
  </script>
  <script type="module" src="https://essdesign.app/assets/scaff-pdf-viewer.js?v=8"></script>
</body>
</html>
""";
    }
}

public sealed class ScaffTagPublicViewModel
{
    [JsonPropertyName("builderName")]
    public string BuilderName { get; init; } = string.Empty;

    [JsonPropertyName("projectName")]
    public string ProjectName { get; init; } = string.Empty;

    [JsonPropertyName("companyEntityId")]
    public string CompanyEntityId { get; init; } = "ess";

    [JsonPropertyName("tagNumber")]
    public string TagNumber { get; init; } = string.Empty;

    [JsonPropertyName("scaffoldName")]
    public string ScaffoldName { get; init; } = string.Empty;

    [JsonPropertyName("jobLocation")]
    public string JobLocation { get; init; } = string.Empty;

    [JsonPropertyName("dateErected")]
    public string DateErected { get; init; } = string.Empty;

    [JsonPropertyName("requestedBy")]
    public string RequestedBy { get; init; } = string.Empty;

    [JsonPropertyName("erectedBy")]
    public string ErectedBy { get; init; } = string.Empty;

    [JsonPropertyName("inspectedBy")]
    public string InspectedBy { get; init; } = string.Empty;

    [JsonPropertyName("erectedBySignatureStrokes")]
    public List<List<ScaffTagSignaturePoint>> ErectedBySignatureStrokes { get; init; } = new();

    [JsonPropertyName("fallProtectionRequired")]
    public string FallProtectionRequired { get; init; } = string.Empty;

    [JsonPropertyName("loadRating")]
    public string LoadRating { get; init; } = string.Empty;

    [JsonPropertyName("loadRatingOther")]
    public string LoadRatingOther { get; init; } = string.Empty;

    [JsonPropertyName("checkHandrails")]
    public bool CheckHandrails { get; init; }

    [JsonPropertyName("checkPlatform")]
    public bool CheckPlatform { get; init; }

    [JsonPropertyName("checkMidRails")]
    public bool CheckMidRails { get; init; }

    [JsonPropertyName("checkLadder")]
    public bool CheckLadder { get; init; }

    [JsonPropertyName("checkToeBoards")]
    public bool CheckToeBoards { get; init; }

    [JsonPropertyName("checkOther")]
    public bool CheckOther { get; init; }

    [JsonPropertyName("checkOtherText")]
    public string CheckOtherText { get; init; } = string.Empty;

    [JsonPropertyName("inspectionRecords")]
    public List<ScaffTagInspectionRecord> InspectionRecords { get; init; } = new();

    [JsonPropertyName("photoUrls")]
    public List<string> PhotoUrls { get; init; } = new();

    [JsonPropertyName("pdfUrl")]
    public string PdfUrl { get; init; } = string.Empty;

    [JsonPropertyName("designUrl")]
    public string DesignUrl { get; init; } = string.Empty;

    [JsonPropertyName("handoverUrl")]
    public string HandoverUrl { get; init; } = string.Empty;

    [JsonPropertyName("updatedAt")]
    public DateTimeOffset? UpdatedAt { get; init; }

    public static ScaffTagPublicViewModel From(
        ScaffTagFormDetails details,
        string pdfUrl,
        IEnumerable<string> photoUrls,
        string designUrl,
        string handoverUrl) => new()
    {
        BuilderName = details.BuilderName ?? string.Empty,
        ProjectName = details.ProjectName ?? string.Empty,
        CompanyEntityId = string.Equals(details.CompanyEntityId, "maloo", StringComparison.OrdinalIgnoreCase)
            ? "maloo"
            : "ess",
        TagNumber = details.TagNumber ?? string.Empty,
        ScaffoldName = details.ScaffoldName ?? string.Empty,
        JobLocation = details.JobLocation ?? string.Empty,
        DateErected = details.DateErected ?? string.Empty,
        RequestedBy = details.RequestedBy ?? string.Empty,
        ErectedBy = details.ErectedBy ?? string.Empty,
        InspectedBy = details.InspectedBy ?? string.Empty,
        ErectedBySignatureStrokes = details.ErectedBySignatureStrokes,
        FallProtectionRequired = details.FallProtectionRequired ?? string.Empty,
        LoadRating = details.LoadRating ?? string.Empty,
        LoadRatingOther = details.LoadRatingOther ?? string.Empty,
        CheckHandrails = details.CheckHandrails,
        CheckPlatform = details.CheckPlatform,
        CheckMidRails = details.CheckMidRails,
        CheckLadder = details.CheckLadder,
        CheckToeBoards = details.CheckToeBoards,
        CheckOther = details.CheckOther,
        CheckOtherText = details.CheckOtherText ?? string.Empty,
        InspectionRecords = details.InspectionRecords.Take(10).ToList(),
        PhotoUrls = photoUrls.Where(url => !string.IsNullOrWhiteSpace(url)).Take(2).ToList(),
        PdfUrl = pdfUrl,
        DesignUrl = designUrl,
        HandoverUrl = handoverUrl,
        UpdatedAt = details.UpdatedAt,
    };
}

public static class ScaffTagPublicPageRenderer
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static string Render(ScaffTagPublicViewModel model)
    {
        var initialJson = JsonSerializer.Serialize(model, JsonOptions);
        var loaderLogoUrl = string.Equals(model.CompanyEntityId, "maloo", StringComparison.OrdinalIgnoreCase)
            ? "https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/MALOO%20LOGO.png"
            : "https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png";
        return $$$"""
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover" />
  <title>Interactive Scaff-Tag</title>
  <style>
    :root { color-scheme: light; --green:#0b4f2f; --green-2:#0b7f45; --line:#8da9be; --yellow:#f7d319; --ink:#111827; }
    * { box-sizing:border-box; }
    html, body { margin:0; min-height:100%; }
    body { min-height:100dvh; overflow:hidden; touch-action:pan-x pan-y pinch-zoom; font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif; color:var(--ink); background:rgba(32,35,39,.96); }
    button, a { font:inherit; }
    .app { width:100%; height:100dvh; min-height:0; display:flex; align-items:center; justify-content:center; padding:max(4px,env(safe-area-inset-top)) max(4px,env(safe-area-inset-right)) max(4px,env(safe-area-inset-bottom)) max(4px,env(safe-area-inset-left)); background:rgba(32,35,39,.96); }
    .stage { position:relative; width:min(calc(100% - 96px),460px); height:90%; min-height:0; max-height:930px; perspective:1600px; touch-action:pan-y pinch-zoom; user-select:none; -webkit-user-select:none; cursor:pointer; outline:none; }
    .flipper { width:100%; height:100%; position:relative; transform-style:preserve-3d; transition:transform .68s cubic-bezier(.2,.72,.18,1); }
    .flipper.is-back { transform:rotateY(180deg); }
    .face { position:absolute; inset:0; overflow:hidden; backface-visibility:hidden; -webkit-backface-visibility:hidden; border-radius:10px; background:transparent; }
    .back { transform:rotateY(180deg); background:transparent; }
    .flip-hint { position:absolute; inset:0; z-index:10; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; border-radius:10px; background:rgba(5,8,10,.78); -webkit-backdrop-filter:blur(1.5px); backdrop-filter:blur(1.5px); opacity:0; visibility:hidden; pointer-events:none; }
    .flip-hint.is-visible { visibility:visible; animation:flip-hint-veil 2.15s ease both; }
    .flip-hint-icon { width:82px; height:82px; display:block; object-fit:contain; filter:invert(1) brightness(1.18) contrast(1.1); animation:flip-hint-touch 1.05s ease-in-out 2; }
    .flip-hint-label { color:#fff; font-size:17px; line-height:1.2; letter-spacing:.15px; font-weight:850; text-align:center; }
    @keyframes flip-hint-veil { 0% { opacity:0; } 12%,72% { opacity:1; } 100% { opacity:0; } }
    @keyframes flip-hint-touch { 0%,100% { transform:scale(1); } 46% { transform:scale(.9); } 68% { transform:scale(1.04); } }
    .tag { position:absolute; top:0; left:0; width:100%; overflow:hidden; transform-origin:top left; border:2px solid var(--green); border-radius:10px; background:var(--green); }
    .tag.back-tag { border-color:#d6b100; background:var(--yellow); }
    .brand { min-height:76px; display:flex; align-items:center; gap:12px; padding:8px 13px; background:#fff; }
    .brand img { width:88px; height:54px; object-fit:contain; }
    .brand-copy { min-width:0; }
    .brand-title { font-size:23px; line-height:1.05; letter-spacing:.35px; font-weight:850; }
    .brand-sub { margin-top:4px; color:#374151; font-size:9px; line-height:1.25; font-weight:700; }
    .brand-company { margin-top:2px; color:var(--green); font-size:9px; line-height:1.25; font-weight:850; }
    .band { min-height:32px; display:flex; align-items:center; justify-content:center; padding:6px 10px; border-top:1px solid #b8d9c7; border-bottom:1px solid #b8d9c7; background:var(--green); color:#fff; font-size:12px; letter-spacing:.55px; font-weight:900; text-align:center; }
    .details { padding:9px 13px 10px; background:var(--green); }
    .field-row { min-height:32px; display:grid; grid-template-columns:78px minmax(0,1fr); align-items:center; gap:7px; margin-bottom:4px; }
    .field-label { color:#fff; font-size:12px; line-height:1.2; font-weight:900; }
    .field-value { min-height:28px; display:flex; align-items:center; padding:5px 8px; overflow-wrap:anywhere; border:1px solid #b8d9c7; background:#fff; color:var(--ink); font-size:12px; line-height:1.2; font-weight:800; }
    .rule { margin-top:6px; padding-top:8px; border-top:1px solid #b8d9c7; }
    .fall { display:flex; align-items:center; justify-content:space-between; gap:8px; color:#fff; font-size:11px; font-weight:900; text-transform:uppercase; }
    .choices { display:flex; gap:12px; }
    .choice, .component { display:flex; align-items:center; gap:5px; }
    .box { width:18px; height:18px; flex:0 0 auto; display:flex; align-items:center; justify-content:center; border:1px solid #b8d9c7; background:#fff; color:var(--green); font-size:14px; line-height:1; font-weight:900; }
    .load-grid { display:grid; grid-template-columns:minmax(0,1.25fr) minmax(0,.75fr); gap:10px; color:#fff; }
    .load-list { display:grid; gap:4px; }
    .load-row { min-height:21px; display:flex; align-items:center; justify-content:space-between; gap:7px; font-size:11px; line-height:1.15; font-weight:900; }
    .load-note { font-size:9px; line-height:1.4; letter-spacing:.15px; font-weight:900; text-transform:uppercase; }
    .other-value { grid-column:1/-1; padding:5px 7px; background:#fff; color:var(--ink); font-size:10px; font-weight:750; }
    .components-title { color:#fff; font-size:11px; letter-spacing:.25px; font-weight:900; text-transform:uppercase; }
    .components-grid { margin-top:6px; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px 5px; color:#fff; font-size:9px; line-height:1.2; font-weight:850; text-transform:uppercase; }
    .section-title { min-height:34px; display:flex; align-items:center; justify-content:center; padding:5px; background:#fff; border-bottom:1px solid var(--line); font-size:17px; letter-spacing:.45px; font-weight:900; text-align:center; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; background:#fff; }
    th, td { height:36px; padding:4px; border-right:1px solid var(--line); border-bottom:1px solid var(--line); color:var(--ink); font-size:9px; line-height:1.15; font-weight:800; text-align:center; overflow-wrap:anywhere; }
    th { height:35px; font-size:10px; font-weight:900; }
    th:last-child, td:last-child { border-right:0; }
    .auth-date { width:20%; } .auth-time { width:18%; } .auth-name { width:29%; } .auth-sign { width:33%; }
    .signature { width:100%; height:31px; display:block; }
    .signature-inline { width:100%; }
    .signature polyline { fill:none; stroke:#000; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; vector-effect:non-scaling-stroke; }
    .caution { min-height:76px; display:flex; align-items:center; justify-content:space-around; gap:10px; padding:10px 15px; border-top:1px solid #d6b100; background:var(--yellow); }
    .warning-box { width:34px; height:34px; flex:0 0 auto; display:flex; align-items:center; justify-content:center; border:3px solid var(--ink); font-size:23px; font-weight:900; }
    .caution-copy { text-align:center; }
    .caution-title { font-size:16px; letter-spacing:.6px; font-weight:900; }
    .caution-sub { margin-top:2px; font-size:8px; letter-spacing:.25px; font-weight:900; }
    .warning { padding:16px 22px 11px; text-align:center; background:var(--yellow); }
    .warning .warning-box { width:50px; height:50px; margin:0 auto; font-size:34px; border-width:4px; }
    .warning-title { margin-top:4px; font-size:21px; letter-spacing:.8px; font-weight:900; }
    .warning-text { margin:3px auto 0; max-width:360px; font-size:11px; line-height:1.4; letter-spacing:.2px; font-weight:900; }
    .reverse-band { min-height:28px; display:flex; align-items:center; justify-content:center; padding:5px 8px; background:var(--green); color:#fff; font-size:11px; letter-spacing:.25px; font-weight:900; text-align:center; }
    .reverse-details { padding:6px 11px 8px; background:var(--green); }
    .reverse-row { min-height:29px; display:grid; grid-template-columns:106px minmax(0,1fr); align-items:center; padding:4px 8px; border-bottom:2px solid var(--green); background:#fff; }
    .reverse-row.signature-row { min-height:45px; border-bottom:0; }
    .reverse-label { font-size:11px; font-weight:900; }
    .reverse-value { min-width:0; overflow-wrap:anywhere; font-size:11px; font-weight:800; }
    .standard { margin-top:7px; color:#fff; font-size:9px; line-height:1.35; font-weight:800; text-align:center; }
    .note-date { width:27%; }
    .photos-title { min-height:39px; display:flex; align-items:center; justify-content:center; border-top:1px solid #d6b100; background:var(--yellow); font-size:13px; letter-spacing:.45px; font-weight:900; }
    .photos { height:150px; min-height:150px; display:grid; grid-template-columns:1fr 1fr; border-top:1px solid #d6b100; background:var(--yellow); overflow:hidden; }
    .photo { width:100%; height:150px; min-height:0; display:flex; align-items:center; justify-content:center; overflow:hidden; padding:0; border:0; border-right:1px solid #d6b100; background:#fff9cf; color:#6b5a00; font:inherit; font-size:11px; font-weight:800; }
    button.photo { cursor:zoom-in; }
    button.photo:focus-visible { outline:3px solid rgba(255,255,255,.9); outline-offset:-4px; }
    .photo:last-child { border-right:0; }
    .photo img { width:100%; height:150px; min-height:0; object-fit:cover; display:block; }
    .photo-viewer { position:fixed; inset:0; z-index:100; display:flex; align-items:center; justify-content:center; padding:max(24px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left)); background:rgba(8,10,12,.94); opacity:0; visibility:hidden; pointer-events:none; transition:opacity .2s ease,visibility 0s linear .2s; }
    .photo-viewer.is-open { opacity:1; visibility:visible; pointer-events:auto; transition-delay:0s; }
    .photo-viewer-image { max-width:100%; max-height:100%; display:block; object-fit:contain; border-radius:4px; opacity:0; transform:scale(.84); transition:opacity .18s ease,transform .24s cubic-bezier(.2,.78,.2,1); }
    .photo-viewer.is-open .photo-viewer-image { opacity:1; transform:scale(1); }
    .photo-viewer-close { position:absolute; top:max(12px,env(safe-area-inset-top)); right:max(12px,env(safe-area-inset-right)); z-index:1; width:44px; height:44px; display:flex; align-items:center; justify-content:center; padding:0; border:1px solid rgba(255,255,255,.32); border-radius:50%; background:rgba(17,24,39,.72); color:#fff; font-size:30px; line-height:1; font-weight:400; cursor:pointer; }
    .photo-viewer-close:focus-visible { outline:3px solid #fff; outline-offset:2px; }
    .document-navigation { position:fixed; inset:0; z-index:40; pointer-events:none; }
    .document-nav { position:absolute; top:50%; width:64px; display:flex; flex-direction:column; align-items:center; gap:5px; color:#fff; opacity:.62; text-decoration:none; pointer-events:auto; -webkit-tap-highlight-color:transparent; transition:opacity .16s ease; }
    .document-nav:hover,.document-nav:focus-visible,.document-nav:active { opacity:.94; }
    .document-nav:focus-visible { outline:0; }
    .document-nav-icon { width:44px; height:44px; display:grid; place-items:center; border:1px solid rgba(255,255,255,.68); border-radius:50%; background:rgba(7,18,31,.58); box-shadow:0 7px 22px rgba(0,0,0,.24); -webkit-backdrop-filter:blur(7px); backdrop-filter:blur(7px); }
    .document-nav svg { width:25px; height:25px; fill:none; stroke:currentColor; stroke-width:2.35; stroke-linecap:round; stroke-linejoin:round; }
    .document-nav-label { max-width:64px; padding:4px 6px; overflow:hidden; border:1px solid rgba(255,255,255,.14); border-radius:999px; background:rgba(7,12,18,.5); font-size:8px; line-height:1; font-weight:800; letter-spacing:.35px; text-align:center; text-overflow:ellipsis; white-space:nowrap; -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px); }
    .document-nav-left { left:max(1px,env(safe-area-inset-left)); animation:document-nudge-left 2.3s ease-in-out infinite; }
    .document-nav-right { right:max(1px,env(safe-area-inset-right)); animation:document-nudge-right 2.3s ease-in-out infinite; }
    @keyframes document-nudge-left { 0%,100% { transform:translateY(-50%) translateX(0); } 50% { transform:translateY(-50%) translateX(-4px); } }
    @keyframes document-nudge-right { 0%,100% { transform:translateY(-50%) translateX(0); } 50% { transform:translateY(-50%) translateX(4px); } }
    @keyframes leave-to-design { to { opacity:0; transform:translateX(24px); } }
    @keyframes leave-to-handover { to { opacity:0; transform:translateX(-24px); } }
    body.is-leaving-left .stage { animation:leave-to-design .18s ease-in forwards; }
    body.is-leaving-right .stage { animation:leave-to-handover .18s ease-in forwards; }
    .navigation-loading { position:fixed; inset:0; z-index:110; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:13px; background:rgba(18,21,24,.78); color:rgba(255,255,255,.9); font-size:11px; font-weight:800; letter-spacing:.5px; opacity:0; visibility:hidden; pointer-events:none; transition:opacity .14s ease,visibility 0s linear .14s; -webkit-backdrop-filter:blur(5px); backdrop-filter:blur(5px); }
    .navigation-loading.is-visible { opacity:1; visibility:visible; pointer-events:auto; transition-delay:0s; }
    .brand-loader { position:relative; width:104px; height:104px; display:grid; flex:0 0 auto; place-items:center; }
    .brand-loader-ring { position:absolute; inset:0; border:7px solid rgba(246,114,0,.2); border-top-color:#f67200; border-radius:50%; animation:navigation-spin .9s linear infinite; }
    .brand-loader-core { position:absolute; inset:10px; display:grid; place-items:center; overflow:hidden; padding:4px; border-radius:50%; background:#fff; box-shadow:0 8px 24px rgba(0,0,0,.28); }
    .brand-loader-logo { width:100%; height:100%; display:block; object-fit:contain; }
    @keyframes navigation-spin { to { transform:rotate(360deg); } }
    .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
    @media (min-width:700px) { .app { padding:18px; } .stage { width:min(92%,460px); height:92%; } .document-nav { width:76px; } .document-nav-icon { width:52px; height:52px; } .document-nav svg { width:29px; height:29px; } .document-nav-label { max-width:76px; padding:5px 8px; font-size:9px; } .document-nav-left { left:max(5px,env(safe-area-inset-left)); } .document-nav-right { right:max(5px,env(safe-area-inset-right)); } }
    @media (prefers-reduced-motion:reduce) { .flipper { transition:none; } .flip-hint.is-visible { animation:none; opacity:1; } .flip-hint-icon { animation:none; } .photo-viewer,.photo-viewer-image,.navigation-loading { transition:none; } .document-nav { animation:none; transform:translateY(-50%); } .brand-loader-ring { animation:none; } body.is-leaving-left .stage,body.is-leaving-right .stage { animation:none; } }
  </style>
</head>
<body>
  <nav id="documentNavigation" class="document-navigation" aria-label="Linked scaffold documents"></nav>
  <div id="navigationLoading" class="navigation-loading" role="status" aria-live="polite"><span class="brand-loader" aria-hidden="true"><span class="brand-loader-ring"></span><span class="brand-loader-core"><img class="brand-loader-logo" src="{{{loaderLogoUrl}}}" alt="" /></span></span><span id="navigationLoadingLabel">Opening document</span></div>
  <main class="app">
    <div id="stage" class="stage" role="button" tabindex="0" aria-label="Flip Scaff-Tag to view the back" aria-pressed="false">
      <div id="flipper" class="flipper">
        <section id="front" class="face front" aria-label="Scaff-Tag front"></section>
        <section id="back" class="face back" aria-label="Scaff-Tag back"></section>
      </div>
      <div id="flipHint" class="flip-hint" aria-hidden="true">
        <img class="flip-hint-icon" src="data:image/png;base64,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" alt="" />
        <div class="flip-hint-label">Tap to flip</div>
      </div>
    </div>
    <div id="announce" class="sr-only" aria-live="polite"></div>
  </main>
  <div id="photoViewer" class="photo-viewer" role="dialog" aria-modal="true" aria-label="Enlarged site photo" aria-hidden="true">
    <button id="photoViewerClose" class="photo-viewer-close" type="button" aria-label="Close enlarged photo">&times;</button>
    <img id="photoViewerImage" class="photo-viewer-image" alt="" />
  </div>
  <script>
    const initialTag = {{{initialJson}}};
    const dataUrl = `${window.location.pathname.replace(/\/$/, '')}/data`;
    const essLogo = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png';
    const malooLogo = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/MALOO%20LOGO.png';
    const loadLabels = {
      LIGHT_DUTY:'Light Duty 225KG', MEDIUM_DUTY:'Medium Duty 450KG', HEAVY_DUTY:'Heavy Duty 675KG',
      SEE_ENGINEERING:'See Engineering Drawing', OTHER:'Other'
    };
    let tag = initialTag;
    let isBack = false;
    let pointerStart = null;
    let pinchInProgress = false;
    let fitFrame = 0;
    const activePointers = new Set();

    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const checked = value => `<span class="box" aria-hidden="true">${value ? '✓' : ''}</span>`;
    const signature = (strokes, inline = false) => {
      if (!Array.isArray(strokes) || strokes.length === 0) return '<span></span>';
      const validPoints = strokes
        .flatMap(stroke => Array.isArray(stroke) ? stroke : [])
        .filter(point => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)));
      const minimumX = inline && validPoints.length > 0
        ? Math.min(...validPoints.map(point => Math.max(0, Math.min(1, Number(point.x)))))
        : 0;
      const leftPadding = inline ? 1 : 0;
      const lines = strokes.map(stroke => {
        if (!Array.isArray(stroke) || stroke.length === 0) return '';
        const points = stroke.map(point => {
          const normalizedX = Math.max(0, Math.min(1, Number(point?.x) || 0));
          const x = leftPadding + (normalizedX - minimumX) * (100 - leftPadding);
          const y = Math.max(0, Math.min(1, Number(point?.y) || 0)) * 40;
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        }).join(' ');
        return `<polyline points="${points}"></polyline>`;
      }).join('');
      const className = inline ? 'signature signature-inline' : 'signature';
      const alignment = inline ? 'none' : 'xMidYMid meet';
      return `<svg class="${className}" viewBox="0 0 100 40" preserveAspectRatio="${alignment}" aria-label="Digital signature">${lines}</svg>`;
    };
    const company = () => tag.companyEntityId === 'maloo'
      ? { logo:malooLogo, legal:'Maloo Access Group Pty Ltd', address:'130 Gilba Road, Girraween NSW 2145', phone:'(02) 8818 3690' }
      : { logo:essLogo, legal:'Erect Safe Scaffolding (Sydney) Pty Ltd', address:'130 Gilba Road, Girraween NSW 2145', phone:'(02) 8818 3690' };
    const inspectionRows = count => Array.from({length:count}, (_, index) => tag.inspectionRecords?.[index] || {});
    const loadRow = (key, label) => `<div class="load-row"><span>${label}</span>${checked(tag.loadRating === key)}</div>`;
    const component = (label, value) => `<div class="component">${checked(value)}<span>${label}</span></div>`;

    function renderDocumentNavigation() {
      const navigation = document.getElementById('documentNavigation');
      const design = tag.designUrl
        ? `<a class="document-nav document-nav-left" href="${esc(tag.designUrl)}" data-direction="left" aria-label="Open latest design document"><span class="document-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"></path></svg></span><span class="document-nav-label">Design</span></a>`
        : '';
      const handover = tag.handoverUrl
        ? `<a class="document-nav document-nav-right" href="${esc(tag.handoverUrl)}" data-direction="right" aria-label="Open latest handover form"><span class="document-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"></path></svg></span><span class="document-nav-label">Handover</span></a>`
        : '';
      navigation.innerHTML = design + handover;
    }

    function renderFront() {
      const entity = company();
      const rows = inspectionRows(10).map(row => `<tr><td>${esc(row.date)}</td><td>${esc(row.time)}</td><td>${esc(row.competentPerson)}</td><td>${signature(row.signatureStrokes)}</td></tr>`).join('');
      return `<article class="tag">
        <header class="brand"><img src="${entity.logo}" alt="${esc(entity.legal)}" /><div class="brand-copy"><div class="brand-title">SCAFFOLD TAG</div><div class="brand-sub">${esc(entity.address)}</div><div class="brand-company">${esc(entity.legal)} · ${esc(entity.phone)}</div></div></header>
        <div class="band">ERECTION AND INSPECTION RECORD</div>
        <section class="details">
          <div class="field-row"><span class="field-label">Location:</span><span class="field-value">${esc(tag.projectName || tag.jobLocation)}</span></div>
          <div class="field-row"><span class="field-label">Scaffold:</span><span class="field-value">${esc(tag.scaffoldName)}</span></div>
          <div class="field-row"><span class="field-label">Ref. No.:</span><span class="field-value">No. ${esc(tag.tagNumber)}</span></div>
          <div class="rule fall"><span>Fall protection required</span><span class="choices"><span class="choice">${checked(tag.fallProtectionRequired === 'YES')}YES</span><span class="choice">${checked(tag.fallProtectionRequired === 'NO')}NO</span></span></div>
          <div class="rule load-grid"><div class="load-list">${loadRow('LIGHT_DUTY','Light Duty 225KG')}${loadRow('MEDIUM_DUTY','Medium Duty 450KG')}${loadRow('HEAVY_DUTY','Heavy Duty 675KG')}${loadRow('SEE_ENGINEERING','See Engineering Drawing')}${loadRow('OTHER','Other')}</div><div class="load-note">THE ABOVE WEIGHTS ARE FOR ONE WORKING PLATFORM ONLY AND INCLUDES MEN AND MATERIALS.</div>${tag.loadRating === 'OTHER' ? `<div class="other-value">${esc(tag.loadRatingOther)}</div>` : ''}</div>
          <div class="rule"><div class="components-title">Scaffold components complete</div><div class="components-grid">${component('Handrails',tag.checkHandrails)}${component('Platform',tag.checkPlatform)}${component('Mid rails',tag.checkMidRails)}${component('Ladder',tag.checkLadder)}${component('Toe boards',tag.checkToeBoards)}${component('Other',tag.checkOther)}</div>${tag.checkOther && tag.checkOtherText ? `<div class="other-value" style="margin-top:7px">${esc(tag.checkOtherText)}</div>` : ''}</div>
        </section>
        <div class="section-title">AUTHORISED PERSON</div>
        <table aria-label="Authorised person inspection records"><thead><tr><th class="auth-date">DATE</th><th class="auth-time">TIME</th><th class="auth-name">NAME</th><th class="auth-sign">SIGNATURE</th></tr></thead><tbody>${rows}</tbody></table>
        <footer class="caution"><span class="warning-box">!</span><div class="caution-copy"><div class="caution-title">CAUTION</div><div class="caution-sub">BE AWARE OF THE FOLLOWING SCAFFOLD HAZARDS</div></div><span class="warning-box">!</span></footer>
      </article>`;
    }

    function renderBack() {
      const rows = inspectionRows(8).map(row => `<tr><td>${esc(row.date)}</td><td>${esc(row.note)}</td></tr>`).join('');
      const photos = Array.from({length:2}, (_, index) => tag.photoUrls?.[index]
        ? `<button class="photo" type="button" data-photo-url="${esc(tag.photoUrls[index])}" data-photo-alt="Scaff-Tag site photo ${index + 1}" aria-label="Enlarge Scaff-Tag site photo ${index + 1}"><img src="${esc(tag.photoUrls[index])}" alt="Scaff-Tag site photo ${index + 1}" loading="lazy" /></button>`
        : `<div class="photo">Photo ${index + 1}</div>`).join('');
      return `<article class="tag back-tag">
        <header class="warning"><span class="warning-box">!</span><div class="warning-title">WARNING</div><div class="warning-text">UNLAWFUL REMOVAL OR INTERFERENCE WITH THIS TAG COULD MAKE YOU LIABLE TO PROSECUTION AND FINES</div></header>
        <div class="reverse-band">MUST BE FILLED OUT BY AUTHORISED PERSON</div>
        <section class="reverse-details">
          <div class="reverse-row"><span class="reverse-label">REQUESTED BY:</span><span class="reverse-value">${esc(tag.requestedBy)}</span></div>
          <div class="reverse-row"><span class="reverse-label">BUILT BY:</span><span class="reverse-value">${esc(tag.erectedBy)}</span></div>
          <div class="reverse-row"><span class="reverse-label">DATE:</span><span class="reverse-value">${esc(tag.dateErected)}</span></div>
          <div class="reverse-row"><span class="reverse-label">INSPECTED BY:</span><span class="reverse-value">${esc(tag.inspectedBy)}</span></div>
          <div class="reverse-row signature-row"><span class="reverse-label">SIGNATURE:</span><span class="reverse-value">${signature(tag.erectedBySignatureStrokes, true)}</span></div>
          <div class="standard">Built in accordance with AS/NZS 1576 &amp; AS/NZS 4576</div>
        </section>
        <div class="section-title">COMPLIANCE NOTE</div>
        <table aria-label="Compliance notes"><thead><tr><th class="note-date">DATE</th><th>NOTE</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="photos-title">SITE PHOTOS</div><div class="photos">${photos}</div>
      </article>`;
    }

    function render() {
      renderDocumentNavigation();
      document.getElementById('front').innerHTML = renderFront();
      document.getElementById('back').innerHTML = renderBack();
      document.querySelectorAll('.tag img').forEach(image => {
        if (!image.complete) image.addEventListener('load', scheduleFit, {once:true});
      });
      scheduleFit();
    }

    function fitFace(face) {
      const card = face.querySelector('.tag');
      if (!card || !face.clientWidth || !face.clientHeight) return;

      card.style.top = '0px';
      card.style.width = `${face.clientWidth}px`;
      card.style.transform = 'none';

      const availableHeight = Math.max(1, face.clientHeight - 10);
      let low = 0.1;
      let high = 1;
      for (let attempt = 0; attempt < 18; attempt += 1) {
        const candidate = (low + high) / 2;
        card.style.width = `${face.clientWidth / candidate}px`;
        const fittedHeight = card.offsetHeight * candidate;
        if (fittedHeight <= availableHeight) low = candidate;
        else high = candidate;
      }

      let scale = low * 0.995;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        card.style.width = `${face.clientWidth / scale}px`;
        const fittedHeight = card.offsetHeight * scale;
        if (fittedHeight <= availableHeight) break;
        scale *= (availableHeight / fittedHeight) * 0.995;
      }
      card.style.width = `${face.clientWidth / scale}px`;
      card.style.transform = `scale(${scale})`;
      const fittedHeight = card.offsetHeight * scale;
      card.style.top = `${Math.max(0, (face.clientHeight - fittedHeight) / 2)}px`;
      face.dataset.fitScale = scale.toFixed(4);
    }

    function fitCards() {
      fitFrame = 0;
      fitFace(document.getElementById('front'));
      fitFace(document.getElementById('back'));
    }

    function scheduleFit() {
      if (fitFrame) cancelAnimationFrame(fitFrame);
      fitFrame = requestAnimationFrame(fitCards);
    }

    function setBack(nextBack) {
      isBack = Boolean(nextBack);
      const flipper = document.getElementById('flipper');
      document.getElementById('flipHint').classList.remove('is-visible');
      flipper.classList.toggle('is-back', isBack);
      const stage = document.getElementById('stage');
      stage.setAttribute('aria-pressed', String(isBack));
      stage.setAttribute('aria-label', isBack ? 'Flip Scaff-Tag to view the front' : 'Flip Scaff-Tag to view the back');
      document.getElementById('announce').textContent = isBack ? 'Showing the back of the Scaff-Tag' : 'Showing the front of the Scaff-Tag';
    }

    function playFlipHint() {
      const hint = document.getElementById('flipHint');
      window.setTimeout(() => {
        if (isBack || document.hidden) return;
        hint.classList.add('is-visible');
        window.setTimeout(() => hint.classList.remove('is-visible'), 2200);
      }, 120);
    }

    async function refresh() {
      try {
        const response = await fetch(dataUrl, {cache:'no-store', headers:{Accept:'application/json'}});
        if (!response.ok) return;
        tag = await response.json();
        render();
      } catch (_) { /* Keep the last successfully loaded tag visible. */ }
    }

    const stage = document.getElementById('stage');
    const documentNavigation = document.getElementById('documentNavigation');
    const photoViewer = document.getElementById('photoViewer');
    const photoViewerImage = document.getElementById('photoViewerImage');
    const photoViewerClose = document.getElementById('photoViewerClose');
    let photoViewerLastFocus = null;
    let photoViewerCleanupTimer = 0;

    documentNavigation.addEventListener('click', event => {
      const link = event.target.closest('a.document-nav');
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const label = link.querySelector('.document-nav-label')?.textContent?.trim() || 'document';
      document.getElementById('navigationLoadingLabel').textContent = `Opening ${label}`;
      document.getElementById('navigationLoading').classList.add('is-visible');
      document.body.classList.add(`is-leaving-${link.dataset.direction}`);
      const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 140;
      window.setTimeout(() => window.location.assign(link.href), delay);
    });

    function openPhotoViewer(photoButton) {
      const url = photoButton?.dataset?.photoUrl;
      if (!url) return;
      window.clearTimeout(photoViewerCleanupTimer);
      photoViewerLastFocus = photoButton;
      photoViewerImage.src = url;
      photoViewerImage.alt = photoButton.dataset.photoAlt || 'Enlarged Scaff-Tag site photo';
      photoViewer.classList.add('is-open');
      photoViewer.setAttribute('aria-hidden', 'false');
      photoViewerClose.focus({preventScroll:true});
    }

    function closePhotoViewer() {
      if (!photoViewer.classList.contains('is-open')) return;
      photoViewer.classList.remove('is-open');
      photoViewer.setAttribute('aria-hidden', 'true');
      photoViewerLastFocus?.focus?.({preventScroll:true});
      photoViewerLastFocus = null;
      window.clearTimeout(photoViewerCleanupTimer);
      photoViewerCleanupTimer = window.setTimeout(() => {
        if (photoViewer.classList.contains('is-open')) return;
        photoViewerImage.removeAttribute('src');
        photoViewerImage.alt = '';
      }, 260);
    }

    stage.addEventListener('click', event => {
      const photoButton = event.target.closest('button.photo[data-photo-url]');
      if (photoButton) openPhotoViewer(photoButton);
    });
    stage.addEventListener('pointerdown', event => {
      if (event.target.closest('.photo')) { pointerStart = null; return; }
      activePointers.add(event.pointerId);
      if (activePointers.size > 1) {
        pinchInProgress = true;
        pointerStart = null;
        return;
      }
      pointerStart = {x:event.clientX,y:event.clientY};
    });
    stage.addEventListener('pointerup', event => {
      activePointers.delete(event.pointerId);
      if (pinchInProgress) {
        pointerStart = null;
        if (activePointers.size === 0) pinchInProgress = false;
        return;
      }
      if (!pointerStart || event.target.closest('.photo')) { pointerStart = null; return; }
      const dx = event.clientX - pointerStart.x;
      const dy = event.clientY - pointerStart.y;
      pointerStart = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) setBack(dx < 0);
      else if (Math.hypot(dx,dy) < 10) setBack(!isBack);
    });
    stage.addEventListener('pointercancel', event => {
      activePointers.delete(event.pointerId);
      pointerStart = null;
      if (activePointers.size === 0) pinchInProgress = false;
    });
    stage.addEventListener('keydown', event => {
      if (event.target.closest('.photo')) return;
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setBack(!isBack); }
    });
    photoViewerClose.addEventListener('click', closePhotoViewer);
    photoViewer.addEventListener('click', event => {
      if (event.target === photoViewer) closePhotoViewer();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closePhotoViewer();
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    window.addEventListener('resize', scheduleFit);
    document.fonts?.ready.then(scheduleFit).catch(() => {});
    render();
    playFlipHint();
    window.setInterval(refresh, 30000);
  </script>
</body>
</html>
""";
    }
}
