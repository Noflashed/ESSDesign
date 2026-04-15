using Microsoft.AspNetCore.Mvc;
using ESSDesign.Server.Models;
using ESSDesign.Server.Services;

namespace ESSDesign.Server.Controllers
{
    [ApiController]
    [Route("api/material-ordering")]
    public class MaterialOrderingController : ControllerBase
    {
        public sealed class InterpretVoiceRequest
        {
            public string Transcript { get; set; } = string.Empty;
        }

        private readonly MaterialOrderingAiService _materialOrderingAiService;
        private readonly SupabaseService _supabaseService;
        private readonly ILogger<MaterialOrderingController> _logger;

        public MaterialOrderingController(
            MaterialOrderingAiService materialOrderingAiService,
            SupabaseService supabaseService,
            ILogger<MaterialOrderingController> logger)
        {
            _materialOrderingAiService = materialOrderingAiService;
            _supabaseService = supabaseService;
            _logger = logger;
        }

        [HttpPost("interpret-voice")]
        public async Task<ActionResult<MaterialOrderingAiService.InterpretationResult>> InterpretVoice(
            [FromBody] InterpretVoiceRequest request,
            CancellationToken cancellationToken)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.Transcript))
                {
                    return BadRequest(new { error = "Transcript is required" });
                }

                var currentUser = await GetCurrentUserAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                var result = await _materialOrderingAiService.InterpretAsync(request.Transcript, cancellationToken);
                return Ok(result);
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Material ordering voice interpretation failed");
                return StatusCode(500, new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected material ordering interpretation error");
                return StatusCode(500, new { error = "Voice interpretation failed" });
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
