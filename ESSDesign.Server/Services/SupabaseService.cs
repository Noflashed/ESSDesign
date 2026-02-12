using Supabase;
using ESSDesign.Server.Models;

namespace ESSDesign.Server.Services
{
    public class SupabaseService
    {
        private readonly Supabase.Client _supabase;
        private readonly ILogger<SupabaseService> _logger;
        private readonly string _bucketName = "design-pdfs";

        public SupabaseService(Supabase.Client supabase, ILogger<SupabaseService> logger)
        {
            _supabase = supabase;
            _logger = logger;
        }

        public async Task<List<FolderResponse>> GetRootFoldersAsync()
        {
            try
            {
                var foldersResponse = await _supabase
                    .From<Folder>()
                    .Where(x => x.ParentFolderId == null)
                    .Order("name", Postgrest.Constants.Ordering.Ascending)
                    .Get();

                var result = new List<FolderResponse>();
                foreach (var folder in foldersResponse.Models)
                {
                    result.Add(await BuildFolderResponse(folder));
                }

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving root folders");
                throw;
            }
        }

        public async Task<FolderResponse> GetFolderByIdAsync(Guid folderId)
        {
            try
            {
                var folderResponse = await _supabase
                    .From<Folder>()
                    .Filter("id", Postgrest.Constants.Operator.Equals, folderId.ToString())
                    .Single();

                if (folderResponse == null) throw new Exception("Folder not found");

                return await BuildFolderResponse(folderResponse);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving folder {FolderId}", folderId);
                throw;
            }
        }

        private async Task<FolderResponse> BuildFolderResponse(Folder folder)
        {
            var subfoldersResponse = await _supabase
                .From<Folder>()
                .Filter("parent_folder_id", Postgrest.Constants.Operator.Equals, folder.Id.ToString())
                .Order("name", Postgrest.Constants.Ordering.Ascending)
                .Get();

            var subfolders = new List<FolderResponse>();
            foreach (var subfolder in subfoldersResponse.Models)
            {
                subfolders.Add(new FolderResponse
                {
                    Id = subfolder.Id,
                    Name = subfolder.Name,
                    ParentFolderId = subfolder.ParentFolderId,
                    CreatedAt = subfolder.CreatedAt,
                    UpdatedAt = subfolder.UpdatedAt
                });
            }

            var documentsResponse = await _supabase
                .From<DesignDocument>()
                .Filter("folder_id", Postgrest.Constants.Operator.Equals, folder.Id.ToString())
                .Order("revision_number", Postgrest.Constants.Ordering.Ascending)
                .Get();

            var documents = documentsResponse.Models.Select(d => new DocumentResponse
            {
                Id = d.Id,
                FolderId = d.FolderId,
                RevisionNumber = d.RevisionNumber,
                EssDesignIssuePath = d.EssDesignIssuePath,
                EssDesignIssueName = d.EssDesignIssueName,
                ThirdPartyDesignPath = d.ThirdPartyDesignPath,
                ThirdPartyDesignName = d.ThirdPartyDesignName,
                CreatedAt = d.CreatedAt,
                UpdatedAt = d.UpdatedAt
            }).ToList();

            return new FolderResponse
            {
                Id = folder.Id,
                Name = folder.Name,
                ParentFolderId = folder.ParentFolderId,
                CreatedAt = folder.CreatedAt,
                UpdatedAt = folder.UpdatedAt,
                SubFolders = subfolders,
                Documents = documents
            };
        }

