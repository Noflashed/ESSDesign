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

        [Column("total_file_size")]
        public long TotalFileSize { get; set; }

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

    

        [Table("user_push_tokens")]
    public class UserPushToken : BaseModel
    {
        [PrimaryKey("id", false)]
        public Guid Id { get; set; }

        [Column("user_id")]
        public Guid UserId { get; set; }

        [Column("token")]
        public string Token { get; set; } = string.Empty;

        [Column("platform")]
        public string Platform { get; set; } = "ios";

        [Column("app_bundle_id")]
        public string? AppBundleId { get; set; }

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("updated_at")]
        public DateTime UpdatedAt { get; set; }
    }
[Table("user_roles")]
    public class UserRoleRecord : BaseModel
    {
        [PrimaryKey("user_id", false)]
        public Guid UserId { get; set; }

        [Column("role")]
        public string Role { get; set; } = AppRoles.Viewer;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("updated_at")]
        public DateTime UpdatedAt { get; set; }
    }

    [Table("user_notifications")]
    public class UserNotification : BaseModel
    {
        [PrimaryKey("id", false)]
        public Guid Id { get; set; }

        [Column("user_id")]
        public Guid UserId { get; set; }

        [Column("title")]
        public string Title { get; set; } = string.Empty;

        [Column("message")]
        public string Message { get; set; } = string.Empty;

        [Column("type")]
        public string Type { get; set; } = "document_update";

        [Column("actor_name")]
        public string? ActorName { get; set; }

        [Column("actor_image_url")]
        public string? ActorImageUrl { get; set; }

        [Column("folder_id")]
        public Guid? FolderId { get; set; }

        [Column("document_id")]
        public Guid? DocumentId { get; set; }

        [Column("read")]
        public bool Read { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("updated_at")]
        public DateTime UpdatedAt { get; set; }
    }

    public class UserNotificationResponse
    {
        public Guid Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public string Type { get; set; } = "document_update";
        public string? ActorName { get; set; }
        public string? ActorImageUrl { get; set; }
        public Guid? FolderId { get; set; }
        public Guid? DocumentId { get; set; }
        public bool Read { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    public static class AppRoles
    {
        public const string Admin = "admin";
        public const string Viewer = "viewer";
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

    public class RefreshSessionRequest
    {
        public string RefreshToken { get; set; } = string.Empty;
    }

    public class InviteUserRequest
    {
        public string Email { get; set; } = string.Empty;
    }

    public class UpdateUserRoleRequest
    {
        public string Role { get; set; } = string.Empty;
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
        public string? AvatarUrl { get; set; }
        public string Role { get; set; } = AppRoles.Viewer;
    }

    public class CreateUserNotificationRequest
    {
        public List<string> RecipientUserIds { get; set; } = new();
        public string Title { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public string Type { get; set; } = "document_update";
        public string? ActorName { get; set; }
        public string? ActorImageUrl { get; set; }
        public Guid? FolderId { get; set; }
        public Guid? DocumentId { get; set; }
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

    public class ShareDocumentRequest
    {
        public List<string> RecipientIds { get; set; } = new();
        public List<string> ExternalEmails { get; set; } = new();
        public string? ExternalMessage { get; set; }
        public string? UserId { get; set; }
    }

    public class MoveDocumentRequest
    {
        public Guid TargetFolderId { get; set; }
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

    public class ReplaceDocumentFilesRequest
    {
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
        public string? Description { get; set; }
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
        public string? OwnerName { get; set; }
        public long? FileSize { get; set; }
        public int SubFolderCount { get; set; }
        public int DocumentCount { get; set; }
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

    public class RegisterDeviceTokenRequest
    {
        public string? Token { get; set; }
        public string? DeviceToken { get; set; }
        public string? ApnsToken { get; set; }
        public string? Platform { get; set; }
        public string? AppBundleId { get; set; }
        public string? UserId { get; set; }
    }
}

