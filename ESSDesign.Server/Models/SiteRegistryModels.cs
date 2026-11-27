using System.Text.Json;

namespace ESSDesign.Server.Models;

public sealed class SiteRegistryChangeRequest
{
    public string Operation { get; set; } = string.Empty;
    public JsonElement Payload { get; set; }
}

/// <summary>Add a drawing to the Drawing Register: the Add Row form's job, done on the server.</summary>
public sealed class AddDrawingRequest
{
    public string BuilderId { get; set; } = string.Empty;
    public string ProjectId { get; set; } = string.Empty;
    public string Design { get; set; } = string.Empty;
    public string? DateIssued { get; set; }
    public string? RevisionNo { get; set; }
    public string? DesignUse { get; set; }
    /// <summary>True works everything out (the drawing number included) and changes nothing.</summary>
    public bool Preview { get; set; }
}
