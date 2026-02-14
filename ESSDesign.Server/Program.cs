using Microsoft.AspNetCore.HttpOverrides;
using ESSDesign.Server.Services;
using Supabase;
using Resend;

var builder = WebApplication.CreateBuilder(args);

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

// Controllers
app.MapControllers();

app.Run();
