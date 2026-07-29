using System.Text.Json;
using ESSDesign.Server.Models;
using ESSDesign.Server.Services;
using Microsoft.AspNetCore.Mvc;

namespace ESSDesign.Server.Controllers;

[ApiController]
[Route("api/site-registry")]
public sealed class SiteRegistryController : ControllerBase
{
    private static readonly HashSet<string> AllowedOperations = new(StringComparer.OrdinalIgnoreCase)
    {
        "create_builder",
        "create_builder_and_project",
        "update_builder",
        "delete_builder",
        "create_project",
        "update_project",
        "delete_project",
        "set_project_archived",
        "update_folder_links",
        "upsert_drawing_entry",
        "upsert_drawing_entries",
        "delete_drawing_entry",
        "replace_drawing_register"
    };

    private readonly SiteRegistryService _siteRegistryService;
    private readonly SupabaseService _supabaseService;
    private readonly ILogger<SiteRegistryController> _logger;

    public SiteRegistryController(
        SiteRegistryService siteRegistryService,
        SupabaseService supabaseService,
        ILogger<SiteRegistryController> logger)
    {
        _siteRegistryService = siteRegistryService;
        _supabaseService = supabaseService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<JsonElement>> Get(
        [FromQuery] bool includeArchived = true,
        CancellationToken cancellationToken = default)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null)
        {
            return Unauthorized(new { error = "Not authenticated" });
        }

        try
        {
            return Ok(await _siteRegistryService.GetDocumentAsync(includeArchived, cancellationToken));
        }
        catch (SiteRegistryUnavailableException ex)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error loading the relational Site Registry");
            return StatusCode(StatusCodes.Status500InternalServerError, new { error = "Could not load the Site Registry." });
        }
    }

    [HttpPost("changes")]
    public async Task<ActionResult<JsonElement>> ApplyChange(
        [FromBody] SiteRegistryChangeRequest request,
        CancellationToken cancellationToken = default)
    {
        var access = await RequireSiteRegistryManagerAsync();
        if (access.Error != null)
        {
            return access.Error;
        }

        if (string.IsNullOrWhiteSpace(request.Operation)
            || !AllowedOperations.Contains(request.Operation))
        {
            return BadRequest(new { error = "Unsupported Site Registry operation." });
        }

        try
        {
            var document = await _siteRegistryService.ApplyChangeAsync(
                request.Operation,
                request.Payload,
                cancellationToken);
            return Ok(document);
        }
        catch (SiteRegistryConflictException ex)
        {
            return Conflict(new { error = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (SiteRegistryUnavailableException ex)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Error applying Site Registry operation {Operation} for user {UserId}",
                request.Operation,
                access.User!.Id);
            return StatusCode(
                StatusCodes.Status500InternalServerError,
                new { error = "Could not save the Site Registry change." });
        }
    }

    private async Task<UserInfo?> GetCurrentUserAsync()
    {
        var authorizationHeader = Request.Headers.Authorization.ToString();
        if (string.IsNullOrWhiteSpace(authorizationHeader)
            || !authorizationHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var accessToken = authorizationHeader["Bearer ".Length..].Trim();
        return await _supabaseService.GetAuthUserInfoFromAccessTokenAsync(accessToken);
    }

    private async Task<(UserInfo? User, ActionResult? Error)> RequireSiteRegistryManagerAsync()
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null)
        {
            return (null, Unauthorized(new { error = "Not authenticated" }));
        }

        var canManage =
            string.Equals(currentUser.Role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase)
            || string.Equals(currentUser.Role, AppRoles.Viewer, StringComparison.OrdinalIgnoreCase)
            || string.Equals(currentUser.Role, AppRoles.ProjectManager, StringComparison.OrdinalIgnoreCase)
            || string.Equals(currentUser.Role, AppRoles.SiteSupervisor, StringComparison.OrdinalIgnoreCase)
            || string.Equals(currentUser.Role, AppRoles.ScaffoldDesigner, StringComparison.OrdinalIgnoreCase);

        return canManage
            ? (currentUser, null)
            : (null, StatusCode(
                StatusCodes.Status403Forbidden,
                new { error = "Site Registry management access required" }));
    }
}
