using ESSDesign.Server.Services;
using Supabase;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

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
            AutoConnectRealtime = false
        }
    ));

// Register Supabase Service
builder.Services.AddScoped<SupabaseService>();

// Configure CORS for React frontend (updated for Vercel)
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll",
        builder => builder
            .WithOrigins(
                "https://localhost:5173",
                "http://localhost:5173",
                "https://*.vercel.app"  // Allow all Vercel deployments
            )
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials());
});

// Configure port for Railway
var port = Environment.GetEnvironmentVariable("PORT") ?? "5000";
builder.WebHost.ConfigureKestrel(serverOptions =>
{
    serverOptions.ListenAnyIP(int.Parse(port));
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
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Only use HTTPS redirection in development (Railway handles SSL)
if (app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseCors("AllowReact");
app.UseAuthorization();
app.MapControllers();
app.MapFallbackToFile("/index.html");

app.Run();