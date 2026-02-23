using System.Text.Json;
using ESSDesign.Server.Models;
using ESSDesign.Server.Services;
using Microsoft.AspNetCore.Mvc;

namespace ESSDesign.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class NotificationsController : ControllerBase
    {
        private readonly SupabaseService _supabaseService;
        private readonly PushNotificationService _pushNotificationService;
        private readonly ILogger<NotificationsController> _logger;

        public NotificationsController(
            SupabaseService supabaseService,
            PushNotificationService pushNotificationService,
            ILogger<NotificationsController> logger)
        {
            _supabaseService = supabaseService;
            _pushNotificationService = pushNotificationService;
            _logger = logger;
        }

        [HttpPost("device-token")]
        public async Task<ActionResult> RegisterDeviceToken([FromBody] RegisterDeviceTokenRequest request)
        {
            try
            {
                var token = request.Token ?? request.DeviceToken ?? request.ApnsToken;
                if (string.IsNullOrWhiteSpace(token))
                {
                    return BadRequest(new { error = "Token is required" });
                }

                var userId = GetUserIdOptional();
                if (userId == Guid.Empty && Guid.TryParse(request.UserId, out var parsed))
                {
                    userId = parsed;
                }

                if (userId == Guid.Empty)
                {
                    return Unauthorized(new { error = "Unable to resolve user from auth token" });
                }

                await _supabaseService.UpsertUserPushTokenAsync(
                    userId,
                    token.Trim(),
                    request.Platform ?? "ios",
                    request.AppBundleId
                );

                return Ok(new
                {
                    message = "Device token registered",
                    pushConfigured = _pushNotificationService.IsConfigured()
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error registering device token");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        private Guid GetUserIdOptional()
        {
            try
            {
                var authHeader = Request.Headers.Authorization.ToString();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                {
                    return Guid.Empty;
                }

                var token = authHeader["Bearer ".Length..];
                var parts = token.Split('.');
                if (parts.Length < 2)
                {
                    return Guid.Empty;
                }

                var payload = parts[1];
                payload = payload.PadRight(payload.Length + (4 - payload.Length % 4) % 4, '=');
                var jsonBytes = Convert.FromBase64String(payload);
                var claims = JsonSerializer.Deserialize<JsonElement>(jsonBytes);

                if (claims.TryGetProperty("sub", out var sub) && Guid.TryParse(sub.GetString(), out var userId))
                {
                    return userId;
                }

                return Guid.Empty;
            }
            catch
            {
                return Guid.Empty;
            }
        }
    }
}