        public async Task<Guid> CreateFolderAsync(string name, Guid? parentFolderId)
        {
            try
            {
                var folder = new Folder
                {
                    Id = Guid.NewGuid(),
                    Name = name,
                    ParentFolderId = parentFolderId,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                var response = await _supabase.From<Folder>().Insert(folder);
                var created = response.Models.FirstOrDefault();
                if (created == null) throw new Exception("Failed to create folder");

                _logger.LogInformation("Created folder: {Name}", name);
                return created.Id;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating folder");
                throw;
            }
        }

        public async Task RenameFolderAsync(Guid folderId, string newName)
        {
            try
            {
                var folder = await _supabase
                    .From<Folder>()
                    .Filter("id", Postgrest.Constants.Operator.Equals, folderId.ToString())
                    .Single();

                if (folder == null) throw new Exception("Folder not found");

                folder.Name = newName;
                folder.UpdatedAt = DateTime.UtcNow;

                await _supabase.From<Folder>().Update(folder);
                _logger.LogInformation("Renamed folder {FolderId}", folderId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error renaming folder");
                throw;
            }
        }

        public async Task DeleteFolderAsync(Guid folderId)
        {
            try
            {
                await _supabase
                    .From<Folder>()
                    .Filter("id", Postgrest.Constants.Operator.Equals, folderId.ToString())
                    .Delete();

                _logger.LogInformation("Deleted folder {FolderId}", folderId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting folder");
                throw;
            }
        }

        public async Task<List<BreadcrumbItem>> GetBreadcrumbsAsync(Guid folderId)
        {
            var breadcrumbs = new List<BreadcrumbItem>();
            var currentId = folderId;

            while (currentId != Guid.Empty)
            {
                var folder = await _supabase
                    .From<Folder>()
                    .Filter("id", Postgrest.Constants.Operator.Equals, currentId.ToString())
                    .Single();

                if (folder == null) break;

                breadcrumbs.Insert(0, new BreadcrumbItem { Id = folder.Id, Name = folder.Name });
                currentId = folder.ParentFolderId ?? Guid.Empty;
            }

            return breadcrumbs;
        }

        public async Task<Guid> UploadDocumentAsync(Guid folderId, string revisionNumber, IFormFile? essDesign, IFormFile? thirdParty)
        {
            try
            {
                var document = new DesignDocument
                {
                    Id = Guid.NewGuid(),
                    FolderId = folderId,
                    RevisionNumber = revisionNumber,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                if (essDesign != null)
                {
                    var path = $"documents/{folderId}/{document.Id}/ess_{essDesign.FileName}";
                    await UploadFileAsync(essDesign, path);
                    document.EssDesignIssuePath = path;
                    document.EssDesignIssueName = essDesign.FileName;
                }

                if (thirdParty != null)
                {
                    var path = $"documents/{folderId}/{document.Id}/third_party_{thirdParty.FileName}";
                    await UploadFileAsync(thirdParty, path);
                    document.ThirdPartyDesignPath = path;
                    document.ThirdPartyDesignName = thirdParty.FileName;
                }

                var response = await _supabase.From<DesignDocument>().Insert(document);
                var created = response.Models.FirstOrDefault();
                if (created == null) throw new Exception("Failed to create document");

                _logger.LogInformation("Uploaded document Rev {RevisionNumber}", revisionNumber);
                return created.Id;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error uploading document");
                throw;
            }
        }

        public async Task DeleteDocumentAsync(Guid documentId)
        {
            try
            {
                var document = await _supabase
                    .From<DesignDocument>()
                    .Filter("id", Postgrest.Constants.Operator.Equals, documentId.ToString())
                    .Single();

                if (document != null)
                {
                    if (!string.IsNullOrEmpty(document.EssDesignIssuePath))
                        await DeleteFileAsync(document.EssDesignIssuePath);
                    if (!string.IsNullOrEmpty(document.ThirdPartyDesignPath))
                        await DeleteFileAsync(document.ThirdPartyDesignPath);
                }

                await _supabase
                    .From<DesignDocument>()
                    .Filter("id", Postgrest.Constants.Operator.Equals, documentId.ToString())
                    .Delete();

                _logger.LogInformation("Deleted document {DocumentId}", documentId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting document");
                throw;
            }
        }

        public async Task<string> GetDocumentDownloadUrlAsync(Guid documentId, string type)
        {
            try
            {
                var document = await _supabase
                    .From<DesignDocument>()
                    .Filter("id", Postgrest.Constants.Operator.Equals, documentId.ToString())
                    .Single();

                if (document == null) throw new FileNotFoundException("Document not found");

                var path = type.ToLower() == "ess" ? document.EssDesignIssuePath : document.ThirdPartyDesignPath;
                if (string.IsNullOrEmpty(path)) throw new FileNotFoundException($"File type {type} not found");

                return await GetSignedUrlAsync(path);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting download URL");
                throw;
            }
        }

        private async Task<string> UploadFileAsync(IFormFile file, string path)
        {
            using var memoryStream = new MemoryStream();
            await file.CopyToAsync(memoryStream);
            var fileBytes = memoryStream.ToArray();

            await _supabase.Storage.From(_bucketName).Upload(fileBytes, path, new Supabase.Storage.FileOptions
            {
                ContentType = file.ContentType,
                Upsert = true
            });

            return path;
        }

        private async Task DeleteFileAsync(string path)
        {
            try
            {
                await _supabase.Storage.From(_bucketName).Remove(new List<string> { path });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error deleting file from storage");
            }
        }

        private async Task<string> GetSignedUrlAsync(string path)
        {
            return await _supabase.Storage.From(_bucketName).CreateSignedUrl(path, 3600);
        }

        public async Task InitializeStorageAsync()
        {
            try
            {
                var buckets = await _supabase.Storage.ListBuckets();
                if (!buckets.Any(b => b.Name == _bucketName))
                {
                    await _supabase.Storage.CreateBucket(_bucketName, new Supabase.Storage.BucketUpsertOptions { Public = false });
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Storage initialization warning");
            }
        }
    }
}