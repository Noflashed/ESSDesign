using Microsoft.AspNetCore.Mvc;
using ESSDesign.Server.Models;
using ESSDesign.Server.Services;
using System.Net.Mail;

namespace ESSDesign.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class UsersController : ControllerBase
    {
        private readonly SupabaseService _supabaseService;
        private readonly ILogger<UsersController> _logger;

        public UsersController(SupabaseService supabaseService, ILogger<UsersController> logger)
        {
            _supabaseService = supabaseService;
            _logger = logger;
        }

        [HttpGet]
        public async Task<ActionResult> GetAllUsers()
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                if (!string.Equals(currentUser.Role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase))
                {
                    return StatusCode(StatusCodes.Status403Forbidden, new { error = "Admin access required" });
                }

                var users = await _supabaseService.GetAllUsersAsync(includeProfileDetails: true);
                return Ok(users);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting users");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPut("{userId}/role")]
        public async Task<ActionResult<UserInfo>> UpdateUserRole(string userId, [FromBody] UpdateUserRoleRequest request)
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                if (!string.Equals(currentUser.Role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase))
                {
                    return StatusCode(StatusCodes.Status403Forbidden, new { error = "Admin access required" });
                }

                var normalizedRole = request.Role?.Trim().ToLowerInvariant();
                if (!AppRoles.All.Contains(normalizedRole ?? ""))
                {
                    return BadRequest(new { error = $"Invalid role. Must be one of: {string.Join(", ", AppRoles.All)}" });
                }

                var updatedUser = await _supabaseService.UpdateUserRoleAsync(userId, normalizedRole);
                return Ok(updatedUser);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating role for {UserId}", userId);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPut("{userId}")]
        public async Task<ActionResult<UserInfo>> UpdateUser(string userId, [FromBody] UpdateUserRequest request)
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                if (!string.Equals(currentUser.Role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase))
                {
                    return StatusCode(StatusCodes.Status403Forbidden, new { error = "Admin access required" });
                }

                if (!string.IsNullOrWhiteSpace(request.Role))
                {
                    var normalizedRole = request.Role.Trim().ToLowerInvariant();
                    if (!AppRoles.All.Contains(normalizedRole))
                    {
                        return BadRequest(new { error = $"Invalid role. Must be one of: {string.Join(", ", AppRoles.All)}" });
                    }
                }

                var updatedUser = await _supabaseService.UpdateAppUserAsync(userId, request.FullName, request.Role, request.PhoneNumber);
                return Ok(updatedUser);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating user {UserId}", userId);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPut("me")]
        public async Task<ActionResult<UserInfo>> UpdateMyProfile([FromBody] UpdateMyProfileRequest request)
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                if (string.IsNullOrWhiteSpace(request.FullName))
                {
                    return BadRequest(new { error = "Full name is required" });
                }

                if (string.IsNullOrWhiteSpace(request.Email) || !IsValidEmailAddress(request.Email))
                {
                    return BadRequest(new { error = "A valid email address is required" });
                }

                if (!string.IsNullOrWhiteSpace(request.EmergencyEmail) && !IsValidEmailAddress(request.EmergencyEmail))
                {
                    return BadRequest(new { error = "Emergency contact email address is invalid" });
                }

                var updatedUser = await _supabaseService.UpdateMyProfileAsync(currentUser.Id, request);
                return Ok(updatedUser);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating current user profile");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("me/profile-image")]
        [RequestSizeLimit(8 * 1024 * 1024)]
        public async Task<ActionResult> UploadMyProfileImage([FromForm] IFormFile file)
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                if (file == null || file.Length == 0)
                {
                    return BadRequest(new { error = "Profile image file is required" });
                }

                if (!file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
                {
                    return BadRequest(new { error = "Profile image must be an image file" });
                }

                var profileImageUrl = await _supabaseService.UploadProfileImageAsync(currentUser.Id, file);
                return Ok(new { profileImageUrl });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error uploading current user profile image");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("me/credentials")]
        [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
        public async Task<ActionResult<List<EmployeeCredentialResponse>>> GetMyCredentials()
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                return Ok(await _supabaseService.GetEmployeeCredentialsAsync(currentUser.Id));
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting current user credentials");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("{userId}/credentials")]
        [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
        public async Task<ActionResult<List<EmployeeCredentialResponse>>> GetUserCredentials(string userId)
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                var isOwner = string.Equals(currentUser.Id, userId, StringComparison.OrdinalIgnoreCase);
                var isAdmin = string.Equals(currentUser.Role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase);
                if (!isOwner && !isAdmin)
                {
                    return StatusCode(StatusCodes.Status403Forbidden, new { error = "You do not have access to these credentials" });
                }

                return Ok(await _supabaseService.GetEmployeeCredentialsAsync(userId));
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting credentials for {UserId}", userId);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPut("me/credentials/{credentialType}")]
        [Consumes("multipart/form-data")]
        [RequestSizeLimit(11 * 1024 * 1024)]
        [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
        public async Task<ActionResult<EmployeeCredentialResponse>> UpsertMyCredential(
            string credentialType,
            [FromForm] UpsertEmployeeCredentialRequest request)
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                if (!EmployeeCredentialTypes.All.Contains(credentialType))
                {
                    return BadRequest(new { error = "Credential type must be white_card, driver_licence or high_risk_work_licence" });
                }

                if (string.IsNullOrWhiteSpace(request.CredentialNumber))
                {
                    return BadRequest(new { error = "Credential number is required" });
                }

                if (request.FrontImage?.Length > 10 * 1024 * 1024)
                {
                    return BadRequest(new { error = "Credential image must not exceed 10 MB" });
                }

                if (request.IssueDate.HasValue && request.ExpiryDate.HasValue && request.ExpiryDate.Value.Date < request.IssueDate.Value.Date)
                {
                    return BadRequest(new { error = "Expiry date cannot be earlier than issue date" });
                }

                var credential = await _supabaseService.UpsertEmployeeCredentialAsync(currentUser.Id, credentialType, request);
                return Ok(credential);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error saving {CredentialType} for current user", credentialType);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpDelete("{userId}")]
        public async Task<ActionResult> DeleteUser(string userId)
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                if (!string.Equals(currentUser.Role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase))
                {
                    return StatusCode(StatusCodes.Status403Forbidden, new { error = "Admin access required" });
                }

                await _supabaseService.DeleteAppUserAsync(userId);
                return Ok(new { message = "User deleted successfully" });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting user {UserId}", userId);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpDelete("employees/{employeeId}")]
        public async Task<ActionResult> DeleteEmployee(string employeeId)
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                if (!string.Equals(currentUser.Role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase))
                {
                    return StatusCode(StatusCodes.Status403Forbidden, new { error = "Admin access required" });
                }

                if (!Guid.TryParse(employeeId, out var employeeGuid))
                {
                    return BadRequest(new { error = "Invalid employee ID" });
                }

                await _supabaseService.DeleteEmployeeAndAuthAsync(employeeGuid);
                return Ok(new { message = "Employee deleted successfully" });
            }
            catch (InvalidOperationException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting employee {EmployeeId}", employeeId);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("notification-recipients")]
        public async Task<ActionResult> GetNotificationRecipients()
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                var allUsers = await _supabaseService.GetAllUsersAsync();
                var recipients = allUsers
                    .Where(u => AppRoles.NotificationRecipientRoles.Contains(u.Role ?? ""))
                    .ToList();
                return Ok(recipients);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting notification recipients");
                return StatusCode(500, new { error = ex.Message });
            }
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
    }
}
