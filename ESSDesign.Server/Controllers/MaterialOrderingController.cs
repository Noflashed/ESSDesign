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

        public sealed class ConfirmVoiceCorrectionRequest
        {
            public string HeardPhrase { get; set; } = string.Empty;
            public string RowId { get; set; } = string.Empty;
            public string Side { get; set; } = string.Empty;
            public string Label { get; set; } = string.Empty;
            public string? Spec { get; set; }
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

                Guid? currentUserId = Guid.TryParse(currentUser.Id, out var parsedUserId) ? parsedUserId : null;
                var result = await _materialOrderingAiService.InterpretAsync(request.Transcript, currentUserId, cancellationToken);
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

        [HttpPost("confirm-voice-correction")]
        public async Task<ActionResult> ConfirmVoiceCorrection(
            [FromBody] ConfirmVoiceCorrectionRequest request,
            CancellationToken cancellationToken)
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                if (!Guid.TryParse(currentUser.Id, out var userId))
                {
                    return BadRequest(new { error = "Invalid user context" });
                }

                if (string.IsNullOrWhiteSpace(request.HeardPhrase) ||
                    string.IsNullOrWhiteSpace(request.RowId) ||
                    string.IsNullOrWhiteSpace(request.Side) ||
                    string.IsNullOrWhiteSpace(request.Label))
                {
                    return BadRequest(new { error = "Heard phrase, row, side, and label are required" });
                }

                await _materialOrderingAiService.SaveConfirmedCorrectionAsync(
                    userId,
                    request.HeardPhrase,
                    request.RowId,
                    request.Side,
                    request.Label,
                    request.Spec,
                    cancellationToken);

                return Ok(new { success = true });
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Material ordering voice correction save failed");
                return StatusCode(500, new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected material ordering correction error");
                return StatusCode(500, new { error = "Voice correction save failed" });
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
