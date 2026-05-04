using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ESSDesign.Server.Models;
using ESSDesign.Server.Services;
using System.Net.Mail;
using System.Net;
using System.Text;
using System.Security.Cryptography;

namespace ESSDesign.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class FoldersController : ControllerBase
    {
        private readonly SupabaseService _supabaseService;
        private readonly EmailService _emailService;
        private readonly PushNotificationService _pushNotificationService;
        private readonly string _shareLinkSecret;
        private readonly string _frontendUrl;
        private readonly ILogger<FoldersController> _logger;

        public FoldersController(
            SupabaseService supabaseService,
            EmailService emailService,
            PushNotificationService pushNotificationService,
            IConfiguration configuration,
            ILogger<FoldersController> logger)
        {
            _supabaseService = supabaseService;
            _emailService = emailService;
            _pushNotificationService = pushNotificationService;
            _shareLinkSecret = configuration["AppSettings:ShareLinkSecret"]
                ?? configuration["Supabase:ServiceRoleKey"]
                ?? configuration["Supabase:Key"]
                ?? "dev-folder-share-link-secret";
            _frontendUrl = configuration["AppSettings:FrontendUrl"] ?? "https://essdesign.app";
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
                var adminResult = await RequireDesignManagerAsync();
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
                var adminResult = await RequireDesignManagerAsync();
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
                var adminResult = await RequireDesignManagerAsync();
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
                var adminResult = await RequireDesignManagerAsync();
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

                        var notificationMessage = BuildDocumentNotificationMessage(
                            hierarchy.Client,
                            hierarchy.Project,
                            hierarchy.Scaffold ?? folder.Name,
                            documentName,
                            request.RevisionNumber);

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

                        await _supabaseService.CreateUserNotificationsAsync(new CreateUserNotificationRequest
                        {
                            RecipientUserIds = request.RecipientIds,
                            Title = "New document uploaded",
                            Message = notificationMessage,
                            Type = "document_upload",
                            ActorName = uploaderName,
                            ActorImageUrl = adminResult.User.AvatarUrl,
                            FolderId = request.FolderId,
                            DocumentId = documentId
                        });

                        _logger.LogInformation("Sent email notifications to {Count} recipients for document {DocumentId}",
                            recipientEmails.Count, documentId);

                        var preferredDocumentType = request.EssDesignIssue != null ? "ess" : "thirdparty";
                        var preferredDocumentTitle = request.EssDesignIssue?.FileName
                            ?? request.ThirdPartyDesign?.FileName
                            ?? documentName;

                        var pushSentCount = await _pushNotificationService.SendDocumentUploadPushAsync(
                            request.RecipientIds,
                            uploaderName,
                            hierarchy.Client ?? "Unknown Client",
                            hierarchy.Project ?? "Unknown Project",
                            hierarchy.Scaffold ?? folder.Name,
                            documentName,
                            request.RevisionNumber,
                            preferredDocumentType,
                            preferredDocumentTitle,
                            request.FolderId,
                            documentId
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
                var adminResult = await RequireDesignManagerAsync();
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
                var adminResult = await RequireDesignManagerAsync();
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
                var adminResult = await RequireDesignManagerAsync();
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
                var adminResult = await RequireDesignManagerAsync();
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
                            var notificationMessage = BuildDocumentNotificationMessage(
                                hierarchy.Client,
                                hierarchy.Project,
                                hierarchy.Scaffold ?? folder.Name,
                                documentName,
                                updatedDocument.RevisionNumber);

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

                            await _supabaseService.CreateUserNotificationsAsync(new CreateUserNotificationRequest
                            {
                                RecipientUserIds = request.RecipientIds!,
                                Title = "Document revision replaced",
                                Message = notificationMessage,
                                Type = "document_revision_replaced",
                                ActorName = updaterName,
                                ActorImageUrl = adminResult.User.AvatarUrl,
                                FolderId = updatedDocument.FolderId,
                                DocumentId = updatedDocument.Id
                            });

                            _logger.LogInformation(
                                "Sent revision replacement notifications to {Count} recipients for document {DocumentId}",
                                recipientEmails.Count,
                                documentId);

                            var preferredDocumentType = !string.IsNullOrWhiteSpace(updatedDocument.EssDesignIssuePath)
                                ? "ess"
                                : "thirdparty";
                            var preferredDocumentTitle = updatedDocument.EssDesignIssueName
                                ?? updatedDocument.ThirdPartyDesignName
                                ?? documentName;

                            var pushSentCount = await _pushNotificationService.SendDocumentReplacementPushAsync(
                                request.RecipientIds!,
                                updaterName,
                                hierarchy.Client ?? "Unknown Client",
                                hierarchy.Project ?? "Unknown Project",
                                hierarchy.Scaffold ?? folder.Name,
                                documentName,
                                updatedDocument.RevisionNumber,
                                preferredDocumentType,
                                preferredDocumentTitle,
                                updatedDocument.FolderId,
                                updatedDocument.Id);

                            _logger.LogInformation(
                                "Sent revision replacement APNs notifications to {Count} devices for document {DocumentId}",
                                pushSentCount,
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
                var adminResult = await RequireDesignManagerAsync();
                if (adminResult.Error != null)
                {
                    return adminResult.Error;
                }

                var internalRecipientIds = request.RecipientIds?
                    .Where(id => !string.IsNullOrWhiteSpace(id))
                    .Select(id => id.Trim())
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList() ?? new List<string>();

                var externalRecipientEmails = request.ExternalEmails?
                    .Where(email => !string.IsNullOrWhiteSpace(email))
                    .Select(email => email.Trim())
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList() ?? new List<string>();

                var invalidExternalEmails = externalRecipientEmails
                    .Where(email => !IsValidEmailAddress(email))
                    .ToList();

                if (!internalRecipientIds.Any() && !externalRecipientEmails.Any())
                {
                    return BadRequest(new { error = "At least one recipient is required" });
                }

                if (invalidExternalEmails.Any())
                {
                    return BadRequest(new { error = $"Invalid external email address(es): {string.Join(", ", invalidExternalEmails)}" });
                }

                var actingUserId = adminResult.User!.Id;
                var document = await _supabaseService.GetDocumentByIdAsync(documentId);
                var folder = await _supabaseService.GetFolderByIdAsync(document.FolderId);
                var hierarchy = await _supabaseService.GetFolderHierarchyAsync(document.FolderId);

                var requestedUserIds = internalRecipientIds
                    .Concat(new[] { actingUserId })
                    .Distinct()
                    .ToList();
                var users = await _supabaseService.GetUsersByIdsAsync(requestedUserIds);

                var sharedByName = users
                    .FirstOrDefault(u => u.Id == actingUserId)?.FullName
                    ?? adminResult.User.FullName
                    ?? adminResult.User.Email;

                var recipientEmails = users
                    .Where(u => internalRecipientIds.Contains(u.Id))
                    .Select(u => u.Email)
                    .Where(email => !string.IsNullOrWhiteSpace(email))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                if (!recipientEmails.Any() && !externalRecipientEmails.Any())
                {
                    return BadRequest(new { error = "No valid recipient emails were found" });
                }

                var documentName = document.EssDesignIssueName
                    ?? document.ThirdPartyDesignName
                    ?? folder.Name;
                var notificationMessage = BuildDocumentNotificationMessage(
                    hierarchy.Client,
                    hierarchy.Project,
                    hierarchy.Scaffold ?? folder.Name,
                    documentName,
                    document.RevisionNumber);

                if (recipientEmails.Any())
                {
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

                    await _supabaseService.CreateUserNotificationsAsync(new CreateUserNotificationRequest
                    {
                        RecipientUserIds = internalRecipientIds,
                        Title = "Document shared",
                        Message = notificationMessage,
                        Type = "document_shared",
                        ActorName = sharedByName,
                        ActorImageUrl = adminResult.User.AvatarUrl,
                        FolderId = document.FolderId,
                        DocumentId = document.Id
                    });

                    var preferredDocumentType = !string.IsNullOrWhiteSpace(document.EssDesignIssuePath)
                        ? "ess"
                        : "thirdparty";
                    var preferredDocumentTitle = document.EssDesignIssueName
                        ?? document.ThirdPartyDesignName
                        ?? documentName;

                    var pushSentCount = await _pushNotificationService.SendDocumentSharePushAsync(
                        internalRecipientIds,
                        sharedByName,
                        hierarchy.Client ?? "Unknown Client",
                        hierarchy.Project ?? "Unknown Project",
                        hierarchy.Scaffold ?? folder.Name,
                        documentName,
                        document.RevisionNumber,
                        preferredDocumentType,
                        preferredDocumentTitle,
                        document.FolderId,
                        document.Id);

                    _logger.LogInformation(
                        "Sent share APNs notifications to {Count} devices for document {DocumentId}",
                        pushSentCount,
                        documentId);
                }

                if (externalRecipientEmails.Any())
                {
                    await _emailService.SendDocumentShareNotificationAsync(
                        externalRecipientEmails,
                        documentName,
                        document.RevisionNumber,
                        sharedByName,
                        document.Id,
                        document.FolderId,
                        !string.IsNullOrWhiteSpace(document.EssDesignIssuePath),
                        !string.IsNullOrWhiteSpace(document.ThirdPartyDesignPath),
                        hierarchy.Client,
                        hierarchy.Project,
                        hierarchy.Scaffold ?? folder.Name,
                        request.ExternalMessage);
                }

                _logger.LogInformation("Shared document {DocumentId} with {InternalCount} internal recipients and {ExternalCount} external recipients", documentId, recipientEmails.Count, externalRecipientEmails.Count);
                return Ok(new { message = "Document shared" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sharing document {DocumentId}", documentId);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("{folderId}/share")]
        public async Task<ActionResult> ShareFolder(Guid folderId, [FromBody] ShareFolderRequest request)
        {
            try
            {
                var adminResult = await RequireDesignManagerAsync();
                if (adminResult.Error != null)
                {
                    return adminResult.Error;
                }

                var internalRecipientIds = request.RecipientIds?
                    .Where(id => !string.IsNullOrWhiteSpace(id))
                    .Select(id => id.Trim())
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList() ?? new List<string>();

                var externalRecipientEmails = request.ExternalEmails?
                    .Where(email => !string.IsNullOrWhiteSpace(email))
                    .Select(email => email.Trim())
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList() ?? new List<string>();

                var invalidExternalEmails = externalRecipientEmails
                    .Where(email => !IsValidEmailAddress(email))
                    .ToList();

                if (!internalRecipientIds.Any() && !externalRecipientEmails.Any())
                {
                    return BadRequest(new { error = "At least one recipient is required" });
                }

                if (invalidExternalEmails.Any())
                {
                    return BadRequest(new { error = $"Invalid external email address(es): {string.Join(", ", invalidExternalEmails)}" });
                }

                var actingUserId = adminResult.User!.Id;
                var folder = await _supabaseService.GetFolderByIdAsync(folderId);
                var shareTree = await _supabaseService.GetFolderShareTreeAsync(folderId);
                var hierarchy = await _supabaseService.GetFolderHierarchyAsync(folderId);

                var requestedUserIds = internalRecipientIds
                    .Concat(new[] { actingUserId })
                    .Distinct()
                    .ToList();
                var users = await _supabaseService.GetUsersByIdsAsync(requestedUserIds);

                var sharedByName = users
                    .FirstOrDefault(u => u.Id == actingUserId)?.FullName
                    ?? adminResult.User.FullName
                    ?? adminResult.User.Email;

                var recipientEmails = users
                    .Where(u => internalRecipientIds.Contains(u.Id))
                    .Select(u => u.Email)
                    .Where(email => !string.IsNullOrWhiteSpace(email))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                if (!recipientEmails.Any() && !externalRecipientEmails.Any())
                {
                    return BadRequest(new { error = "No valid recipient emails were found" });
                }

                var documentCount = CountSharedDocuments(shareTree);
                var notificationMessage = BuildFolderNotificationMessage(
                    hierarchy.Client,
                    hierarchy.Project,
                    hierarchy.Scaffold ?? folder.Name,
                    folder.Name,
                    documentCount);

                if (recipientEmails.Any())
                {
                    await _emailService.SendFolderShareNotificationAsync(
                        recipientEmails,
                        folder.Name,
                        sharedByName,
                        folder.Id,
                        documentCount,
                        hierarchy.Client,
                        hierarchy.Project,
                        hierarchy.Scaffold ?? folder.Name);

                    await _supabaseService.CreateUserNotificationsAsync(new CreateUserNotificationRequest
                    {
                        RecipientUserIds = internalRecipientIds,
                        Title = "Folder shared",
                        Message = notificationMessage,
                        Type = "folder_shared",
                        ActorName = sharedByName,
                        ActorImageUrl = adminResult.User.AvatarUrl,
                        FolderId = folder.Id
                    });
                }

                if (externalRecipientEmails.Any())
                {
                    await _emailService.SendFolderShareNotificationAsync(
                        externalRecipientEmails,
                        folder.Name,
                        sharedByName,
                        folder.Id,
                        documentCount,
                        hierarchy.Client,
                        hierarchy.Project,
                        hierarchy.Scaffold ?? folder.Name,
                        request.ExternalMessage);
                }

                _logger.LogInformation("Shared folder {FolderId} with {InternalCount} internal recipients and {ExternalCount} external recipients", folderId, recipientEmails.Count, externalRecipientEmails.Count);
                return Ok(new { message = "Folder shared" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sharing folder {FolderId}", folderId);
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

        [AllowAnonymous]
        [HttpGet("{folderId}/public-share")]
        public async Task<ActionResult> ViewSharedFolder(Guid folderId, [FromQuery] string? token)
        {
            try
            {
                if (!ValidateFolderShareAccessToken(folderId, token))
                {
                    return StatusCode(StatusCodes.Status403Forbidden, "This folder share link is invalid or has expired.");
                }

                await _supabaseService.GetFolderByIdAsync(folderId);
                var appUrl = $"{_frontendUrl.TrimEnd('/')}/?sharedFolder={folderId:D}&token={WebUtility.UrlEncode(token)}";
                return Redirect(appUrl);
            }
            catch (FileNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error rendering shared folder {FolderId}", folderId);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [AllowAnonymous]
        [HttpGet("{folderId}/public-share-data")]
        public async Task<ActionResult<FolderShareTree>> GetSharedFolderData(Guid folderId, [FromQuery] string? token)
        {
            try
            {
                if (!ValidateFolderShareAccessToken(folderId, token))
                {
                    return StatusCode(StatusCodes.Status403Forbidden, new { error = "This folder share link is invalid or has expired." });
                }

                var folder = await _supabaseService.GetFolderShareTreeAsync(folderId);
                HydrateSharedFolderLinks(folder, token!);
                return Ok(folder);
            }
            catch (FileNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error loading shared folder data {FolderId}", folderId);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [AllowAnonymous]
        [HttpGet("{folderId}/public-share/documents/{documentId}/download/{type}")]
        public async Task<ActionResult> DownloadSharedFolderDocument(Guid folderId, Guid documentId, string type, [FromQuery] string? token)
        {
            try
            {
                if (!ValidateFolderShareAccessToken(folderId, token))
                {
                    return StatusCode(StatusCodes.Status403Forbidden, "This folder share link is invalid or has expired.");
                }

                if (!type.Equals("ess", StringComparison.OrdinalIgnoreCase) &&
                    !type.Equals("thirdparty", StringComparison.OrdinalIgnoreCase))
                {
                    return BadRequest(new { error = "Type must be 'ess' or 'thirdparty'" });
                }

                var folder = await _supabaseService.GetFolderShareTreeAsync(folderId);
                if (!FolderContainsDocument(folder, documentId))
                {
                    return NotFound(new { error = "Document is not part of this shared folder." });
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
                _logger.LogError(ex, "Error downloading shared folder document {DocumentId}", documentId);
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

        private static bool IsValidEmailAddress(string email)
        {
            try
            {
                _ = new MailAddress(email);
                return true;
            }
            catch
            {
                return false;
            }
        }

        private static string BuildDocumentNotificationMessage(
            string? client,
            string? project,
            string? scaffold,
            string? document,
            string? revisionNumber)
        {
            var clientText = string.IsNullOrWhiteSpace(client) ? "N/A" : client.Trim();
            var projectText = string.IsNullOrWhiteSpace(project) ? "N/A" : project.Trim();
            var scaffoldText = string.IsNullOrWhiteSpace(scaffold) ? "N/A" : scaffold.Trim();
            var documentText = string.IsNullOrWhiteSpace(document) ? "N/A" : document.Trim();
            var revisionText = string.IsNullOrWhiteSpace(revisionNumber) ? "N/A" : revisionNumber.Trim();

            return string.Join("\n", new[]
            {
                $"Client: {clientText}",
                $"Project: {projectText}",
                $"Scaffold: {scaffoldText}",
                $"Document: {documentText}",
                $"Revision Number: {revisionText}"
            });
        }

        private static string BuildFolderNotificationMessage(
            string? client,
            string? project,
            string? scaffold,
            string? folder,
            int documentCount)
        {
            var clientText = string.IsNullOrWhiteSpace(client) ? "N/A" : client.Trim();
            var projectText = string.IsNullOrWhiteSpace(project) ? "N/A" : project.Trim();
            var scaffoldText = string.IsNullOrWhiteSpace(scaffold) ? "N/A" : scaffold.Trim();
            var folderText = string.IsNullOrWhiteSpace(folder) ? "N/A" : folder.Trim();
            var fileText = documentCount == 1 ? "1 document" : $"{documentCount} documents";

            return string.Join("\n", new[]
            {
                $"Client: {clientText}",
                $"Project: {projectText}",
                $"Scaffold: {scaffoldText}",
                $"Folder: {folderText}",
                $"Files: {fileText}"
            });
        }

        private static int CountSharedDocuments(FolderShareTree folder)
        {
            return folder.Documents.Count + folder.SubFolders.Sum(CountSharedDocuments);
        }

        private void HydrateSharedFolderLinks(FolderShareTree folder, string token)
        {
            foreach (var document in folder.Documents)
            {
                if (document.HasEssDesign)
                {
                    document.EssDesignUrl = BuildSharedDocumentDownloadPath(folder.Id, document.Id, "ess", token);
                }

                if (document.HasThirdPartyDesign)
                {
                    document.ThirdPartyDesignUrl = BuildSharedDocumentDownloadPath(folder.Id, document.Id, "thirdparty", token);
                }
            }

            foreach (var subfolder in folder.SubFolders)
            {
                HydrateSharedFolderLinksForRoot(folder.Id, subfolder, token);
            }
        }

        private void HydrateSharedFolderLinksForRoot(Guid rootFolderId, FolderShareTree folder, string token)
        {
            foreach (var document in folder.Documents)
            {
                if (document.HasEssDesign)
                {
                    document.EssDesignUrl = BuildSharedDocumentDownloadPath(rootFolderId, document.Id, "ess", token);
                }

                if (document.HasThirdPartyDesign)
                {
                    document.ThirdPartyDesignUrl = BuildSharedDocumentDownloadPath(rootFolderId, document.Id, "thirdparty", token);
                }
            }

            foreach (var subfolder in folder.SubFolders)
            {
                HydrateSharedFolderLinksForRoot(rootFolderId, subfolder, token);
            }
        }

        private static string BuildSharedDocumentDownloadPath(Guid folderId, Guid documentId, string type, string token)
        {
            return $"/api/folders/{folderId}/public-share/documents/{documentId}/download/{type}?token={WebUtility.UrlEncode(token)}";
        }

        private static bool FolderContainsDocument(FolderShareTree folder, Guid documentId)
        {
            return folder.Documents.Any(document => document.Id == documentId)
                || folder.SubFolders.Any(subfolder => FolderContainsDocument(subfolder, documentId));
        }

        private string BuildSharedFolderHtml(FolderShareTree folder)
        {
            var safeFolderName = WebUtility.HtmlEncode(folder.Name);
            var fileCount = CountSharedDocuments(folder);
            var fileCountText = fileCount == 1 ? "1 file" : $"{fileCount} files";

            return $@"
<!doctype html>
<html lang=""en"">
<head>
  <meta charset=""utf-8"" />
  <meta name=""viewport"" content=""width=device-width, initial-scale=1"" />
  <title>{safeFolderName} - ESS Design</title>
  <style>
    body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, ""Segoe UI"", sans-serif; background: #f4f6f8; color: #111827; }}
    .wrap {{ max-width: 980px; margin: 0 auto; padding: 28px 18px 48px; }}
    .header {{ background: #1a1a2e; color: white; border-radius: 14px; padding: 26px 28px; margin-bottom: 18px; }}
    h1 {{ margin: 0 0 6px; font-size: 24px; }}
    .muted {{ color: #6b7280; }}
    .header .muted {{ color: #b9bfd2; }}
    .folder {{ background: white; border: 1px solid #e5e7eb; border-radius: 12px; margin: 14px 0; padding: 14px; }}
    .folder-title {{ font-weight: 700; margin: 0 0 10px; }}
    .children {{ margin-left: 18px; }}
    .file {{ display: flex; justify-content: space-between; gap: 14px; align-items: center; border-top: 1px solid #edf0f3; padding: 12px 0; }}
    .file:first-of-type {{ border-top: 0; }}
    .file-name {{ font-weight: 600; }}
    .file-meta {{ font-size: 13px; color: #6b7280; margin-top: 2px; }}
    .actions {{ display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }}
    a.btn {{ color: white; background: #1a73e8; border-radius: 999px; padding: 8px 14px; font-size: 13px; font-weight: 700; text-decoration: none; white-space: nowrap; }}
    a.btn.alt {{ background: #2f855a; }}
    .empty {{ background: white; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 22px; text-align: center; }}
    @media (max-width: 640px) {{ .file {{ display: block; }} .actions {{ justify-content: flex-start; margin-top: 10px; }} .children {{ margin-left: 8px; }} }}
  </style>
</head>
<body>
  <main class=""wrap"">
    <section class=""header"">
      <h1>{safeFolderName}</h1>
      <div class=""muted"">Shared ESS Design folder - {fileCountText}</div>
    </section>
    {(fileCount == 0 ? "<div class=\"empty muted\">No files are currently available in this shared folder.</div>" : RenderSharedFolder(folder))}
  </main>
</body>
</html>";
        }

        private string RenderSharedFolder(FolderShareTree folder)
        {
            var builder = new StringBuilder();
            builder.Append("<section class=\"folder\">");
            builder.Append("<div class=\"folder-title\">");
            builder.Append(WebUtility.HtmlEncode(folder.Name));
            builder.Append("</div>");

            foreach (var document in folder.Documents)
            {
                builder.Append(RenderSharedDocument(document));
            }

            if (folder.SubFolders.Any())
            {
                builder.Append("<div class=\"children\">");
                foreach (var subfolder in folder.SubFolders)
                {
                    builder.Append(RenderSharedFolder(subfolder));
                }
                builder.Append("</div>");
            }

            builder.Append("</section>");
            return builder.ToString();
        }

        private string RenderSharedDocument(FolderShareDocument document)
        {
            var safeName = WebUtility.HtmlEncode(document.DisplayName);
            var safeRevision = WebUtility.HtmlEncode(document.RevisionNumber);
            var safeDescription = string.IsNullOrWhiteSpace(document.Description)
                ? string.Empty
                : $"<div class=\"file-meta\">{WebUtility.HtmlEncode(document.Description)}</div>";
            var actions = new StringBuilder();

            if (document.HasEssDesign)
            {
                actions.Append($"<a class=\"btn\" href=\"/api/folders/documents/{document.Id}/public-download/ess\">ESS PDF</a>");
            }

            if (document.HasThirdPartyDesign)
            {
                actions.Append($"<a class=\"btn alt\" href=\"/api/folders/documents/{document.Id}/public-download/thirdparty\">Third-Party PDF</a>");
            }

            return $@"
<article class=""file"">
  <div>
    <div class=""file-name"">{safeName}</div>
    <div class=""file-meta"">Revision {safeRevision}</div>
    {safeDescription}
  </div>
  <div class=""actions"">{actions}</div>
</article>";
        }

        private bool ValidateFolderShareAccessToken(Guid folderId, string? token)
        {
            if (string.IsNullOrWhiteSpace(token))
            {
                return false;
            }

            var parts = token.Split('.', 2);
            if (parts.Length != 2 || !long.TryParse(parts[0], out var expires))
            {
                return false;
            }

            if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > expires)
            {
                return false;
            }

            var payload = $"{folderId:N}.{expires}";
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_shareLinkSecret));
            var expected = ToBase64Url(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload)));
            return CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(expected),
                Encoding.UTF8.GetBytes(parts[1]));
        }

        private static string ToBase64Url(byte[] bytes)
        {
            return Convert.ToBase64String(bytes)
                .TrimEnd('=')
                .Replace('+', '-')
                .Replace('/', '_');
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

        private async Task<(UserInfo? User, ActionResult? Error)> RequireDesignManagerAsync()
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser == null)
            {
                return (null, Unauthorized(new { error = "Not authenticated" }));
            }

            var canManageDesign =
                string.Equals(currentUser.Role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(currentUser.Role, AppRoles.ScaffoldDesigner, StringComparison.OrdinalIgnoreCase);

            if (!canManageDesign)
            {
                return (null, StatusCode(StatusCodes.Status403Forbidden, new { error = "Design manager access required" }));
            }

            return (currentUser, null);
        }
    }
}
