using Supabase;
using ESSDesign.Server.Models;
using ESSDesign.Server.Services.Assistant;
using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.RegularExpressions;

namespace ESSDesign.Server.Services
{
    public class SupabaseService
    {
        private const string TruckDeviceEmailDomain = "ess-trucks.local";
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

        private sealed class FolderCountRow
        {
            [JsonPropertyName("parent_folder_id")]
            public Guid? ParentFolderId { get; set; }
        }

        private sealed class DocumentFolderRow
        {
            [JsonPropertyName("folder_id")]
            public Guid FolderId { get; set; }
        }

        private sealed class PreparedDocumentUpload
        {
            public string TempFilePath { get; init; } = string.Empty;
            public string FileName { get; init; } = string.Empty;
            public string ContentType { get; init; } = "application/pdf";
            public long Length { get; init; }
            public string Fingerprint { get; init; } = string.Empty;
        }

        private sealed class DrawingDocumentLookupRow
        {
            [JsonPropertyName("id")]
            public Guid Id { get; set; }

            [JsonPropertyName("folder_id")]
            public Guid FolderId { get; set; }

            [JsonPropertyName("ess_design_issue_name")]
            public string? EssDesignIssueName { get; set; }

            [JsonPropertyName("ess_design_issue_path")]
            public string? EssDesignIssuePath { get; set; }

            [JsonPropertyName("third_party_design_name")]
            public string? ThirdPartyDesignName { get; set; }

            [JsonPropertyName("third_party_design_path")]
            public string? ThirdPartyDesignPath { get; set; }

            [JsonPropertyName("revision_number")]
            public string? RevisionNumber { get; set; }

            [JsonPropertyName("drawing_status")]
            public string? DrawingStatus { get; set; }

            [JsonPropertyName("updated_at")]
            public DateTime UpdatedAt { get; set; }
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
        private readonly EssAssistantUploadQueue _assistantUploadQueue;
        private readonly string _supabaseUrl;
        private readonly string _supabaseKey;
        private readonly string _bucketName = "design-pdfs";
        private readonly string _safetyBucketName = "project-information";
        private readonly string _profileImagesBucketName = "profile-images";
        private readonly JsonSerializerOptions _jsonOptions = new() { PropertyNameCaseInsensitive = true };
        private const string BootstrapAdminUserId = "dccf9acd-cb29-4a64-8ded-8b58da6bca74";

        // In-memory cache for folders (5 minute expiration)
        private static readonly ConcurrentDictionary<Guid, (FolderResponse Data, DateTime Expiry)> _folderCache = new();
        private static readonly ConcurrentDictionary<string, (string Value, DateTime Expiry)> _userNameCache = new(StringComparer.OrdinalIgnoreCase);
        private static readonly ConcurrentDictionary<string, (string Url, DateTimeOffset ExpiresAt)> _signedUrlCache = new(StringComparer.Ordinal);
        private static readonly SemaphoreSlim _signedUrlLock = new(1, 1);
        private static readonly TimeSpan _cacheExpiration = TimeSpan.FromMinutes(5);

        // Root folders cache
        private static List<FolderResponse>? _rootFoldersCache;
        private static DateTime _rootFoldersCacheExpiry = DateTime.MinValue;

        public SupabaseService(
            Supabase.Client supabase,
            ILogger<SupabaseService> logger,
            IHttpClientFactory httpClientFactory,
            EssAssistantUploadQueue assistantUploadQueue,
            IConfiguration configuration)
        {
            _supabase = supabase;
            _logger = logger;
            _httpClientFactory = httpClientFactory;
            _assistantUploadQueue = assistantUploadQueue;
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
                    await PopulateFolderItemCountsAsync(_rootFoldersCache);
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
                await PopulateFolderItemCountsAsync(result);

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
                        await PopulateFolderItemCountsAsync(cached.Data.SubFolders);
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
                await PopulateFolderItemCountsAsync(result.SubFolders);

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
                var payload = new[]
                {
                    new Dictionary<string, object?>
                    {
                        ["id"] = userGuid,
                        ["email"] = email,
                        ["full_name"] = !string.IsNullOrWhiteSpace(fullName) ? fullName.Trim() : email.Split('@')[0],
                        ["updated_at"] = DateTime.UtcNow
                    }
                };

                await PostRestRowsAsync<object>(
                    "user_names?on_conflict=id",
                    payload,
                    "resolution=merge-duplicates");
                _logger.LogInformation("Upserted user_names for {UserId}", userId);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to upsert user_names for {UserId}", userId);
            }
        }

        private const string UserProfileSelect =
            "id,email,fullName:full_name,phoneNumber:phone_number,preferredName:preferred_name,dateOfBirth:date_of_birth,gender,personalAddress:personal_address,addressStreet:address_street,addressCity:address_city,addressState:address_state,addressPostalCode:address_postal_code,addressCountry:address_country,emergencyContactName:emergency_contact_name,emergencyRelationship:emergency_relationship,emergencyPhoneNumber:emergency_phone_number,emergencyEmail:emergency_email,emergencyAddress:emergency_address";

        private static string? CleanOptional(string? value)
        {
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }

        private static string? CleanEmail(string? value)
        {
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToLowerInvariant();
        }

        private static void ApplyUserProfileFields(UserInfo target, UserInfo? profile)
        {
            if (target == null || profile == null)
            {
                return;
            }

            target.Email = string.IsNullOrWhiteSpace(profile.Email) ? target.Email : profile.Email;
            target.FullName = string.IsNullOrWhiteSpace(profile.FullName) ? target.FullName : profile.FullName;
            target.PhoneNumber = profile.PhoneNumber;
            target.PreferredName = profile.PreferredName;
            target.DateOfBirth = profile.DateOfBirth;
            target.Gender = profile.Gender;
            target.PersonalAddress = profile.PersonalAddress;
            target.AddressStreet = profile.AddressStreet;
            target.AddressCity = profile.AddressCity;
            target.AddressState = profile.AddressState;
            target.AddressPostalCode = profile.AddressPostalCode;
            target.AddressCountry = profile.AddressCountry;
            target.EmergencyContactName = profile.EmergencyContactName;
            target.EmergencyRelationship = profile.EmergencyRelationship;
            target.EmergencyPhoneNumber = profile.EmergencyPhoneNumber;
            target.EmergencyEmail = profile.EmergencyEmail;
            target.EmergencyAddress = profile.EmergencyAddress;
        }

        public async Task<UserInfo?> GetUserProfileRowAsync(string userId)
        {
            if (!TryNormalizeUserId(userId, out var normalizedUserId))
            {
                return null;
            }

            var rows = await GetRestRowsAsync<UserInfo>(
                $"user_names?select={Uri.EscapeDataString(UserProfileSelect)}&id=eq.{normalizedUserId}&limit=1");
            return rows.FirstOrDefault();
        }

