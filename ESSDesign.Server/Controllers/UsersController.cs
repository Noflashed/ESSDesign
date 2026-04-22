using Microsoft.AspNetCore.Mvc;
using ESSDesign.Server.Models;
using ESSDesign.Server.Services;

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

                var users = await _supabaseService.GetAllUsersAsync();
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
    }
}
