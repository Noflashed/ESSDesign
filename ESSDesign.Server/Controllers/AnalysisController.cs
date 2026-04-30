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
                _logger.LogError(ex, "OpenAI API key not configured");
                return StatusCode(503, new { error = "AI analysis service is not configured." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Delivery analysis failed for site {Site}", request.SiteLocation);
                return StatusCode(500, new { error = "Analysis failed. Please try again." });
            }
        }

        [HttpPost("recommend-time-slot")]
        public async Task<IActionResult> RecommendTimeSlot(
            [FromBody] DeliveryAnalysisService.TimeSlotRecommendationRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.ScheduledDate))
                return BadRequest(new { error = "scheduledDate is required." });

            try
            {
                var result = await _deliveryAnalysisService.RecommendTimeSlotAsync(request);
                return Ok(result);
            }
            catch (InvalidOperationException ex) when (ex.Message.Contains("not configured"))
            {
                _logger.LogError(ex, "OpenAI API key not configured");
                return StatusCode(503, new { error = "AI analysis service is not configured." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Time slot recommendation failed");
                return StatusCode(500, new { error = "Recommendation failed. Please try again." });
            }
        }

        [HttpPost("route-preview")]
        public async Task<IActionResult> RoutePreview(
            [FromBody] DeliveryAnalysisService.RoutePreviewRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.SiteLocation))
                return BadRequest(new { error = "siteLocation is required." });

            try
            {
                var result = await _deliveryAnalysisService.GetRoutePreviewAsync(request);
                if (result == null)
                {
                    return NotFound(new { error = "Route preview unavailable for this site." });
                }

                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Route preview failed for site {Site}", request.SiteLocation);
                return StatusCode(500, new { error = "Route preview failed. Please try again." });
            }
        }

        [HttpPost("route-preview-between")]
        public async Task<IActionResult> RoutePreviewBetween(
            [FromBody] DeliveryAnalysisService.RoutePreviewBetweenRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.FromLocation))
                return BadRequest(new { error = "fromLocation is required." });

            if (string.IsNullOrWhiteSpace(request.ToLocation))
                return BadRequest(new { error = "toLocation is required." });

            try
            {
                var result = await _deliveryAnalysisService.GetRoutePreviewBetweenAsync(request);
                if (result == null)
                {
                    return NotFound(new { error = "Route preview unavailable for this route." });
                }

                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Route preview failed between {From} and {To}", request.FromLocation, request.ToLocation);
                return StatusCode(500, new { error = "Route preview failed. Please try again." });
            }
        }
    }
}
