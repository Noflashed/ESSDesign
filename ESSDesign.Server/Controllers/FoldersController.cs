using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ESSDesign.Server.Models;
using ESSDesign.Server.Services;

namespace ESSDesign.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class FoldersController : ControllerBase
    {
        private readonly SupabaseService _supabaseService;
        private readonly EmailService _emailService;
        private readonly PushNotificationService _pushNotificationService;
        private readonly ILogger<FoldersController> _logger;

        public FoldersController(
            SupabaseService supabaseService,
            EmailService emailService,
            PushNotificationService pushNotificationService,
            ILogger<FoldersController> logger)
        {
            _supabaseService = supabaseService;
            _emailService = emailService;
            _pushNotificationService = pushNotificationService;
            _logger = logger;
        }

        [HttpGet]
        public async Task<ActionResult<List<FolderResponse>>> GetRootFolders()
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                var folders = await _supabaseService.GetRootFoldersAsync();
                return Ok(folders);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting root folders");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("{folderId}")]
        public async Task<ActionResult<FolderResponse>> GetFolder(Guid folderId)
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                var folder = await _supabaseService.GetFolderByIdAsync(folderId);
                return Ok(folder);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting folder");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("{folderId}/breadcrumbs")]
        public async Task<ActionResult<List<BreadcrumbItem>>> GetBreadcrumbs(Guid folderId)
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                var breadcrumbs = await _supabaseService.GetBreadcrumbsAsync(folderId);
                return Ok(breadcrumbs);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting breadcrumbs");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost]
        public async Task<ActionResult<FolderResponse>> CreateFolder([FromBody] CreateFolderRequest request)
        {
            try
            {
                var adminResult = await RequireAdminAsync();
                if (adminResult.Error != null)
                {
                    return adminResult.Error;
                }

                if (string.IsNullOrWhiteSpace(request.Name))
                {
                    return BadRequest(new { error = "Folder name is required" });
                }

                var folderId = await _supabaseService.CreateFolderAsync(request.Name, request.ParentFolderId, adminResult.User!.Id);
                var folderResponse = await _supabaseService.GetFolderByIdAsync(folderId);

                _logger.LogInformation("Created folder {FolderId} with name {Name}", folderId, request.Name);
                return Ok(folderResponse);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating folder");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPut("{folderId}/rename")]
        public async Task<ActionResult> RenameFolder(Guid folderId, [FromBody] RenameFolderRequest request)
        {
            try
            {
                var adminResult = await RequireAdminAsync();
                if (adminResult.Error != null)
                {
                    return adminResult.Error;
                }

                if (string.IsNullOrWhiteSpace(request.NewName))
                {
                    return BadRequest(new { error = "New name is required" });
                }

                await _supabaseService.RenameFolderAsync(folderId, request.NewName);
                return Ok(new { message = "Folder renamed" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error renaming folder");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpDelete("{folderId}")]
        public async Task<ActionResult> DeleteFolder(Guid folderId)
        {
            try
            {
                var adminResult = await RequireAdminAsync();
                if (adminResult.Error != null)
                {
                    return adminResult.Error;
                }

                await _supabaseService.DeleteFolderAsync(folderId);
                return Ok(new { message = "Folder deleted" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting folder");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("documents")]
        [RequestSizeLimit(1_000_000_000)]
        public async Task<ActionResult> UploadDocument([FromForm] UploadDocumentRequest request)
        {
            try
            {
                var adminResult = await RequireAdminAsync();
                if (adminResult.Error != null)
                {
                    return adminResult.Error;
                }

                if (request.FolderId == Guid.Empty)
                {
                    return BadRequest(new { error = "Folder ID required" });
                }
                if (string.IsNullOrWhiteSpace(request.RevisionNumber))
                {
                    return BadRequest(new { error = "Revision number required" });
                }
                if (request.EssDesignIssue == null && request.ThirdPartyDesign == null)
                {
                    return BadRequest(new { error = "At least one file required" });
                }

                var actingUserId = adminResult.User!.Id;
                var documentId = await _supabaseService.UploadDocumentAsync(
                    request.FolderId,
                    request.RevisionNumber,
                    request.EssDesignIssue,
                    request.ThirdPartyDesign,
                    request.Description,
                    actingUserId
                );

                if (request.RecipientIds != null && request.RecipientIds.Any())
                {
                    try
                    {
                        var folder = await _supabaseService.GetFolderByIdAsync(request.FolderId);
                        var documentName = folder.Name;
                        var hierarchy = await _supabaseService.GetFolderHierarchyAsync(request.FolderId);

                        var requestedUserIds = request.RecipientIds
                            .Concat(new[] { actingUserId })
                            .Distinct()
                            .ToList();
                        var users = await _supabaseService.GetUsersByIdsAsync(requestedUserIds);

                        var uploaderName = users
                            .FirstOrDefault(u => u.Id == actingUserId)?.FullName
                            ?? adminResult.User.FullName
                            ?? adminResult.User.Email;

                        var recipientEmails = users
                            .Where(u => request.RecipientIds.Contains(u.Id))
                            .Select(u => u.Email)
                            .ToList();

                        await _emailService.SendDocumentUploadNotificationAsync(
                            recipientEmails,
                            documentName,
                            request.RevisionNumber,
                            uploaderName,
                            DateTime.UtcNow,
                            documentId,
                            request.FolderId,
                            request.EssDesignIssue != null,
                            request.ThirdPartyDesign != null,
                            hierarchy.Client,
                            hierarchy.Project,
                            hierarchy.Scaffold,
                            request.Description
                        );

                        _logger.LogInformation("Sent email notifications to {Count} recipients for document {DocumentId}",
                            recipientEmails.Count, documentId);

                        var pushSentCount = await _pushNotificationService.SendDocumentUploadPushAsync(
                            request.RecipientIds,
                            uploaderName,
                            hierarchy.Client ?? "Unknown Client",
                            hierarchy.Project ?? "Unknown Project",
                            hierarchy.Scaffold ?? folder.Name,
                            documentName,
                            request.RevisionNumber
                        );

                        _logger.LogInformation("Sent APNs notifications to {Count} devices for document {DocumentId}",
                            pushSentCount, documentId);
                    }
                    catch (Exception emailEx)
                    {
                        _logger.LogError(emailEx, "Error sending notifications for document {DocumentId}", documentId);
                    }
                }

                return Ok(new { id = documentId, message = "Document uploaded" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error uploading document");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpDelete("documents/{documentId}")]
        public async Task<ActionResult> DeleteDocument(Guid documentId)
        {
            try
            {
                var adminResult = await RequireAdminAsync();
                if (adminResult.Error != null)
                {
                    return adminResult.Error;
                }

                await _supabaseService.DeleteDocumentAsync(documentId);
                return Ok(new { message = "Document deleted" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting document");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPut("documents/{documentId}/move")]
        public async Task<ActionResult> MoveDocument(Guid documentId, [FromBody] MoveDocumentRequest request)
        {
            try
            {
                var adminResult = await RequireAdminAsync();
                if (adminResult.Error != null)
                {
                    return adminResult.Error;
                }

                if (request.TargetFolderId == Guid.Empty)
                {
                    return BadRequest(new { error = "Target folder ID is required" });
                }

                await _supabaseService.MoveDocumentAsync(documentId, request.TargetFolderId);
                return Ok(new { message = "Document moved" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error moving document");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPut("documents/{documentId}/revision")]
        public async Task<ActionResult> UpdateDocumentRevision(Guid documentId, [FromBody] UpdateDocumentRevisionRequest request)
        {
            try
            {
                var adminResult = await RequireAdminAsync();
                if (adminResult.Error != null)
                {
                    return adminResult.Error;
                }

                if (string.IsNullOrWhiteSpace(request.NewRevisionNumber))
                {
                    return BadRequest(new { error = "New revision number is required" });
                }

                await _supabaseService.UpdateDocumentRevisionAsync(documentId, request.NewRevisionNumber);
                return Ok(new { message = "Document revision updated" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating document revision");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPut("documents/{documentId}/replace")]
        [RequestSizeLimit(1_000_000_000)]
        public async Task<ActionResult> ReplaceDocumentFiles(Guid documentId, [FromForm] ReplaceDocumentFilesRequest request)
        {
            try
            {
                var adminResult = await RequireAdminAsync();
                if (adminResult.Error != null)
                {
                    return adminResult.Error;
                }

                if (request.EssDesignIssue == null && request.ThirdPartyDesign == null)
                {
                    return BadRequest(new { error = "At least one replacement file is required" });
                }

                var actingUserId = adminResult.User!.Id;
                var updatedDocument = await _supabaseService.ReplaceDocumentFilesAsync(
                    documentId,
                    request.EssDesignIssue,
                    request.ThirdPartyDesign,
                    request.Description,
                    actingUserId);

                if (request.RecipientIds != null && request.RecipientIds.Any())
                {
                    try
                    {
                        var folder = await _supabaseService.GetFolderByIdAsync(updatedDocument.FolderId);
                        var hierarchy = await _supabaseService.GetFolderHierarchyAsync(updatedDocument.FolderId);

                        var requestedUserIds = request.RecipientIds
                            .Concat(new[] { actingUserId })
                            .Distinct()
                            .ToList();
                        var users = await _supabaseService.GetUsersByIdsAsync(requestedUserIds);

                        var updaterName = users
                            .FirstOrDefault(u => u.Id == actingUserId)?.FullName
                            ?? adminResult.User.FullName
                            ?? adminResult.User.Email;

                        var recipientEmails = users
                            .Where(u => request.RecipientIds.Contains(u.Id))
                            .Select(u => u.Email)
                            .Where(email => !string.IsNullOrWhiteSpace(email))
                            .Distinct(StringComparer.OrdinalIgnoreCase)
                            .ToList();

                        if (recipientEmails.Any())
                        {
                            var documentName = updatedDocument.EssDesignIssueName
                                ?? updatedDocument.ThirdPartyDesignName
                                ?? folder.Name;

                            await _emailService.SendDocumentRevisionReplacementNotificationAsync(
                                recipientEmails,
                                documentName,
                                updatedDocument.RevisionNumber,
                                updaterName,
                                DateTime.UtcNow,
                                updatedDocument.Id,
                                updatedDocument.FolderId,
                                !string.IsNullOrWhiteSpace(updatedDocument.EssDesignIssuePath),
                                !string.IsNullOrWhiteSpace(updatedDocument.ThirdPartyDesignPath),
                                hierarchy.Client,
                                hierarchy.Project,
                                hierarchy.Scaffold ?? folder.Name,
                                request.Description);

                            _logger.LogInformation(
                                "Sent revision replacement notifications to {Count} recipients for document {DocumentId}",
                                recipientEmails.Count,
                                documentId);
                        }
                    }
                    catch (Exception emailEx)
                    {
                        _logger.LogError(emailEx, "Error sending revision replacement notifications for document {DocumentId}", documentId);
                    }
                }

                return Ok(new { message = "Document files replaced" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error replacing document files for {DocumentId}", documentId);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("documents/{documentId}/share")]
        public async Task<ActionResult> ShareDocument(Guid documentId, [FromBody] ShareDocumentRequest request)
        {
            try
            {
                var adminResult = await RequireAdminAsync();
                if (adminResult.Error != null)
                {
                    return adminResult.Error;
                }

                if (request.RecipientIds == null || !request.RecipientIds.Any())
                {
                    return BadRequest(new { error = "At least one recipient is required" });
                }

                var actingUserId = adminResult.User!.Id;
                var document = await _supabaseService.GetDocumentByIdAsync(documentId);
                var folder = await _supabaseService.GetFolderByIdAsync(document.FolderId);
                var hierarchy = await _supabaseService.GetFolderHierarchyAsync(document.FolderId);

                var requestedUserIds = request.RecipientIds
                    .Concat(new[] { actingUserId })
                    .Distinct()
                    .ToList();
                var users = await _supabaseService.GetUsersByIdsAsync(requestedUserIds);

                var sharedByName = users
                    .FirstOrDefault(u => u.Id == actingUserId)?.FullName
                    ?? adminResult.User.FullName
                    ?? adminResult.User.Email;

                var recipientEmails = users
                    .Where(u => request.RecipientIds.Contains(u.Id))
                    .Select(u => u.Email)
                    .Where(email => !string.IsNullOrWhiteSpace(email))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                if (!recipientEmails.Any())
                {
                    return BadRequest(new { error = "No valid recipient emails were found" });
                }

                var documentName = document.EssDesignIssueName
                    ?? document.ThirdPartyDesignName
                    ?? folder.Name;

                await _emailService.SendDocumentShareNotificationAsync(
                    recipientEmails,
                    documentName,
                    document.RevisionNumber,
                    sharedByName,
                    document.Id,
                    document.FolderId,
                    !string.IsNullOrWhiteSpace(document.EssDesignIssuePath),
                    !string.IsNullOrWhiteSpace(document.ThirdPartyDesignPath),
                    hierarchy.Client,
                    hierarchy.Project,
                    hierarchy.Scaffold ?? folder.Name);

                _logger.LogInformation("Shared document {DocumentId} with {Count} recipients", documentId, recipientEmails.Count);
                return Ok(new { message = "Document shared" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sharing document {DocumentId}", documentId);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("documents/{documentId}/download/{type}")]
        public async Task<ActionResult> DownloadDocument(Guid documentId, string type, [FromQuery] bool redirect = false)
        {
            try
            {
                if (!redirect)
                {
                    var currentUser = await GetCurrentUserAsync();
                    if (currentUser == null)
                    {
                        return Unauthorized(new { error = "Not authenticated" });
                    }
                }

                if (!type.Equals("ess", StringComparison.OrdinalIgnoreCase) &&
                    !type.Equals("thirdparty", StringComparison.OrdinalIgnoreCase))
                {
                    return BadRequest(new { error = "Type must be 'ess' or 'thirdparty'" });
                }

                var fileInfo = await _supabaseService.GetDocumentDownloadUrlAsync(documentId, type);

                if (redirect)
                {
                    using var httpClient = new HttpClient();
                    var response = await httpClient.GetAsync(fileInfo.Url);
                    response.EnsureSuccessStatusCode();

                    var stream = await response.Content.ReadAsStreamAsync();
                    var contentType = response.Content.Headers.ContentType?.ToString() ?? "application/pdf";

                    Response.Headers.Append("Content-Disposition", $"inline; filename=\"{fileInfo.FileName}\"");

                    return new FileStreamResult(stream, contentType);
                }

                return Ok(new { url = fileInfo.Url, fileName = fileInfo.FileName });
            }
            catch (FileNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error downloading document");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [AllowAnonymous]
        [HttpGet("documents/{documentId}/public-download/{type}")]
        public async Task<ActionResult> DownloadDocumentFromEmail(Guid documentId, string type)
        {
            try
            {
                if (!type.Equals("ess", StringComparison.OrdinalIgnoreCase) &&
                    !type.Equals("thirdparty", StringComparison.OrdinalIgnoreCase))
                {
                    return BadRequest(new { error = "Type must be 'ess' or 'thirdparty'" });
                }

                var fileInfo = await _supabaseService.GetDocumentDownloadUrlAsync(documentId, type);

                using var httpClient = new HttpClient();
                var response = await httpClient.GetAsync(fileInfo.Url);
                response.EnsureSuccessStatusCode();

                var stream = await response.Content.ReadAsStreamAsync();
                var contentType = response.Content.Headers.ContentType?.ToString() ?? "application/pdf";

                Response.Headers.Append("Content-Disposition", $"inline; filename=\"{fileInfo.FileName}\"");

                return new FileStreamResult(stream, contentType);
            }
            catch (FileNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error downloading emailed document");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("search")]
        public async Task<ActionResult<List<SearchResult>>> Search([FromQuery] string q)
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 2)
                {
                    return BadRequest(new { error = "Search query must be at least 2 characters" });
                }

                var results = await _supabaseService.SearchAsync(q.Trim());
                return Ok(results);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error searching");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("health")]
        public ActionResult Health()
        {
            return Ok(new { status = "healthy", timestamp = DateTime.UtcNow });
        }

        private async Task<UserInfo?> GetCurrentUserAsync()
        {
            var authorizationHeader = Request.Headers.Authorization.ToString();
            if (string.IsNullOrWhiteSpace(authorizationHeader) || !authorizationHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            var accessToken = authorizationHeader.Substring("Bearer ".Length).Trim();
            return await _supabaseService.GetAuthUserInfoFromAccessTokenAsync(accessToken);
        }

        private async Task<(UserInfo? User, ActionResult? Error)> RequireAdminAsync()
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser == null)
            {
                return (null, Unauthorized(new { error = "Not authenticated" }));
            }

            if (!string.Equals(currentUser.Role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase))
            {
                return (null, StatusCode(StatusCodes.Status403Forbidden, new { error = "Admin access required" }));
            }

            return (currentUser, null);
        }
    }
}


