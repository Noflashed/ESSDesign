using System.Collections.Concurrent;
using ESSDesign.Server.Models;
using ESSDesign.Server.Services;
using ESSDesign.Server.Services.Assistant;
using Microsoft.AspNetCore.Mvc;

namespace ESSDesign.Server.Controllers;

[ApiController]
[Route("api/assistant")]
[Route("api/admin-assistant")]
public sealed class AssistantController : ControllerBase
{
    private static readonly ConcurrentDictionary<string, RequestWindow> RequestWindows = new(StringComparer.OrdinalIgnoreCase);
    private readonly EssAssistantService _assistant;
    private readonly EssAssistantAccessPolicy _accessPolicy;
    private readonly EssAssistantConversationStore _conversations;
    private readonly EssAssistantDocumentIndexService _documentIndex;
    private readonly SupabaseService _supabaseService;
    private readonly ILogger<AssistantController> _logger;

    public AssistantController(
        EssAssistantService assistant,
        EssAssistantAccessPolicy accessPolicy,
        EssAssistantConversationStore conversations,
        EssAssistantDocumentIndexService documentIndex,
        SupabaseService supabaseService,
        ILogger<AssistantController> logger)
    {
        _assistant = assistant;
        _accessPolicy = accessPolicy;
        _conversations = conversations;
        _documentIndex = documentIndex;
        _supabaseService = supabaseService;
        _logger = logger;
    }

    [HttpPost("chat")]
    public async Task<ActionResult<EssAssistantChatResponse>> Chat(
        [FromBody] EssAssistantChatRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Message))
            return BadRequest(new { error = "Message is required." });
        if (request.Message.Length > 4_000)
            return BadRequest(new { error = "Messages must be 4,000 characters or fewer." });

        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null)
            return Unauthorized(new { error = "Not authenticated." });
        if (!AllowRequest(currentUser.Id))
            return StatusCode(StatusCodes.Status429TooManyRequests, new { error = "Too many assistant requests. Please wait a moment and try again." });

        request.Message = request.Message.Trim();
        request.History = request.History
            .Where(item => item.Role is "user" or "assistant" && !string.IsNullOrWhiteSpace(item.Content))
            .TakeLast(20)
            .Select(item => new EssAssistantHistoryMessage
            {
                Role = item.Role,
                Content = item.Content.Length <= 8_000 ? item.Content : item.Content[..8_000],
            })
            .ToList();

        try
        {
            return Ok(await _assistant.ChatAsync(request, _accessPolicy.For(currentUser), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "ESS assistant is not configured");
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = "ESS Assistant is not configured yet." });
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            return new EmptyResult();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "ESS assistant chat failed for {UserId}", currentUser.Id);
            return StatusCode(StatusCodes.Status502BadGateway, new { error = "ESS Assistant could not complete that request. Please try again." });
        }
    }

    [HttpPost("feedback")]
    public async Task<IActionResult> Feedback([FromBody] FeedbackRequest request, CancellationToken cancellationToken)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null)
            return Unauthorized(new { error = "Not authenticated." });
        if (request.ConversationId == Guid.Empty || request.Rating is < -1 or > 1 || request.Rating == 0)
            return BadRequest(new { error = "A conversation and positive or negative rating are required." });

        try
        {
            await _conversations.SaveFeedbackAsync(
                request.ConversationId,
                request.MessageId,
                _accessPolicy.For(currentUser),
                request.Rating,
                request.Comment,
                cancellationToken);
            return Ok(new { saved = true });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unable to save ESS assistant feedback");
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = "Feedback could not be saved." });
        }
    }

    [HttpPost("documents/sync")]
    public async Task<ActionResult<EssAssistantDocumentSyncResult>> SyncDocuments(
        [FromQuery] int limit = 250,
        CancellationToken cancellationToken = default)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null)
            return Unauthorized(new { error = "Not authenticated." });

        var access = _accessPolicy.For(currentUser);
        if (!access.CanSyncDocumentIndex)
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "Administrator access is required." });

        try
        {
            return Ok(await _documentIndex.SyncAsync(Math.Clamp(limit, 1, 5_000), access, cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = ex.Message });
        }
    }

    private async Task<UserInfo?> GetCurrentUserAsync()
    {
        var authorizationHeader = Request.Headers.Authorization.ToString();
        if (string.IsNullOrWhiteSpace(authorizationHeader) ||
            !authorizationHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return null;

        var accessToken = authorizationHeader["Bearer ".Length..].Trim();
        return await _supabaseService.GetAuthUserInfoFromAccessTokenAsync(accessToken);
    }

    private static bool AllowRequest(string userId)
    {
        var now = DateTimeOffset.UtcNow;
        var window = RequestWindows.AddOrUpdate(
            userId,
            _ => new RequestWindow(now, 1),
            (_, current) => now - current.StartedAt >= TimeSpan.FromMinutes(1)
                ? new RequestWindow(now, 1)
                : current with { Count = current.Count + 1 });
        return window.Count <= 30;
    }

    public sealed class FeedbackRequest
    {
        public Guid ConversationId { get; set; }
        public Guid? MessageId { get; set; }
        public int Rating { get; set; }
        public string? Comment { get; set; }
    }

    private sealed record RequestWindow(DateTimeOffset StartedAt, int Count);
}
