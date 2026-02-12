using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ESSDesign.Server.Models;
using ESSDesign.Server.Services;
using System.Security.Claims;

namespace ESSDesign.Server.Controllers
{
    [Authorize]
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
            var userIdString = User.FindFirst(ClaimTypes.NameIdentifier)?.Value 
                ?? throw new UnauthorizedAccessException("User ID not found");
            
            if (!Guid.TryParse(userIdString, out var userId))
            {
                throw new UnauthorizedAccessException("Invalid User ID format");
            }
            
            return userId;
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
