using Microsoft.AspNetCore.HttpOverrides;
using ESSDesign.Server.Services;
using ESSDesign.Server.Services.Assistant;
using Supabase;
using Resend;

var builder = WebApplication.CreateBuilder(args);

// Configure Kestrel server limits for large file uploads
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 1_000_000_000; // 1GB limit
});

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Enable response compression (GZip + Brotli)
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
});

// Trust proxy headers (Railway/edge proxies) so HTTPS redirection and CORS behave correctly
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

// Configure Supabase
var supabaseUrl = builder.Configuration["Supabase:Url"]!;
var supabaseKey = builder.Configuration["Supabase:Key"]!;

builder.Services.AddScoped<Client>(_ =>
    new Client(
        supabaseUrl,
        supabaseKey,
        new SupabaseOptions
        {
            AutoRefreshToken = true,
            AutoConnectRealtime = true // ✅ Enable realtime for instant updates!
        }
    ));

// Register Supabase Service
builder.Services.AddScoped<SupabaseService>();
builder.Services.AddScoped<ScaffTagPublicPageService>();
builder.Services.AddScoped<SiteRegistryService>();
builder.Services.AddScoped<PushNotificationService>();
builder.Services.AddScoped<MaterialOrderingAiService>();
builder.Services.AddSingleton<EssAssistantAccessPolicy>();
builder.Services.AddScoped<EssAssistantSupabaseGateway>();
builder.Services.AddScoped<EssAssistantConversationStore>();
builder.Services.AddScoped<EssAssistantDataService>();
builder.Services.AddScoped<EssAssistantToolCatalog>();
builder.Services.AddScoped<EssAssistantDocumentIndexService>();
builder.Services.AddSingleton<EssAssistantUploadQueue>();
builder.Services.AddSingleton<EssAssistantPersistenceQueue>();
builder.Services.AddScoped<EssAssistantService>();
builder.Services.AddHostedService<EssAssistantDocumentIndexWorker>();
builder.Services.AddHostedService<EssAssistantUploadWorker>();
builder.Services.AddHostedService<EssAssistantPersistenceWorker>();
builder.Services.AddScoped<DeliveryAnalysisService>();
builder.Services.AddScoped<TransportRouteEstimateService>();
builder.Services.AddScoped<TomTomUsageBudgetService>();
builder.Services.AddHttpClient();

// Configure Resend Email Service (optional - emails are skipped if API key is not set)
var resendApiKey = builder.Configuration["Resend:ApiKey"];
if (!string.IsNullOrEmpty(resendApiKey))
{
    builder.Services.AddOptions();
    builder.Services.AddHttpClient<ResendClient>();
    builder.Services.Configure<ResendClientOptions>(o =>
    {
        o.ApiToken = resendApiKey;
    });
    builder.Services.AddTransient<IResend, ResendClient>();
}
else
{
    builder.Services.AddTransient<IResend>(_ => null!);
}

// Register Email Service
builder.Services.AddScoped<EmailService>();

// Configure CORS - Allow production and development origins
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReact", policy =>
    {
        policy.SetIsOriginAllowed(origin =>
            {
                // Allow production domains
                if (origin == "https://essdesign.app" ||
                    origin == "https://www.essdesign.app" ||
                    origin == "https://essdesign-production.up.railway.app")
                {
                    return true;
                }

                // Allow Vercel preview deployments
                if (origin.Contains(".vercel.app"))
                {
                    return true;
                }

                // Allow localhost for development
                if (origin.StartsWith("http://localhost:"))
                {
                    return true;
                }

                return false;
            })
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials()
            .WithExposedHeaders("*");
    });
});

var app = builder.Build();

// Initialize Supabase storage bucket
using (var scope = app.Services.CreateScope())
{
    var supabaseService = scope.ServiceProvider.GetRequiredService<SupabaseService>();
    try
    {
        await supabaseService.InitializeStorageAsync();
    }
    catch (Exception ex)
    {
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
        logger.LogWarning(ex, "Storage initialization warning - continuing startup");
    }
}

