using Supabase;
using ESSDesign.Server.Models;
using System.Collections.Concurrent;

namespace ESSDesign.Server.Services
{
    public class SupabaseService
    {
        private readonly Supabase.Client _supabase;
        private readonly ILogger<SupabaseService> _logger;
        private readonly string _bucketName = "design-pdfs";
        
        // In-memory cache for folders (5 minute expiration)
        private static readonly ConcurrentDictionary<Guid, (FolderResponse Data, DateTime Expiry)> _folderCache = new();
        private static readonly TimeSpan _cacheExpiration = TimeSpan.FromMinutes(5);

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
                    result.Add(await BuildFolderResponseLight(folder));
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
                // Check cache first
                if (_folderCache.TryGetValue(folderId, out var cached))
                {
                    if (cached.Expiry > DateTime.UtcNow)
                    {
                        _logger.LogInformation("Cache hit for folder {FolderId}", folderId);
                        return cached.Data;
                    }
                    else
                    {
                        _folderCache.TryRemove(folderId, out _);
                    }
                }

                var folderResponse = await _supabase
                    .From<Folder>()
                    .Filter("id", Postgrest.Constants.Operator.Equals, folderId.ToString())
                    .Single();

                if (folderResponse == null) throw new Exception("Folder not found");

                var result = await BuildFolderResponseFull(folderResponse);
                
