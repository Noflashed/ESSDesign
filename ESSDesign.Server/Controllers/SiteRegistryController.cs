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
    [KleinScope("design.read")]
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
    [KleinScope("register.write")]
    public async Task<ActionResult<JsonElement>> ApplyChange(
        [FromBody] SiteRegistryChangeRequest request,
        CancellationToken cancellationToken = default)
    {
        if (KleinIdentity.From(HttpContext) != null && request.Operation is not ("upsert_drawing_entry" or "upsert_drawing_entries" or "create_builder" or "create_project"))
            return StatusCode(403);
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

    private static readonly SemaphoreSlim AddDrawingLock = new(1, 1);

    /// <summary>
    /// Add a drawing to the Drawing Register in one call, as the Add Row form does: the next ESD number,
    /// the scaffold folder under the project's ESS Design directory, and the register row. With
    /// preview set it only works them out, so Klein can read the drawing number back before the user's yes.
    /// </summary>
    [HttpPost("drawings")]
    [KleinScope("register.write")]
    public async Task<ActionResult> AddDrawing(
        [FromBody] AddDrawingRequest request,
        CancellationToken cancellationToken = default)
    {
        var access = await RequireSiteRegistryManagerAsync();
        if (access.Error != null)
        {
            return access.Error;
        }

        var design = DrawingRegisterNumbers.CleanName(request.Design);
        if (design.Length == 0)
        {
            return BadRequest(new { error = "Enter a design description." });
        }

        var dateIssued = string.IsNullOrWhiteSpace(request.DateIssued)
            ? DrawingRegisterNumbers.Today()
            : DrawingRegisterNumbers.DateIssued(request.DateIssued);
        if (dateIssued.Length == 0)
        {
            return BadRequest(new { error = "The issue date isn't a valid date." });
        }

        var revisionNo = (request.RevisionNo ?? string.Empty).Trim();
        var designUse = DrawingRegisterNumbers.DesignUse(request.DesignUse);
        if (!string.IsNullOrWhiteSpace(request.DesignUse) && designUse.Length == 0)
        {
            return BadRequest(new { error = "The design use must be Construction, Preliminary, Concept or As-Built." });
        }

        var missing = new List<string>();
        if (revisionNo.Length == 0) missing.Add("revisionNo");
        if (designUse.Length == 0) missing.Add("designUse");
        if (!request.Preview && missing.Count > 0)
        {
            return BadRequest(new { error = "A revision number and design use are required.", missing });
        }

        if (!request.Preview)
        {
            await AddDrawingLock.WaitAsync(cancellationToken);
        }

        try
        {
            var document = await _siteRegistryService.GetDocumentAsync(true, cancellationToken);
            var builder = FindById(document, "builders", request.BuilderId);
            if (builder == null)
            {
                return NotFound(new { error = "That client isn't in the Site Registry." });
            }

            var project = FindById(builder.Value, "projects", request.ProjectId);
            if (project == null)
            {
                return NotFound(new { error = "That project isn't under the selected client in the Site Registry." });
            }

            var client = DrawingRegisterNumbers.Text(builder.Value, "name");
            var projectName = DrawingRegisterNumbers.Text(project.Value, "name");
            if (project.Value.TryGetProperty("archived", out var archived) && archived.ValueKind == JsonValueKind.True)
            {
                return BadRequest(new { error = $"{projectName} is archived in the Site Registry." });
            }

            if (!Guid.TryParse(DrawingRegisterNumbers.Text(project.Value, "designFolderId"), out var projectFolderId))
            {
                return BadRequest(new { error = $"{projectName} does not have an ESS Design directory linked in the Site Registry." });
            }

            FolderResponse projectFolder;
            try
            {
                projectFolder = await _supabaseService.GetFolderByIdAsync(projectFolderId, forceRefresh: true);
            }
            catch (Exception)
            {
                return BadRequest(new { error = $"The ESS Design directory linked to {projectName} could not be found. Please relink it in the Site Registry." });
            }

            var folderName = design.ToUpperInvariant();
            var existingFolder = projectFolder.SubFolders.FirstOrDefault(folder =>
                DrawingRegisterNumbers.CleanName(folder.Name).ToUpperInvariant() == folderName);
            var drawingNo = DrawingRegisterNumbers.Next(DrawingRegisterNumbers.Rows(document), client, projectName);

            if (request.Preview)
            {
                return Ok(new
                {
                    added = false, drawingNo, client, project = projectName, design, dateIssued, revisionNo, designUse,
                    folder = folderName, folderExists = existingFolder != null, missing
                });
            }

            var folderId = existingFolder?.Id;
            if (folderId == null)
            {
                if (!IsDesignContributor(access.User!))
                {
                    return StatusCode(StatusCodes.Status403Forbidden, new { error = "Design contributor access required to create the scaffold folder." });
                }
                folderId = (await _supabaseService.CreateFolderAsync(folderName, projectFolderId, access.User!.Id)).Id;
            }

            var entry = new
            {
                id = $"manual-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                builderId = DrawingRegisterNumbers.Text(builder.Value, "id"),
                projectId = DrawingRegisterNumbers.Text(project.Value, "id"),
                client,
                project = projectName,
                design,
                drawingNo,
                dateIssued,
                revisionNo,
                designUse
            };
            await _siteRegistryService.ApplyChangeAsync(
                "upsert_drawing_entry",
                JsonSerializer.SerializeToElement(new { entry }),
                cancellationToken);
            _logger.LogInformation("Added drawing {DrawingNo} for {Client} / {Project} by user {UserId}{Via}",
                drawingNo, client, projectName, access.User!.Id,
                KleinIdentity.From(HttpContext) is { } device ? $" via Klein ({device.Device.Name})" : string.Empty);

            return Ok(new
            {
                added = true, id = entry.id, drawingNo, client, project = projectName, design, dateIssued, revisionNo,
                designUse, folder = folderName, folderId, folderExists = existingFolder != null, missing
            });
        }
        catch (SiteRegistryConflictException ex)
        {
            return Conflict(new { error = ex.Message });
        }
        catch (SiteRegistryUnavailableException ex)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding a Drawing Register entry for user {UserId}", access.User!.Id);
            return StatusCode(StatusCodes.Status500InternalServerError, new { error = "Could not add the drawing." });
        }
        finally
        {
            if (!request.Preview)
            {
                AddDrawingLock.Release();
            }
        }
    }

    private static JsonElement? FindById(JsonElement parent, string property, string id)
    {
        if (string.IsNullOrWhiteSpace(id)
            || parent.ValueKind != JsonValueKind.Object
            || !parent.TryGetProperty(property, out var items)
            || items.ValueKind != JsonValueKind.Array)
        {
            return null;
        }
        foreach (var item in items.EnumerateArray())
        {
            if (string.Equals(DrawingRegisterNumbers.Text(item, "id"), id.Trim(), StringComparison.Ordinal))
            {
                return item;
            }
        }
        return null;
    }

    private static bool IsDesignContributor(UserInfo user) =>
        string.Equals(user.Role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase)
        || string.Equals(user.Role, AppRoles.ScaffoldDesigner, StringComparison.OrdinalIgnoreCase)
        || string.Equals(user.Role, AppRoles.ProjectManager, StringComparison.OrdinalIgnoreCase);

    private async Task<UserInfo?> GetCurrentUserAsync()
    {
            if (KleinIdentity.From(HttpContext) is {} device) return device.User;
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
            || string.Equals(currentUser.Role, AppRoles.Accounts, StringComparison.OrdinalIgnoreCase)
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
