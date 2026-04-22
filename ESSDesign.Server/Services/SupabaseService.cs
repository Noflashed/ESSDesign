using Supabase;
using ESSDesign.Server.Models;
using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Text.Json;
using System.Net.Http;
using System.Net.Http.Headers;

namespace ESSDesign.Server.Services
{
    public class SupabaseService
    {
        private sealed class EmployeeAuthRow
        {
            public Guid Id { get; set; }
            public string? Email { get; set; }
            public string? FirstName { get; set; }
            public string? LastName { get; set; }
            public Guid? LinkedAuthUserId { get; set; }
            public DateTime? InviteSentAt { get; set; }
            public DateTime? VerifiedAt { get; set; }
        }

        private sealed class EmployeeRoleRow
        {
            public Guid Id { get; set; }
            public string? Email { get; set; }
            public string? FirstName { get; set; }
            public string? LastName { get; set; }
            public string? PhoneNumber { get; set; }
            public bool LeadingHand { get; set; }
            public Guid? LinkedAuthUserId { get; set; }
            public DateTime? VerifiedAt { get; set; }
        }

        private sealed class AuthAdminUser
        {
            public string Id { get; set; } = string.Empty;
            public string Email { get; set; } = string.Empty;
            public DateTime? EmailConfirmedAt { get; set; }
            public DateTime? ConfirmedAt { get; set; }
        }

        public sealed class EmployeeAuthLinkInfo
        {
            public Guid Id { get; set; }
            public string Email { get; set; } = string.Empty;
            public string FirstName { get; set; } = string.Empty;
            public string LastName { get; set; } = string.Empty;
            public Guid? LinkedAuthUserId { get; set; }
            public DateTime? InviteSentAt { get; set; }
            public DateTime? VerifiedAt { get; set; }
        }

        private readonly Supabase.Client _supabase;
        private readonly ILogger<SupabaseService> _logger;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly string _supabaseUrl;
        private readonly string _supabaseKey;
        private readonly string _bucketName = "design-pdfs";
        private readonly string _safetyBucketName = "project-information";
        private readonly JsonSerializerOptions _jsonOptions = new() { PropertyNameCaseInsensitive = true };
        private const string BootstrapAdminUserId = "dccf9acd-cb29-4a64-8ded-8b58da6bca74";

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

                var userNames = await GetUserNamesAsync(foldersResponse.Models.Select(folder => folder.UserId));
                var result = foldersResponse.Models
                    .Select(folder => BuildFolderSummary(folder, userNames))
                    .ToList();

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
                if (_folderCache.TryGetValue(folderId, out var cached))
                {
                    if (cached.Expiry > DateTime.UtcNow)
                    {
                        _logger.LogInformation("Cache hit for folder {FolderId}", folderId);
                        return cached.Data;
                    }

                    _folderCache.TryRemove(folderId, out _);
                }

                var folderResponse = await _supabase
                    .From<Folder>()
                    .Filter("id", Postgrest.Constants.Operator.Equals, folderId.ToString())
                    .Single();

                if (folderResponse == null)
                {
                    throw new Exception("Folder not found");
                }

                var subfoldersTask = _supabase
                    .From<Folder>()
                    .Filter("parent_folder_id", Postgrest.Constants.Operator.Equals, folderId.ToString())
                    .Order("name", Postgrest.Constants.Ordering.Ascending)
                    .Get();

                var documentsTask = _supabase
                    .From<DesignDocument>()
                    .Filter("folder_id", Postgrest.Constants.Operator.Equals, folderId.ToString())
                    .Order("revision_number", Postgrest.Constants.Ordering.Ascending)
                    .Get();

                await Task.WhenAll(subfoldersTask, documentsTask);

                var subfolders = (await subfoldersTask).Models;
                var documents = (await documentsTask).Models;

                var userIds = new List<string?> { folderResponse.UserId };
                userIds.AddRange(subfolders.Select(folder => folder.UserId));
                userIds.AddRange(documents.Select(document => document.UserId));

                var userNames = await GetUserNamesAsync(userIds);
                var result = BuildFolderDetail(folderResponse, subfolders, documents, userNames);

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

        private async Task<T?> InvokeRpcAsync<T>(string functionName, object payload)
        {
            if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_supabaseKey))
            {
                throw new InvalidOperationException("Supabase URL or key not configured.");
            }

