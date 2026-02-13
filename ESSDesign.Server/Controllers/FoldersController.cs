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
        private readonly ILogger<FoldersController> _logger;

        public FoldersController(SupabaseService supabaseService, ILogger<FoldersController> logger)
        {
            _supabaseService = supabaseService;
            _logger = logger;
        }

        [HttpGet]
        public async Task<ActionResult<List<FolderResponse>>> GetRootFolders()
        {
            try
            {
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
                if (string.IsNullOrWhiteSpace(request.Name))
                    return BadRequest(new { error = "Folder name is required" });

                var folderId = await _supabaseService.CreateFolderAsync(request.Name, request.ParentFolderId);

                // Fetch and return the complete folder object
                var folderResponse = new FolderResponse
                {
                    Id = folderId,
                    Name = request.Name,
                    ParentFolderId = request.ParentFolderId,
                    SubFolders = new List<FolderResponse>(),
                    Documents = new List<DocumentResponse>(),
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

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
                if (string.IsNullOrWhiteSpace(request.NewName))
                    return BadRequest(new { error = "New name is required" });

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
        [RequestSizeLimit(100_000_000)]
        public async Task<ActionResult> UploadDocument([FromForm] UploadDocumentRequest request)
        {
            try
            {
                if (request.FolderId == Guid.Empty)
                    return BadRequest(new { error = "Folder ID required" });
                if (string.IsNullOrWhiteSpace(request.RevisionNumber))
                    return BadRequest(new { error = "Revision number required" });
                if (request.EssDesignIssue == null && request.ThirdPartyDesign == null)
                    return BadRequest(new { error = "At least one file required" });

                var documentId = await _supabaseService.UploadDocumentAsync(
                    request.FolderId,
                    request.RevisionNumber,
                    request.EssDesignIssue,
                    request.ThirdPartyDesign
                );

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
                await _supabaseService.DeleteDocumentAsync(documentId);
                return Ok(new { message = "Document deleted" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting document");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("documents/{documentId}/download/{type}")]
        public async Task<ActionResult> DownloadDocument(Guid documentId, string type)
        {
            try
            {
                if (!type.Equals("ess", StringComparison.OrdinalIgnoreCase) &&
                    !type.Equals("thirdparty", StringComparison.OrdinalIgnoreCase))
                    return BadRequest(new { error = "Type must be 'ess' or 'thirdparty'" });

                var fileInfo = await _supabaseService.GetDocumentDownloadUrlAsync(documentId, type);
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

        [HttpGet("search")]
        public async Task<ActionResult<List<SearchResult>>> Search([FromQuery] string q)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 2)
                    return BadRequest(new { error = "Search query must be at least 2 characters" });

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
    }
}