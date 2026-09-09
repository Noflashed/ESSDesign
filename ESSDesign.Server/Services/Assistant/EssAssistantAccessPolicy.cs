using ESSDesign.Server.Models;

namespace ESSDesign.Server.Services.Assistant;

public sealed class EssAssistantAccessPolicy
{
    private static readonly HashSet<string> AssistantRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        AppRoles.Admin,
        AppRoles.Accounts,
        AppRoles.SiteSupervisor,
        AppRoles.ProjectManager,
        AppRoles.LeadingHand,
    };

    private static readonly HashSet<string> ManagementRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        AppRoles.Admin,
        AppRoles.ProjectManager,
        AppRoles.SiteSupervisor,
    };

    private static readonly HashSet<string> TransportRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        AppRoles.Admin,
        AppRoles.ProjectManager,
        AppRoles.SiteSupervisor,
        AppRoles.TransportManagement,
        AppRoles.TruckEss01,
        AppRoles.TruckEss02,
        AppRoles.TruckEss03,
    };

    public EssAssistantAccessContext For(UserInfo user) => new()
    {
        UserId = user.Id,
        UserName = string.IsNullOrWhiteSpace(user.PreferredName) ? user.FullName : user.PreferredName!,
        Email = user.Email,
        Role = string.IsNullOrWhiteSpace(user.Role) ? AppRoles.Viewer : user.Role,
        CanUseAssistant = AssistantRoles.Contains(user.Role),
        IsAdmin = string.Equals(user.Role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase),
        CanSeeWorkContactDetails = ManagementRoles.Contains(user.Role),
        CanSeePrivateProfileDetails = string.Equals(user.Role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase),
        CanSeeTransportOperations = TransportRoles.Contains(user.Role),
        CanSeeAllNotifications = string.Equals(user.Role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase),
        CanSyncDocumentIndex = string.Equals(user.Role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase),
    };
}

public sealed class EssAssistantAccessContext
{
    private static readonly HashSet<string> AccountsTools = new(StringComparer.Ordinal)
    {
        "search_ess", "search_sites", "calculate_site_distances", "search_designs",
        "search_drawing_register", "search_project_data", "get_notifications",
        "get_weather", "open_ess_record",
    };

    public bool IsAccounts => string.Equals(Role, AppRoles.Accounts, StringComparison.OrdinalIgnoreCase);
    public bool CanUseTool(string name) => CanUseAssistant && (!IsAccounts || AccountsTools.Contains(name));
    public bool CanSearchDomain(string domain) => !IsAccounts || domain is "sites" or "designs" or "drawing_register" or "project_data";

    public string UserId { get; init; } = string.Empty;
    public string UserName { get; init; } = string.Empty;
    public string Email { get; init; } = string.Empty;
    public string Role { get; init; } = string.Empty;
    public bool CanUseAssistant { get; init; }
    public bool IsAdmin { get; init; }
    public bool CanSeeWorkContactDetails { get; init; }
    public bool CanSeePrivateProfileDetails { get; init; }
    public bool CanSeeTransportOperations { get; init; }
    public bool CanSeeAllNotifications { get; init; }
    public bool CanSyncDocumentIndex { get; init; }

    public string DescribeForModel() =>
        $"user={UserName}; role={Role}; workContactDetails={CanSeeWorkContactDetails}; " +
        $"privateProfileDetails={CanSeePrivateProfileDetails}; transportOperations={CanSeeTransportOperations}; " +
        $"allNotifications={CanSeeAllNotifications}";
}
