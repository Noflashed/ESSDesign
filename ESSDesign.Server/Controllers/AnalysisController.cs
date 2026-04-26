using Microsoft.AspNetCore.Mvc;
using ESSDesign.Server.Services;

namespace ESSDesign.Server.Controllers
{
    [ApiController]
    [Route("api/analysis")]
    public class AnalysisController : ControllerBase
    {
        private readonly DeliveryAnalysisService _deliveryAnalysisService;
        private readonly ILogger<AnalysisController> _logger;

        public AnalysisController(
            DeliveryAnalysisService deliveryAnalysisService,
            ILogger<AnalysisController> logger)
        {
            _deliveryAnalysisService = deliveryAnalysisService;
            _logger = logger;
        }

        [HttpPost("delivery-schedule")]
        public async Task<IActionResult> AnalyzeDeliverySchedule(
            [FromBody] DeliveryAnalysisService.DeliveryAnalysisRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.SiteLocation))
                return BadRequest(new { error = "siteLocation is required." });

            if (string.IsNullOrWhiteSpace(request.ScheduledDate))
                return BadRequest(new { error = "scheduledDate is required." });

            try
            {
                var result = await _deliveryAnalysisService.AnalyzeAsync(request);
                return Ok(result);
            }
            catch (InvalidOperationException ex) when (ex.Message.Contains("not configured"))
            {
                _logger.LogError(ex, "Anthropic API key not configured");
                return StatusCode(503, new { error = "AI analysis service is not configured." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Delivery analysis failed for site {Site}", request.SiteLocation);
                return StatusCode(500, new { error = "Analysis failed. Please try again." });
            }
        }
    }
}
