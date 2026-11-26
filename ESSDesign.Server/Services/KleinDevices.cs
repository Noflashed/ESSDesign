using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ESSDesign.Server.Models;
using Microsoft.AspNetCore.WebUtilities;

namespace ESSDesign.Server.Services;

[AttributeUsage(AttributeTargets.Method)]
public sealed class KleinScopeAttribute(string scope) : Attribute
{
    public string Scope { get; } = scope;
}

public sealed record KleinDevice(Guid Id, string Name, string Owner, string[] Scopes);
public sealed record KleinIdentity(KleinDevice Device, UserInfo User)
{
    public static KleinIdentity? From(HttpContext context) => context.Items[typeof(KleinIdentity)] as KleinIdentity;
}

public sealed class KleinDevices(IConfiguration config, IHttpClientFactory clients, SupabaseService users)
{
    public static readonly string[] AllScopes = ["design.read", "design.write", "notify", "register.write", "employees.read"];
    public static string Hash(string value) => WebEncoders.Base64UrlEncode(SHA256.HashData(Encoding.ASCII.GetBytes(value)));
    public static string NewKey() => "essk_" + WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));

    public Task<JsonElement?> Call(string op, object args, CancellationToken ct) =>
        CallRpc("klein_device_request", new { op, args }, ct);

    public Task<JsonElement?> SearchEmployees(string? query, CancellationToken ct) =>
        CallRpc("klein_employee_search", new { search_name = query ?? string.Empty }, ct);

    private async Task<JsonElement?> CallRpc(string function, object body, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, config["Supabase:Url"]!.TrimEnd('/') + "/rest/v1/rpc/" + function);
        var key = config["Supabase:ServiceRoleKey"] ?? config["Supabase:Key"];
        req.Headers.Add("apikey", key);
        req.Headers.Authorization = new("Bearer", key);
        req.Content = JsonContent.Create(body);
        using var response = await clients.CreateClient().SendAsync(req, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement?>(cancellationToken: ct);
    }

    public async Task<KleinIdentity> Identity(JsonElement row)
    {
        var device = row.Deserialize<KleinDevice>(new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        var user = await users.GetUserProfileRowAsync(device.Owner) ?? new UserInfo { Id = device.Owner };
        user.Role = await users.GetUserRoleAsync(device.Owner);
        return new(device, user);
    }

    public static async Task Authenticate(HttpContext context, RequestDelegate next)
    {
        var bearer = context.Request.Headers.Authorization.ToString();
        if (!bearer.StartsWith("Bearer essk_", StringComparison.OrdinalIgnoreCase)) { await next(context); return; }
        var policy = context.GetEndpoint()?.Metadata.GetMetadata<KleinScopeAttribute>();
        if (policy == null) { context.Response.StatusCode = 403; return; }
        var devices = context.RequestServices.GetRequiredService<KleinDevices>();
        var row = await devices.Call("authenticate", new { hash = Hash(bearer[7..]) }, context.RequestAborted);
        if (row == null) { context.Response.StatusCode = 401; return; }
        var identity = await devices.Identity(row.Value);
        if (policy.Scope != "" && !identity.Device.Scopes.Contains(policy.Scope)) { context.Response.StatusCode = 403; return; }
        context.Items[typeof(KleinIdentity)] = identity;
        await next(context);
    }
}
