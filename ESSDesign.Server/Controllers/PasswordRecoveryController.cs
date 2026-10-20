using System.ComponentModel.DataAnnotations;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using ESSDesign.Server.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace ESSDesign.Server.Controllers;

[ApiController]
[Route("api/auth/password")]
[EnableRateLimiting("password-recovery")]
public class PasswordRecoveryController(IHttpClientFactory clients, IConfiguration configuration,
    EmailService email, ILogger<PasswordRecoveryController> logger) : ControllerBase
{
    public record ForgotRequest([Required, EmailAddress, MaxLength(254)] string Email);
    public record VerifyRequest([Required, MaxLength(2048)] string TokenHash);
    public record RecoverySession(string AccessToken);
    public record ResetRequest([Required, MaxLength(16384)] string AccessToken,
        [Required, MinLength(8), MaxLength(128)] string Password);

    private HttpClient AuthClient(bool admin = false)
    {
        var key = configuration[admin ? "Supabase:ServiceRoleKey" : "Supabase:Key"];
        if (string.IsNullOrWhiteSpace(key)) throw new InvalidOperationException("Auth key missing.");
        var client = clients.CreateClient();
        client.BaseAddress = new Uri(configuration["Supabase:Url"]!.TrimEnd('/') + "/auth/v1/");
        client.DefaultRequestHeaders.Add("apikey", key);
        if (admin) client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", key);
        return client;
    }

    [HttpPost("forgot")]
    public async Task<IActionResult> Forgot(ForgotRequest request)
    {
        Response.Headers.CacheControl = "no-store";
        try
        {
            using var client = AuthClient(true);
            using var response = await client.PostAsJsonAsync("admin/generate_link", new { type = "recovery", email = request.Email.Trim().ToLowerInvariant() });
            if (response.IsSuccessStatusCode)
            {
                using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
                var hash = body.RootElement.GetProperty("hashed_token").GetString();
                if (string.IsNullOrWhiteSpace(hash)) throw new InvalidOperationException("Missing recovery token.");
                var frontend = (configuration["AppSettings:FrontendUrl"] ?? "https://essdesign.app").TrimEnd('/');
                await email.SendPasswordRecoveryAsync(request.Email.Trim(), $"{frontend}/?auth=reset-password#token_hash={Uri.EscapeDataString(hash)}");
            }
            else if (response.StatusCode != HttpStatusCode.NotFound && response.StatusCode != HttpStatusCode.UnprocessableEntity)
            {
                logger.LogWarning("Recovery provider returned HTTP {Status}", (int)response.StatusCode);
            }
        }
        catch (Exception)
        {
            // Never log provider bodies, tokens or passwords, or reveal account existence.
            logger.LogError("Password recovery delivery failed. Check Supabase and Resend configuration.");
        }
        return Ok(new { message = "If an account exists for that email, a password reset link will arrive shortly." });
    }

    [HttpPost("verify")]
    public async Task<IActionResult> Verify(VerifyRequest request)
    {
        Response.Headers.CacheControl = "no-store";
        try
        {
            using var client = AuthClient();
            using var verification = await client.PostAsJsonAsync("verify", new { type = "recovery", token_hash = request.TokenHash });
            if (!verification.IsSuccessStatusCode)
                return BadRequest(new { error = "This reset link is invalid or has expired. Please request a new link." });
            using var session = JsonDocument.Parse(await verification.Content.ReadAsStringAsync());
            var token = session.RootElement.GetProperty("access_token").GetString();
            if (string.IsNullOrWhiteSpace(token)) throw new InvalidOperationException();
            return Ok(new RecoverySession(token));
        }
        catch (Exception)
        {
            logger.LogError("Password recovery verification failed.");
            return StatusCode(503, new { error = "Unable to verify your reset link. Please try again." });
        }
    }

    [HttpPost("reset")]
    public async Task<IActionResult> Reset(ResetRequest request)
    {
        Response.Headers.CacheControl = "no-store";
        try
        {
            using var client = AuthClient();
            // Supabase validates this user session. Never use the admin key for updates.
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", request.AccessToken);
            using var update = await client.PutAsJsonAsync("user", new { password = request.Password });
            if (!update.IsSuccessStatusCode)
            {
                if (update.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
                    return BadRequest(new { error = "Your reset session has expired. Please request a new link." });
                if (update.StatusCode == HttpStatusCode.TooManyRequests)
                    return StatusCode(429, new { error = "Too many attempts. Please wait a minute and try again." });
                using var failure = JsonDocument.Parse(await update.Content.ReadAsStringAsync());
                var code = failure.RootElement.TryGetProperty("code", out var value) ? value.GetString() : null;
                var message = code == "same_password"
                    ? "Choose a password different from your current password, then try again."
                    : code == "weak_password"
                    ? "Choose a stronger password with uppercase and lowercase letters, numbers and symbols, then try again."
                    : "The password could not be accepted. Choose a different, stronger password and try again.";
                return BadRequest(new { error = message });
            }
            // Revoke refresh sessions, including the temporary recovery session.
            using var logout = await client.PostAsync("logout?scope=global", null);
            if (!logout.IsSuccessStatusCode) logger.LogWarning("Recovery session revocation returned HTTP {Status}", (int)logout.StatusCode);
            return Ok(new { message = "Password updated. Sign in with your new password." });
        }
        catch (Exception)
        {
            logger.LogError("Password recovery update failed.");
            return StatusCode(503, new { error = "Unable to reset your password right now. Please try again." });
        }
    }
}
