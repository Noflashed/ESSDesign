using System.Text.Json;

namespace ESSDesign.Server.Services.Assistant;

public sealed class EssAssistantConversationStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly EssAssistantSupabaseGateway _gateway;
    private readonly ILogger<EssAssistantConversationStore> _logger;
    private int _schemaWarningLogged;

    public EssAssistantConversationStore(
        EssAssistantSupabaseGateway gateway,
        ILogger<EssAssistantConversationStore> logger)
    {
        _gateway = gateway;
        _logger = logger;
    }

    public async Task<EssAssistantPreparedTurn> PrepareTurnAsync(
        Guid? requestedConversationId,
        EssAssistantAccessContext access,
        string message,
        int historyLimit,
        CancellationToken cancellationToken)
    {
        var messageId = Guid.NewGuid();
        try
        {
            var result = await _gateway.InvokeJsonRpcAsync(
                "prepare_ess_ai_chat_turn",
                new
                {
                    p_conversation_id = requestedConversationId,
                    p_user_id = Guid.Parse(access.UserId),
                    p_title = BuildTitle(message),
                    p_message_id = messageId,
                    p_message = message,
                    p_history_limit = Math.Clamp(historyLimit, 1, 20),
                },
                cancellationToken);
            var conversationId = Guid.Parse(GetString(result, "conversationId")!);
            var history = result.TryGetProperty("history", out var historyValue) && historyValue.ValueKind == JsonValueKind.Array
                ? historyValue.EnumerateArray()
                    .Select(row => new EssAssistantHistoryMessage
                    {
                        Role = GetString(row, "role") ?? string.Empty,
                        Content = GetString(row, "content") ?? string.Empty,
                    })
                    .Where(item => item.Role is "user" or "assistant" && !string.IsNullOrWhiteSpace(item.Content))
                    .ToList()
                : new List<EssAssistantHistoryMessage>();
            return new EssAssistantPreparedTurn(conversationId, messageId, history);
        }
        catch (Exception ex) when (ex is FormatException || ex.Message.Contains("prepare_ess_ai_chat_turn", StringComparison.Ordinal))
        {
            if (Interlocked.Exchange(ref _schemaWarningLogged, 1) == 0)
                _logger.LogWarning(ex, "Apply migration 035_reduce_assistant_latency.sql to enable the low-latency conversation path");

            var conversationId = await GetOrCreateAsync(requestedConversationId, access, message, cancellationToken);
            var history = await LoadRecentAsync(conversationId, access, historyLimit, cancellationToken);
            await AppendMessageAsync(conversationId, access, "user", message, null, cancellationToken, messageId);
            return new EssAssistantPreparedTurn(conversationId, messageId, history);
        }
    }

    public async Task<Guid> GetOrCreateAsync(
        Guid? requestedConversationId,
        EssAssistantAccessContext access,
        string firstMessage,
        CancellationToken cancellationToken)
    {
        if (requestedConversationId.HasValue)
        {
            var existing = await TryAsync(() => _gateway.GetRowsAsync(
                $"ess_ai_conversations?select=id&id=eq.{requestedConversationId.Value:D}&user_id=eq.{Uri.EscapeDataString(access.UserId)}&limit=1",
                cancellationToken));
            if (existing?.Count > 0)
                return requestedConversationId.Value;
        }

        var conversationId = Guid.NewGuid();
        var title = BuildTitle(firstMessage);
        await TryAsync(() => _gateway.InsertRowsAsync(
            "ess_ai_conversations",
            new
            {
                id = conversationId,
                user_id = access.UserId,
                title,
                created_at = DateTimeOffset.UtcNow,
                updated_at = DateTimeOffset.UtcNow,
            },
            cancellationToken));
        return conversationId;
    }

    public async Task<List<EssAssistantConversationSummary>> ListConversationsAsync(
        EssAssistantAccessContext access,
        int limit,
        CancellationToken cancellationToken)
    {
        var rows = await _gateway.GetRowsAsync(
            $"ess_ai_conversations?select=id,title,created_at,updated_at&user_id=eq.{Uri.EscapeDataString(access.UserId)}&order=updated_at.desc&limit={Math.Clamp(limit, 1, 200)}",
            cancellationToken);
        return rows
            .Select(ToConversationSummary)
            .Where(conversation => conversation.Id != Guid.Empty)
            .ToList();
    }

    public async Task<EssAssistantConversationDetails?> GetConversationAsync(
        Guid conversationId,
        EssAssistantAccessContext access,
        CancellationToken cancellationToken)
    {
        var conversationTask = _gateway.GetRowsAsync(
            $"ess_ai_conversations?select=id,title,created_at,updated_at&id=eq.{conversationId:D}&user_id=eq.{Uri.EscapeDataString(access.UserId)}&limit=1",
            cancellationToken);
        var messagesTask = _gateway.GetRowsAsync(
            $"ess_ai_messages?select=id,role,content,sources,created_at&conversation_id=eq.{conversationId:D}&user_id=eq.{Uri.EscapeDataString(access.UserId)}&order=created_at.asc&limit=500",
            cancellationToken);
        await Task.WhenAll(conversationTask, messagesTask);

        var summary = conversationTask.Result.Select(ToConversationSummary).FirstOrDefault();
        if (summary == null || summary.Id == Guid.Empty)
            return null;

        return new EssAssistantConversationDetails
        {
            Id = summary.Id,
            Title = summary.Title,
            CreatedAt = summary.CreatedAt,
            UpdatedAt = summary.UpdatedAt,
            Messages = messagesTask.Result
                .Select(ToSavedMessage)
                .Where(message => message.Id != Guid.Empty && (message.Role is "user" or "assistant"))
                .ToList(),
        };
    }

    public async Task RenameConversationAsync(
        Guid conversationId,
        EssAssistantAccessContext access,
        string title,
        CancellationToken cancellationToken)
    {
        var safeTitle = BuildTitle(title);
        await EnsureConversationOwnershipAsync(conversationId, access, cancellationToken);
        await _gateway.PatchRowsAsync(
            $"ess_ai_conversations?id=eq.{conversationId:D}&user_id=eq.{Uri.EscapeDataString(access.UserId)}",
            new { title = safeTitle, updated_at = DateTimeOffset.UtcNow },
            cancellationToken);
    }

    public async Task DeleteConversationAsync(
        Guid conversationId,
        EssAssistantAccessContext access,
        CancellationToken cancellationToken)
    {
        await EnsureConversationOwnershipAsync(conversationId, access, cancellationToken);
        await _gateway.DeleteRowsAsync(
            $"ess_ai_conversations?id=eq.{conversationId:D}&user_id=eq.{Uri.EscapeDataString(access.UserId)}",
            cancellationToken);
    }

    public async Task<List<EssAssistantHistoryMessage>> LoadRecentAsync(
        Guid conversationId,
        EssAssistantAccessContext access,
        int limit,
        CancellationToken cancellationToken)
    {
        var rows = await TryAsync(() => _gateway.GetRowsAsync(
            $"ess_ai_messages?select=role,content,created_at&conversation_id=eq.{conversationId:D}&user_id=eq.{Uri.EscapeDataString(access.UserId)}&order=created_at.desc&limit={Math.Clamp(limit, 1, 40)}",
            cancellationToken));

        if (rows == null)
            return new List<EssAssistantHistoryMessage>();

        return rows
            .Select(row => new EssAssistantHistoryMessage
            {
                Role = GetString(row, "role") ?? string.Empty,
                Content = GetString(row, "content") ?? string.Empty,
            })
            .Where(message => message.Role is "user" or "assistant" && !string.IsNullOrWhiteSpace(message.Content))
            .Reverse()
            .ToList();
    }

    public async Task<Guid> AppendMessageAsync(
        Guid conversationId,
        EssAssistantAccessContext access,
        string role,
        string content,
        IReadOnlyList<EssAssistantSource>? sources,
        CancellationToken cancellationToken,
        Guid? requestedMessageId = null)
    {
        var safeContent = content.Length <= 30_000 ? content : content[..30_000];
        var messageId = requestedMessageId ?? Guid.NewGuid();
        var insertTask = TryAsync(() => _gateway.InsertRowsAsync(
            "ess_ai_messages",
            new
            {
                id = messageId,
                conversation_id = conversationId,
                user_id = access.UserId,
                role,
                content = safeContent,
                sources = sources ?? Array.Empty<EssAssistantSource>(),
                created_at = DateTimeOffset.UtcNow,
            },
            cancellationToken));
        var touchTask = TryAsync(async () =>
        {
            await _gateway.PatchRowsAsync(
                $"ess_ai_conversations?id=eq.{conversationId:D}&user_id=eq.{Uri.EscapeDataString(access.UserId)}",
                new { updated_at = DateTimeOffset.UtcNow },
                cancellationToken);
            return true;
        });
        await Task.WhenAll(insertTask, touchTask);
        return messageId;
    }

    public async Task RecordRunAsync(
        Guid conversationId,
        EssAssistantAccessContext access,
        EssAssistantRunMetrics metrics,
        CancellationToken cancellationToken)
    {
        await TryAsync(() => _gateway.InsertRowsAsync(
            "ess_ai_runs",
            new
            {
                id = metrics.RunId,
                conversation_id = conversationId,
                user_id = access.UserId,
                user_role = access.Role,
                model = metrics.Model,
                tool_names = metrics.ToolNames,
                tool_call_count = metrics.ToolCalls,
                input_tokens = metrics.InputTokens,
                output_tokens = metrics.OutputTokens,
                cached_input_tokens = metrics.CachedInputTokens,
                reasoning_tokens = metrics.ReasoningTokens,
                duration_ms = metrics.DurationMs,
                route = metrics.Route,
                authentication_ms = metrics.AuthenticationMs,
                preparation_ms = metrics.PreparationMs,
                model_ms = metrics.ModelMs,
                tool_ms = metrics.ToolMs,
                persistence_ms = metrics.PersistenceMs,
                first_event_ms = metrics.FirstEventMs,
                success = metrics.Success,
                error_code = metrics.ErrorCode,
                created_at = DateTimeOffset.UtcNow,
            },
            cancellationToken));
    }

    public async Task SaveFeedbackAsync(
        Guid conversationId,
        Guid? messageId,
        EssAssistantAccessContext access,
        int rating,
        string? comment,
        CancellationToken cancellationToken)
    {
        var conversation = await _gateway.GetRowsAsync(
            $"ess_ai_conversations?select=id&id=eq.{conversationId:D}&user_id=eq.{Uri.EscapeDataString(access.UserId)}&limit=1",
            cancellationToken);
        if (conversation.Count == 0)
            throw new InvalidOperationException("The assistant conversation was not found for this user.");
        if (messageId.HasValue)
        {
            var message = await _gateway.GetRowsAsync(
                $"ess_ai_messages?select=id&id=eq.{messageId.Value:D}&conversation_id=eq.{conversationId:D}&user_id=eq.{Uri.EscapeDataString(access.UserId)}&limit=1",
                cancellationToken);
            if (message.Count == 0)
                throw new InvalidOperationException("The assistant message was not found in this conversation.");
        }

        var safeComment = string.IsNullOrWhiteSpace(comment) ? null : comment.Trim();
        if (safeComment?.Length > 2_000)
            safeComment = safeComment[..2_000];
        await _gateway.InsertRowsAsync(
            "ess_ai_feedback",
            new
            {
                id = Guid.NewGuid(),
                conversation_id = conversationId,
                message_id = messageId,
                user_id = access.UserId,
                rating = Math.Clamp(rating, -1, 1),
                comment = safeComment,
                created_at = DateTimeOffset.UtcNow,
            },
            cancellationToken);
    }

    public async Task<List<EssAssistantFeedbackLog>> ListFeedbackAsync(
        EssAssistantAccessContext access,
        int limit,
        CancellationToken cancellationToken)
    {
        if (!access.IsAdmin)
            throw new UnauthorizedAccessException("Administrator access is required.");

        var feedbackRows = await _gateway.GetRowsAsync(
            $"ess_ai_feedback?select=id,conversation_id,message_id,user_id,rating,comment,created_at&order=created_at.desc&limit={Math.Clamp(limit, 1, 500)}",
            cancellationToken);
        if (feedbackRows.Count == 0)
            return new List<EssAssistantFeedbackLog>();

        var conversationIds = feedbackRows
            .Select(row => GetString(row, "conversation_id"))
            .Where(value => Guid.TryParse(value, out _))
            .Select(value => value!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var userIds = feedbackRows
            .Select(row => GetString(row, "user_id"))
            .Where(value => Guid.TryParse(value, out _))
            .Select(value => value!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var conversationRows = await LoadRowsInBatchesAsync(
            "ess_ai_conversations",
            "id,title",
            "id",
            conversationIds,
            cancellationToken);
        var messageRows = await LoadRowsInBatchesAsync(
            "ess_ai_messages",
            "id,conversation_id,role,content,created_at",
            "conversation_id",
            conversationIds,
            cancellationToken,
            20_000,
            "created_at.asc");
        var userRows = await LoadRowsInBatchesAsync(
            "user_names",
            "id,full_name,email",
            "id",
            userIds,
            cancellationToken);

        var titles = conversationRows
            .Where(row => !string.IsNullOrWhiteSpace(GetString(row, "id")))
            .GroupBy(row => GetString(row, "id")!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => GetString(group.First(), "title") ?? "New conversation", StringComparer.OrdinalIgnoreCase);
        var users = userRows
            .Where(row => !string.IsNullOrWhiteSpace(GetString(row, "id")))
            .GroupBy(row => GetString(row, "id")!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => GetString(group.First(), "full_name") ?? GetString(group.First(), "email") ?? "ESS user",
                StringComparer.OrdinalIgnoreCase);
        var messagesByConversation = messageRows
            .Select(row => new FeedbackMessage(
                GetString(row, "id") ?? string.Empty,
                GetString(row, "conversation_id") ?? string.Empty,
                GetString(row, "role") ?? string.Empty,
                GetString(row, "content") ?? string.Empty,
                ParseTimestamp(GetString(row, "created_at"))))
            .Where(message => !string.IsNullOrWhiteSpace(message.ConversationId))
            .GroupBy(message => message.ConversationId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.OrderBy(message => message.CreatedAt).ToList(), StringComparer.OrdinalIgnoreCase);

        return feedbackRows.Select(row =>
        {
            var conversationIdText = GetString(row, "conversation_id") ?? string.Empty;
            var messageIdText = GetString(row, "message_id");
            var userId = GetString(row, "user_id") ?? string.Empty;
            var feedbackAt = ParseTimestamp(GetString(row, "created_at"));
            messagesByConversation.TryGetValue(conversationIdText, out var messages);
            messages ??= new List<FeedbackMessage>();

            var responseIndex = !string.IsNullOrWhiteSpace(messageIdText)
                ? messages.FindIndex(message => string.Equals(message.Id, messageIdText, StringComparison.OrdinalIgnoreCase))
                : -1;
            if (responseIndex < 0)
            {
                responseIndex = messages.FindLastIndex(message =>
                    message.Role == "assistant" && message.CreatedAt <= feedbackAt);
            }

            var response = responseIndex >= 0 ? messages[responseIndex].Content : string.Empty;
            var question = responseIndex > 0
                ? messages.Take(responseIndex).LastOrDefault(message => message.Role == "user")?.Content ?? string.Empty
                : string.Empty;

            return new EssAssistantFeedbackLog
            {
                Id = Guid.TryParse(GetString(row, "id"), out var id) ? id : Guid.Empty,
                ConversationId = Guid.TryParse(conversationIdText, out var conversationId) ? conversationId : Guid.Empty,
                MessageId = Guid.TryParse(messageIdText, out var messageId) ? messageId : null,
                UserId = userId,
                UserName = users.GetValueOrDefault(userId, "ESS user"),
                ConversationTitle = titles.GetValueOrDefault(conversationIdText, "New conversation"),
                Question = question,
                Response = response,
                Rating = GetInt(row, "rating"),
                Comment = GetString(row, "comment"),
                CreatedAt = feedbackAt,
            };
        }).Where(item => item.Id != Guid.Empty).ToList();
    }

    public async Task ClearFeedbackAsync(EssAssistantAccessContext access, CancellationToken cancellationToken)
    {
        if (!access.IsAdmin)
            throw new UnauthorizedAccessException("Administrator access is required.");

        await _gateway.DeleteRowsAsync("ess_ai_feedback?id=not.is.null", cancellationToken);
    }

    private async Task<List<JsonElement>> LoadRowsInBatchesAsync(
        string table,
        string select,
        string filterColumn,
        IReadOnlyList<string> ids,
        CancellationToken cancellationToken,
        int limit = 500,
        string? order = null)
    {
        if (ids.Count == 0)
            return new List<JsonElement>();

        var orderQuery = string.IsNullOrWhiteSpace(order) ? string.Empty : $"&order={order}";
        var tasks = ids.Chunk(40).Select(batch => _gateway.GetRowsAsync(
            $"{table}?select={select}&{filterColumn}=in.({string.Join(',', batch)}){orderQuery}&limit={limit}",
            cancellationToken));
        var batches = await Task.WhenAll(tasks);
        return batches.SelectMany(rows => rows).ToList();
    }

    private async Task EnsureConversationOwnershipAsync(
        Guid conversationId,
        EssAssistantAccessContext access,
        CancellationToken cancellationToken)
    {
        var rows = await _gateway.GetRowsAsync(
            $"ess_ai_conversations?select=id&id=eq.{conversationId:D}&user_id=eq.{Uri.EscapeDataString(access.UserId)}&limit=1",
            cancellationToken);
        if (rows.Count == 0)
            throw new KeyNotFoundException("The ESS AI conversation was not found.");
    }

    private async Task<T?> TryAsync<T>(Func<Task<T>> action)
    {
        try
        {
            return await action();
        }
        catch (Exception ex)
        {
            if (Interlocked.Exchange(ref _schemaWarningLogged, 1) == 0)
            {
                _logger.LogWarning(ex,
                    "ESS assistant persistence is unavailable. Apply database migration 033_rebuild_ess_ai_assistant.sql to enable conversations, audit records, feedback, and document indexing.");
            }
            return default;
        }
    }

    private static string BuildTitle(string message)
    {
        var title = string.Join(' ', message.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return title.Length <= 80 ? title : $"{title[..77]}...";
    }

    private static EssAssistantConversationSummary ToConversationSummary(JsonElement row) => new()
    {
        Id = Guid.TryParse(GetString(row, "id"), out var id) ? id : Guid.Empty,
        Title = GetString(row, "title") ?? "New conversation",
        CreatedAt = ParseTimestamp(GetString(row, "created_at")),
        UpdatedAt = ParseTimestamp(GetString(row, "updated_at")),
    };

    private static EssAssistantSavedMessage ToSavedMessage(JsonElement row)
    {
        var sources = new List<EssAssistantSource>();
        if (row.TryGetProperty("sources", out var sourceValue) && sourceValue.ValueKind == JsonValueKind.Array)
        {
            try
            {
                sources = JsonSerializer.Deserialize<List<EssAssistantSource>>(sourceValue.GetRawText(), JsonOptions)
                    ?? new List<EssAssistantSource>();
            }
            catch (JsonException)
            {
                sources = new List<EssAssistantSource>();
            }
        }
        return new EssAssistantSavedMessage
        {
            Id = Guid.TryParse(GetString(row, "id"), out var id) ? id : Guid.Empty,
            Role = GetString(row, "role") ?? string.Empty,
            Content = GetString(row, "content") ?? string.Empty,
            Sources = sources,
            CreatedAt = ParseTimestamp(GetString(row, "created_at")),
        };
    }

    private static DateTimeOffset ParseTimestamp(string? value) =>
        DateTimeOffset.TryParse(value, out var timestamp) ? timestamp : DateTimeOffset.MinValue;

    private static string? GetString(JsonElement element, string property)
    {
        if (!element.TryGetProperty(property, out var value) || value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            return null;
        return value.ValueKind == JsonValueKind.String ? value.GetString() : value.ToString();
    }

    private static int GetInt(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.TryGetInt32(out var number) ? number : 0;

    private sealed record FeedbackMessage(string Id, string ConversationId, string Role, string Content, DateTimeOffset CreatedAt);
}

public sealed record EssAssistantPreparedTurn(
    Guid ConversationId,
    Guid UserMessageId,
    List<EssAssistantHistoryMessage> History);
