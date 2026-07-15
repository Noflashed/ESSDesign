using System.Collections.Concurrent;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ESSDesign.Server.Models;
using ESSDesign.Server.Services;
using ESSDesign.Server.Services.Assistant;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http.Features;

namespace ESSDesign.Server.Controllers;

[ApiController]
[Route("api/assistant")]
[Route("api/admin-assistant")]
public sealed class AssistantController : ControllerBase
{
    private static readonly ConcurrentDictionary<string, RequestWindow> RequestWindows = new(StringComparer.OrdinalIgnoreCase);
    private static readonly ConcurrentDictionary<string, CachedAssistantUser> UserCache = new(StringComparer.Ordinal);
    private static readonly TimeSpan UserCacheDuration = TimeSpan.FromMinutes(2);
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

        var authTimer = Stopwatch.StartNew();
        var currentUser = await GetCurrentUserAsync();
        authTimer.Stop();
        if (currentUser == null)
            return Unauthorized(new { error = "Not authenticated." });
        if (!AllowRequest(currentUser.Id))
            return StatusCode(StatusCodes.Status429TooManyRequests, new { error = "Too many assistant requests. Please wait a moment and try again." });

        NormalizeRequest(request);

        try
        {
            return Ok(await _assistant.ChatAsync(
                request,
                _accessPolicy.For(currentUser),
                cancellationToken,
                authTimer.ElapsedMilliseconds));
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

    [HttpPost("chat/stream")]
    public async Task ChatStream(
        [FromBody] EssAssistantChatRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Message) || request.Message.Length > 4_000)
        {
            Response.StatusCode = StatusCodes.Status400BadRequest;
            await Response.WriteAsJsonAsync(new { error = "A message of 4,000 characters or fewer is required." }, cancellationToken);
            return;
        }

        var authTimer = Stopwatch.StartNew();
        var currentUser = await GetCurrentUserAsync();
        authTimer.Stop();
        if (currentUser == null)
        {
            Response.StatusCode = StatusCodes.Status401Unauthorized;
            await Response.WriteAsJsonAsync(new { error = "Not authenticated." }, cancellationToken);
            return;
        }
        if (!AllowRequest(currentUser.Id))
        {
            Response.StatusCode = StatusCodes.Status429TooManyRequests;
            await Response.WriteAsJsonAsync(new { error = "Too many assistant requests. Please wait a moment and try again." }, cancellationToken);
            return;
        }

        NormalizeRequest(request);
        Response.StatusCode = StatusCodes.Status200OK;
        Response.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-cache, no-store";
        Response.Headers.ContentEncoding = "identity";
        Response.Headers.Append("X-Accel-Buffering", "no");
        HttpContext.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();

        async Task EmitAsync(EssAssistantStreamEvent streamEvent, CancellationToken token)
        {
            var json = JsonSerializer.Serialize(streamEvent, new JsonSerializerOptions(JsonSerializerDefaults.Web));
            await Response.WriteAsync($"event: {streamEvent.Type}\ndata: {json}\n\n", token);
            await Response.Body.FlushAsync(token);
        }

        try
        {
            await _assistant.ChatStreamAsync(
                request,
                _accessPolicy.For(currentUser),
                EmitAsync,
                cancellationToken,
                authTimer.ElapsedMilliseconds);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // The browser closed the stream.
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "ESS assistant stream failed for {UserId}", currentUser.Id);
            if (!cancellationToken.IsCancellationRequested)
            {
                await EmitAsync(new EssAssistantStreamEvent
                {
                    Type = "error",
                    Message = "ESS Assistant could not complete that request. Please try again.",
                }, cancellationToken);
            }
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

