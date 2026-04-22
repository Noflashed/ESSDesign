using Microsoft.AspNetCore.HttpOverrides;
using ESSDesign.Server.Services;
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
builder.Services.AddScoped<PushNotificationService>();
builder.Services.AddScoped<MaterialOrderingAiService>();
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
app.MapGet("/t/{tagRef}", async (string tagRef, SupabaseService supabaseService, ILogger<Program> logger) =>
{
    if (string.IsNullOrWhiteSpace(tagRef))
    {
        return Results.BadRequest("Missing tag reference.");
    }

    var decodedRef = Uri.UnescapeDataString(tagRef);
    var parts = decodedRef.Split(':', StringSplitOptions.RemoveEmptyEntries);
    if (parts.Length != 3)
    {
        return Results.BadRequest("Invalid tag reference format.");
    }

    var builderId = parts[0].Trim();
    var projectId = parts[1].Trim();
    var formId = parts[2].Trim();

    if (string.IsNullOrWhiteSpace(builderId) || string.IsNullOrWhiteSpace(projectId) || string.IsNullOrWhiteSpace(formId))
    {
        return Results.BadRequest("Invalid tag reference values.");
    }

    try
    {
        var details = await supabaseService.GetScaffTagFormDetailsAsync(builderId, projectId, formId);
        if (details == null || string.IsNullOrWhiteSpace(details.PdfPath))
        {
            return Results.NotFound("Scaff-tag form or PDF path not found.");
        }

        var pdfUrl = await supabaseService.GetSafetyStorageSignedUrlAsync(details.PdfPath, 60 * 60 * 24 * 14);
        var photoUrls = await Task.WhenAll(details.PhotoPaths.Select(p => supabaseService.GetSafetyStorageSignedUrlAsync(p, 60 * 60 * 24 * 7)));

        var scaffoldTitle = System.Net.WebUtility.HtmlEncode(details.ScaffoldName ?? "Scaff-Tag");
        var locationTitle = System.Net.WebUtility.HtmlEncode(details.JobLocation ?? string.Empty);
        var photosHtml = photoUrls.Length == 0
            ? "<p class=\"muted\">No photos attached.</p>"
            : string.Join(
                "",
                photoUrls.Select(url =>
                    $"<a class=\"photo\" href=\"{System.Net.WebUtility.HtmlEncode(url)}\" target=\"_blank\" rel=\"noopener noreferrer\"><img src=\"{System.Net.WebUtility.HtmlEncode(url)}\" loading=\"lazy\" /></a>"));

        var html = $$"""
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Scaff-Tag</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif; background: #f4f6f8; color: #111827; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 16px; }
    .card { background: #fff; border-radius: 14px; box-shadow: 0 6px 22px rgba(0,0,0,0.08); overflow: hidden; margin-bottom: 14px; border: 2px solid #0b7f45; }
    .head { padding: 14px 16px; border-bottom: 1px solid #e5e7eb; }
    h1 { margin: 0; font-size: 18px; line-height: 1.2; }
    .sub { margin-top: 6px; color: #4b5563; font-size: 13px; }
    .pdf { width: 100%; height: 72vh; border: 0; display: block; }
    .photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; padding: 12px; }
    .photo { border-radius: 10px; overflow: hidden; display: block; border: 2px solid #0b7f45; background: #fff; }
    .photo img { width: 100%; height: 130px; object-fit: cover; display: block; }
    .muted { margin: 0; padding: 12px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="head">
        <h1>{{scaffoldTitle}}</h1>
        <div class="sub">{{locationTitle}}</div>
      </div>
      <iframe class="pdf" src="{{System.Net.WebUtility.HtmlEncode(pdfUrl)}}" title="Scaff-Tag PDF"></iframe>
    </div>
    <div class="card">
      <div class="head"><h1>Photos</h1></div>
      <div class="photos">{{photosHtml}}</div>
    </div>
  </div>
</body>
</html>
""";

        return Results.Content(html, "text/html; charset=utf-8");
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Failed QR redirect for tag ref {TagRef}", tagRef);
        return Results.Problem("Unable to resolve scaff-tag PDF.", statusCode: 500);
    }
});

// Controllers
app.MapControllers();

app.Run();