        public async Task EnrichUserInfoWithProfileAsync(UserInfo user)
        {
            if (user == null || string.IsNullOrWhiteSpace(user.Id))
            {
                return;
            }

            var profile = await GetUserProfileRowAsync(user.Id);
            ApplyUserProfileFields(user, profile);
            SanitizeUserForClient(user);
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

        private static string GetRoleDisplayName(string? role)
        {
            return NormalizeRole(role) switch
            {
                AppRoles.Admin => "Admin",
                AppRoles.ScaffoldDesigner => "Scaffold Designer",
                AppRoles.SiteSupervisor => "Site Supervisor",
                AppRoles.ProjectManager => "Project Manager",
                AppRoles.LeadingHand => "Leading Hand",
                AppRoles.GeneralScaffolder => "General Scaffolder",
                AppRoles.TransportManagement => "Transport Management",
                AppRoles.TruckEss01 => "Truck ESS01",
                AppRoles.TruckEss02 => "Truck ESS02",
                AppRoles.TruckEss03 => "Truck ESS03",
                _ => "Viewer"
            };
        }

        private static string NormalizeDeviceId(string? value)
        {
            var trimmed = value?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(trimmed))
            {
                return string.Empty;
            }

            var cleaned = Regex.Replace(trimmed, @"[^A-Za-z0-9]+", string.Empty);
            return cleaned.ToUpperInvariant();
        }

        private static string ToTruckDeviceEmail(string deviceId)
        {
            var normalized = NormalizeDeviceId(deviceId);
            return $"{normalized}@{TruckDeviceEmailDomain}";
        }

        private static bool IsTruckDeviceEmail(string? email)
        {
            return !string.IsNullOrWhiteSpace(email)
                && email.EndsWith($"@{TruckDeviceEmailDomain}", StringComparison.OrdinalIgnoreCase);
        }

        private static string ToPublicIdentifier(string? email)
        {
            if (string.IsNullOrWhiteSpace(email))
            {
                return string.Empty;
            }

            var suffix = $"@{TruckDeviceEmailDomain}";
            return email.EndsWith(suffix, StringComparison.OrdinalIgnoreCase)
                ? NormalizeDeviceId(email[..^suffix.Length])
                : email;
        }

        private static void SanitizeUserForClient(UserInfo user)
        {
            if (user == null || !IsTruckDeviceEmail(user.Email))
            {
                return;
            }

            user.Email = ToPublicIdentifier(user.Email);
            if (string.IsNullOrWhiteSpace(user.FullName))
            {
                user.FullName = user.Email;
            }
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
                SanitizeUserForClient(user);
                return;
            }

            user.EmployeeId = employee.Id;
            user.EmployeeFirstName = employee.FirstName?.Trim();
            user.EmployeeLastName = employee.LastName?.Trim();
            user.EmployeePhoneNumber = employee.PhoneNumber?.Trim();
            user.LeadingHand = employee.LeadingHand;

            var isExplicitRole = AppRoles.All.Contains(user.Role ?? "")
                && !string.Equals(user.Role, AppRoles.Viewer, StringComparison.OrdinalIgnoreCase);

            if (!isExplicitRole)
            {
                user.Role = employee.LeadingHand ? AppRoles.LeadingHand : AppRoles.GeneralScaffolder;
            }

            user.EmployeeTitle = GetRoleDisplayName(user.Role);
            SanitizeUserForClient(user);
        }

        private async Task<List<EmployeeRoleRow>> GetEmployeeRoleRowsAsync()
        {
            return await GetRestRowsAsync<EmployeeRoleRow>(
                $"ess_rostering_employees?select={Uri.EscapeDataString("id,email,firstName:first_name,lastName:last_name,phoneNumber:phone_number,leadingHand:leading_hand,linkedAuthUserId:linked_auth_user_id,verifiedAt:verified_at")}");
        }

        private static (Dictionary<string, EmployeeRoleRow> ByLinkedUserId, Dictionary<string, EmployeeRoleRow> ByEmail) BuildEmployeeRoleLookup(IEnumerable<EmployeeRoleRow> employees)
        {
            var byLinkedUserId = new Dictionary<string, EmployeeRoleRow>(StringComparer.OrdinalIgnoreCase);
            var byEmail = new Dictionary<string, EmployeeRoleRow>(StringComparer.OrdinalIgnoreCase);

            foreach (var employee in employees)
            {
                if (employee.LinkedAuthUserId.HasValue)
                {
                    byLinkedUserId[employee.LinkedAuthUserId.Value.ToString().ToLowerInvariant()] = employee;
                }

                var email = employee.Email?.Trim().ToLowerInvariant();
                if (!string.IsNullOrWhiteSpace(email))
                {
                    byEmail[email] = employee;
                }
            }

            return (byLinkedUserId, byEmail);
        }

        private static EmployeeRoleRow? FindEmployeeForUser(
            UserInfo user,
            (Dictionary<string, EmployeeRoleRow> ByLinkedUserId, Dictionary<string, EmployeeRoleRow> ByEmail) lookup)
        {
            if (TryNormalizeUserId(user.Id, out var normalizedUserId)
                && lookup.ByLinkedUserId.TryGetValue(normalizedUserId, out var linkedEmployee))
            {
                return linkedEmployee;
            }

            var normalizedEmail = user.Email?.Trim().ToLowerInvariant();
            return !string.IsNullOrWhiteSpace(normalizedEmail)
                && lookup.ByEmail.TryGetValue(normalizedEmail, out var emailEmployee)
                ? emailEmployee
                : null;
        }

        private static string ResolveUserListRole(string? userId, IReadOnlyDictionary<string, string> roles, EmployeeRoleRow? employee)
        {
            var normalizedUserId = TryNormalizeUserId(userId, out var parsedUserId) ? parsedUserId : string.Empty;
            if (!string.IsNullOrWhiteSpace(normalizedUserId) && roles.TryGetValue(normalizedUserId, out var storedRole))
            {
                var normalizedRole = NormalizeRole(storedRole);
                if (normalizedRole != AppRoles.Viewer)
                {
                    return normalizedRole;
                }
            }

            var bootstrapRole = NormalizeRole(GetBootstrapRole(normalizedUserId));
            if (bootstrapRole != AppRoles.Viewer)
            {
                return bootstrapRole;
            }

            if (employee != null)
            {
                return employee.LeadingHand ? AppRoles.LeadingHand : AppRoles.GeneralScaffolder;
            }

            return roles.TryGetValue(normalizedUserId, out var fallbackRole)
                ? NormalizeRole(fallbackRole)
                : AppRoles.Viewer;
        }

