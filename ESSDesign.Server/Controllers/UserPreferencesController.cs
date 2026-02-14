using Microsoft.AspNetCore.Mvc;
using ESSDesign.Server.Models;
using ESSDesign.Server.Services;
using System.Text.Json;

namespace ESSDesign.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class UserPreferencesController : ControllerBase
    {
        private readonly SupabaseService _supabaseService;
        private readonly ILogger<UserPreferencesController> _logger;

        public UserPreferencesController(
            SupabaseService supabaseService,
            ILogger<UserPreferencesController> logger)
        {
            _supabaseService = supabaseService;
            _logger = logger;
        }

        private Guid GetUserId()
        {
            var authHeader = Request.Headers.Authorization.ToString();
            if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
            {
                throw new UnauthorizedAccessException("No authorization token provided");
            }

            var token = authHeader["Bearer ".Length..];
            // Decode the JWT payload (second segment) to extract the user ID
            var parts = token.Split('.');
            if (parts.Length < 2)
            {
                throw new UnauthorizedAccessException("Invalid token format");
            }

            var payload = parts[1];
            // Pad base64 if needed
            payload = payload.PadRight(payload.Length + (4 - payload.Length % 4) % 4, '=');
            var jsonBytes = Convert.FromBase64String(payload);
            var claims = JsonSerializer.Deserialize<JsonElement>(jsonBytes);

            if (claims.TryGetProperty("sub", out var sub) && Guid.TryParse(sub.GetString(), out var userId))
            {
                return userId;
            }

            throw new UnauthorizedAccessException("User ID not found in token");
        }

        [HttpGet]
        public async Task<ActionResult<UserPreferencesResponse>> GetPreferences()
        {
            try
            {
                var userId = GetUserId();
                var preferences = await _supabaseService.GetUserPreferencesAsync(userId);
                
                if (preferences == null)
                {
                    // Return default preferences if none exist
                    return Ok(new UserPreferencesResponse
                    {
                        UserId = userId,
                        SelectedFolderId = null,
                        Theme = "light",
                        ViewMode = "grid",
                        SidebarWidth = 280,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    });
                }

                return Ok(new UserPreferencesResponse
                {
                    UserId = preferences.UserId,
                    SelectedFolderId = preferences.SelectedFolderId,
                    Theme = preferences.Theme,
                    ViewMode = preferences.ViewMode,
                    SidebarWidth = preferences.SidebarWidth,
                    CreatedAt = preferences.CreatedAt,
                    UpdatedAt = preferences.UpdatedAt
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting user preferences");
                return StatusCode(500, "Error getting preferences");
            }
        }

        [HttpPut]
        public async Task<ActionResult<UserPreferencesResponse>> UpdatePreferences(
            [FromBody] UserPreferencesRequest request)
        {
            try
            {
                var userId = GetUserId();
                var preferences = await _supabaseService.UpsertUserPreferencesAsync(
                    userId,
                    request.SelectedFolderId,
                    request.Theme,
                    request.ViewMode,
                    request.SidebarWidth
                );

                return Ok(new UserPreferencesResponse
                {
                    UserId = preferences.UserId,
                    SelectedFolderId = preferences.SelectedFolderId,
                    Theme = preferences.Theme,
                    ViewMode = preferences.ViewMode,
                    SidebarWidth = preferences.SidebarWidth,
                    CreatedAt = preferences.CreatedAt,
                    UpdatedAt = preferences.UpdatedAt
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating user preferences");
                return StatusCode(500, "Error updating preferences");
            }
        }
    }
}
