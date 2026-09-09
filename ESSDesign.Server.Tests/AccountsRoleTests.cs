using System.Reflection;
using System.Text.Json;
using ESSDesign.Server.Models;
using ESSDesign.Server.Services;
using ESSDesign.Server.Services.Assistant;

namespace ESSDesign.Server.Tests;

public sealed class AccountsRoleTests
{
    private static EssAssistantAccessContext AccountsAccess => new EssAssistantAccessPolicy().For(
        new UserInfo { Id = "accounts-test", Role = AppRoles.Accounts });

    [Theory]
    [InlineData("accounts")]
    [InlineData(" Accounts ")]
    [InlineData("ACCOUNTS")]
    public void RoleSurvivesSessionAndEmployeeInviteNormalization(string role)
    {
        Assert.Contains(AppRoles.Accounts, AppRoles.All);
        var normalize = typeof(SupabaseService).GetMethod("NormalizeRole", BindingFlags.NonPublic | BindingFlags.Static)!;
        var invite = typeof(SupabaseService).GetMethod("ResolveEmployeeInvitedRole", BindingFlags.NonPublic | BindingFlags.Static)!;
        Assert.Equal(AppRoles.Accounts, normalize.Invoke(null, new object[] { role }));
        Assert.Equal(AppRoles.Accounts, invite.Invoke(null, new object[] { role, false }));
        Assert.Equal(AppRoles.Accounts, invite.Invoke(null, new object[] { role, true }));
    }

    [Fact]
    public void AssistantAllowsAccountsWithoutAdministrativeOrTransportPrivileges()
    {
        var access = AccountsAccess;
        Assert.True(access.CanUseAssistant);
        Assert.False(access.IsAdmin);
        Assert.False(access.CanSeePrivateProfileDetails);
        Assert.False(access.CanSeeWorkContactDetails);
        Assert.False(access.CanSeeTransportOperations);
        Assert.False(access.CanSeeAllNotifications);
        Assert.False(access.CanSyncDocumentIndex);
    }

    [Fact]
    public void AssistantAdvertisesOnlyAccountsToolsAndSearchDomains()
    {
        var access = AccountsAccess;
        var catalog = new EssAssistantToolCatalog(null!);
        var names = catalog.GetDefinitions(access).Select(tool => JsonSerializer.SerializeToElement(tool).GetProperty("name").GetString()).ToHashSet();
        foreach (var tool in new[] { "search_ess", "search_sites", "search_designs", "search_drawing_register", "search_project_data", "open_ess_record" })
            Assert.Contains(tool, names);
        foreach (var tool in new[] { "search_people", "get_roster", "search_material_orders", "get_transport", "get_ess_overview", "get_news" })
            Assert.DoesNotContain(tool, names);
        foreach (var domain in new[] { "sites", "designs", "drawing_register", "project_data" })
            Assert.True(access.CanSearchDomain(domain));
        foreach (var domain in new[] { "people", "materials", "transport", "news" })
            Assert.False(access.CanSearchDomain(domain));
    }

    [Theory]
    [InlineData("get_roster", "{}")]
    [InlineData("get_transport", "{}")]
    [InlineData("get_ess_overview", "{}")]
    [InlineData("open_ess_record", "{\"record_type\":\"material_order\",\"record_id\":\"test\"}")]
    public async Task AssistantRejectsOutOfScopeCallsBeforeReachingDataServices(string tool, string arguments)
    {
        var result = await new EssAssistantToolCatalog(null!).ExecuteAsync(tool, arguments, AccountsAccess, CancellationToken.None);
        Assert.True(JsonSerializer.SerializeToElement(result.Data).TryGetProperty("error", out _));
        Assert.Empty(result.Sources);
    }

    [Fact]
    public void ExistingAdminAssistantAccessIsPreserved()
    {
        var access = new EssAssistantAccessPolicy().For(new UserInfo { Role = AppRoles.Admin });
        Assert.True(access.CanUseTool("get_roster"));
        Assert.True(access.CanSearchDomain("people"));
        Assert.True(access.CanSeeTransportOperations);
        Assert.True(access.CanSyncDocumentIndex);
    }
}
