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

        [Column("ess_design_issue_path")]
        public string? EssDesignIssuePath { get; set; }

        [Column("ess_design_issue_name")]
        public string? EssDesignIssueName { get; set; }

        [Column("third_party_design_path")]
        public string? ThirdPartyDesignPath { get; set; }

        [Column("third_party_design_name")]
        public string? ThirdPartyDesignName { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("updated_at")]
        public DateTime UpdatedAt { get; set; }
    }

    public class CreateFolderRequest
    {
        public string Name { get; set; } = string.Empty;
        public Guid? ParentFolderId { get; set; }
    }

    public class RenameFolderRequest
    {
        public string NewName { get; set; } = string.Empty;
    }

    public class UploadDocumentRequest
    {
        public Guid FolderId { get; set; }
        public string RevisionNumber { get; set; } = string.Empty;
        public IFormFile? EssDesignIssue { get; set; }
        public IFormFile? ThirdPartyDesign { get; set; }
    }

    public class FolderResponse
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public Guid? ParentFolderId { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
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
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    public class BreadcrumbItem
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
    }
}
