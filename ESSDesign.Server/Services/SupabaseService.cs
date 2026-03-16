using Supabase;
using ESSDesign.Server.Models;
using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Text.Json;

namespace ESSDesign.Server.Services
{
    public class SupabaseService
    {
        private readonly Supabase.Client _supabase;
        private readonly ILogger<SupabaseService> _logger;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly string _supabaseUrl;
        private readonly string _supabaseKey;
        private readonly string _bucketName = "design-pdfs";
        private readonly string _safetyBucketName = "project-information";

        // In-memory cache for folders (5 minute expiration)
        private static readonly ConcurrentDictionary<Guid, (FolderResponse Data, DateTime Expiry)> _folderCache = new();
        private static readonly ConcurrentDictionary<string, (string Value, DateTime Expiry)> _userNameCache = new(StringComparer.OrdinalIgnoreCase);
        private static readonly TimeSpan _cacheExpiration = TimeSpan.FromMinutes(5);

        // Root folders cache
        private static List<FolderResponse>? _rootFoldersCache;
        private static DateTime _rootFoldersCacheExpiry = DateTime.MinValue;

        public SupabaseService(
            Supabase.Client supabase,
            ILogger<SupabaseService> logger,
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration)
        {
            _supabase = supabase;
            _logger = logger;
            _httpClientFactory = httpClientFactory;
            _supabaseUrl = configuration["Supabase:Url"] ?? string.Empty;
            _supabaseKey = configuration["Supabase:ServiceRoleKey"]
                ?? configuration["Supabase:Key"]
                ?? string.Empty;
            _safetyBucketName = configuration["Supabase:SafetyBucket"] ?? "project-information";
        }

