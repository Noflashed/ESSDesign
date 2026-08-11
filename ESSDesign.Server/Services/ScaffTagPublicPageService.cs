using System.Text.Json;
using System.Text.Json.Serialization;

namespace ESSDesign.Server.Services;

public sealed class ScaffTagPublicPageService
{
    private readonly SupabaseService _supabaseService;

    public ScaffTagPublicPageService(SupabaseService supabaseService)
    {
        _supabaseService = supabaseService;
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
        var photoUrls = await Task.WhenAll(photoUrlTasks);

        return ScaffTagPublicViewModel.From(details, await pdfUrlTask, photoUrls);
    }

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

    [JsonPropertyName("updatedAt")]
    public DateTimeOffset? UpdatedAt { get; init; }

    public static ScaffTagPublicViewModel From(
        ScaffTagFormDetails details,
        string pdfUrl,
        IEnumerable<string> photoUrls) => new()
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
        UpdatedAt = details.UpdatedAt,
    };
}

public static class ScaffTagPublicPageRenderer
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static string Render(ScaffTagPublicViewModel model)
    {
        var initialJson = JsonSerializer.Serialize(model, JsonOptions);
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
    .stage { position:relative; width:min(85%,430px); height:85%; min-height:0; max-height:930px; perspective:1600px; touch-action:pan-y pinch-zoom; user-select:none; -webkit-user-select:none; cursor:pointer; outline:none; }
    .flipper { width:100%; height:100%; position:relative; transform-style:preserve-3d; transition:transform .68s cubic-bezier(.2,.72,.18,1); }
    .flipper.is-back { transform:rotateY(180deg); }
    .flipper.is-hinting { animation:flip-peek 1.25s cubic-bezier(.2,.72,.18,1) both; }
    @keyframes flip-peek { 0%,100% { transform:rotateY(0deg); } 38% { transform:rotateY(-24deg); } 64% { transform:rotateY(9deg); } 82% { transform:rotateY(-3deg); } }
    .face { position:absolute; inset:0; overflow:hidden; backface-visibility:hidden; -webkit-backface-visibility:hidden; border-radius:10px; background:transparent; }
    .back { transform:rotateY(180deg); background:transparent; }
    .flip-hint { position:absolute; inset:0; z-index:10; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; border-radius:10px; background:rgba(255,255,255,.76); -webkit-backdrop-filter:blur(1.5px); backdrop-filter:blur(1.5px); opacity:0; visibility:hidden; pointer-events:none; }
    .flip-hint.is-visible { visibility:visible; animation:flip-hint-veil 2.15s ease both; }
    .flip-hint-icon { width:82px; height:82px; display:block; object-fit:contain; filter:contrast(1.25); animation:flip-hint-touch 1.05s ease-in-out 2; }
    .flip-hint-label { color:#111827; font-size:17px; line-height:1.2; letter-spacing:.15px; font-weight:850; text-align:center; }
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
    .photos { min-height:150px; display:grid; grid-template-columns:1fr 1fr; border-top:1px solid #d6b100; background:var(--yellow); }
    .photo { min-height:150px; display:flex; align-items:center; justify-content:center; overflow:hidden; border-right:1px solid #d6b100; background:#fff9cf; color:#6b5a00; font-size:11px; font-weight:800; }
    .photo:last-child { border-right:0; }
    .photo img { width:100%; height:100%; min-height:150px; object-fit:cover; display:block; }
    .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
    @media (min-width:700px) { .app { padding:18px; } }
    @media (prefers-reduced-motion:reduce) { .flipper { transition:none; } .flipper.is-hinting { animation:none; } .flip-hint.is-visible { animation:none; opacity:1; } .flip-hint-icon { animation:none; } }
  </style>
</head>
<body>
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
        ? `<a class="photo" href="${esc(tag.photoUrls[index])}" target="_blank" rel="noopener noreferrer"><img src="${esc(tag.photoUrls[index])}" alt="Scaff-Tag site photo ${index + 1}" loading="lazy" /></a>`
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
      document.getElementById('front').innerHTML = renderFront();
      document.getElementById('back').innerHTML = renderBack();
      scheduleFit();
    }

    function fitFace(face) {
      const card = face.querySelector('.tag');
      if (!card || !face.clientWidth || !face.clientHeight) return;

      card.style.top = '0px';
      card.style.width = `${face.clientWidth}px`;
      card.style.transform = 'none';

      let low = 0.35;
      let high = 1;
      for (let attempt = 0; attempt < 18; attempt += 1) {
        const candidate = (low + high) / 2;
        card.style.width = `${face.clientWidth / candidate}px`;
        const fittedHeight = card.offsetHeight * candidate;
        if (fittedHeight <= face.clientHeight) low = candidate;
        else high = candidate;
      }

      let scale = low * 0.998;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        card.style.width = `${face.clientWidth / scale}px`;
        const fittedHeight = card.offsetHeight * scale;
        if (fittedHeight <= face.clientHeight) break;
        scale *= (face.clientHeight / fittedHeight) * 0.995;
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
      flipper.classList.remove('is-hinting');
      flipper.classList.toggle('is-back', isBack);
      const stage = document.getElementById('stage');
      stage.setAttribute('aria-pressed', String(isBack));
      stage.setAttribute('aria-label', isBack ? 'Flip Scaff-Tag to view the front' : 'Flip Scaff-Tag to view the back');
      document.getElementById('announce').textContent = isBack ? 'Showing the back of the Scaff-Tag' : 'Showing the front of the Scaff-Tag';
    }

    function playFlipHint() {
      const hint = document.getElementById('flipHint');
      const flipper = document.getElementById('flipper');
      window.setTimeout(() => {
        if (isBack || document.hidden) return;
        hint.classList.add('is-visible');
        flipper.classList.add('is-hinting');
        window.setTimeout(() => {
          hint.classList.remove('is-visible');
          flipper.classList.remove('is-hinting');
        }, 2200);
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
    stage.addEventListener('pointerdown', event => {
      if (event.target.closest('a')) return;
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
      if (!pointerStart || event.target.closest('a')) { pointerStart = null; return; }
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
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setBack(!isBack); }
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
