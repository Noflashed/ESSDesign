using Microsoft.AspNetCore.Mvc;
using ESSDesign.Server.Models;
using ESSDesign.Server.Services;

namespace ESSDesign.Server.Controllers
{
    [ApiController]
    [Route("api/admin-assistant")]
    public sealed class AdminAssistantController : ControllerBase
    {
        public sealed class ChatRequest
        {
            public string Message { get; set; } = string.Empty;
            public List<AdminAssistantService.ChatMessage> History { get; set; } = new();
        }

        private readonly AdminAssistantService _adminAssistantService;
        private readonly SupabaseService _supabaseService;
        private readonly ILogger<AdminAssistantController> _logger;

        public AdminAssistantController(
            AdminAssistantService adminAssistantService,
            SupabaseService supabaseService,
            ILogger<AdminAssistantController> logger)
        {
            _adminAssistantService = adminAssistantService;
            _supabaseService = supabaseService;
            _logger = logger;
        }

        [HttpPost("chat")]
        public async Task<ActionResult<AdminAssistantService.ChatResult>> Chat(
            [FromBody] ChatRequest request,
            CancellationToken cancellationToken)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.Message))
                {
                    return BadRequest(new { error = "Message is required" });
                }

                var currentUser = await GetCurrentUserAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                if (!string.Equals(currentUser.Role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase))
                {
                    return StatusCode(StatusCodes.Status403Forbidden, new { error = "Admin access required" });
                }

                var result = await _adminAssistantService.AskAsync(
                    request.Message,
                    request.History,
                    currentUser,
                    cancellationToken);

                return Ok(result);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Admin assistant chat failed");
                return StatusCode(500, new { error = "Admin assistant failed" });
            }
        }

        private async Task<UserInfo?> GetCurrentUserAsync()
        {
            var authorizationHeader = Request.Headers.Authorization.ToString();
            if (string.IsNullOrWhiteSpace(authorizationHeader) ||
                !authorizationHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            var accessToken = authorizationHeader.Substring("Bearer ".Length).Trim();
            return await _supabaseService.GetAuthUserInfoFromAccessTokenAsync(accessToken);
        }
    }
}