        public async Task<List<FolderResponse>> GetRootFoldersAsync()
        {
            try
            {
                // Check root folders cache
                if (_rootFoldersCache != null && _rootFoldersCacheExpiry > DateTime.UtcNow)
                {
                    _logger.LogInformation("Cache hit for root folders");
                    return _rootFoldersCache;
                }

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

                // Cache the result
                _rootFoldersCache = result;
                _rootFoldersCacheExpiry = DateTime.UtcNow.Add(_cacheExpiration);

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

        // Helper method to get user name by ID
        private async Task<string?> GetUserNameAsync(string? userId)
        {
            if (!TryNormalizeUserId(userId, out var normalizedUserId))
            {
                return null;
            }

            try
            {
                if (TryGetCachedUserName(normalizedUserId, out var cachedUserName))
                {
                    return cachedUserName;
                }

                var userResponse = await _supabase
                    .From<UserName>()
                    .Filter("id", Postgrest.Constants.Operator.Equals, normalizedUserId)
                    .Single();

                var resolvedUserName = !string.IsNullOrWhiteSpace(userResponse?.FullName)
                    ? userResponse.FullName
                    : userResponse?.Email;

                if (!string.IsNullOrWhiteSpace(resolvedUserName))
                {
                    SetCachedUserName(normalizedUserId, resolvedUserName);
                }

                return resolvedUserName;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to fetch user name for {UserId}", normalizedUserId);
                return null;
            }
        }

        // Helper method to get multiple user names at once without scanning the full table
        private async Task<Dictionary<string, string>> GetUserNamesAsync(IEnumerable<string?> userIds)
        {
            var validUserIds = userIds
                .Where(id => TryNormalizeUserId(id, out _))
                .Select(id => id!.ToLowerInvariant())
                .Distinct()
                .ToList();
            if (!validUserIds.Any()) return new Dictionary<string, string>();

            try
            {
                var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                var missingUserIds = new List<string>();

                foreach (var validUserId in validUserIds)
                {
                    if (TryGetCachedUserName(validUserId, out var cachedUserName))
                    {
                        result[validUserId] = cachedUserName;
                    }
                    else
                    {
                        missingUserIds.Add(validUserId);
                    }
                }

                if (missingUserIds.Count == 0)
                {
                    return result;
                }

                var lookups = missingUserIds.Select(async missingUserId => new
                {
                    UserId = missingUserId,
                    UserName = await GetUserNameAsync(missingUserId)
                });

                foreach (var lookup in await Task.WhenAll(lookups))
                {
                    if (!string.IsNullOrWhiteSpace(lookup.UserName))
                    {
                        result[lookup.UserId] = lookup.UserName;
                    }
                }

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to fetch user names for {Count} user IDs", validUserIds.Count);
                return new Dictionary<string, string>();
            }
        }

        private static bool TryNormalizeUserId(string? userId, out string normalizedUserId)
        {
            normalizedUserId = string.Empty;
            if (string.IsNullOrWhiteSpace(userId) || !Guid.TryParse(userId, out var parsedUserId))
            {
                return false;
            }

            normalizedUserId = parsedUserId.ToString().ToLowerInvariant();
            return true;
        }

        private bool TryGetCachedUserName(string userId, out string userName)
        {
            userName = string.Empty;
            if (!_userNameCache.TryGetValue(userId, out var cachedUserName))
            {
                return false;
            }

            if (cachedUserName.Expiry <= DateTime.UtcNow)
            {
                _userNameCache.TryRemove(userId, out _);
                return false;
            }

            userName = cachedUserName.Value;
            return true;
        }

        private void SetCachedUserName(string userId, string userName)
        {
            _userNameCache[userId] = (userName, DateTime.UtcNow.Add(_cacheExpiration));
        }

        // Upsert a user name entry (called on signup as a fallback for the DB trigger)
        public async Task UpsertUserNameAsync(string userId, string email, string fullName)
        {
            if (!Guid.TryParse(userId, out var userGuid)) return;

            try
            {
                var userName = new UserName
                {
                    Id = userGuid,
                    Email = email,
                    FullName = !string.IsNullOrWhiteSpace(fullName) ? fullName : email.Split('@')[0]
                };

                await _supabase.From<UserName>().Upsert(userName);
                _logger.LogInformation("Upserted user_names for {UserId}", userId);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to upsert user_names for {UserId}", userId);
            }
        }

        private async Task<long?> CalculateFolderFileSizeAsync(Guid folderId)
        {
            var documentsTask = _supabase
                .From<DesignDocument>()
                .Filter("folder_id", Postgrest.Constants.Operator.Equals, folderId.ToString())
                .Get();

            var subfoldersTask = _supabase
                .From<Folder>()
                .Filter("parent_folder_id", Postgrest.Constants.Operator.Equals, folderId.ToString())
                .Get();

            await Task.WhenAll(documentsTask, subfoldersTask);

            var documents = (await documentsTask).Models;
            var subfolders = (await subfoldersTask).Models;

            long totalSize = documents.Sum(document => (document.EssDesignFileSize ?? 0) + (document.ThirdPartyDesignFileSize ?? 0));

            if (subfolders.Count > 0)
            {
                var nestedSizes = await Task.WhenAll(subfolders.Select(subfolder => CalculateFolderFileSizeAsync(subfolder.Id)));
                totalSize += nestedSizes.Sum(size => size ?? 0);
            }

            return totalSize > 0 ? totalSize : null;
        }

        // Light version - only gets immediate subfolders count, no documents
        private async Task<FolderResponse> BuildFolderResponseLight(Folder folder)
        {
            var subfoldersResponse = await _supabase
                .From<Folder>()
                .Filter("parent_folder_id", Postgrest.Constants.Operator.Equals, folder.Id.ToString())
                .Order("name", Postgrest.Constants.Ordering.Ascending)
                .Get();

            // Collect all user IDs to fetch names in batch
            var userIds = new List<string?> { folder.UserId };
            userIds.AddRange(subfoldersResponse.Models.Select(sf => sf.UserId));
            var userNames = await GetUserNamesAsync(userIds);

            var subfolders = await Task.WhenAll(subfoldersResponse.Models.Select(async sf => new FolderResponse
            {
                Id = sf.Id,
                Name = sf.Name,
                ParentFolderId = sf.ParentFolderId,
                UserId = sf.UserId,
                OwnerName = sf.UserId != null && userNames.ContainsKey(sf.UserId) ? userNames[sf.UserId] : null,
                CreatedAt = sf.CreatedAt,
                UpdatedAt = sf.UpdatedAt,
                FileSize = await CalculateFolderFileSizeAsync(sf.Id),
                SubFolders = new List<FolderResponse>(),
                Documents = new List<DocumentResponse>()
            }));

            return new FolderResponse
            {
                Id = folder.Id,
                Name = folder.Name,
                ParentFolderId = folder.ParentFolderId,
                UserId = folder.UserId,
                OwnerName = folder.UserId != null && userNames.ContainsKey(folder.UserId) ? userNames[folder.UserId] : null,
                CreatedAt = folder.CreatedAt,
                UpdatedAt = folder.UpdatedAt,
                FileSize = await CalculateFolderFileSizeAsync(folder.Id),
                SubFolders = subfolders.ToList(),
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

            var subfoldersResult = (await subfoldersTask).Models;
            var documentsResult = (await documentsTask).Models;

            // Collect all user IDs to fetch names in batch
            var userIds = new List<string?> { folder.UserId };
            userIds.AddRange(subfoldersResult.Select(sf => sf.UserId));
            userIds.AddRange(documentsResult.Select(d => d.UserId));
            var userNames = await GetUserNamesAsync(userIds);

            var subfolders = await Task.WhenAll(subfoldersResult.Select(async sf => new FolderResponse
            {
                Id = sf.Id,
                Name = sf.Name,
                ParentFolderId = sf.ParentFolderId,
                UserId = sf.UserId,
                OwnerName = sf.UserId != null && userNames.ContainsKey(sf.UserId) ? userNames[sf.UserId] : null,
                CreatedAt = sf.CreatedAt,
                UpdatedAt = sf.UpdatedAt,
                FileSize = await CalculateFolderFileSizeAsync(sf.Id),
                SubFolders = new List<FolderResponse>(),
                Documents = new List<DocumentResponse>()
            }));

            var documents = documentsResult.Select(d =>
            {
                var totalSize = (d.EssDesignFileSize ?? 0) + (d.ThirdPartyDesignFileSize ?? 0);
                return new DocumentResponse
                {
                    Id = d.Id,
                    FolderId = d.FolderId,
                    RevisionNumber = d.RevisionNumber,
                    EssDesignIssuePath = d.EssDesignIssuePath,
                    EssDesignIssueName = d.EssDesignIssueName,
                    ThirdPartyDesignPath = d.ThirdPartyDesignPath,
                    ThirdPartyDesignName = d.ThirdPartyDesignName,
                    EssDesignFileSize = d.EssDesignFileSize,
                    ThirdPartyDesignFileSize = d.ThirdPartyDesignFileSize,
                    TotalFileSize = totalSize > 0 ? totalSize : null,
                    UserId = d.UserId,
                    OwnerName = d.UserId != null && userNames.ContainsKey(d.UserId) ? userNames[d.UserId] : null,
                    CreatedAt = d.CreatedAt,
                    UpdatedAt = d.UpdatedAt
                };
            }).ToList();

            return new FolderResponse
            {
                Id = folder.Id,
                Name = folder.Name,
                ParentFolderId = folder.ParentFolderId,
                UserId = folder.UserId,
                OwnerName = folder.UserId != null && userNames.ContainsKey(folder.UserId) ? userNames[folder.UserId] : null,
                CreatedAt = folder.CreatedAt,
                UpdatedAt = folder.UpdatedAt,
                FileSize = await CalculateFolderFileSizeAsync(folder.Id),
                SubFolders = subfolders.ToList(),
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
                else
                {
                    // Root folder created - invalidate root cache
                    _rootFoldersCache = null;
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
                else
                {
                    // Root folder deleted - invalidate root cache
                    _rootFoldersCache = null;
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

        public async Task<FolderHierarchy> GetFolderHierarchyAsync(Guid folderId)
        {
            var hierarchy = new FolderHierarchy();
            var currentId = folderId;
            var level = 0;

            // Traverse up the folder tree
            while (currentId != Guid.Empty && level < 3)
            {
                var folder = await _supabase
                    .From<Folder>()
                    .Filter("id", Postgrest.Constants.Operator.Equals, currentId.ToString())
                    .Single();

                if (folder == null) break;

                // Assign to hierarchy based on level (0 = Scaffold, 1 = Project, 2 = Client)
                if (level == 0)
                    hierarchy.Scaffold = folder.Name;
                else if (level == 1)
                    hierarchy.Project = folder.Name;
                else if (level == 2)
                    hierarchy.Client = folder.Name;

                currentId = folder.ParentFolderId ?? Guid.Empty;
                level++;
            }

            return hierarchy;
        }

        public async Task<Guid> UploadDocumentAsync(Guid folderId, string revisionNumber, IFormFile? essDesign, IFormFile? thirdParty, string? description = null, string? userId = null)
        {
            try
            {
                var document = new DesignDocument
                {
                    Id = Guid.NewGuid(),
                    FolderId = folderId,
                    RevisionNumber = revisionNumber,
                    Description = description,
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
                        document.EssDesignFileSize = essDesign.Length;
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
                        document.ThirdPartyDesignFileSize = thirdParty.Length;
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

        public async Task MoveDocumentAsync(Guid documentId, Guid targetFolderId)
        {
            try
            {
                var document = await _supabase
                    .From<DesignDocument>()
                    .Filter("id", Postgrest.Constants.Operator.Equals, documentId.ToString())
                    .Single();

                if (document == null)
                    throw new FileNotFoundException("Document not found");

                var oldFolderId = document.FolderId;
                document.FolderId = targetFolderId;
                document.UpdatedAt = DateTime.UtcNow;

                await _supabase
                    .From<DesignDocument>()
                    .Update(document);

                // Clear cache for both old and new folders
                _folderCache.TryRemove(oldFolderId, out _);
                _folderCache.TryRemove(targetFolderId, out _);

                _logger.LogInformation("Moved document {DocumentId} from folder {OldFolderId} to folder {TargetFolderId}", documentId, oldFolderId, targetFolderId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error moving document");
                throw;
            }
        }

        public async Task UpdateDocumentRevisionAsync(Guid documentId, string newRevisionNumber)
        {
            try
            {
                var document = await _supabase
                    .From<DesignDocument>()
                    .Filter("id", Postgrest.Constants.Operator.Equals, documentId.ToString())
                    .Single();

                if (document == null)
                    throw new FileNotFoundException("Document not found");

                document.RevisionNumber = newRevisionNumber;
                document.UpdatedAt = DateTime.UtcNow;

                await _supabase
                    .From<DesignDocument>()
                    .Update(document);

                // Clear folder cache
                _folderCache.TryRemove(document.FolderId, out _);

                _logger.LogInformation("Updated document {DocumentId} revision to {RevisionNumber}", documentId, newRevisionNumber);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating document revision");
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

        public async Task<string?> GetScaffTagPdfPathAsync(string builderId, string projectId, string formId)
        {
            var details = await GetScaffTagFormDetailsAsync(builderId, projectId, formId);
            return details?.PdfPath;
        }

        public async Task<ScaffTagFormDetails?> GetScaffTagFormDetailsAsync(string builderId, string projectId, string formId)
        {
            var formPath = $"site-data/{builderId}/{projectId}/scaff-tags/forms/{formId}.json";
            var json = await DownloadStorageObjectAsync(_safetyBucketName, formPath);
            if (string.IsNullOrWhiteSpace(json))
            {
                return null;
            }

            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                var details = new ScaffTagFormDetails();

                if (root.TryGetProperty("pdfPath", out var pdfPathElement))
                {
                    details.PdfPath = pdfPathElement.GetString();
                }
                else if (root.TryGetProperty("pdf_path", out var pdfPathSnakeElement))
                {
                    details.PdfPath = pdfPathSnakeElement.GetString();
                }

                if (root.TryGetProperty("photoPaths", out var photoPathsElement) &&
                    photoPathsElement.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in photoPathsElement.EnumerateArray())
                    {
                        var value = item.GetString();
                        if (!string.IsNullOrWhiteSpace(value))
                        {
                            details.PhotoPaths.Add(value);
                        }
                    }
                }

                if (root.TryGetProperty("scaffoldNo", out var scaffoldElement))
                {
                    details.ScaffoldName = scaffoldElement.GetString();
                }

                if (root.TryGetProperty("jobLocation", out var jobLocationElement))
                {
                    details.JobLocation = jobLocationElement.GetString();
                }

                return string.IsNullOrWhiteSpace(details.PdfPath) ? null : details;
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex, "Failed to parse scaff-tag form JSON at {Path}", formPath);
            }

            return null;
        }

        public async Task<string> GetSafetyStorageSignedUrlAsync(string path, int expiresInSeconds = 60 * 60 * 24 * 14)
        {
            if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_supabaseKey))
            {
                throw new InvalidOperationException("Supabase URL or key not configured.");
            }

            var client = _httpClientFactory.CreateClient();
            var escapedPath = string.Join(
                "/",
                path.Split('/', StringSplitOptions.RemoveEmptyEntries).Select(Uri.EscapeDataString));
            var url = $"{_supabaseUrl.TrimEnd('/')}/storage/v1/object/sign/{Uri.EscapeDataString(_safetyBucketName)}/{escapedPath}";

            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Headers.Add("apikey", _supabaseKey);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _supabaseKey);
            request.Content = JsonContent.Create(new { expiresIn = expiresInSeconds });

            using var response = await client.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException(
                    $"Failed to create signed URL for '{path}'. Status: {(int)response.StatusCode}. Body: {body}");
            }

            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            string? signedPath = null;
            if (root.TryGetProperty("signedURL", out var signedUrlUpper))
            {
                signedPath = signedUrlUpper.GetString();
            }
            else if (root.TryGetProperty("signedUrl", out var signedUrlLower))
            {
                signedPath = signedUrlLower.GetString();
            }

            if (string.IsNullOrWhiteSpace(signedPath))
            {
                throw new InvalidOperationException($"Supabase signed URL response missing signed URL. Body: {body}");
            }

            if (signedPath.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                signedPath.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                return signedPath;
            }

            return $"{_supabaseUrl.TrimEnd('/')}/storage/v1{signedPath}";
        }

        public async Task<StorageObjectDownload?> DownloadSafetyObjectAsync(string path)
        {
            return await DownloadStorageBinaryObjectAsync(_safetyBucketName, path);
        }

        private async Task<string?> DownloadStorageObjectAsync(string bucket, string path)
        {
            if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_supabaseKey))
            {
                _logger.LogWarning("Supabase URL or key not configured; cannot download storage object.");
                return null;
            }

            var client = _httpClientFactory.CreateClient();
            var escapedPath = string.Join(
                "/",
                path.Split('/', StringSplitOptions.RemoveEmptyEntries).Select(Uri.EscapeDataString));
            var url = $"{_supabaseUrl.TrimEnd('/')}/storage/v1/object/{Uri.EscapeDataString(bucket)}/{escapedPath}";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Add("apikey", _supabaseKey);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _supabaseKey);

            using var response = await client.SendAsync(request);
            if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                return null;
            }

            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync();
                _logger.LogWarning(
                    "Failed to download storage object {Bucket}/{Path}. Status: {Status}. Body: {Body}",
                    bucket,
                    path,
                    (int)response.StatusCode,
                    errorBody);
                return null;
            }

            return await response.Content.ReadAsStringAsync();
        }

        private async Task<StorageObjectDownload?> DownloadStorageBinaryObjectAsync(string bucket, string path)
        {
            if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_supabaseKey))
            {
                _logger.LogWarning("Supabase URL or key not configured; cannot download storage object.");
                return null;
            }