    [HttpGet("feedback/logs")]
    public async Task<ActionResult<List<EssAssistantFeedbackLog>>> ListFeedbackLogs(
        [FromQuery] int limit = 250,
        CancellationToken cancellationToken = default)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null)
            return Unauthorized(new { error = "Not authenticated." });

        var access = _accessPolicy.For(currentUser);
        if (!access.IsAdmin)
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "Administrator access is required." });

        try
        {
            return Ok(await _conversations.ListFeedbackAsync(access, Math.Clamp(limit, 1, 500), cancellationToken));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unable to load ESS AI feedback logs");
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = "Feedback logs could not be loaded." });
        }
    }

    [HttpDelete("feedback/logs")]
    public async Task<IActionResult> ClearFeedbackLogs(CancellationToken cancellationToken)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null)
            return Unauthorized(new { error = "Not authenticated." });

        var access = _accessPolicy.For(currentUser);
        if (!access.IsAdmin)
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "Administrator access is required." });

        try
        {
            await _conversations.ClearFeedbackAsync(access, cancellationToken);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unable to clear ESS AI feedback logs");
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = "Feedback logs could not be cleared." });
        }
    }

    [HttpGet("conversations")]
    public async Task<ActionResult<List<EssAssistantConversationSummary>>> ListConversations(
        [FromQuery] int limit = 100,
        CancellationToken cancellationToken = default)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null)
            return Unauthorized(new { error = "Not authenticated." });

        try
        {
            return Ok(await _conversations.ListConversationsAsync(
                _accessPolicy.For(currentUser),
                Math.Clamp(limit, 1, 200),
                cancellationToken));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unable to list ESS AI conversations for {UserId}", currentUser.Id);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = "Saved chats could not be loaded." });
        }
    }

    [HttpGet("conversations/{conversationId:guid}")]
    public async Task<ActionResult<EssAssistantConversationDetails>> GetConversation(
        Guid conversationId,
        CancellationToken cancellationToken)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null)
            return Unauthorized(new { error = "Not authenticated." });

        var conversation = await _conversations.GetConversationAsync(
            conversationId,
            _accessPolicy.For(currentUser),
            cancellationToken);
        return conversation == null
            ? NotFound(new { error = "The saved chat was not found." })
            : Ok(conversation);
    }

    [HttpPatch("conversations/{conversationId:guid}")]
    public async Task<IActionResult> RenameConversation(
        Guid conversationId,
        [FromBody] RenameConversationRequest request,
        CancellationToken cancellationToken)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null)
            return Unauthorized(new { error = "Not authenticated." });
        if (string.IsNullOrWhiteSpace(request.Title))
            return BadRequest(new { error = "A chat title is required." });

        try
        {
            await _conversations.RenameConversationAsync(
                conversationId,
                _accessPolicy.For(currentUser),
                request.Title,
                cancellationToken);
            return Ok(new { saved = true });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { error = "The saved chat was not found." });
        }
    }

    [HttpDelete("conversations/{conversationId:guid}")]
    public async Task<IActionResult> DeleteConversation(
        Guid conversationId,
        CancellationToken cancellationToken)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null)
            return Unauthorized(new { error = "Not authenticated." });

        try
        {
            await _conversations.DeleteConversationAsync(
                conversationId,
                _accessPolicy.For(currentUser),
                cancellationToken);
            return NoContent();
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { error = "The saved chat was not found." });
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
        var cacheKey = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(accessToken)));
        if (UserCache.TryGetValue(cacheKey, out var cached) && cached.ExpiresAt > DateTimeOffset.UtcNow)
            return cached.User;

        var user = await _supabaseService.GetAuthUserInfoFromAccessTokenAsync(accessToken);
        if (user != null)
            UserCache[cacheKey] = new CachedAssistantUser(user, DateTimeOffset.UtcNow.Add(UserCacheDuration));
        if (UserCache.Count > 1_000)
        {
            foreach (var expired in UserCache.Where(item => item.Value.ExpiresAt <= DateTimeOffset.UtcNow).Select(item => item.Key))
                UserCache.TryRemove(expired, out _);
        }
        return user;
    }

    private static void NormalizeRequest(EssAssistantChatRequest request)
    {
        request.Message = request.Message.Trim();
        request.History = request.History
            .Where(item => item.Role is "user" or "assistant" && !string.IsNullOrWhiteSpace(item.Content))
            .TakeLast(10)
            .Select(item => new EssAssistantHistoryMessage
            {
                Role = item.Role,
                Content = item.Content.Length <= 8_000 ? item.Content : item.Content[..8_000],
            })
            .ToList();
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

    public sealed class RenameConversationRequest
    {
        public string Title { get; set; } = string.Empty;
    }

    private sealed record RequestWindow(DateTimeOffset StartedAt, int Count);
    private sealed record CachedAssistantUser(UserInfo User, DateTimeOffset ExpiresAt);
}