        private static void EnrichUserInfoWithEmployeeRole(UserInfo user, EmployeeRoleRow? employee)
        {
            if (employee == null)
            {
                SanitizeUserForClient(user);
                return;
            }

            user.EmployeeId = employee.Id;
            user.EmployeeFirstName = employee.FirstName?.Trim();
            user.EmployeeLastName = employee.LastName?.Trim();
            user.EmployeePhoneNumber = employee.PhoneNumber?.Trim();
            user.LeadingHand = employee.LeadingHand;
            user.EmployeeTitle = GetRoleDisplayName(user.Role);
            SanitizeUserForClient(user);
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

        public async Task<UserInfo> CreateTruckDeviceUserAsync(
            string deviceId,
            string fullName,
            string password,
            string role)
        {
            var normalizedDeviceId = NormalizeDeviceId(deviceId);
            if (string.IsNullOrWhiteSpace(normalizedDeviceId))
            {
                throw new ArgumentException("Device ID is required", nameof(deviceId));
            }

            if (string.IsNullOrWhiteSpace(password) || password.Trim().Length < 6)
            {
                throw new ArgumentException("Password must be at least 6 characters", nameof(password));
            }

            var normalizedRole = NormalizeRole(role);
            var deviceEmail = ToTruckDeviceEmail(normalizedDeviceId);
            var serviceRoleKey = _supabaseKey;
            if (string.IsNullOrWhiteSpace(serviceRoleKey) || string.IsNullOrWhiteSpace(_supabaseUrl))
            {
                throw new InvalidOperationException("Supabase service role key is not configured");
            }

            var client = _httpClientFactory.CreateClient();
            using var request = new HttpRequestMessage(HttpMethod.Post, $"{_supabaseUrl.TrimEnd('/')}/auth/v1/admin/users");
            request.Headers.Add("apikey", serviceRoleKey);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", serviceRoleKey);
            request.Content = JsonContent.Create(new
            {
                email = deviceEmail,
                password = password.Trim(),
                email_confirm = true,
                user_metadata = new
                {
                    full_name = string.IsNullOrWhiteSpace(fullName) ? normalizedDeviceId : fullName.Trim()
                }
            });

            using var response = await client.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                if (body.Contains("already", StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException("A truck device account already exists for that device ID.");
                }
                throw new InvalidOperationException($"Failed to create truck device user: {body}");
            }

            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            var userId = GetJsonString(root, "id");
            if (string.IsNullOrWhiteSpace(userId))
            {
                throw new InvalidOperationException("Truck device account was created without a valid user ID.");
            }

            await UpsertUserNameAsync(
                userId,
                deviceEmail,
                string.IsNullOrWhiteSpace(fullName) ? normalizedDeviceId : fullName.Trim());

            return await UpdateUserRoleAsync(userId, normalizedRole);
        }

        private async Task SyncLinkedEmployeeRoleAsync(string normalizedUserId, string normalizedRole)
        {
            var linkedEmployee = await GetLinkedEmployeeRoleInfoAsync(normalizedUserId, null);
            if (linkedEmployee == null)
            {
                return;
            }

            var shouldBeLeadingHand = normalizedRole == AppRoles.LeadingHand;
            var isFieldRole = normalizedRole == AppRoles.LeadingHand || normalizedRole == AppRoles.GeneralScaffolder;

            if (linkedEmployee.LeadingHand == shouldBeLeadingHand && isFieldRole)
            {
                return;
            }

            try
            {
                if (isFieldRole)
                {
                    await PatchRestRowsAsync<object>(
                        $"ess_rostering_employees?id=eq.{linkedEmployee.Id:D}",
                        new
                        {
                            leading_hand = shouldBeLeadingHand,
                            updated_at = DateTime.UtcNow
                        });
                }
                else
                {
                    await PatchRestRowsAsync<object>(
                        $"ess_rostering_employees?id=eq.{linkedEmployee.Id:D}",
                        new
                        {
                            leading_hand = false,
                            preferred_site_1 = (string?)null,
                            preferred_site_2 = (string?)null,
                            preferred_site_3 = (string?)null,
                            updated_at = DateTime.UtcNow
                        });
                }
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
            var subfolderList = subfolders.ToList();
            var documentList = documents.ToList();
            var response = BuildFolderSummary(folder, userNames);
            response.SubFolderCount = subfolderList.Count;
            response.DocumentCount = documentList.Count;
            response.SubFolders = subfolderList
                .Select(subfolder => BuildFolderSummary(subfolder, userNames))
                .ToList();
            response.Documents = documentList
                .Select(document => BuildDocumentResponse(document, userNames))
                .ToList();
            return response;
        }

        private async Task PopulateFolderItemCountsAsync(IReadOnlyCollection<FolderResponse> folders)
        {
            if (folders.Count == 0)
            {
                return;
            }

            var folderIds = folders
                .Select(folder => folder.Id)
                .Distinct()
                .ToList();

            var inFilter = Uri.EscapeDataString($"in.({string.Join(",", folderIds.Select(folderId => folderId.ToString("D")))})");
            var subfoldersTask = GetRestRowsAsync<FolderCountRow>(
                $"folders?select=parent_folder_id&parent_folder_id={inFilter}");
            var documentsTask = GetRestRowsAsync<DocumentFolderRow>(
                $"design_documents?select=folder_id&folder_id={inFilter}");

            await Task.WhenAll(subfoldersTask, documentsTask);

            var subfolderCounts = (await subfoldersTask)
                .Where(folder => folder.ParentFolderId.HasValue)
                .GroupBy(folder => folder.ParentFolderId!.Value)
                .ToDictionary(group => group.Key, group => group.Count());

            var documentCounts = (await documentsTask)
                .GroupBy(document => document.FolderId)
                .ToDictionary(group => group.Key, group => group.Count());

            foreach (var folder in folders)
            {
                folder.SubFolderCount = subfolderCounts.TryGetValue(folder.Id, out var subfolderCount)
                    ? subfolderCount
                    : 0;
                folder.DocumentCount = documentCounts.TryGetValue(folder.Id, out var documentCount)
                    ? documentCount
                    : 0;
            }
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
                DrawingStatus = InferDrawingStatusFromFileName(document.EssDesignIssueName ?? document.ThirdPartyDesignName)
                    ?? document.DrawingStatus,
                Description = document.Description,
                EssDesignIssuePath = document.EssDesignIssuePath,
                EssDesignIssueName = document.EssDesignIssueName,
                ThirdPartyDesignPath = document.ThirdPartyDesignPath,
                ThirdPartyDesignName = document.ThirdPartyDesignName,
                EssDesignFileSize = document.EssDesignFileSize,
                ThirdPartyDesignFileSize = document.ThirdPartyDesignFileSize,
                EssDesignFileFingerprint = document.EssDesignFileFingerprint,
                ThirdPartyDesignFileFingerprint = document.ThirdPartyDesignFileFingerprint,
                TotalFileSize = totalSize > 0 ? totalSize : null,
                UserId = document.UserId,
                OwnerName = ownerName,
                CreatedAt = document.CreatedAt,
                UpdatedAt = document.UpdatedAt
            };
        }

        private static string NormalizeDrawingStatus(string? drawingStatus)
        {
            var trimmed = drawingStatus?.Trim();
            return trimmed switch
            {
                "Construction" => "Construction",
                "Preliminary" => "Preliminary",
                "Concept" => "Concept",
                "As-Built" => "As-Built",
                _ => "Construction"
            };
        }

        private static string? InferDrawingStatusFromFileName(string? fileName)
        {
            if (string.IsNullOrWhiteSpace(fileName))
            {
                return null;
            }

            var upperName = fileName.ToUpperInvariant();
            if (upperName.Contains("(ASB)")) return "As-Built";
            if (upperName.Contains("(PRE)")) return "Preliminary";
            if (upperName.Contains("(CON)")) return "Construction";
            if (upperName.Contains("(CPT)") || upperName.Contains("(CONCEPT)")) return "Concept";
            return null;
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

        public async Task<FolderShareTree> GetFolderShareTreeAsync(Guid folderId)
        {
            var folder = await GetFolderByIdAsync(folderId);
            var tree = new FolderShareTree
            {
                Id = folder.Id,
                Name = folder.Name,
                ParentFolderId = folder.ParentFolderId,
                UserId = folder.UserId,
                OwnerName = folder.OwnerName,
                CreatedAt = folder.CreatedAt,
                UpdatedAt = folder.UpdatedAt,
                FileSize = folder.FileSize,
                SubFolderCount = folder.SubFolderCount,
                DocumentCount = folder.DocumentCount,
                Documents = folder.Documents
                    .Select(document => new FolderShareDocument
                    {
                        Id = document.Id,
                        FolderId = document.FolderId,
                        DisplayName = document.EssDesignIssueName
                            ?? document.ThirdPartyDesignName
                            ?? $"Revision {document.RevisionNumber}",
                        RevisionNumber = document.RevisionNumber,
                        Description = document.Description,
                        HasEssDesign = !string.IsNullOrWhiteSpace(document.EssDesignIssuePath),
                        HasThirdPartyDesign = !string.IsNullOrWhiteSpace(document.ThirdPartyDesignPath),
                        EssDesignIssueName = document.EssDesignIssueName,
                        ThirdPartyDesignName = document.ThirdPartyDesignName,
                        DrawingStatus = document.DrawingStatus,
                        EssDesignFileSize = document.EssDesignFileSize,
                        ThirdPartyDesignFileSize = document.ThirdPartyDesignFileSize,
                        EssDesignFileFingerprint = document.EssDesignFileFingerprint,
                        ThirdPartyDesignFileFingerprint = document.ThirdPartyDesignFileFingerprint,
                        TotalFileSize = document.TotalFileSize,
                        UserId = document.UserId,
                        OwnerName = document.OwnerName,
                        CreatedAt = document.CreatedAt,
                        UpdatedAt = document.UpdatedAt
                    })
                    .ToList()
            };

            foreach (var subfolder in folder.SubFolders)
            {
                tree.SubFolders.Add(await GetFolderShareTreeAsync(subfolder.Id));
            }

            return tree;
        }

        public async Task<Guid> CreateFolderAsync(string name, Guid? parentFolderId, string? userId = null)
        {
            try
            {
                var now = DateTime.UtcNow;
                var folder = new Folder
                {
                    Id = Guid.NewGuid(),
                    Name = name,
                    ParentFolderId = parentFolderId,
                    UserId = userId,
                    CreatedAt = now,
                    UpdatedAt = now
                };

                var response = await _supabase.From<Folder>().Insert(folder);
                var created = response.Models.FirstOrDefault();
                if (created == null) throw new Exception("Failed to create folder");

                if (parentFolderId.HasValue)
                {
                    await TouchFolderModifiedAsync(parentFolderId.Value, now);
                }
                else
                {
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
                var now = DateTime.UtcNow;
                folder.UpdatedAt = now;

                await _supabase.From<Folder>().Update(folder);

                _folderCache.TryRemove(folderId, out _);
                if (folder.ParentFolderId.HasValue)
                {
                    await TouchFolderModifiedAsync(folder.ParentFolderId.Value, now);
                }
                else
                {
                    _rootFoldersCache = null;
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

                _folderCache.TryRemove(folderId, out _);
                if (folder?.ParentFolderId != null)
                {
                    await TouchFolderModifiedAsync(folder.ParentFolderId.Value);
                }
                else
                {
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

        public async Task<Guid> UploadDocumentAsync(Guid folderId, string revisionNumber, IFormFile? essDesign, IFormFile? thirdParty, string? description = null, string? userId = null, string? drawingStatus = null)
        {
            PreparedDocumentUpload? preparedEss = null;
            PreparedDocumentUpload? preparedThirdParty = null;
            var essQueued = false;
            var thirdPartyQueued = false;
            var uploadedPaths = new List<string>();
            var documentCreated = false;
            try
            {
                var essPreparationTask = essDesign == null
                    ? Task.FromResult<PreparedDocumentUpload?>(null)
                    : PrepareOptionalDocumentUploadAsync(essDesign);
                var thirdPartyPreparationTask = thirdParty == null
                    ? Task.FromResult<PreparedDocumentUpload?>(null)
                    : PrepareOptionalDocumentUploadAsync(thirdParty);
                await Task.WhenAll(essPreparationTask, thirdPartyPreparationTask);
                preparedEss = await essPreparationTask;
                preparedThirdParty = await thirdPartyPreparationTask;

                var now = DateTime.UtcNow;
                var document = new DesignDocument
                {
                    Id = Guid.NewGuid(),
                    FolderId = folderId,
                    RevisionNumber = revisionNumber,
                    DrawingStatus = NormalizeDrawingStatus(drawingStatus),
                    Description = description,
                    UserId = userId,
                    CreatedAt = now,
                    UpdatedAt = now
                };

                var uploadTasks = new List<Task>();
                if (preparedEss != null)
                {
                    var path = BuildVersionedDocumentPath(folderId, document.Id, "ess", preparedEss);
                    uploadedPaths.Add(path);
                    uploadTasks.Add(UploadAndAssignEssFileAsync(preparedEss, path, document));
                }
                if (preparedThirdParty != null)
                {
                    var path = BuildVersionedDocumentPath(folderId, document.Id, "third_party", preparedThirdParty);
                    uploadedPaths.Add(path);
                    uploadTasks.Add(UploadAndAssignThirdPartyFileAsync(preparedThirdParty, path, document));
                }

                await Task.WhenAll(uploadTasks);

                var response = await _supabase.From<DesignDocument>().Insert(document);
                var created = response.Models.FirstOrDefault();
                if (created == null) throw new Exception("Failed to create document");
                documentCreated = true;

                await TouchFolderModifiedAsync(folderId, now);
                if (preparedEss != null && !string.IsNullOrWhiteSpace(created.EssDesignIssuePath))
                    essQueued = QueueAssistantUpload(created, preparedEss, created.EssDesignIssuePath, "ess_design");
                if (preparedThirdParty != null && !string.IsNullOrWhiteSpace(created.ThirdPartyDesignPath))
                    thirdPartyQueued = QueueAssistantUpload(created, preparedThirdParty, created.ThirdPartyDesignPath, "third_party_design");

                _logger.LogInformation("Uploaded document Rev {RevisionNumber}", revisionNumber);
                return created.Id;
            }
            catch (Exception ex)
            {
                if (!documentCreated)
                {
                    foreach (var path in uploadedPaths)
                        await DeleteFileAsync(path);
                }
                _logger.LogError(ex, "Error uploading document");
                throw;
            }
            finally
            {
                if (!essQueued) DeletePreparedUpload(preparedEss);
                if (!thirdPartyQueued) DeletePreparedUpload(preparedThirdParty);
            }
        }

        private async Task UploadAndAssignEssFileAsync(PreparedDocumentUpload essDesign, string path, DesignDocument document)
        {
            await UploadFileAsync(essDesign, path);
            document.EssDesignIssuePath = path;
            document.EssDesignIssueName = essDesign.FileName;
            document.EssDesignFileSize = essDesign.Length;
            document.EssDesignFileFingerprint = essDesign.Fingerprint;
        }

        private async Task UploadAndAssignThirdPartyFileAsync(PreparedDocumentUpload thirdParty, string path, DesignDocument document)
        {
            await UploadFileAsync(thirdParty, path);
            document.ThirdPartyDesignPath = path;
            document.ThirdPartyDesignName = thirdParty.FileName;
            document.ThirdPartyDesignFileSize = thirdParty.Length;
            document.ThirdPartyDesignFileFingerprint = thirdParty.Fingerprint;
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

                    await TouchFolderModifiedAsync(document.FolderId);
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
                var now = DateTime.UtcNow;
                document.FolderId = targetFolderId;
                document.UpdatedAt = now;

                await _supabase
                    .From<DesignDocument>()
                    .Update(document);

                await TouchFolderModifiedAsync(oldFolderId, now);
                if (targetFolderId != oldFolderId)
                {
                    await TouchFolderModifiedAsync(targetFolderId, now);
                }

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
                var now = DateTime.UtcNow;
                document.UpdatedAt = now;

                await _supabase
                    .From<DesignDocument>()
                    .Update(document);

                await TouchFolderModifiedAsync(document.FolderId, now);

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
            string? userId = null,
            string? drawingStatus = null)
        {
            PreparedDocumentUpload? preparedEss = null;
            PreparedDocumentUpload? preparedThirdParty = null;
            var essQueued = false;
            var thirdPartyQueued = false;
            var newlyUploadedPaths = new List<string>();
            var documentUpdated = false;
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

                var essPreparationTask = essDesign == null
                    ? Task.FromResult<PreparedDocumentUpload?>(null)
                    : PrepareOptionalDocumentUploadAsync(essDesign);
                var thirdPartyPreparationTask = thirdParty == null
                    ? Task.FromResult<PreparedDocumentUpload?>(null)
                    : PrepareOptionalDocumentUploadAsync(thirdParty);
                await Task.WhenAll(essPreparationTask, thirdPartyPreparationTask);
                preparedEss = await essPreparationTask;
                preparedThirdParty = await thirdPartyPreparationTask;

                var oldEssPath = document.EssDesignIssuePath;
                var oldThirdPartyPath = document.ThirdPartyDesignPath;
                var replaceTasks = new List<Task>();
                if (preparedEss != null)
                {
                    var essPath = BuildVersionedDocumentPath(document.FolderId, document.Id, "ess", preparedEss);
                    newlyUploadedPaths.Add(essPath);
                    replaceTasks.Add(UploadAndAssignEssFileAsync(preparedEss, essPath, document));
                }
                if (preparedThirdParty != null)
                {
                    var thirdPartyPath = BuildVersionedDocumentPath(document.FolderId, document.Id, "third_party", preparedThirdParty);
                    newlyUploadedPaths.Add(thirdPartyPath);
                    replaceTasks.Add(UploadAndAssignThirdPartyFileAsync(preparedThirdParty, thirdPartyPath, document));
                }

                await Task.WhenAll(replaceTasks);

                document.Description = description;
                document.DrawingStatus = NormalizeDrawingStatus(drawingStatus ?? document.DrawingStatus);
                document.UserId = userId ?? document.UserId;
                var now = DateTime.UtcNow;
                document.UpdatedAt = now;

                await _supabase
                    .From<DesignDocument>()
                    .Update(document);
                documentUpdated = true;

                await TouchFolderModifiedAsync(document.FolderId, now);
                var stalePathDeletes = new List<Task>();
                if (preparedEss != null && !string.IsNullOrWhiteSpace(oldEssPath) &&
                    !string.Equals(oldEssPath, document.EssDesignIssuePath, StringComparison.Ordinal))
                    stalePathDeletes.Add(DeleteFileAsync(oldEssPath));
                if (preparedThirdParty != null && !string.IsNullOrWhiteSpace(oldThirdPartyPath) &&
                    !string.Equals(oldThirdPartyPath, document.ThirdPartyDesignPath, StringComparison.Ordinal))
                    stalePathDeletes.Add(DeleteFileAsync(oldThirdPartyPath));
                await Task.WhenAll(stalePathDeletes);

                if (preparedEss != null && !string.IsNullOrWhiteSpace(document.EssDesignIssuePath))
                    essQueued = QueueAssistantUpload(document, preparedEss, document.EssDesignIssuePath, "ess_design");
                if (preparedThirdParty != null && !string.IsNullOrWhiteSpace(document.ThirdPartyDesignPath))
                    thirdPartyQueued = QueueAssistantUpload(document, preparedThirdParty, document.ThirdPartyDesignPath, "third_party_design");

                _logger.LogInformation("Replaced files for document {DocumentId}", documentId);
                return document;
            }
            catch (Exception ex)
            {
                if (!documentUpdated)
                {
                    foreach (var path in newlyUploadedPaths)
                        await DeleteFileAsync(path);
                }
                _logger.LogError(ex, "Error replacing files for document {DocumentId}", documentId);
                throw;
            }
            finally
            {
                if (!essQueued) DeletePreparedUpload(preparedEss);
                if (!thirdPartyQueued) DeletePreparedUpload(preparedThirdParty);
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

        private static async Task<PreparedDocumentUpload> PrepareDocumentUploadAsync(IFormFile file)
        {
            var tempFilePath = Path.Combine(
                Path.GetTempPath(),
                $"{EssAssistantUploadQueue.TempFilePrefix}{Guid.NewGuid():N}.tmp");
            try
            {
                await using (var destination = new FileStream(
                    tempFilePath,
                    FileMode.CreateNew,
                    FileAccess.Write,
                    FileShare.Read,
                    81920,
                    FileOptions.Asynchronous | FileOptions.SequentialScan))
                {
                    await file.CopyToAsync(destination);
                }

                await using var source = new FileStream(
                    tempFilePath,
                    FileMode.Open,
                    FileAccess.Read,
                    FileShare.Read,
                    81920,
                    FileOptions.Asynchronous | FileOptions.SequentialScan);
                var hash = await SHA256.HashDataAsync(source);
                return new PreparedDocumentUpload
                {
                    TempFilePath = tempFilePath,
                    FileName = Path.GetFileName(file.FileName),
                    ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/pdf" : file.ContentType,
                    Length = source.Length,
                    Fingerprint = $"sha256:{Convert.ToHexString(hash).ToLowerInvariant()}",
                };
            }
            catch
            {
                TryDeleteTempFile(tempFilePath);
                throw;
            }
        }

        private static async Task<PreparedDocumentUpload?> PrepareOptionalDocumentUploadAsync(IFormFile file) =>
            await PrepareDocumentUploadAsync(file);

        private static string BuildVersionedDocumentPath(
            Guid folderId,
            Guid documentId,
            string prefix,
            PreparedDocumentUpload upload)
        {
            var safeName = Regex.Replace(upload.FileName, "[^a-zA-Z0-9._-]+", "_").Trim('_');
            if (string.IsNullOrWhiteSpace(safeName))
                safeName = "document.pdf";
            if (safeName.Length > 160)
            {
                var extension = Path.GetExtension(safeName);
                var stem = Path.GetFileNameWithoutExtension(safeName);
                safeName = $"{stem[..Math.Min(stem.Length, 140)]}{extension}";
            }
            var hash = upload.Fingerprint.StartsWith("sha256:", StringComparison.Ordinal)
                ? upload.Fingerprint[7..23]
                : Guid.NewGuid().ToString("N")[..16];
            return $"documents/{folderId:D}/{documentId:D}/{prefix}_{hash}_{safeName}";
        }

        private bool QueueAssistantUpload(
            DesignDocument document,
            PreparedDocumentUpload upload,
            string storagePath,
            string domain) =>
            _assistantUploadQueue.TryQueue(new EssAssistantPendingUpload
            {
                StoragePath = storagePath,
                DisplayName = upload.FileName,
                ContentType = upload.ContentType,
                Domain = domain,
                RecordId = document.Id.ToString("D"),
                SourceUpdatedAt = document.UpdatedAt.ToUniversalTime().ToString("O"),
                Fingerprint = upload.Fingerprint,
                Size = upload.Length,
                TempFilePath = upload.TempFilePath,
            });

        private static void DeletePreparedUpload(PreparedDocumentUpload? upload)
        {
            if (upload != null)
                TryDeleteTempFile(upload.TempFilePath);
        }

        private static void TryDeleteTempFile(string path)
        {
            try
            {
                if (File.Exists(path))
                    File.Delete(path);
            }
            catch
            {
                // Stale upload files are cleaned by EssAssistantUploadWorker on startup.
            }
        }

        private async Task<string> UploadFileAsync(PreparedDocumentUpload file, string path)
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
            request.Headers.CacheControl = new CacheControlHeaderValue
            {
                MaxAge = TimeSpan.FromDays(365),
            };
            request.Headers.CacheControl.Extensions.Add(new NameValueHeaderValue("immutable"));

            var stream = new FileStream(
                file.TempFilePath,
                FileMode.Open,
                FileAccess.Read,
                FileShare.Read,
                81920,
                FileOptions.Asynchronous | FileOptions.SequentialScan);
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

        public async Task<string> UploadProfileImageAsync(string userId, IFormFile file)
        {
            if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_supabaseKey))
            {
                throw new InvalidOperationException("Supabase URL or key not configured.");
            }

            if (string.IsNullOrWhiteSpace(userId))
            {
                throw new ArgumentException("User ID is required.", nameof(userId));
            }

            if (file == null || file.Length == 0)
            {
                throw new ArgumentException("Profile image file is required.", nameof(file));
            }

            var extension = Path.GetExtension(file.FileName)?.TrimStart('.').ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(extension) || !Regex.IsMatch(extension, "^[a-z0-9]+$"))
            {
                extension = "jpg";
            }

            var safeUserId = Regex.Replace(userId.Trim(), "[^a-zA-Z0-9_-]", "");
            if (string.IsNullOrWhiteSpace(safeUserId))
            {
                throw new ArgumentException("User ID is invalid.", nameof(userId));
            }

            var objectPath = $"{safeUserId}/avatar.{extension}";
            var escapedPath = string.Join(
                "/",
                objectPath.Split('/', StringSplitOptions.RemoveEmptyEntries).Select(Uri.EscapeDataString));
            var url = $"{_supabaseUrl.TrimEnd('/')}/storage/v1/object/{Uri.EscapeDataString(_profileImagesBucketName)}/{escapedPath}?upsert=true";

            var client = _httpClientFactory.CreateClient();
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
                    $"Failed to upload profile image. Status: {(int)response.StatusCode}. Body: {errorBody}");
            }

            var publicUrl = $"{_supabaseUrl.TrimEnd('/')}/storage/v1/object/public/{_profileImagesBucketName}/{objectPath}";
            try
            {
                await PersistProfileImageMetadataAsync(safeUserId, publicUrl, objectPath);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Profile image uploaded but canonical metadata could not be persisted for {UserId}", safeUserId);
            }
            return publicUrl;
        }

        private async Task PersistProfileImageMetadataAsync(string userId, string publicUrl, string objectPath)
        {
            var client = _httpClientFactory.CreateClient();
            var endpoint = $"{_supabaseUrl.TrimEnd('/')}/auth/v1/admin/users/{Uri.EscapeDataString(userId)}";
            using var getRequest = new HttpRequestMessage(HttpMethod.Get, endpoint);
            getRequest.Headers.Add("apikey", _supabaseKey);
            getRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _supabaseKey);
            using var getResponse = await client.SendAsync(getRequest);
            getResponse.EnsureSuccessStatusCode();

            var metadata = new Dictionary<string, object?>();
            using (var document = JsonDocument.Parse(await getResponse.Content.ReadAsStringAsync()))
            {
                if (document.RootElement.TryGetProperty("user_metadata", out var currentMetadata)
                    && currentMetadata.ValueKind == JsonValueKind.Object)
                {
                    foreach (var property in currentMetadata.EnumerateObject())
                    {
                        metadata[property.Name] = property.Value.Clone();
                    }
                }
            }

            metadata["avatar_url"] = publicUrl;
            metadata["profile_image_url"] = publicUrl;
            metadata["avatar_path"] = objectPath;
            metadata["avatar_updated_at"] = DateTime.UtcNow.ToString("O");

            using var updateRequest = new HttpRequestMessage(HttpMethod.Put, endpoint);
            updateRequest.Headers.Add("apikey", _supabaseKey);
            updateRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _supabaseKey);
            updateRequest.Content = JsonContent.Create(new { user_metadata = metadata });
            using var updateResponse = await client.SendAsync(updateRequest);
            updateResponse.EnsureSuccessStatusCode();
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
            if (_signedUrlCache.TryGetValue(path, out var cached) &&
                cached.ExpiresAt > DateTimeOffset.UtcNow.AddMinutes(2))
                return cached.Url;

            await _signedUrlLock.WaitAsync();
            try
            {
                if (_signedUrlCache.TryGetValue(path, out cached) &&
                    cached.ExpiresAt > DateTimeOffset.UtcNow.AddMinutes(2))
                    return cached.Url;

                const int lifetimeSeconds = 3600;
                var url = await _supabase.Storage.From(_bucketName).CreateSignedUrl(path, lifetimeSeconds);
                _signedUrlCache[path] = (url, DateTimeOffset.UtcNow.AddMinutes(55));
                return url;
            }
            finally
            {
                _signedUrlLock.Release();
            }
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

        private async Task TouchFolderModifiedAsync(Guid? folderId, DateTime? modifiedAt = null)
        {
            var currentId = folderId;
            var timestamp = modifiedAt ?? DateTime.UtcNow;

            while (currentId.HasValue)
            {
                var folder = await _supabase
                    .From<Folder>()
                    .Filter("id", Postgrest.Constants.Operator.Equals, currentId.Value.ToString())
                    .Single();

                if (folder == null)
                {
                    _folderCache.TryRemove(currentId.Value, out _);
                    return;
                }

                folder.UpdatedAt = timestamp;
                await _supabase.From<Folder>().Update(folder);

                _folderCache.TryRemove(folder.Id, out _);
                if (!folder.ParentFolderId.HasValue)
                {
                    _rootFoldersCache = null;
                }

                currentId = folder.ParentFolderId;
            }
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

        public async Task<Guid?> FindDrawingFolderAsync(string drawingNumber)
        {
            var baseNumber = drawingNumber.Trim().ToUpperInvariant();
            // PostgREST accepts * as the ILIKE wildcard. Searching anywhere in the
            // filename also handles uploader-added prefixes before the drawing number.
            var pattern = $"*{baseNumber}*";
            var documents = await GetRestRowsAsync<DrawingDocumentLookupRow>(
                $"design_documents?select=folder_id,ess_design_issue_name,ess_design_issue_path,third_party_design_name,third_party_design_path,updated_at&or=(ess_design_issue_name.ilike.{pattern},ess_design_issue_path.ilike.{pattern},third_party_design_name.ilike.{pattern},third_party_design_path.ilike.{pattern})&limit=100");

            var documentFolderId = documents
                .Where(document => DocumentMatchesDrawingNumber(document.EssDesignIssueName, baseNumber)
                    || DocumentMatchesDrawingNumber(document.EssDesignIssuePath, baseNumber)
                    || DocumentMatchesDrawingNumber(document.ThirdPartyDesignName, baseNumber)
                    || DocumentMatchesDrawingNumber(document.ThirdPartyDesignPath, baseNumber))
                .OrderByDescending(document => document.UpdatedAt)
                .Select(document => (Guid?)document.FolderId)
                .FirstOrDefault();

            if (documentFolderId.HasValue)
            {
                return documentFolderId;
            }

            var folderMatch = (await SearchAsync(baseNumber))
                .FirstOrDefault(folder => folder.Name.Contains(baseNumber, StringComparison.OrdinalIgnoreCase));
            return folderMatch?.Id;
        }

        public async Task<Dictionary<string, DrawingFolderResolution>> FindDrawingFoldersAsync(IEnumerable<string> drawingNumbers)
        {
            var requested = drawingNumbers
                .Select(number => number.Trim().ToUpperInvariant())
                .Where(number => Regex.IsMatch(number, @"^[A-Z0-9]+-[A-Z0-9]+-ESD\d+$"))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            if (requested.Count == 0)
            {
                return new Dictionary<string, DrawingFolderResolution>(StringComparer.OrdinalIgnoreCase);
            }

            var documents = await GetRestRowsAsync<DrawingDocumentLookupRow>(
                "design_documents?select=id,folder_id,revision_number,drawing_status,ess_design_issue_name,ess_design_issue_path,third_party_design_name,third_party_design_path,updated_at&limit=10000");
            var matches = new Dictionary<string, (DrawingFolderResolution Resolution, int RevisionSort, DateTime UpdatedAt)>(StringComparer.OrdinalIgnoreCase);

            foreach (var document in documents)
            {
                var sources = new[]
                {
                    new { Value = document.EssDesignIssueName, FileType = "ess", FileName = document.EssDesignIssueName },
                    new { Value = document.EssDesignIssuePath, FileType = "ess", FileName = document.EssDesignIssueName },
                    new { Value = document.ThirdPartyDesignName, FileType = "thirdparty", FileName = document.ThirdPartyDesignName },
                    new { Value = document.ThirdPartyDesignPath, FileType = "thirdparty", FileName = document.ThirdPartyDesignName }
                };

                foreach (var source in sources.Where(source => !string.IsNullOrWhiteSpace(source.Value)))
                {
                    var decoded = Uri.UnescapeDataString(source.Value!);
                    foreach (Match match in Regex.Matches(decoded, @"[A-Z0-9]+-[A-Z0-9]+-ESD\d+", RegexOptions.IgnoreCase))
                    {
                        var drawingNumber = match.Value.ToUpperInvariant();
                        if (!requested.Contains(drawingNumber))
                        {
                            continue;
                        }

                        var revisionNo = ExtractDrawingRevision(decoded, document.RevisionNumber);
                        var revisionSort = int.TryParse(revisionNo, out var parsedRevision) ? parsedRevision : 0;
                        var designUse = ExtractDrawingUse(decoded, document.DrawingStatus);
                        if (!matches.TryGetValue(drawingNumber, out var existing)
                            || revisionSort > existing.RevisionSort
                            || revisionSort == existing.RevisionSort && document.UpdatedAt > existing.UpdatedAt)
                        {
                            matches[drawingNumber] = (
                                new DrawingFolderResolution
                                {
                                    FolderId = document.FolderId,
                                    DocumentId = document.Id,
                                    FileType = source.FileType,
                                    FileName = source.FileName ?? Path.GetFileName(decoded),
                                    RevisionNo = revisionNo,
                                    DesignUse = designUse
                                },
                                revisionSort,
                                document.UpdatedAt);
                        }
                    }
                }
            }

            return matches.ToDictionary(match => match.Key, match => match.Value.Resolution, StringComparer.OrdinalIgnoreCase);
        }

        private static string ExtractDrawingRevision(string fileName, string? fallbackRevision)
        {
            var match = Regex.Match(fileName, @"\(REV(?:ISION)?\s*0*(\d+)\)", RegexOptions.IgnoreCase);
            if (match.Success)
            {
                return match.Groups[1].Value;
            }

            var fallbackMatch = Regex.Match(fallbackRevision ?? string.Empty, @"\d+");
            return fallbackMatch.Success ? fallbackMatch.Value.TrimStart('0').PadLeft(1, '0') : string.Empty;
        }

        private static string ExtractDrawingUse(string fileName, string? fallbackStatus)
        {
            var match = Regex.Match(fileName, @"\((CONSTRUCTION|CON|PRELIMINARY|PRE|AS-BUILT|ASB|CONCEPT|CONC)\)", RegexOptions.IgnoreCase);
            var value = match.Success ? match.Groups[1].Value : fallbackStatus ?? string.Empty;
            return NormalizeRegisterDesignUse(value);
        }

        private static string NormalizeRegisterDesignUse(string value)
        {
            var normalized = value.Trim().ToUpperInvariant();
            if (normalized is "CON" or "CONSTRUCTION" or "CONSTRICTION") return "CONSTRUCTION";
            if (normalized is "PRE" or "PRELIMINARY") return "PRELIMINARY";
            if (normalized is "ASB" or "AS-BUILT" or "AS-BULT") return "AS-BUILT";
            if (normalized is "CONC" or "CONCEPT" or "CONCEPT ONLY" or "CONCEPTUAL") return "CONCEPT";
            return normalized;
        }

        private static bool DocumentMatchesDrawingNumber(string? fileName, string drawingNumber)
        {
            if (string.IsNullOrWhiteSpace(fileName))
            {
                return false;
            }

            var name = Uri.UnescapeDataString(fileName).Trim();
            var index = name.IndexOf(drawingNumber, StringComparison.OrdinalIgnoreCase);
            if (index < 0)
            {
                return false;
            }

            var hasValidStartBoundary = index == 0 || !char.IsLetterOrDigit(name[index - 1]);
            var suffixIndex = index + drawingNumber.Length;
            var hasValidEndBoundary = suffixIndex == name.Length || !char.IsLetterOrDigit(name[suffixIndex]);
            return hasValidStartBoundary && hasValidEndBoundary;
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
            int? sidebarWidth,
            bool? emailNotifications = null,
            bool? smsNotifications = null,
            bool? systemAnnouncements = null,
            bool? marketingUpdates = null)
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
                    EmailNotifications = emailNotifications ?? existing?.EmailNotifications ?? true,
                    SmsNotifications = smsNotifications ?? existing?.SmsNotifications ?? true,
                    SystemAnnouncements = systemAnnouncements ?? existing?.SystemAnnouncements ?? true,
                    MarketingUpdates = marketingUpdates ?? existing?.MarketingUpdates ?? false,
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
            var roleTask = EnsureUserRoleAsync(id);
            var profileTask = string.IsNullOrWhiteSpace(id)
                ? Task.FromResult<UserInfo?>(null)
                : GetUserProfileRowAsync(id);
            await Task.WhenAll(roleTask, profileTask);
            var role = await roleTask;

            var userInfo = new UserInfo
            {
                Id = id ?? string.Empty,
                Email = ToPublicIdentifier(email),
                FullName = fullName ?? string.Empty,
                AvatarUrl = avatarUrl,
                Role = role
            };

            if (!string.IsNullOrWhiteSpace(id))
            {
                var profile = await profileTask;
                ApplyUserProfileFields(userInfo, profile);
            }

            SanitizeUserForClient(userInfo);
            return userInfo;
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
                var usersTask = GetRestRowsAsync<UserInfo>(
                    $"user_names?select={Uri.EscapeDataString("id,email,fullName:full_name,phoneNumber:phone_number")}&order=full_name.asc");
                var rolesTask = GetAllUserRolesAsync();
                var employeeRowsTask = GetEmployeeRoleRowsAsync();

                await Task.WhenAll(usersTask, rolesTask, employeeRowsTask);

                var users = usersTask.Result;
                var roles = rolesTask.Result;
                var employeeLookup = BuildEmployeeRoleLookup(employeeRowsTask.Result);

                foreach (var user in users)
                {
                    var employee = FindEmployeeForUser(user, employeeLookup);
                    user.Role = ResolveUserListRole(user.Id, roles, employee);
                    EnrichUserInfoWithEmployeeRole(user, employee);
                    SanitizeUserForClient(user);
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
                var usersTask = GetRestRowsAsync<UserInfo>(
                    $"user_names?select={Uri.EscapeDataString("id,email,fullName:full_name,phoneNumber:phone_number")}&id=in.{BuildInFilter(validUserIds)}&order=full_name.asc");
                var rolesTask = GetUserRolesByIdsAsync(validUserIds);
                var employeeRowsTask = GetEmployeeRoleRowsAsync();

                await Task.WhenAll(usersTask, rolesTask, employeeRowsTask);

                var users = usersTask.Result;
                var roles = rolesTask.Result;
                var employeeLookup = BuildEmployeeRoleLookup(employeeRowsTask.Result);

                foreach (var user in users)
                {
                    var employee = FindEmployeeForUser(user, employeeLookup);
                    user.Role = ResolveUserListRole(user.Id, roles, employee);
                    EnrichUserInfoWithEmployeeRole(user, employee);
                    SanitizeUserForClient(user);
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

        public async Task<UserInfo> UpdateAppUserAsync(string userId, string? fullName, string? role, string? phoneNumber = null)
        {
            if (!TryNormalizeUserId(userId, out var normalizedUserId))
            {
                throw new ArgumentException("Invalid user ID", nameof(userId));
            }

            var namePatches = new Dictionary<string, object?>();
            if (fullName != null)
                namePatches["full_name"] = string.IsNullOrWhiteSpace(fullName) ? null : fullName.Trim();
            if (phoneNumber != null)
                namePatches["phone_number"] = string.IsNullOrWhiteSpace(phoneNumber) ? null : phoneNumber.Trim();

            if (namePatches.Count > 0)
            {
                await PatchRestRowsAsync<object>(
                    $"user_names?id=eq.{normalizedUserId}",
                    namePatches);
            }

            if (!string.IsNullOrWhiteSpace(role))
            {
                var normalizedRole = NormalizeRole(role);
                await UpdateUserRoleAsync(normalizedUserId, normalizedRole);
            }

            var users = await GetUsersByIdsAsync(new[] { normalizedUserId });
            return users.FirstOrDefault() ?? throw new InvalidOperationException("User not found");
        }

        public async Task<UserInfo> UpdateMyProfileAsync(string userId, UpdateMyProfileRequest request)
        {
            if (!TryNormalizeUserId(userId, out var normalizedUserId))
            {
                throw new ArgumentException("Invalid user ID", nameof(userId));
            }

            var normalizedEmail = CleanEmail(request.Email);
            var normalizedFullName = CleanOptional(request.FullName);
            if (string.IsNullOrWhiteSpace(normalizedFullName))
            {
                normalizedFullName = normalizedEmail?.Split('@')[0] ?? "User";
            }

            await UpdateAuthUserProfileAsync(normalizedUserId, normalizedEmail, normalizedFullName);

            var payload = new Dictionary<string, object?>
            {
                ["id"] = Guid.Parse(normalizedUserId),
                ["email"] = normalizedEmail,
                ["full_name"] = normalizedFullName,
                ["phone_number"] = CleanOptional(request.PhoneNumber),
                ["preferred_name"] = CleanOptional(request.PreferredName),
                ["date_of_birth"] = request.DateOfBirth?.Date,
                ["gender"] = CleanOptional(request.Gender),
                ["personal_address"] = CleanOptional(request.PersonalAddress),
                ["address_street"] = CleanOptional(request.AddressStreet),
                ["address_city"] = CleanOptional(request.AddressCity),
                ["address_state"] = CleanOptional(request.AddressState),
                ["address_postal_code"] = CleanOptional(request.AddressPostalCode),
                ["address_country"] = CleanOptional(request.AddressCountry),
                ["emergency_contact_name"] = CleanOptional(request.EmergencyContactName),
                ["emergency_relationship"] = CleanOptional(request.EmergencyRelationship),
                ["emergency_phone_number"] = CleanOptional(request.EmergencyPhoneNumber),
                ["emergency_email"] = CleanEmail(request.EmergencyEmail),
                ["emergency_address"] = CleanOptional(request.EmergencyAddress),
                ["updated_at"] = DateTime.UtcNow
            };

            await PostRestRowsAsync<object>(
                "user_names?on_conflict=id",
                new[] { payload },
                "resolution=merge-duplicates");

            await SyncLinkedEmployeeProfileAsync(
                normalizedUserId,
                normalizedEmail,
                normalizedFullName,
                CleanOptional(request.PhoneNumber));

            var profile = await GetUserProfileRowAsync(normalizedUserId)
                ?? throw new InvalidOperationException("User profile not found");
            profile.Role = await GetUserRoleAsync(normalizedUserId);
            await EnrichUserInfoWithEmployeeRoleAsync(profile);
            return profile;
        }

        private async Task UpdateAuthUserProfileAsync(string normalizedUserId, string? email, string? fullName)
        {
            if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_supabaseKey))
            {
                throw new InvalidOperationException("Supabase URL or key not configured.");
            }

            var payload = new Dictionary<string, object?>
            {
                ["user_metadata"] = new Dictionary<string, object?>
                {
                    ["full_name"] = fullName
                }
            };

            if (!string.IsNullOrWhiteSpace(email))
            {
                payload["email"] = email;
                payload["email_confirm"] = true;
            }

            var client = _httpClientFactory.CreateClient();
            var url = $"{_supabaseUrl.TrimEnd('/')}/auth/v1/admin/users/{Uri.EscapeDataString(normalizedUserId)}";

            using var request = new HttpRequestMessage(HttpMethod.Put, url);
            request.Headers.Add("apikey", _supabaseKey);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _supabaseKey);
            request.Content = JsonContent.Create(payload);

            using var response = await client.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"Supabase auth update failed with status {(int)response.StatusCode}: {body}");
            }
        }