                // Cache the result
                _folderCache[folderId] = (result, DateTime.UtcNow.Add(_cacheExpiration));
                
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving folder {FolderId}", folderId);
                throw;
            }
        }

        // Light version - only gets immediate subfolders count, no documents
        private async Task<FolderResponse> BuildFolderResponseLight(Folder folder)
        {
            var subfoldersResponse = await _supabase
                .From<Folder>()
                .Filter("parent_folder_id", Postgrest.Constants.Operator.Equals, folder.Id.ToString())
                .Order("name", Postgrest.Constants.Ordering.Ascending)
                .Get();

            var subfolders = subfoldersResponse.Models.Select(sf => new FolderResponse
            {
                Id = sf.Id,
                Name = sf.Name,
                ParentFolderId = sf.ParentFolderId,
                UserId = sf.UserId,
                CreatedAt = sf.CreatedAt,
                UpdatedAt = sf.UpdatedAt,
                SubFolders = new List<FolderResponse>(),
                Documents = new List<DocumentResponse>()
            }).ToList();

            return new FolderResponse
            {
                Id = folder.Id,
                Name = folder.Name,
                ParentFolderId = folder.ParentFolderId,
                UserId = folder.UserId,
                CreatedAt = folder.CreatedAt,
                UpdatedAt = folder.UpdatedAt,
                SubFolders = subfolders,
                Documents = new List<DocumentResponse>()
            };
        }

        // Full version - gets everything including documents
        private async Task<FolderResponse> BuildFolderResponseFull(Folder folder)
        {
            // Parallel execution for subfolders and documents
            var subfoldersTask = _supabase
                .From<Folder>()
                .Filter("parent_folder_id", Postgrest.Constants.Operator.Equals, folder.Id.ToString())
                .Order("name", Postgrest.Constants.Ordering.Ascending)
                .Get();

            var documentsTask = _supabase
                .From<DesignDocument>()
                .Filter("folder_id", Postgrest.Constants.Operator.Equals, folder.Id.ToString())
                .Order("revision_number", Postgrest.Constants.Ordering.Ascending)
                .Get();

            await Task.WhenAll(subfoldersTask, documentsTask);

            var subfolders = (await subfoldersTask).Models.Select(sf => new FolderResponse
            {
                Id = sf.Id,
                Name = sf.Name,
                ParentFolderId = sf.ParentFolderId,
                UserId = sf.UserId,
                CreatedAt = sf.CreatedAt,
                UpdatedAt = sf.UpdatedAt,
                SubFolders = new List<FolderResponse>(),
                Documents = new List<DocumentResponse>()
            }).ToList();

            var documents = (await documentsTask).Models.Select(d => new DocumentResponse
            {
                Id = d.Id,
                FolderId = d.FolderId,
                RevisionNumber = d.RevisionNumber,
                EssDesignIssuePath = d.EssDesignIssuePath,
                EssDesignIssueName = d.EssDesignIssueName,
                ThirdPartyDesignPath = d.ThirdPartyDesignPath,
                ThirdPartyDesignName = d.ThirdPartyDesignName,
                UserId = d.UserId,
                CreatedAt = d.CreatedAt,
                UpdatedAt = d.UpdatedAt
            }).ToList();

            return new FolderResponse
            {
                Id = folder.Id,
                Name = folder.Name,
                ParentFolderId = folder.ParentFolderId,
                UserId = folder.UserId,
                CreatedAt = folder.CreatedAt,
                UpdatedAt = folder.UpdatedAt,
                SubFolders = subfolders,
                Documents = documents
            };
        }

        public async Task<Guid> CreateFolderAsync(string name, Guid? parentFolderId, string? userId = null)
        {
            try
            {
                var folder = new Folder
                {
                    Id = Guid.NewGuid(),
                    Name = name,
                    ParentFolderId = parentFolderId,
                    UserId = userId,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                var response = await _supabase.From<Folder>().Insert(folder);
                var created = response.Models.FirstOrDefault();
                if (created == null) throw new Exception("Failed to create folder");

                // Clear parent folder cache
                if (parentFolderId.HasValue)
                {
                    _folderCache.TryRemove(parentFolderId.Value, out _);
                }

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
                
                // Clear cache
                _folderCache.TryRemove(folderId, out _);
                if (folder.ParentFolderId.HasValue)
                {
                    _folderCache.TryRemove(folder.ParentFolderId.Value, out _);
                }

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
                var folder = await _supabase
                    .From<Folder>()
                    .Filter("id", Postgrest.Constants.Operator.Equals, folderId.ToString())
                    .Single();

                await _supabase
                    .From<Folder>()
                    .Filter("id", Postgrest.Constants.Operator.Equals, folderId.ToString())
                    .Delete();

                // Clear cache
                _folderCache.TryRemove(folderId, out _);
                if (folder?.ParentFolderId != null)
                {
                    _folderCache.TryRemove(folder.ParentFolderId.Value, out _);
                }

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

        public async Task<Guid> UploadDocumentAsync(Guid folderId, string revisionNumber, IFormFile? essDesign, IFormFile? thirdParty, string? userId = null)
        {
            try
            {
                var document = new DesignDocument
                {
                    Id = Guid.NewGuid(),
                    FolderId = folderId,
                    RevisionNumber = revisionNumber,
                    UserId = userId,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                // Upload files in parallel
                var uploadTasks = new List<Task>();

                if (essDesign != null)
                {
                    var path = $"documents/{folderId}/{document.Id}/ess_{essDesign.FileName}";
                    uploadTasks.Add(Task.Run(async () =>
                    {
                        await UploadFileAsync(essDesign, path);
                        document.EssDesignIssuePath = path;
                        document.EssDesignIssueName = essDesign.FileName;
                    }));
                }

                if (thirdParty != null)
                {
                    var path = $"documents/{folderId}/{document.Id}/third_party_{thirdParty.FileName}";
                    uploadTasks.Add(Task.Run(async () =>
                    {
                        await UploadFileAsync(thirdParty, path);
                        document.ThirdPartyDesignPath = path;
                        document.ThirdPartyDesignName = thirdParty.FileName;
                    }));
                }

                await Task.WhenAll(uploadTasks);

                var response = await _supabase.From<DesignDocument>().Insert(document);
                var created = response.Models.FirstOrDefault();
                if (created == null) throw new Exception("Failed to create document");

                // Clear folder cache
                _folderCache.TryRemove(folderId, out _);

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
                    // Delete files in parallel
                    var deleteTasks = new List<Task>();
                    if (!string.IsNullOrEmpty(document.EssDesignIssuePath))
                        deleteTasks.Add(DeleteFileAsync(document.EssDesignIssuePath));
                    if (!string.IsNullOrEmpty(document.ThirdPartyDesignPath))
                        deleteTasks.Add(DeleteFileAsync(document.ThirdPartyDesignPath));

                    await Task.WhenAll(deleteTasks);

                    // Clear folder cache
                    _folderCache.TryRemove(document.FolderId, out _);
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

        public async Task<FileDownloadInfo> GetDocumentDownloadUrlAsync(Guid documentId, string type)
        {
            try
            {
                var document = await _supabase
                    .From<DesignDocument>()
                    .Filter("id", Postgrest.Constants.Operator.Equals, documentId.ToString())
                    .Single();

                if (document == null) throw new FileNotFoundException("Document not found");

                string path;
                string fileName;

                if (type.ToLower() == "ess")
                {
                    path = document.EssDesignIssuePath;
                    fileName = document.EssDesignIssueName;
                }
                else
                {
                    path = document.ThirdPartyDesignPath;
                    fileName = document.ThirdPartyDesignName;
                }

                if (string.IsNullOrEmpty(path)) throw new FileNotFoundException($"File type {type} not found");

                var url = await GetSignedUrlAsync(path);

                return new FileDownloadInfo
                {
                    Url = url,
                    FileName = fileName ?? "document.pdf"
                };
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

        // Method to clear entire cache (useful for testing)
        public static void ClearCache()
        {
            _folderCache.Clear();
        }
    }

    public class FileDownloadInfo
    {
        public string Url { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;
    }
}