            var client = _httpClientFactory.CreateClient();
            var url = $"{_supabaseUrl.TrimEnd('/')}/rest/v1/rpc/{functionName}";

            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Headers.Add("apikey", _supabaseKey);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _supabaseKey);
            request.Content = JsonContent.Create(payload);

            using var response = await client.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"RPC {functionName} failed with status {(int)response.StatusCode}: {body}");
            }

            if (string.IsNullOrWhiteSpace(body))
            {
                return default;
            }

            return JsonSerializer.Deserialize<T>(body, _jsonOptions);
        }

        private async Task<List<T>> GetRestRowsAsync<T>(string relativePath)
        {
            if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_supabaseKey))
            {
                throw new InvalidOperationException("Supabase URL or key not configured.");
            }

            var client = _httpClientFactory.CreateClient();
            var url = $"{_supabaseUrl.TrimEnd('/')}/rest/v1/{relativePath}";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Add("apikey", _supabaseKey);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _supabaseKey);

            using var response = await client.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"Supabase request failed with status {(int)response.StatusCode}: {body}");
            }

            if (string.IsNullOrWhiteSpace(body))
            {
                return new List<T>();
            }

            return JsonSerializer.Deserialize<List<T>>(body, _jsonOptions) ?? new List<T>();
        }

        private async Task<List<T>> PostRestRowsAsync<T>(string relativePath, object payload, string? prefer = null)
        {
            if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_supabaseKey))
            {
                throw new InvalidOperationException("Supabase URL or key not configured.");
            }

            var client = _httpClientFactory.CreateClient();
            var url = $"{_supabaseUrl.TrimEnd('/')}/rest/v1/{relativePath}";

            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Headers.Add("apikey", _supabaseKey);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _supabaseKey);
            if (!string.IsNullOrWhiteSpace(prefer))
            {
                request.Headers.Add("Prefer", prefer);
            }
            request.Content = JsonContent.Create(payload);

            using var response = await client.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"Supabase POST failed with status {(int)response.StatusCode}: {body}");
            }

            if (string.IsNullOrWhiteSpace(body))
            {
                return new List<T>();
            }

            return JsonSerializer.Deserialize<List<T>>(body, _jsonOptions) ?? new List<T>();
        }

        private async Task<List<T>> PatchRestRowsAsync<T>(string relativePath, object payload, string? prefer = null)
        {
            if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_supabaseKey))
            {
                throw new InvalidOperationException("Supabase URL or key not configured.");
            }

            var client = _httpClientFactory.CreateClient();
            var url = $"{_supabaseUrl.TrimEnd('/')}/rest/v1/{relativePath}";

            using var request = new HttpRequestMessage(HttpMethod.Patch, url);
            request.Headers.Add("apikey", _supabaseKey);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _supabaseKey);
            if (!string.IsNullOrWhiteSpace(prefer))
            {
                request.Headers.Add("Prefer", prefer);
            }
            request.Content = JsonContent.Create(payload);

            using var response = await client.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"Supabase PATCH failed with status {(int)response.StatusCode}: {body}");
            }

            if (string.IsNullOrWhiteSpace(body))
            {
                return new List<T>();
            }

            return JsonSerializer.Deserialize<List<T>>(body, _jsonOptions) ?? new List<T>();
        }

        private async Task DeleteRestRowsAsync(string relativePath)
        {
            if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_supabaseKey))
            {
                throw new InvalidOperationException("Supabase URL or key not configured.");
            }

            var client = _httpClientFactory.CreateClient();
            var url = $"{_supabaseUrl.TrimEnd('/')}/rest/v1/{relativePath}";

            using var request = new HttpRequestMessage(HttpMethod.Delete, url);
            request.Headers.Add("apikey", _supabaseKey);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _supabaseKey);

            using var response = await client.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"Supabase DELETE failed with status {(int)response.StatusCode}: {body}");
            }
        }

        private static string BuildInFilter(IEnumerable<string> ids)
        {
            return $"({string.Join(",", ids)})";
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

        private static string NormalizeRole(string? role)
        {
            var normalized = role?.Trim().ToLowerInvariant() ?? "";
            return AppRoles.All.Contains(normalized) ? normalized : AppRoles.Viewer;
        }

        private static string GetBootstrapRole(string normalizedUserId)
        {
            return string.Equals(normalizedUserId, BootstrapAdminUserId, StringComparison.OrdinalIgnoreCase)
                ? AppRoles.Admin
                : AppRoles.Viewer;
        }

        public async Task<string> EnsureUserRoleAsync(string? userId, string? desiredRole = null)
        {
            if (!TryNormalizeUserId(userId, out var normalizedUserId))
            {
                return AppRoles.Viewer;
            }

            var response = await _supabase
                .From<UserRoleRecord>()
                .Filter("user_id", Postgrest.Constants.Operator.Equals, normalizedUserId)
                .Get();

            var existing = response.Models.FirstOrDefault();
            if (existing != null)
            {
                var storedRole = NormalizeRole(existing.Role);
                if (storedRole != AppRoles.Viewer)
                {
                    return storedRole;
                }
                return await GetEmployeeDerivedRoleAsync(normalizedUserId);
            }

            var now = DateTime.UtcNow;
            var assignedRole = NormalizeRole(desiredRole ?? GetBootstrapRole(normalizedUserId));
            var record = new UserRoleRecord
            {
                UserId = Guid.Parse(normalizedUserId),
                Role = assignedRole,
                CreatedAt = now,
                UpdatedAt = now
            };

            await _supabase.From<UserRoleRecord>().Upsert(record);
            if (assignedRole != AppRoles.Viewer)
            {
                return assignedRole;
            }
            return await GetEmployeeDerivedRoleAsync(normalizedUserId);
        }

        public async Task<string> GetUserRoleAsync(string? userId)
        {
            if (!TryNormalizeUserId(userId, out var normalizedUserId))
            {
                return AppRoles.Viewer;
            }

            try
            {
                var response = await _supabase
                    .From<UserRoleRecord>()
                    .Filter("user_id", Postgrest.Constants.Operator.Equals, normalizedUserId)
                    .Get();

                var existing = response.Models.FirstOrDefault();
                if (existing != null)
                {
                    var storedRole = NormalizeRole(existing.Role);
                    if (storedRole != AppRoles.Viewer)
                    {
                        return storedRole;
                    }
                    return await GetEmployeeDerivedRoleAsync(normalizedUserId);
                }

                return await EnsureUserRoleAsync(normalizedUserId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting role for user {UserId}", normalizedUserId);
                throw;
            }
        }

        private async Task<string> GetEmployeeDerivedRoleAsync(string userId)
        {
            var employee = await GetLinkedEmployeeRoleInfoAsync(userId, null);
            if (employee == null)
            {
                return AppRoles.Viewer;
            }

            return employee.LeadingHand
                ? AppRoles.LeadingHand
                : AppRoles.GeneralScaffolder;
        }

        private async Task<EmployeeRoleRow?> GetLinkedEmployeeRoleInfoAsync(string? userId, string? email)
        {
            if (TryNormalizeUserId(userId, out var normalizedUserId))
            {
                var linkedRows = await GetRestRowsAsync<EmployeeRoleRow>(
                    $"ess_rostering_employees?select={Uri.EscapeDataString("id,email,firstName:first_name,lastName:last_name,phoneNumber:phone_number,leadingHand:leading_hand,linkedAuthUserId:linked_auth_user_id,verifiedAt:verified_at")}&linked_auth_user_id=eq.{normalizedUserId}&limit=1");

                var linkedEmployee = linkedRows.FirstOrDefault();
                if (linkedEmployee != null)
                {
                    return linkedEmployee;
                }
            }

            var normalizedEmail = email?.Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(normalizedEmail))
            {
                return null;
            }

            var emailRows = await GetRestRowsAsync<EmployeeRoleRow>(
                $"ess_rostering_employees?select={Uri.EscapeDataString("id,email,firstName:first_name,lastName:last_name,phoneNumber:phone_number,leadingHand:leading_hand,linkedAuthUserId:linked_auth_user_id,verifiedAt:verified_at")}&email=eq.{Uri.EscapeDataString(normalizedEmail)}&limit=1");

            return emailRows.FirstOrDefault();
        }

        public async Task EnrichUserInfoWithEmployeeRoleAsync(UserInfo user)
        {
            if (user == null)
            {
                return;
            }

            var employee = await GetLinkedEmployeeRoleInfoAsync(user.Id, user.Email);
            if (employee == null)
            {
                return;
            }

            user.EmployeeId = employee.Id;
            user.EmployeeFirstName = employee.FirstName?.Trim();
            user.EmployeeLastName = employee.LastName?.Trim();
            user.EmployeePhoneNumber = employee.PhoneNumber?.Trim();
            user.LeadingHand = employee.LeadingHand;

            if (!string.Equals(user.Role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase))
            {
                user.Role = employee.LeadingHand ? AppRoles.LeadingHand : AppRoles.GeneralScaffolder;
            }

            user.EmployeeTitle = employee.LeadingHand ? "Leading Hand" : "General Scaffolder";
        }

        private async Task<Dictionary<string, string>> GetAllUserRolesAsync()
        {
            try
            {
                var response = await _supabase
                    .From<UserRoleRecord>()
                    .Get();

                return response.Models.ToDictionary(
                    role => role.UserId.ToString().ToLowerInvariant(),
                    role => NormalizeRole(role.Role),
                    StringComparer.OrdinalIgnoreCase);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting all user roles");
                throw;
            }
        }

        private async Task<Dictionary<string, string>> GetUserRolesByIdsAsync(IEnumerable<string> userIds)
        {
            var validUserIds = userIds
                .Where(id => TryNormalizeUserId(id, out _))
                .Select(id => id!.ToLowerInvariant())
                .Distinct()
                .ToList();

            if (!validUserIds.Any())
            {
                return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            }

            try
            {
                var response = await _supabase
                    .From<UserRoleRecord>()
                    .Filter("user_id", Postgrest.Constants.Operator.In, validUserIds)
                    .Get();

                var roles = response.Models.ToDictionary(
                    role => role.UserId.ToString().ToLowerInvariant(),
                    role => NormalizeRole(role.Role),
                    StringComparer.OrdinalIgnoreCase);

                foreach (var userId in validUserIds.Where(userId => !roles.ContainsKey(userId)))
                {
                    roles[userId] = await EnsureUserRoleAsync(userId);
                }

                return roles;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting user roles by id");
                throw;
            }
        }

        public async Task<UserInfo> UpdateUserRoleAsync(string userId, string role)
        {
            if (!TryNormalizeUserId(userId, out var normalizedUserId))
            {
                throw new ArgumentException("Invalid user ID", nameof(userId));
            }

            var normalizedRole = NormalizeRole(role);
            var now = DateTime.UtcNow;
            var record = new UserRoleRecord
            {
                UserId = Guid.Parse(normalizedUserId),
                Role = normalizedRole,
                CreatedAt = now,
                UpdatedAt = now
            };

            await _supabase.From<UserRoleRecord>().Upsert(record);
            await SyncLinkedEmployeeRoleAsync(normalizedUserId, normalizedRole);

            var user = (await GetUsersByIdsAsync(new[] { normalizedUserId })).FirstOrDefault();
            if (user == null)
            {
                throw new InvalidOperationException("User not found");
            }

            return user;
        }

        private async Task SyncLinkedEmployeeRoleAsync(string normalizedUserId, string normalizedRole)
        {
            if (normalizedRole != AppRoles.LeadingHand && normalizedRole != AppRoles.GeneralScaffolder)
            {
                return;
            }

            var linkedEmployee = await GetLinkedEmployeeRoleInfoAsync(normalizedUserId, null);
            if (linkedEmployee == null)
            {
                return;
            }

            var shouldBeLeadingHand = normalizedRole == AppRoles.LeadingHand;
            if (linkedEmployee.LeadingHand == shouldBeLeadingHand)
            {
                return;
            }

            try
            {
                await PatchRestRowsAsync<object>(
                    $"ess_rostering_employees?id=eq.{linkedEmployee.Id:D}",
                    new
                    {
                        leading_hand = shouldBeLeadingHand,
                        updated_at = DateTime.UtcNow
                    });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error syncing linked employee role for user {UserId}", normalizedUserId);
                throw;
            }
        }
        private FolderResponse BuildFolderSummary(Folder folder, IReadOnlyDictionary<string, string> userNames)
        {
            userNames.TryGetValue(folder.UserId ?? string.Empty, out var ownerName);

            return new FolderResponse
            {
                Id = folder.Id,
                Name = folder.Name,
                ParentFolderId = folder.ParentFolderId,
                UserId = folder.UserId,
                OwnerName = ownerName,
                CreatedAt = folder.CreatedAt,
                UpdatedAt = folder.UpdatedAt,
                FileSize = folder.TotalFileSize > 0 ? folder.TotalFileSize : null,
                SubFolders = new List<FolderResponse>(),
                Documents = new List<DocumentResponse>()
            };
        }

        private FolderResponse BuildFolderDetail(
            Folder folder,
            IEnumerable<Folder> subfolders,
            IEnumerable<DesignDocument> documents,
            IReadOnlyDictionary<string, string> userNames)
        {
            var response = BuildFolderSummary(folder, userNames);
            response.SubFolders = subfolders
                .Select(subfolder => BuildFolderSummary(subfolder, userNames))
                .ToList();
            response.Documents = documents
                .Select(document => BuildDocumentResponse(document, userNames))
                .ToList();
            return response;
        }

        private DocumentResponse BuildDocumentResponse(DesignDocument document, IReadOnlyDictionary<string, string> userNames)
        {
            userNames.TryGetValue(document.UserId ?? string.Empty, out var ownerName);
            var totalSize = (document.EssDesignFileSize ?? 0) + (document.ThirdPartyDesignFileSize ?? 0);

            return new DocumentResponse
            {
                Id = document.Id,
                FolderId = document.FolderId,
                RevisionNumber = document.RevisionNumber,
                Description = document.Description,
                EssDesignIssuePath = document.EssDesignIssuePath,
                EssDesignIssueName = document.EssDesignIssueName,
                ThirdPartyDesignPath = document.ThirdPartyDesignPath,
                ThirdPartyDesignName = document.ThirdPartyDesignName,
                EssDesignFileSize = document.EssDesignFileSize,
                ThirdPartyDesignFileSize = document.ThirdPartyDesignFileSize,
                TotalFileSize = totalSize > 0 ? totalSize : null,
                UserId = document.UserId,
                OwnerName = ownerName,
                CreatedAt = document.CreatedAt,
                UpdatedAt = document.UpdatedAt
            };
        }

        public async Task<DocumentResponse> GetDocumentByIdAsync(Guid documentId)
        {
            try
            {
                var document = await _supabase
                    .From<DesignDocument>()
                    .Filter("id", Postgrest.Constants.Operator.Equals, documentId.ToString())
                    .Single();

                if (document == null)
                {
                    throw new FileNotFoundException("Document not found");
                }

                var userNames = await GetUserNamesAsync(new[] { document.UserId });
                return BuildDocumentResponse(document, userNames);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving document {DocumentId}", documentId);
                throw;
            }
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
            return await InvokeRpcAsync<List<BreadcrumbItem>>("get_folder_breadcrumbs", new { p_folder_id = folderId })
                ?? new List<BreadcrumbItem>();
        }

        public async Task<FolderHierarchy> GetFolderHierarchyAsync(Guid folderId)
        {
            return await InvokeRpcAsync<FolderHierarchy>("get_folder_hierarchy", new { p_folder_id = folderId })
                ?? new FolderHierarchy();
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
                    uploadTasks.Add(UploadAndAssignEssFileAsync(essDesign, path, document));
                }

                if (thirdParty != null)
                {
                    var path = $"documents/{folderId}/{document.Id}/third_party_{thirdParty.FileName}";
                    uploadTasks.Add(UploadAndAssignThirdPartyFileAsync(thirdParty, path, document));
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

        private async Task UploadAndAssignEssFileAsync(IFormFile essDesign, string path, DesignDocument document)
        {
            await UploadFileAsync(essDesign, path);
            document.EssDesignIssuePath = path;
            document.EssDesignIssueName = essDesign.FileName;
            document.EssDesignFileSize = essDesign.Length;
        }

        private async Task UploadAndAssignThirdPartyFileAsync(IFormFile thirdParty, string path, DesignDocument document)
        {
            await UploadFileAsync(thirdParty, path);
            document.ThirdPartyDesignPath = path;
            document.ThirdPartyDesignName = thirdParty.FileName;
            document.ThirdPartyDesignFileSize = thirdParty.Length;
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

        public async Task<DesignDocument> ReplaceDocumentFilesAsync(
            Guid documentId,
            IFormFile? essDesign,
            IFormFile? thirdParty,
            string? description = null,
            string? userId = null)
        {
            try
            {
                var document = await _supabase
                    .From<DesignDocument>()
                    .Filter("id", Postgrest.Constants.Operator.Equals, documentId.ToString())
                    .Single();

                if (document == null)
                {
                    throw new FileNotFoundException("Document not found");
                }

                if (essDesign == null && thirdParty == null)
                {
                    throw new InvalidOperationException("At least one replacement file is required");
                }

                var replaceTasks = new List<Task>();

                if (essDesign != null)
                {
                    if (!string.IsNullOrWhiteSpace(document.EssDesignIssuePath))
                    {
                        replaceTasks.Add(DeleteFileAsync(document.EssDesignIssuePath));
                    }

                    var essPath = $"documents/{document.FolderId}/{document.Id}/ess_{essDesign.FileName}";
                    replaceTasks.Add(UploadAndAssignEssFileAsync(essDesign, essPath, document));
                }

                if (thirdParty != null)
                {
                    if (!string.IsNullOrWhiteSpace(document.ThirdPartyDesignPath))
                    {
                        replaceTasks.Add(DeleteFileAsync(document.ThirdPartyDesignPath));
                    }

                    var thirdPartyPath = $"documents/{document.FolderId}/{document.Id}/third_party_{thirdParty.FileName}";
                    replaceTasks.Add(UploadAndAssignThirdPartyFileAsync(thirdParty, thirdPartyPath, document));
                }

                await Task.WhenAll(replaceTasks);

                document.Description = description;
                document.UserId = userId ?? document.UserId;
                document.UpdatedAt = DateTime.UtcNow;

                await _supabase
                    .From<DesignDocument>()
                    .Update(document);

                _folderCache.TryRemove(document.FolderId, out _);

                _logger.LogInformation("Replaced files for document {DocumentId}", documentId);
                return document;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error replacing files for document {DocumentId}", documentId);
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
            if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_supabaseKey))
            {
                throw new InvalidOperationException("Supabase URL or key not configured.");
            }

            var client = _httpClientFactory.CreateClient();
            var escapedPath = string.Join(
                "/",
                path.Split('/', StringSplitOptions.RemoveEmptyEntries).Select(Uri.EscapeDataString));
            var url = $"{_supabaseUrl.TrimEnd('/')}/storage/v1/object/{Uri.EscapeDataString(_bucketName)}/{escapedPath}";

            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Headers.Add("apikey", _supabaseKey);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _supabaseKey);
            request.Headers.Add("x-upsert", "true");

            var stream = file.OpenReadStream();
            var content = new StreamContent(stream);
            content.Headers.ContentType = MediaTypeHeaderValue.Parse(
                string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType);
            request.Content = content;

            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync();
                throw new InvalidOperationException(
                    $"Failed to upload '{file.FileName}' to storage. Status: {(int)response.StatusCode}. Body: {errorBody}");
            }

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
                return await InvokeRpcAsync<List<SearchResult>>(
                           "search_folders",
                           new { p_query = query, p_limit = 12 })
                       ?? new List<SearchResult>();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error searching for '{Query}'", query);
                throw;
            }
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
            var role = await EnsureUserRoleAsync(id);

            return new UserInfo
            {
                Id = id ?? string.Empty,
                Email = email ?? string.Empty,
                FullName = fullName ?? string.Empty,
                AvatarUrl = avatarUrl,
                Role = role
            };
        }

        public async Task<AuthResponse?> RefreshAuthSessionAsync(string refreshToken)
        {
            if (string.IsNullOrWhiteSpace(refreshToken) || string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_supabaseKey))
            {
                return null;
            }

            var client = _httpClientFactory.CreateClient();
            var url = $"{_supabaseUrl.TrimEnd('/')}/auth/v1/token?grant_type=refresh_token";

            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Headers.Add("apikey", _supabaseKey);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _supabaseKey);
            request.Content = JsonContent.Create(new { refresh_token = refreshToken });

            using var response = await client.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            var body = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;

            var newAccessToken = GetJsonString(root, "access_token");
            var newRefreshToken = GetJsonString(root, "refresh_token") ?? refreshToken;

            if (string.IsNullOrWhiteSpace(newAccessToken))
            {
                return null;
            }

            var user = await GetAuthUserInfoFromAccessTokenAsync(newAccessToken);
            if (user == null)
            {
                return null;
            }

            return new AuthResponse
            {
                AccessToken = newAccessToken,
                RefreshToken = newRefreshToken,
                User = user
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

        private static Guid? TryGetGuid(JsonElement obj, string propertyName)
        {
            var value = GetJsonString(obj, propertyName);
            return Guid.TryParse(value, out var parsed) ? parsed : null;
        }

        private static DateTime? TryGetDateTime(JsonElement obj, string propertyName)
        {
            var value = GetJsonString(obj, propertyName);
            return DateTime.TryParse(value, out var parsed) ? parsed : null;
        }

        public async Task<List<UserInfo>> GetAllUsersAsync()
        {
            try
            {
                var users = await GetRestRowsAsync<UserInfo>(
                    $"user_names?select={Uri.EscapeDataString("id,email,fullName:full_name")}&order=full_name.asc");
                var roles = await GetAllUserRolesAsync();

                foreach (var user in users)
                {
                    user.Role = roles.TryGetValue(user.Id, out var role)
                        ? role
                        : await EnsureUserRoleAsync(user.Id);
                    await EnrichUserInfoWithEmployeeRoleAsync(user);
                }

                return users;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting all users");
                throw;
            }
        }

        public async Task<List<UserInfo>> GetUsersByIdsAsync(IEnumerable<string> userIds)
        {
            var validUserIds = userIds
                .Where(id => TryNormalizeUserId(id, out _))
                .Select(id => id!.ToLowerInvariant())
                .Distinct()
                .ToList();

            if (!validUserIds.Any())
            {
                return new List<UserInfo>();
            }

            try
            {
                var users = await GetRestRowsAsync<UserInfo>(
                    $"user_names?select={Uri.EscapeDataString("id,email,fullName:full_name")}&id=in.{BuildInFilter(validUserIds)}&order=full_name.asc");
                var roles = await GetUserRolesByIdsAsync(validUserIds);

                foreach (var user in users)
                {
                    user.Role = roles.TryGetValue(user.Id, out var role)
                        ? role
                        : await EnsureUserRoleAsync(user.Id);
                    await EnrichUserInfoWithEmployeeRoleAsync(user);
                }

                return users;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting {Count} users by id", validUserIds.Count);
                throw;
            }
        }

        public async Task<EmployeeAuthLinkInfo?> GetEmployeeAuthLinkInfoAsync(Guid employeeId)
        {
            try
            {
                var rows = await GetRestRowsAsync<EmployeeAuthRow>(
                    $"ess_rostering_employees?select={Uri.EscapeDataString("id,email,firstName:first_name,lastName:last_name,linkedAuthUserId:linked_auth_user_id,inviteSentAt:invite_sent_at,verifiedAt:verified_at")}&id=eq.{employeeId:D}&limit=1");

                var row = rows.FirstOrDefault();
                if (row == null)
                {
                    return null;
                }

                return new EmployeeAuthLinkInfo
                {
                    Id = row.Id,
                    Email = row.Email?.Trim() ?? string.Empty,
                    FirstName = row.FirstName?.Trim() ?? string.Empty,
                    LastName = row.LastName?.Trim() ?? string.Empty,
                    LinkedAuthUserId = row.LinkedAuthUserId,
                    InviteSentAt = row.InviteSentAt,
                    VerifiedAt = row.VerifiedAt
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting employee auth link info for {EmployeeId}", employeeId);
                throw;
            }
        }

        public async Task DeleteEmployeeAndAuthAsync(Guid employeeId)
        {
            var employee = await GetEmployeeAuthLinkInfoAsync(employeeId);
            if (employee == null)
            {
                throw new InvalidOperationException("Employee not found.");
            }

            if (employee.LinkedAuthUserId.HasValue)
            {
                await DeleteAuthUserAsync(employee.LinkedAuthUserId.Value.ToString());
                await DeleteUserMetadataAsync(employee.LinkedAuthUserId.Value);
            }

            try
            {
                await DeleteRestRowsAsync($"ess_rostering_employees?id=eq.{employeeId:D}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting employee row {EmployeeId}", employeeId);
                throw;
            }
        }

        private async Task DeleteAuthUserAsync(string authUserId)
        {
            if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_supabaseKey))
            {
                throw new InvalidOperationException("Supabase URL or key not configured.");
            }

            var client = _httpClientFactory.CreateClient();
            var url = $"{_supabaseUrl.TrimEnd('/')}/auth/v1/admin/users/{Uri.EscapeDataString(authUserId)}";

            using var request = new HttpRequestMessage(HttpMethod.Delete, url);
            request.Headers.Add("apikey", _supabaseKey);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _supabaseKey);

            using var response = await client.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"Supabase auth delete failed with status {(int)response.StatusCode}: {body}");
            }
        }

        private async Task DeleteUserMetadataAsync(Guid userId)
        {
            try
            {
                await DeleteRestRowsAsync($"user_names?id=eq.{userId:D}");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed deleting user_names row for {UserId}", userId);
            }

            try
            {
                await DeleteRestRowsAsync($"user_roles?user_id=eq.{userId:D}");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed deleting user_roles row for {UserId}", userId);
            }
        }

        public async Task UpdateEmployeeInviteAsync(Guid employeeId, string email)
        {
            try
            {
                await PatchRestRowsAsync<object>(
                    $"ess_rostering_employees?id=eq.{employeeId:D}",
                    new
                    {
                        email = email.Trim().ToLowerInvariant(),
                        invite_sent_at = DateTime.UtcNow,
                        updated_at = DateTime.UtcNow
                    });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating employee invite state for {EmployeeId}", employeeId);
                throw;
            }
        }

        public async Task LinkEmployeeAuthUserAsync(Guid employeeId, string email, string authUserId)
        {
            if (!Guid.TryParse(authUserId, out var authUserGuid))
            {
                throw new InvalidOperationException("Invalid auth user id.");
            }

            try
            {
                await PatchRestRowsAsync<object>(
                    $"ess_rostering_employees?id=eq.{employeeId:D}",
                    new
                    {
                        email = email.Trim().ToLowerInvariant(),
                        linked_auth_user_id = authUserGuid,
                        verified_at = DateTime.UtcNow,
                        updated_at = DateTime.UtcNow
                    });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error linking employee {EmployeeId} to auth user {AuthUserId}", employeeId, authUserId);
                throw;
            }
        }

        public async Task<int> SyncEmployeeLinkForUserAsync(string authUserId, string email)
        {
            if (!Guid.TryParse(authUserId, out var authUserGuid))
            {
                return 0;
            }

            var normalizedEmail = email?.Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(normalizedEmail))
            {
                return 0;
            }

            var employees = await GetRestRowsAsync<EmployeeAuthRow>(
                $"ess_rostering_employees?select={Uri.EscapeDataString("id,email,linkedAuthUserId:linked_auth_user_id,verifiedAt:verified_at")}&email=eq.{Uri.EscapeDataString(normalizedEmail)}");

            if (employees.Count == 0)
            {
                return 0;
            }

            var syncedCount = 0;

            foreach (var employee in employees)
            {
                var alreadyLinked = employee.LinkedAuthUserId.HasValue
                    && employee.LinkedAuthUserId.Value == authUserGuid
                    && employee.VerifiedAt.HasValue;

                if (alreadyLinked)
                {
                    continue;
                }

                await LinkEmployeeAuthUserAsync(employee.Id, normalizedEmail, authUserId);
                syncedCount += 1;
            }

            return syncedCount;
        }

        public async Task<int> SyncEmployeeAuthLinksAsync()
        {
            var employees = await GetRestRowsAsync<EmployeeAuthRow>(
                $"ess_rostering_employees?select={Uri.EscapeDataString("id,email,linkedAuthUserId:linked_auth_user_id,verifiedAt:verified_at")}&not.email=is.null");

            if (employees.Count == 0)
            {
                return 0;
            }

            var confirmedUsersByEmail = await GetConfirmedAuthUsersByEmailAsync();
            var knownUsersByEmail = await GetKnownUserNamesByEmailAsync();
            var syncedCount = 0;

            foreach (var employee in employees)
            {
                var email = employee.Email?.Trim().ToLowerInvariant();
                if (string.IsNullOrWhiteSpace(email))
                {
                    continue;
                }

                if (!confirmedUsersByEmail.TryGetValue(email, out var authUser)
                    && !knownUsersByEmail.TryGetValue(email, out authUser))
                {
                    continue;
                }

                var alreadyLinked = employee.LinkedAuthUserId.HasValue
                    && Guid.TryParse(authUser.Id, out var authGuid)
                    && employee.LinkedAuthUserId.Value == authGuid
                    && employee.VerifiedAt.HasValue;

                if (alreadyLinked)
                {
                    continue;
                }

                await LinkEmployeeAuthUserAsync(employee.Id, email, authUser.Id);
                syncedCount += 1;
            }

            return syncedCount;
        }

        private async Task<Dictionary<string, AuthAdminUser>> GetKnownUserNamesByEmailAsync()
        {
            var users = await GetRestRowsAsync<UserInfo>(
                $"user_names?select={Uri.EscapeDataString("id,email")}&not.email=is.null");

            var usersByEmail = new Dictionary<string, AuthAdminUser>(StringComparer.OrdinalIgnoreCase);

            foreach (var user in users)
            {
                var email = user.Email?.Trim().ToLowerInvariant();
                var id = user.Id?.Trim();

                if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(id))
                {
                    continue;
                }

                usersByEmail[email] = new AuthAdminUser
                {
                    Id = id,
                    Email = email,
                    ConfirmedAt = DateTime.UtcNow
                };
            }

            return usersByEmail;
        }

        private async Task<Dictionary<string, AuthAdminUser>> GetConfirmedAuthUsersByEmailAsync()
        {
            if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_supabaseKey))
            {
                throw new InvalidOperationException("Supabase URL or key not configured.");
            }

            var client = _httpClientFactory.CreateClient();
            var usersByEmail = new Dictionary<string, AuthAdminUser>(StringComparer.OrdinalIgnoreCase);
            var page = 1;

            while (true)
            {
                var url = $"{_supabaseUrl.TrimEnd('/')}/auth/v1/admin/users?page={page}&per_page=1000";
                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                request.Headers.Add("apikey", _supabaseKey);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _supabaseKey);

                using var response = await client.SendAsync(request);
                var body = await response.Content.ReadAsStringAsync();
                if (!response.IsSuccessStatusCode)
                {
                    throw new InvalidOperationException($"Supabase admin users request failed with status {(int)response.StatusCode}: {body}");
                }

                using var doc = JsonDocument.Parse(body);
                if (!doc.RootElement.TryGetProperty("users", out var usersEl) || usersEl.ValueKind != JsonValueKind.Array)
                {
                    break;
                }

                var count = 0;
                foreach (var userEl in usersEl.EnumerateArray())
                {
                    count += 1;
                    var email = GetJsonString(userEl, "email")?.Trim().ToLowerInvariant();
                    var id = GetJsonString(userEl, "id");
                    var emailConfirmedAt = TryGetDateTime(userEl, "email_confirmed_at");
                    var confirmedAt = TryGetDateTime(userEl, "confirmed_at");

                    if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(id))
                    {
                        continue;
                    }

                    if (!emailConfirmedAt.HasValue && !confirmedAt.HasValue)
                    {
                        continue;
                    }

                    usersByEmail[email] = new AuthAdminUser
                    {
                        Id = id,
                        Email = email,
                        EmailConfirmedAt = emailConfirmedAt,
                        ConfirmedAt = confirmedAt
                    };
                }

                if (count < 1000)
                {
                    break;
                }

                page += 1;
            }

            return usersByEmail;
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
                var existingResponse = await GetRestRowsAsync<UserPushToken>(
                    $"user_push_tokens?select={Uri.EscapeDataString("id,userId:user_id,token,platform,appBundleId:app_bundle_id,isActive:is_active,createdAt:created_at,updatedAt:updated_at")}&user_id=eq.{userId:D}&platform=eq.{Uri.EscapeDataString(normalizedPlatform)}&is_active=eq.true&limit=1");

                var now = DateTime.UtcNow;
                var existing = existingResponse.FirstOrDefault();
                if (existing != null)
                {
                    await PatchRestRowsAsync<UserPushToken>(
                        $"user_push_tokens?id=eq.{existing.Id:D}",
                        new
                        {
                            token,
                            app_bundle_id = appBundleId,
                            is_active = true,
                            updated_at = now
                        },
                        "return=representation");
                    return;
                }

                await PostRestRowsAsync<UserPushToken>(
                    "user_push_tokens",
                    new[]
                    {
                        new
                        {
                            id = Guid.NewGuid(),
                            user_id = userId,
                            token,
                            platform = normalizedPlatform,
                            app_bundle_id = appBundleId,
                            is_active = true,
                            created_at = now,
                            updated_at = now
                        }
                    },
                    "return=representation");
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
            var validUserIds = userIds
                .Where(id => Guid.TryParse(id, out _))
                .Select(id => Guid.Parse(id).ToString().ToLowerInvariant())
                .Distinct()
                .ToList();

            if (!validUserIds.Any())
            {
                return new List<UserPushToken>();
            }

            try
            {
                var normalizedPlatform = string.IsNullOrWhiteSpace(platform)
                    ? "ios"
                    : platform.Trim().ToLowerInvariant();

                return await GetRestRowsAsync<UserPushToken>(
                    $"user_push_tokens?select={Uri.EscapeDataString("id,userId:user_id,token,platform,appBundleId:app_bundle_id,isActive:is_active,createdAt:created_at,updatedAt:updated_at")}&platform=eq.{Uri.EscapeDataString(normalizedPlatform)}&is_active=eq.true&user_id=in.{BuildInFilter(validUserIds)}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting push tokens for users");
                throw;
            }
        }

        public async Task CreateUserNotificationsAsync(CreateUserNotificationRequest request)
        {
            var validUserIds = request.RecipientUserIds
                .Where(id => Guid.TryParse(id, out _))
                .Select(Guid.Parse)
                .Distinct()
                .ToList();

            if (!validUserIds.Any() || string.IsNullOrWhiteSpace(request.Title))
            {
                return;
            }

            try
            {
                var now = DateTime.UtcNow;
                var rows = validUserIds.Select(userId => new
                {
                    id = Guid.NewGuid(),
                    user_id = userId,
                    title = request.Title.Trim(),
                    message = request.Message?.Trim() ?? string.Empty,
                    type = string.IsNullOrWhiteSpace(request.Type) ? "document_update" : request.Type.Trim(),
                    actor_name = request.ActorName,
                    actor_image_url = request.ActorImageUrl,
                    folder_id = request.FolderId,
                    document_id = request.DocumentId,
                    read = false,
                    created_at = now,
                    updated_at = now
                }).ToList();

                await PostRestRowsAsync<UserNotification>(
                    "user_notifications",
                    rows,
                    "return=representation");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating notifications for {Count} users", validUserIds.Count);
                throw;
            }
        }

        public async Task<List<UserNotification>> GetUserNotificationsAsync(string userId)
        {
            if (!TryNormalizeUserId(userId, out var normalizedUserId))
            {
                return new List<UserNotification>();
            }

            try
            {
                if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_supabaseKey))
                {
                    throw new InvalidOperationException("Supabase URL or key not configured.");
                }

                var client = _httpClientFactory.CreateClient();
                var url = $"{_supabaseUrl.TrimEnd('/')}/rest/v1/user_notifications?select={Uri.EscapeDataString("id,user_id,title,message,type,actor_name,actor_image_url,folder_id,document_id,read,created_at,updated_at")}&user_id=eq.{normalizedUserId}&order=created_at.desc";

                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                request.Headers.Add("apikey", _supabaseKey);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _supabaseKey);

                using var response = await client.SendAsync(request);
                var body = await response.Content.ReadAsStringAsync();
                if (!response.IsSuccessStatusCode)
                {
                    throw new InvalidOperationException($"Supabase notifications request failed with status {(int)response.StatusCode}: {body}");
                }

                if (string.IsNullOrWhiteSpace(body))
                {
                    return new List<UserNotification>();
                }

                using var doc = JsonDocument.Parse(body);
                if (doc.RootElement.ValueKind != JsonValueKind.Array)
                {
                    return new List<UserNotification>();
                }

                var notifications = new List<UserNotification>();
                foreach (var item in doc.RootElement.EnumerateArray())
                {
                    var notificationId = TryGetGuid(item, "id");
                    var notificationUserId = TryGetGuid(item, "user_id");
                    if (notificationId == null || notificationUserId == null)
                    {
                        continue;
                    }

                    notifications.Add(new UserNotification
                    {
                        Id = notificationId.Value,
                        UserId = notificationUserId.Value,
                        Title = GetJsonString(item, "title") ?? string.Empty,
                        Message = GetJsonString(item, "message") ?? string.Empty,
                        Type = GetJsonString(item, "type") ?? "document_update",
                        ActorName = GetJsonString(item, "actor_name"),
                        ActorImageUrl = GetJsonString(item, "actor_image_url"),
                        FolderId = TryGetGuid(item, "folder_id"),
                        DocumentId = TryGetGuid(item, "document_id"),
                        Read = item.TryGetProperty("read", out var readProperty) && readProperty.ValueKind == JsonValueKind.True,
                        CreatedAt = TryGetDateTime(item, "created_at") ?? DateTime.UtcNow,
                        UpdatedAt = TryGetDateTime(item, "updated_at") ?? DateTime.UtcNow
                    });
                }

                return notifications;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting notifications for {UserId}", normalizedUserId);
                throw;
            }
        }

        public async Task MarkAllUserNotificationsReadAsync(string userId)
        {
            if (!TryNormalizeUserId(userId, out var normalizedUserId))
            {
                return;
            }

            try
            {
                var unreadNotifications = await GetRestRowsAsync<UserNotification>(
                    $"user_notifications?select={Uri.EscapeDataString("id")}&user_id=eq.{normalizedUserId}&read=eq.false");

                foreach (var row in unreadNotifications)
                {
                    await PatchRestRowsAsync<UserNotification>(
                        $"user_notifications?id=eq.{row.Id:D}&user_id=eq.{normalizedUserId}",
                        new
                        {
                            read = true,
                            updated_at = DateTime.UtcNow
                        },
                        "return=representation");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error marking notifications read for {UserId}", normalizedUserId);
                throw;
            }
        }

        public async Task DeleteUserNotificationAsync(string userId, Guid notificationId)
        {
            if (!TryNormalizeUserId(userId, out var normalizedUserId))
            {
                return;
            }

            try
            {
                await DeleteRestRowsAsync(
                    $"user_notifications?id=eq.{notificationId:D}&user_id=eq.{normalizedUserId}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting notification {NotificationId} for {UserId}", notificationId, normalizedUserId);
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
                var response = await GetRestRowsAsync<UserPushToken>(
                    $"user_push_tokens?select={Uri.EscapeDataString("id")}&token=eq.{Uri.EscapeDataString(token)}&is_active=eq.true");

                foreach (var row in response)
                {
                    await PatchRestRowsAsync<UserPushToken>(
                        $"user_push_tokens?id=eq.{row.Id:D}",
                        new
                        {
                            is_active = false,
                            updated_at = DateTime.UtcNow
                        },
                        "return=representation");
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
