namespace ESSDesign.Server.Services;

/// <summary>Fixed diagnostic categories; contains no transcript or provider response body.</summary>
public sealed class PreStartAnswerFailure(string code, string? validationStep = null, string? field = null)
    : HttpRequestException("Pre-start answer failed: " + code)
{
    public string Code { get; } = code;
    public string? ValidationStep { get; } = validationStep;
    public string? Field { get; } = field;
}
