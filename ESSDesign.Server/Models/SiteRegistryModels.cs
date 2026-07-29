using System.Text.Json;

namespace ESSDesign.Server.Models;

public sealed class SiteRegistryChangeRequest
{
    public string Operation { get; set; } = string.Empty;
    public JsonElement Payload { get; set; }
}
