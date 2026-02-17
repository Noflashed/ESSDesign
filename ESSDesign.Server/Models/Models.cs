using Postgrest.Attributes;
using Postgrest.Models;

namespace ESSDesign.Server.Models
{
    [Table("folders")]
    public class Folder : BaseModel
    {
        [PrimaryKey("id", false)]
        public Guid Id { get; set; }

        [Column("name")]
        public string Name { get; set; } = string.Empty;

        [Column("parent_folder_id")]
        public Guid? ParentFolderId { get; set; }

        [Column("user_id")]
        public string? UserId { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("updated_at")]
        public DateTime UpdatedAt { get; set; }
    }

    [Table("design_documents")]
    public class DesignDocument : BaseModel
    {
        [PrimaryKey("id", false)]
        public Guid Id { get; set; }

        [Column("folder_id")]
        public Guid FolderId { get; set; }

        [Column("revision_number")]
        public string RevisionNumber { get; set; } = string.Empty;

        [Column("description")]
        public string? Description { get; set; }

        [Column("ess_design_issue_path")]
        public string? EssDesignIssuePath { get; set; }

        [Column("ess_design_issue_name")]
        public string? EssDesignIssueName { get; set; }

        [Column("third_party_design_path")]
        public string? ThirdPartyDesignPath { get; set; }

        [Column("third_party_design_name")]
        public string? ThirdPartyDesignName { get; set; }

        [Column("ess_design_file_size")]
        public long? EssDesignFileSize { get; set; }

        [Column("third_party_design_file_size")]
        public long? ThirdPartyDesignFileSize { get; set; }

        [Column("user_id")]
        public string? UserId { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("updated_at")]
        public DateTime UpdatedAt { get; set; }
    }

    [Table("user_preferences")]
    public class UserPreferences : BaseModel
    {
        [PrimaryKey("user_id", false)]
        public Guid UserId { get; set; }

        [Column("selected_folder_id")]
        public Guid? SelectedFolderId { get; set; }

        [Column("theme")]
        public string Theme { get; set; } = "light";

        [Column("view_mode")]
        public string ViewMode { get; set; } = "grid";

        [Column("sidebar_width")]
        public int SidebarWidth { get; set; } = 280;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("updated_at")]
        public DateTime UpdatedAt { get; set; }
    }

    [Table("user_names")]
    public class UserName : BaseModel
    {
        [PrimaryKey("id", false)]
        public Guid Id { get; set; }

        [Column("email")]
        public string Email { get; set; } = string.Empty;

        [Column("full_name")]
        public string FullName { get; set; } = string.Empty;
    }

    public class SignUpRequest
    {
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
    }

    public class SignInRequest
    {
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class AuthResponse
    {
        public string AccessToken { get; set; } = string.Empty;
        public string RefreshToken { get; set; } = string.Empty;
        public UserInfo User { get; set; } = new();
    }

    public class UserInfo
    {
        public string Id { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
    }

    public class CreateFolderRequest
    {
        public string Name { get; set; } = string.Empty;
        public Guid? ParentFolderId { get; set; }
        public string? UserId { get; set; }
    }

    public class RenameFolderRequest
    {
        public string NewName { get; set; } = string.Empty;
    }

    public class UpdateDocumentRevisionRequest
    {
        public string NewRevisionNumber { get; set; } = string.Empty;
    }

    public class UploadDocumentRequest
    {
        public Guid FolderId { get; set; }
        public string RevisionNumber { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string? UserId { get; set; }
        public IFormFile? EssDesignIssue { get; set; }
        public IFormFile? ThirdPartyDesign { get; set; }
        public List<string>? RecipientIds { get; set; }
        public long? EssDesignFileSize { get; set; }
        public long? ThirdPartyDesignFileSize { get; set; }
    }

    public class FolderResponse
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public Guid? ParentFolderId { get; set; }
        public string? UserId { get; set; }
        public string? OwnerName { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public long? FileSize { get; set; }
        public List<FolderResponse> SubFolders { get; set; } = new();
        public List<DocumentResponse> Documents { get; set; } = new();
    }

    public class DocumentResponse
    {
        public Guid Id { get; set; }
        public Guid FolderId { get; set; }
        public string RevisionNumber { get; set; } = string.Empty;
        public string? EssDesignIssuePath { get; set; }
        public string? EssDesignIssueName { get; set; }
        public string? ThirdPartyDesignPath { get; set; }
        public string? ThirdPartyDesignName { get; set; }
        public long? EssDesignFileSize { get; set; }
        public long? ThirdPartyDesignFileSize { get; set; }
        public long? TotalFileSize { get; set; }
        public string? UserId { get; set; }
        public string? OwnerName { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    public class BreadcrumbItem
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
    }

    public class FolderHierarchy
    {
        public string? Client { get; set; }
        public string? Project { get; set; }
        public string? Scaffold { get; set; }
    }

    public class SearchResult
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public Guid? ParentFolderId { get; set; }
        public string Path { get; set; } = string.Empty;
        public List<FolderResponse> SubFolders { get; set; } = new();
        public List<DocumentResponse> Documents { get; set; } = new();
    }

    public class UserPreferencesRequest
    {
        public Guid? SelectedFolderId { get; set; }
        public string? Theme { get; set; }
        public string? ViewMode { get; set; }
        public int? SidebarWidth { get; set; }
    }

    public class UserPreferencesResponse
    {
        public Guid UserId { get; set; }
        public Guid? SelectedFolderId { get; set; }
        public string Theme { get; set; } = "light";
        public string ViewMode { get; set; } = "grid";
        public int SidebarWidth { get; set; } = 280;
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}