// Configure the HTTP request pipeline
app.UseForwardedHeaders();

// Manual CORS middleware - runs before everything to guarantee headers on all responses
app.Use(async (context, next) =>
{
    var origin = context.Request.Headers.Origin.ToString();
    if (!string.IsNullOrEmpty(origin))
    {
        var allowed = origin == "https://essdesign.app" ||
                      origin == "https://www.essdesign.app" ||
                      origin == "https://essdesign-production.up.railway.app" ||
                      origin.Contains(".vercel.app") ||
                      origin.StartsWith("http://localhost:");

        if (allowed)
        {
            context.Response.Headers.Append("Access-Control-Allow-Origin", origin);
            context.Response.Headers.Append("Access-Control-Allow-Credentials", "true");
            context.Response.Headers.Append("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
            context.Response.Headers.Append("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
        }

        // Handle preflight OPTIONS requests immediately
        if (context.Request.Method == "OPTIONS")
        {
            context.Response.StatusCode = 204;
            return;
        }
    }

    await next();
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// HTTPS redirection for production
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

// Enable response compression
app.UseResponseCompression();

// Routing
app.UseRouting();

// CORS (kept as backup for endpoint-level policies)
app.UseCors("AllowReact");

// Authorization
app.UseAuthorization();

// Health check endpoints
app.MapGet("/", () => Results.Ok(new { status = "API is running", timestamp = DateTime.UtcNow }));
app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

// Deep link redirect — serves a page that fires essdesign:// then falls back to the web app.
// Used by email buttons so they work from Outlook and any email client (https only).
app.MapGet("/open/document/{documentId}", (string documentId, string? folder, string? title, string? type, IConfiguration config) =>
{
    var frontendUrl = config["AppSettings:FrontendUrl"] ?? "https://essdesign.app";
    var safeId = Uri.EscapeDataString(documentId);
    var queryParts = new List<string>();
    if (!string.IsNullOrWhiteSpace(folder)) queryParts.Add($"folder={Uri.EscapeDataString(folder)}");
    if (!string.IsNullOrWhiteSpace(type)) queryParts.Add($"type={Uri.EscapeDataString(type)}");
    if (!string.IsNullOrWhiteSpace(title)) queryParts.Add($"title={Uri.EscapeDataString(title)}");
    var queryString = queryParts.Any() ? "?" + string.Join("&", queryParts) : string.Empty;

    var appSchemeUrl = $"essdesign://document/{safeId}{queryString}";
    var webFallbackUrl = $"{frontendUrl}/document/{safeId}{queryString}";
    var safeAppUrl = System.Net.WebUtility.HtmlEncode(appSchemeUrl);
    var safeWebUrl = System.Net.WebUtility.HtmlEncode(webFallbackUrl);
    var safeTitle = System.Net.WebUtility.HtmlEncode(title ?? "Document");

    var html = $$"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Opening ESS App...</title>
            <style>
                body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                       background: #1a1a2e; color: #fff; display: flex; align-items: center;
                       justify-content: center; min-height: 100vh; text-align: center; padding: 24px; }
                .card { max-width: 360px; }
                h1 { font-size: 20px; margin: 0 0 8px; }
                p { color: #9a9ab0; font-size: 14px; margin: 0 0 24px; }
                a.btn { display: inline-block; padding: 14px 32px; border-radius: 100px;
                        background: #FF6B35; color: #fff; text-decoration: none;
                        font-weight: 600; font-size: 15px; }
                a.web { display: block; margin-top: 16px; color: #9a9ab0; font-size: 13px; }
            </style>
            <script>
                window.onload = function() {
                    window.location = '{{appSchemeUrl}}';
                    setTimeout(function() {
                        document.getElementById('fallback').style.display = 'block';
                    }, 1500);
                };
            </script>
        </head>
        <body>
            <div class="card">
                <h1>Opening ESS App...</h1>
                <p>{{safeTitle}}</p>
                <div id="fallback" style="display:none">
                    <a class="btn" href="{{safeAppUrl}}">Open in ESS App</a>
                    <a class="web" href="{{safeWebUrl}}">Don't have the app? View in browser</a>
                </div>
            </div>
        </body>
        </html>
        """;

    return Results.Content(html, "text/html; charset=utf-8");
});
app.MapGet("/q/{code}", async (string code, HttpContext context, SupabaseService supabaseService, ILogger<Program> logger) =>
{
    try
    {
        var label = await supabaseService.GetScaffTagQrLabelByCodeAsync(code);
        if (label == null)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return Results.Content("Scaff-Tag QR label not found.", "text/plain; charset=utf-8");
        }

        if (string.Equals(label.Status, "assigned", StringComparison.OrdinalIgnoreCase) &&
            !string.IsNullOrWhiteSpace(label.AssignedBuilderId) &&
            !string.IsNullOrWhiteSpace(label.AssignedProjectId) &&
            !string.IsNullOrWhiteSpace(label.AssignedFormId))
        {
            var tagRef = Uri.EscapeDataString($"{label.AssignedBuilderId}:{label.AssignedProjectId}:{label.AssignedFormId}");
            return Results.Redirect($"/t/{tagRef}", permanent: false);
        }

        var retired = string.Equals(label.Status, "retired", StringComparison.OrdinalIgnoreCase);
        if (retired)
            context.Response.StatusCode = StatusCodes.Status410Gone;

        var safeNumber = System.Net.WebUtility.HtmlEncode(label.DisplayNumber);
        var heading = retired ? "QR label retired" : "Ready to be assigned";
        var message = retired
            ? "This physical label has been replaced or retired and no longer opens a Scaff-Tag."
            : "This pre-printed QR label has not yet been linked to a Scaff-Tag. Open the ESS mobile app and use Link QR Code after creating the form.";
        var stateClass = retired ? "retired" : "ready";
        var html = $$"""
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{{safeNumber}} · ESS Scaff-Tag</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 22px; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif; background: #f2f6f3; color: #111827; }
    .card { width: min(430px, 100%); overflow: hidden; border: 2px solid #087a45; border-radius: 24px; background: #fff; box-shadow: 0 18px 55px rgba(15, 23, 42, .13); text-align: center; }
    .brand { background: #087a45; color: #fff; padding: 17px; font-size: 13px; font-weight: 800; letter-spacing: 1.1px; }
    .body { padding: 30px 26px 26px; }
    .number { display: inline-flex; border-radius: 999px; background: #111827; color: #fff; padding: 10px 18px; font-size: 20px; font-weight: 800; letter-spacing: .6px; }
    h1 { margin: 23px 0 10px; font-size: 24px; line-height: 1.15; }
    p { margin: 0; color: #667085; font-size: 15px; line-height: 1.55; }
    .state { display: inline-flex; margin-top: 24px; padding: 9px 14px; border-radius: 999px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; }
    .state.ready { color: #7a4a00; background: #fff4b8; }
    .state.retired { color: #667085; background: #eef0f3; }
    .banner { margin-top: 28px; padding: 11px; border-radius: 999px; background: #ffd326; color: #193324; font-size: 12px; font-weight: 900; }
  </style>
</head>
<body>
  <main class="card">
    <div class="brand">ESS · LIVE DIGITAL SCAFF-TAG</div>
    <div class="body">
      <div class="number">{{safeNumber}}</div>
      <h1>{{heading}}</h1>
      <p>{{message}}</p>
      <div class="state {{stateClass}}">{{(retired ? "Retired" : "Unassigned")}}</div>
      <div class="banner">LIVE DIGITAL SCAFF-TAG</div>
    </div>
  </main>
</body>
</html>
""";
        return Results.Content(html, "text/html; charset=utf-8");
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Failed to resolve Scaff-Tag QR label {Code}", code);
        return Results.Problem("Unable to resolve this Scaff-Tag QR label.", statusCode: 500);
    }
});

app.MapGet("/t/{tagRef}", async (
    string tagRef,
    HttpContext context,
    ScaffTagPublicPageService scaffTagPageService,
    ILogger<Program> logger) =>
{
    context.Response.Headers.CacheControl = "no-store, no-cache, max-age=0";
    context.Response.Headers.Pragma = "no-cache";
    context.Response.Headers.Append("X-Robots-Tag", "noindex, nofollow, noarchive");
    if (!ScaffTagPublicPageService.TryParseReference(tagRef, out _, out _, out _))
    {
        return Results.BadRequest("Invalid tag reference.");
    }

    try
    {
        var model = await scaffTagPageService.GetAsync(tagRef);
        if (model == null)
        {
            return Results.NotFound("Scaff-tag not found.");
        }

        return Results.Content(
            ScaffTagPublicPageRenderer.Render(model),
            "text/html; charset=utf-8");
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Failed interactive Scaff-tag page for tag ref {TagRef}", tagRef);
        return Results.Problem("Unable to load Scaff-tag.", statusCode: 500);
    }
});

app.MapGet("/t/{tagRef}/data", async (
    string tagRef,
    HttpContext context,
    ScaffTagPublicPageService scaffTagPageService,
    ILogger<Program> logger) =>
{
    context.Response.Headers.CacheControl = "no-store, no-cache, max-age=0";
    context.Response.Headers.Pragma = "no-cache";
    context.Response.Headers.Append("X-Robots-Tag", "noindex, nofollow, noarchive");
    if (!ScaffTagPublicPageService.TryParseReference(tagRef, out _, out _, out _))
    {
        return Results.BadRequest("Invalid tag reference.");
    }

    try
    {
        var model = await scaffTagPageService.GetAsync(tagRef);
        return model == null
            ? Results.NotFound()
            : Results.Json(model);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Failed interactive Scaff-tag refresh for tag ref {TagRef}", tagRef);
        return Results.Problem("Unable to refresh Scaff-tag.", statusCode: 500);
    }
});

app.MapGet("/t/{tagRef}/design", async (
    string tagRef,
    HttpContext context,
    ScaffTagPublicPageService scaffTagPageService,
    ILogger<Program> logger) =>
{
    context.Response.Headers.CacheControl = "no-store, no-cache, max-age=0";
    context.Response.Headers.Pragma = "no-cache";
    context.Response.Headers.Append("X-Robots-Tag", "noindex, nofollow, noarchive");
    if (!ScaffTagPublicPageService.TryParseReference(tagRef, out _, out _, out _))
    {
        return Results.BadRequest("Invalid tag reference.");
    }

    try
    {
        var url = await scaffTagPageService.GetLatestDesignUrlAsync(tagRef);
        return string.IsNullOrWhiteSpace(url)
            ? Results.NotFound("No design document is linked to this Scaff-Tag.")
            : Results.Redirect(url, permanent: false);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Failed to open the latest design for Scaff-Tag {TagRef}", tagRef);
        return Results.Problem("Unable to open the linked design document.", statusCode: 500);
    }
});

app.MapGet("/t/{tagRef}/handover", async (
    string tagRef,
    HttpContext context,
    ScaffTagPublicPageService scaffTagPageService,
    ILogger<Program> logger) =>
{
    context.Response.Headers.CacheControl = "no-store, no-cache, max-age=0";
    context.Response.Headers.Pragma = "no-cache";
    context.Response.Headers.Append("X-Robots-Tag", "noindex, nofollow, noarchive");
    if (!ScaffTagPublicPageService.TryParseReference(tagRef, out _, out _, out _))
    {
        return Results.BadRequest("Invalid tag reference.");
    }

    try
    {
        var url = await scaffTagPageService.GetLatestHandoverUrlAsync(tagRef);
        return string.IsNullOrWhiteSpace(url)
            ? Results.NotFound("No handover form is linked to this Scaff-Tag.")
            : Results.Redirect(url, permanent: false);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Failed to open the latest handover for Scaff-Tag {TagRef}", tagRef);
        return Results.Problem("Unable to open the linked handover form.", statusCode: 500);
    }
});

// Controllers
app.MapControllers();

app.Run();
