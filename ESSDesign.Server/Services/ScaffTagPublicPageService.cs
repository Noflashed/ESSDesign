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
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0b4f2f" />
  <title>Interactive Scaff-Tag</title>
  <style>
    :root { color-scheme: light; --green:#0b4f2f; --green-2:#0b7f45; --line:#8da9be; --yellow:#f7d319; --ink:#111827; }
    * { box-sizing:border-box; }
    html, body { margin:0; min-height:100%; }
    body { min-height:100dvh; overflow:hidden; font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif; color:var(--ink); background:radial-gradient(circle at 50% -15%,#e5f2eb 0,#eef3f0 35%,#dbe5df 100%); }
    button, a { font:inherit; }
    .app { min-height:100dvh; display:flex; flex-direction:column; align-items:center; padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left)); }
    .topbar { width:min(100%,430px); height:42px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex:0 0 auto; }
    .live { display:flex; align-items:center; gap:7px; min-width:0; color:#315344; font-size:12px; font-weight:800; }
    .live-dot { width:8px; height:8px; border-radius:50%; background:#16a34a; box-shadow:0 0 0 4px rgba(22,163,74,.13); }
    .updated { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#587064; font-size:11px; text-align:right; }
    .stage { width:min(100%,430px); height:calc(100dvh - 104px); min-height:520px; max-height:930px; perspective:1600px; touch-action:pan-y; user-select:none; -webkit-user-select:none; cursor:pointer; outline:none; }
    .stage:focus-visible { border-radius:14px; box-shadow:0 0 0 4px rgba(11,127,69,.28); }
    .flipper { width:100%; height:100%; position:relative; transform-style:preserve-3d; transition:transform .68s cubic-bezier(.2,.72,.18,1); }
    .flipper.is-back { transform:rotateY(180deg); }
    .face { position:absolute; inset:0; overflow:auto; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; backface-visibility:hidden; -webkit-backface-visibility:hidden; border-radius:10px; box-shadow:0 18px 48px rgba(18,45,32,.24),0 2px 7px rgba(18,45,32,.17); background:#fff; scrollbar-width:thin; }
    .back { transform:rotateY(180deg); background:var(--yellow); }
    .tag { width:100%; min-height:100%; overflow:hidden; border:2px solid var(--green); border-radius:10px; background:var(--green); }
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
    .controls { width:min(100%,430px); height:52px; display:flex; align-items:center; justify-content:center; gap:10px; flex:0 0 auto; }
    .flip-btn { min-width:150px; min-height:38px; display:flex; align-items:center; justify-content:center; gap:8px; padding:8px 17px; border:1px solid rgba(11,79,47,.24); border-radius:999px; color:#fff; background:var(--green); box-shadow:0 6px 16px rgba(11,79,47,.18); font-size:12px; font-weight:850; cursor:pointer; }
    .flip-icon { display:inline-block; font-size:17px; transition:transform .68s cubic-bezier(.2,.72,.18,1); }
    .flip-btn.is-back .flip-icon { transform:rotate(180deg); }
    .pdf-link { color:var(--green); font-size:11px; font-weight:850; text-underline-offset:3px; }
    .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
    @media (max-height:690px) { .topbar { height:34px; } .stage { height:calc(100dvh - 86px); min-height:500px; } .controls { height:42px; } .flip-btn { min-height:34px; } }
    @media (min-width:700px) { .app { padding-top:18px; } .topbar { height:46px; } .stage { height:min(84dvh,930px); } }
    @media (prefers-reduced-motion:reduce) { .flipper, .flip-icon { transition:none; } }
  </style>
</head>
<body>
  <main class="app">
    <div class="topbar">
      <div class="live"><span class="live-dot" aria-hidden="true"></span><span>Live Scaff-Tag</span></div>
      <div id="updated" class="updated" aria-live="polite">Loading latest information...</div>
    </div>
    <div id="stage" class="stage" role="button" tabindex="0" aria-label="Flip Scaff-Tag to view the back" aria-pressed="false">
      <div id="flipper" class="flipper">
        <section id="front" class="face front" aria-label="Scaff-Tag front"></section>
        <section id="back" class="face back" aria-label="Scaff-Tag back"></section>
      </div>
    </div>
    <div class="controls">
      <button id="flipButton" class="flip-btn" type="button"><span class="flip-icon" aria-hidden="true">↻</span><span id="sideText">Tap to view back</span></button>
      <a id="pdfLink" class="pdf-link" target="_blank" rel="noopener noreferrer">PDF</a>
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

    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const checked = value => `<span class="box" aria-hidden="true">${value ? '✓' : ''}</span>`;
    const signature = strokes => {
      if (!Array.isArray(strokes) || strokes.length === 0) return '<span></span>';
      const lines = strokes.map(stroke => {
        if (!Array.isArray(stroke) || stroke.length === 0) return '';
        const points = stroke.map(point => {
          const x = Math.max(0, Math.min(1, Number(point?.x) || 0)) * 100;
          const y = Math.max(0, Math.min(1, Number(point?.y) || 0)) * 40;
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        }).join(' ');
        return `<polyline points="${points}"></polyline>`;
      }).join('');
      return `<svg class="signature" viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="Digital signature">${lines}</svg>`;
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
          <div class="reverse-row signature-row"><span class="reverse-label">SIGNATURE:</span><span class="reverse-value">${signature(tag.erectedBySignatureStrokes)}</span></div>
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
      document.getElementById('pdfLink').href = tag.pdfUrl || '#';
      const updated = tag.updatedAt ? new Date(tag.updatedAt) : null;
      document.getElementById('updated').textContent = updated && !Number.isNaN(updated.getTime())
        ? `Updated ${new Intl.DateTimeFormat('en-AU',{dateStyle:'medium',timeStyle:'short',timeZone:'Australia/Sydney'}).format(updated)}`
        : 'Latest saved information';
    }

    function setBack(nextBack) {
      isBack = Boolean(nextBack);
      document.getElementById('flipper').classList.toggle('is-back', isBack);
      document.getElementById('flipButton').classList.toggle('is-back', isBack);
      const stage = document.getElementById('stage');
      stage.setAttribute('aria-pressed', String(isBack));
      stage.setAttribute('aria-label', isBack ? 'Flip Scaff-Tag to view the front' : 'Flip Scaff-Tag to view the back');
      document.getElementById('sideText').textContent = isBack ? 'Tap to view front' : 'Tap to view back';
      document.getElementById('announce').textContent = isBack ? 'Showing the back of the Scaff-Tag' : 'Showing the front of the Scaff-Tag';
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
      pointerStart = {x:event.clientX,y:event.clientY};
    });
    stage.addEventListener('pointerup', event => {
      if (!pointerStart || event.target.closest('a')) { pointerStart = null; return; }
      const dx = event.clientX - pointerStart.x;
      const dy = event.clientY - pointerStart.y;
      pointerStart = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) setBack(dx < 0);
      else if (Math.hypot(dx,dy) < 10) setBack(!isBack);
    });
    stage.addEventListener('pointercancel', () => { pointerStart = null; });
    stage.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setBack(!isBack); }
    });
    document.getElementById('flipButton').addEventListener('click', () => setBack(!isBack));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    render();
    window.setInterval(refresh, 30000);
  </script>
</body>
</html>
""";
    }
}