            var client = _httpClientFactory.CreateClient();
            var escapedPath = string.Join(
                "/",
                path.Split('/', StringSplitOptions.RemoveEmptyEntries).Select(Uri.EscapeDataString));
            var url = $"{_supabaseUrl.TrimEnd('/')}/storage/v1/object/{Uri.EscapeDataString(bucket)}/{escapedPath}";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Add("apikey", _supabaseKey);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _supabaseKey);

            using var response = await client.SendAsync(request);
            if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                return null;
            }

            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync();
                _logger.LogWarning(
                    "Failed to download storage object {Bucket}/{Path}. Status: {Status}. Body: {Body}",
                    bucket,
                    path,
                    (int)response.StatusCode,
                    errorBody);
                return null;
            }

            var bytes = await response.Content.ReadAsByteArrayAsync();
            var contentType = response.Content.Headers.ContentType?.MediaType;
            return new StorageObjectDownload
            {
                Bytes = bytes,
                ContentType = contentType
            };
        }

        // Method to clear entire cache (useful for testing)
        public static void ClearCache()
        {
            _folderCache.Clear();
            _userNameCache.Clear();
            _rootFoldersCache = null;
        }

        public async Task<List<SearchResult>> SearchAsync(string query)
        {
            try
            {
                // 1. Search matching folders (1 query)
                var foldersResponse = await _supabase
                    .From<Folder>()
                    .Filter("name", Postgrest.Constants.Operator.ILike, $"%{query}%")
                    .Order("name", Postgrest.Constants.Ordering.Ascending)
                    .Get();

                if (!foldersResponse.Models.Any())
                    return new List<SearchResult>();

                // 2. Fetch ALL folders once for in-memory breadcrumb computation (1 query)
                var allFoldersResponse = await _supabase.From<Folder>().Get();
                var folderLookup = allFoldersResponse.Models.ToDictionary(f => f.Id);

                // 3. For each match, compute breadcrumbs in-memory + fetch children in parallel
                var tasks = foldersResponse.Models.Select(async folder =>
                {
                    var path = BuildBreadcrumbPath(folder, folderLookup);

                    // Subfolders + documents in parallel (2 queries per result, all results concurrent)
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

                    var subfoldersResult = (await subfoldersTask).Models;
                    var documentsResult = (await documentsTask).Models;

                    // Fetch user names in batch
                    var userIds = new List<string?> { folder.UserId };
                    userIds.AddRange(subfoldersResult.Select(sf => sf.UserId));
                    userIds.AddRange(documentsResult.Select(d => d.UserId));
                    var userNames = await GetUserNamesAsync(userIds);

                    var subFolders = subfoldersResult.Select(sf => new FolderResponse
                    {
                        Id = sf.Id,
                        Name = sf.Name,
                        ParentFolderId = sf.ParentFolderId,
                        UserId = sf.UserId,
                        OwnerName = sf.UserId != null && userNames.ContainsKey(sf.UserId) ? userNames[sf.UserId] : null,
                        CreatedAt = sf.CreatedAt,
                        UpdatedAt = sf.UpdatedAt,
                        SubFolders = new List<FolderResponse>(),
                        Documents = new List<DocumentResponse>()
                    }).ToList();

                    var documents = documentsResult.Select(d =>
                    {
                        var totalSize = (d.EssDesignFileSize ?? 0) + (d.ThirdPartyDesignFileSize ?? 0);
                        return new DocumentResponse
                        {
                            Id = d.Id,
                            FolderId = d.FolderId,
                            RevisionNumber = d.RevisionNumber,
                            EssDesignIssuePath = d.EssDesignIssuePath,
                            EssDesignIssueName = d.EssDesignIssueName,
                            ThirdPartyDesignPath = d.ThirdPartyDesignPath,
                            ThirdPartyDesignName = d.ThirdPartyDesignName,
                            EssDesignFileSize = d.EssDesignFileSize,
                            ThirdPartyDesignFileSize = d.ThirdPartyDesignFileSize,
                            TotalFileSize = totalSize > 0 ? totalSize : null,
                            UserId = d.UserId,
                            OwnerName = d.UserId != null && userNames.ContainsKey(d.UserId) ? userNames[d.UserId] : null,
                            CreatedAt = d.CreatedAt,
                            UpdatedAt = d.UpdatedAt
                        };
                    }).ToList();

                    return new SearchResult
                    {
                        Id = folder.Id,
                        Name = folder.Name,
                        Type = "folder",
                        ParentFolderId = folder.ParentFolderId,
                        Path = path,
                        SubFolders = subFolders,
                        Documents = documents
                    };
                });

                return (await Task.WhenAll(tasks)).ToList();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error searching for '{Query}'", query);
                throw;
            }
        }

        private static string BuildBreadcrumbPath(Folder folder, Dictionary<Guid, Folder> lookup)
        {
            var parts = new List<string>();
            var currentId = folder.ParentFolderId;
            while (currentId.HasValue && lookup.TryGetValue(currentId.Value, out var parent))
            {
                parts.Insert(0, parent.Name);
                currentId = parent.ParentFolderId;
            }
            return string.Join(" / ", parts);
        }

        // User Preferences Methods
        public async Task<UserPreferences?> GetUserPreferencesAsync(Guid userId)
        {
            try
            {
                var response = await _supabase
                    .From<UserPreferences>()
                    .Filter("user_id", Postgrest.Constants.Operator.Equals, userId.ToString())
                    .Single();

                return response;
            }
            catch (Exception ex)
            {
                _logger.LogInformation("No preferences found for user {UserId}: {Message}", userId, ex.Message);
                return null;
            }
        }

        public async Task<UserPreferences> UpsertUserPreferencesAsync(
            Guid userId,
            Guid? selectedFolderId,
            string? theme,
            string? viewMode,
            int? sidebarWidth)
        {
            try
            {
                var existing = await GetUserPreferencesAsync(userId);
                var now = DateTime.UtcNow;

                var mergedPreferences = new UserPreferences
                {
                    UserId = userId,
                    SelectedFolderId = selectedFolderId ?? existing?.SelectedFolderId,
                    Theme = theme ?? existing?.Theme ?? "light",
                    ViewMode = viewMode ?? existing?.ViewMode ?? "grid",
                    SidebarWidth = sidebarWidth ?? existing?.SidebarWidth ?? 280,
                    CreatedAt = existing?.CreatedAt ?? now,
                    UpdatedAt = now
                };

                var upsertResponse = await _supabase
                    .From<UserPreferences>()
                    .Upsert(mergedPreferences);

                return upsertResponse.Models.FirstOrDefault()
                    ?? mergedPreferences;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error upserting user preferences for {UserId}", userId);
                throw;
            }
        }


        public async Task<UserInfo?> GetAuthUserInfoFromAccessTokenAsync(string accessToken)
        {
            if (string.IsNullOrWhiteSpace(accessToken) || string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_supabaseKey))
            {
                return null;
            }

            var client = _httpClientFactory.CreateClient();
            var url = $"{_supabaseUrl.TrimEnd('/')}/auth/v1/user";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Add("apikey", _supabaseKey);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);

            using var response = await client.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            var body = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;

            string? email = root.TryGetProperty("email", out var emailEl) ? emailEl.GetString() : null;
            string? fullName = null;
            string? avatarUrl = null;

            if (root.TryGetProperty("user_metadata", out var metadataEl) && metadataEl.ValueKind == JsonValueKind.Object)
            {
                fullName = GetJsonString(metadataEl, "full_name") ?? GetJsonString(metadataEl, "name");
                avatarUrl = GetJsonString(metadataEl, "avatar_url")
                    ?? GetJsonString(metadataEl, "picture")
                    ?? GetJsonString(metadataEl, "profile_image")
                    ?? GetJsonString(metadataEl, "profile_image_url");
            }

            if (string.IsNullOrWhiteSpace(avatarUrl) && root.TryGetProperty("identities", out var identitiesEl) && identitiesEl.ValueKind == JsonValueKind.Array)
            {
                foreach (var identity in identitiesEl.EnumerateArray())
                {
                    if (!identity.TryGetProperty("identity_data", out var identityData) || identityData.ValueKind != JsonValueKind.Object)
                    {
                        continue;
                    }

                    avatarUrl = GetJsonString(identityData, "avatar_url")
                        ?? GetJsonString(identityData, "picture")
                        ?? GetJsonString(identityData, "profile_image")
                        ?? GetJsonString(identityData, "profile_image_url");

                    fullName ??= GetJsonString(identityData, "full_name")
                        ?? GetJsonString(identityData, "name")
                        ?? GetJsonString(identityData, "display_name");

                    if (!string.IsNullOrWhiteSpace(avatarUrl))
                    {
                        break;
                    }
                }
            }

            var id = root.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
            return new UserInfo
            {
                Id = id ?? string.Empty,
                Email = email ?? string.Empty,
                FullName = fullName ?? string.Empty,
                AvatarUrl = avatarUrl
            };
        }

        private static string? GetJsonString(JsonElement obj, string propertyName)
        {
            if (obj.TryGetProperty(propertyName, out var property) && property.ValueKind == JsonValueKind.String)
            {
                return property.GetString();
            }

            return null;
        }
        public async Task<List<UserInfo>> GetAllUsersAsync()
        {
            try
            {
                var response = await _supabase
                    .From<UserName>()
                    .Order("full_name", Postgrest.Constants.Ordering.Ascending)
                    .Get();

                return response.Models.Select(u => new UserInfo
                {
                    Id = u.Id.ToString(),
                    Email = u.Email,
                    FullName = u.FullName
                }).ToList();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting all users");
                throw;
            }
        }

        public async Task UpsertUserPushTokenAsync(
            Guid userId,
            string token,
            string platform,
            string? appBundleId)
        {
            try
            {
                var normalizedPlatform = string.IsNullOrWhiteSpace(platform)
                    ? "ios"
                    : platform.Trim().ToLowerInvariant();

                var existingResponse = await _supabase
                    .From<UserPushToken>()
                    .Filter("user_id", Postgrest.Constants.Operator.Equals, userId.ToString())
                    .Filter("platform", Postgrest.Constants.Operator.Equals, normalizedPlatform)
                    .Filter("is_active", Postgrest.Constants.Operator.Equals, "true")
                    .Get();

                var now = DateTime.UtcNow;
                var existing = existingResponse.Models.FirstOrDefault();
                if (existing != null)
                {
                    existing.Token = token;
                    existing.AppBundleId = appBundleId;
                    existing.IsActive = true;
                    existing.UpdatedAt = now;
                    await _supabase.From<UserPushToken>().Update(existing);
                    return;
                }

                var row = new UserPushToken
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    Token = token,
                    Platform = normalizedPlatform,
                    AppBundleId = appBundleId,
                    IsActive = true,
                    CreatedAt = now,
                    UpdatedAt = now
                };
                await _supabase.From<UserPushToken>().Insert(row);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error upserting push token for user {UserId}", userId);
                throw;
            }
        }

        public async Task<List<UserPushToken>> GetActivePushTokensByUserIdsAsync(
            IEnumerable<string> userIds,
            string platform = "ios")
        {
            var guidIds = userIds
                .Where(id => Guid.TryParse(id, out _))
                .Select(Guid.Parse)
                .ToHashSet();

            if (!guidIds.Any())
            {
                return new List<UserPushToken>();
            }

            try
            {
                var normalizedPlatform = string.IsNullOrWhiteSpace(platform)
                    ? "ios"
                    : platform.Trim().ToLowerInvariant();

                var response = await _supabase
                    .From<UserPushToken>()
                    .Filter("platform", Postgrest.Constants.Operator.Equals, normalizedPlatform)
                    .Filter("is_active", Postgrest.Constants.Operator.Equals, "true")
                    .Get();

                return response.Models
                    .Where(r => guidIds.Contains(r.UserId))
                    .ToList();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting push tokens for users");
                throw;
            }
        }

        public async Task DeactivatePushTokenAsync(string token)
        {
            if (string.IsNullOrWhiteSpace(token))
            {
                return;
            }

            try
            {
                var response = await _supabase
                    .From<UserPushToken>()
                    .Filter("token", Postgrest.Constants.Operator.Equals, token)
                    .Filter("is_active", Postgrest.Constants.Operator.Equals, "true")
                    .Get();

                foreach (var row in response.Models)
                {
                    row.IsActive = false;
                    row.UpdatedAt = DateTime.UtcNow;
                    await _supabase.From<UserPushToken>().Update(row);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to deactivate push token");
            }
        }
    }

    public class FileDownloadInfo
    {
        public string Url { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;
    }

    public class StorageObjectDownload
    {
        public byte[] Bytes { get; set; } = Array.Empty<byte>();
        public string? ContentType { get; set; }
    }

    public class ScaffTagFormDetails
    {
        public string? PdfPath { get; set; }
        public string? ScaffoldName { get; set; }
        public string? JobLocation { get; set; }
        public List<string> PhotoPaths { get; set; } = new();
    }
}

