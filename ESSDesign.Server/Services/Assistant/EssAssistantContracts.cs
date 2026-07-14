using System.Text.Json;

namespace ESSDesign.Server.Services.Assistant;

public sealed class EssAssistantChatRequest
{
    public string Message { get; set; } = string.Empty;
    public Guid? ConversationId { get; set; }
    public List<EssAssistantHistoryMessage> History { get; set; } = new();
    public EssAssistantPageContext? PageContext { get; set; }
}

public sealed class EssAssistantHistoryMessage
{
    public string Role { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
}

public sealed class EssAssistantPageContext
{
    public string? Page { get; set; }
    public string? BuilderId { get; set; }
    public string? ProjectId { get; set; }
    public string? FolderId { get; set; }
    public string? DocumentId { get; set; }
}

public sealed class EssAssistantChatResponse
{
    public Guid ConversationId { get; set; }
    public Guid? MessageId { get; set; }
    public string Reply { get; set; } = string.Empty;
    public bool Grounded { get; set; }
    public List<EssAssistantSource> Sources { get; set; } = new();
    public List<EssAssistantLink> Links { get; set; } = new();
    public List<string> FollowUps { get; set; } = new();
}

public sealed class EssAssistantStreamEvent
{
    public string Type { get; init; } = string.Empty;
    public string? Message { get; init; }
    public string? Delta { get; init; }
    public EssAssistantChatResponse? Response { get; init; }
}

public sealed class EssAssistantSource
{
    public string Id { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string? Detail { get; set; }
    public string? UpdatedAt { get; set; }
    public string? Url { get; set; }
}

public sealed class EssAssistantLink
{
    public string Label { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
}

public sealed class EssAssistantToolResult
{
    public object Data { get; init; } = new { };
    public List<EssAssistantSource> Sources { get; init; } = new();
    public List<EssAssistantLink> Links { get; init; } = new();
}

public sealed class EssAssistantRunMetrics
{
    public Guid RunId { get; init; } = Guid.NewGuid();
    public string Model { get; set; } = string.Empty;
    public int ToolCalls { get; set; }
    public int InputTokens { get; set; }
    public int OutputTokens { get; set; }
    public int CachedInputTokens { get; set; }
    public int ReasoningTokens { get; set; }
    public long DurationMs { get; set; }
    public long AuthenticationMs { get; set; }
    public long PreparationMs { get; set; }
    public long ModelMs { get; set; }
    public long ToolMs { get; set; }
    public long PersistenceMs { get; set; }
    public long FirstEventMs { get; set; }
    public string Route { get; set; } = string.Empty;
    public bool Success { get; set; }
    public string? ErrorCode { get; set; }
    public List<string> ToolNames { get; } = new();
}

internal sealed class EssAssistantModelAnswer
{
    public string Reply { get; set; } = string.Empty;
    public bool Grounded { get; set; }
    public List<string> SourceIds { get; set; } = new();
    public List<string> FollowUps { get; set; } = new();
}

internal sealed class EssAssistantModelResponse
{
    public string Id { get; init; } = string.Empty;
    public List<JsonElement> Output { get; init; } = new();
    public int InputTokens { get; init; }
    public int OutputTokens { get; init; }
    public int CachedInputTokens { get; init; }
    public int ReasoningTokens { get; init; }
}