        private async Task SyncLinkedEmployeeProfileAsync(
            string normalizedUserId,
            string? email,
            string? fullName,
            string? phoneNumber)
        {
            var linkedEmployee = await GetLinkedEmployeeRoleInfoAsync(normalizedUserId, null);
            if (linkedEmployee == null)
            {
                return;
            }

            var parts = (fullName ?? string.Empty)
                .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            var firstName = parts.FirstOrDefault();
            var lastName = parts.Length > 1 ? string.Join(' ', parts.Skip(1)) : null;

            var payload = new Dictionary<string, object?>
            {
                ["email"] = email,
                ["phone_number"] = phoneNumber,
                ["updated_at"] = DateTime.UtcNow
            };

            if (!string.IsNullOrWhiteSpace(firstName))
            {
                payload["first_name"] = firstName;
            }
            if (!string.IsNullOrWhiteSpace(lastName))
            {
                payload["last_name"] = lastName;
            }

            await PatchRestRowsAsync<object>(
                $"ess_rostering_employees?id=eq.{linkedEmployee.Id:D}",
                payload);
        }

        public async Task DeleteAppUserAsync(string userId)
        {
            if (!TryNormalizeUserId(userId, out var normalizedUserId))
            {
                throw new ArgumentException("Invalid user ID", nameof(userId));
            }

            await DeleteAuthUserAsync(normalizedUserId);
            await DeleteUserMetadataAsync(Guid.Parse(normalizedUserId));
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
