using Microsoft.AspNetCore.Mvc;
using ESSDesign.Server.Models;
using ESSDesign.Server.Services;
using Supabase.Gotrue;
using Supabase.Gotrue.Responses;
using System.Text.RegularExpressions;

namespace ESSDesign.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private const string TruckDeviceEmailDomain = "ess-trucks.local";
        private readonly Supabase.Client _supabase;
        private readonly SupabaseService _supabaseService;
        private readonly EmailService _emailService;
        private readonly ILogger<AuthController> _logger;
        private readonly IConfiguration _configuration;

        public AuthController(
            Supabase.Client supabase,
            SupabaseService supabaseService,
            EmailService emailService,
            ILogger<AuthController> logger,
            IConfiguration configuration)
        {
            _supabase = supabase;
            _supabaseService = supabaseService;
            _emailService = emailService;
            _logger = logger;
            _configuration = configuration;
        }

        [HttpPost("signup")]
        public async Task<ActionResult<AuthResponse>> SignUp([FromBody] SignUpRequest request)
        {
            try
            {
                var serviceRoleKey = _configuration["Supabase:ServiceRoleKey"];
                if (string.IsNullOrWhiteSpace(serviceRoleKey))
                {
                    _logger.LogError("Signup error: Supabase service role key is not configured");
                    return StatusCode(500, new { error = "Signup is not configured correctly." });
                }

                var frontendUrl = (_configuration["AppSettings:FrontendUrl"] ?? "https://essdesign.app").TrimEnd('/');
                var confirmationRedirect = $"{frontendUrl}/?auth=signup-confirmed&email={Uri.EscapeDataString(request.Email)}";
                if (request.EmployeeId.HasValue)
                {
                    confirmationRedirect += $"&employeeId={request.EmployeeId.Value:D}";
                }
                var adminAuth = _supabase.AdminAuth(serviceRoleKey);

                var generatedLink = await adminAuth.GenerateLink(new GenerateLinkOptions(GenerateLinkOptions.LinkType.SignUp, request.Email)
                {
                    Password = request.Password,
                    RedirectTo = confirmationRedirect,
                    Data = new Dictionary<string, object>
                    {
                        { "full_name", request.FullName }
                    }
                });

                if (generatedLink == null || string.IsNullOrWhiteSpace(generatedLink.Id) || string.IsNullOrWhiteSpace(generatedLink.ActionLink))
                {
                    return BadRequest(new { error = "Failed to create account" });
                }

                try
                {
                    await _supabaseService.UpsertUserNameAsync(generatedLink.Id, generatedLink.Email ?? request.Email, request.FullName);
                    await _supabaseService.EnsureUserRoleAsync(generatedLink.Id);
                }
                catch (Exception nameEx)
                {
                    _logger.LogWarning(nameEx, "Failed to initialize user profile records for {UserId}", generatedLink.Id);
                }

                await _emailService.SendRegistrationConfirmationAsync(request.Email, request.FullName, generatedLink.ActionLink);

                var role = await _supabaseService.EnsureUserRoleAsync(generatedLink.Id);

                var userInfo = BuildUserInfo(generatedLink, request.FullName, role);
                await _supabaseService.EnrichUserInfoWithEmployeeRoleAsync(userInfo);

                return Ok(new AuthResponse
                {
                    AccessToken = string.Empty,
                    RefreshToken = string.Empty,
                    User = userInfo
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Signup error");
                var errorMessage = ex.Message ?? "Failed to create account";
                if (errorMessage.Contains("already registered", StringComparison.OrdinalIgnoreCase) ||
                    errorMessage.Contains("already been registered", StringComparison.OrdinalIgnoreCase) ||
                    errorMessage.Contains("user already registered", StringComparison.OrdinalIgnoreCase))
                {
                    return Conflict(new { error = "An account already exists for this email. Please sign in instead." });
                }

                return StatusCode(500, new { error = errorMessage });
            }
        }

        [HttpPost("signin")]
        public async Task<ActionResult<AuthResponse>> SignIn([FromBody] SignInRequest request)
        {
            try
            {
                var identifier = string.IsNullOrWhiteSpace(request.Identifier)
                    ? request.Email
                    : request.Identifier;
                var signInEmail = NormalizeSignInIdentifier(identifier);
                var session = await _supabase.Auth.SignIn(signInEmail, request.Password);

                if (session?.User == null)
                {
                    return Unauthorized(new { error = "Invalid credentials" });
                }

                var fullName = session.User.UserMetadata?.ContainsKey("full_name") == true
                    ? session.User.UserMetadata["full_name"]?.ToString() ?? string.Empty
                    : string.Empty;
                await _supabaseService.UpsertUserNameAsync(session.User.Id, session.User.Email ?? signInEmail, fullName);
                var role = await _supabaseService.EnsureUserRoleAsync(session.User.Id);
                await _supabaseService.SyncEmployeeLinkForUserAsync(session.User.Id, session.User.Email ?? signInEmail);

                var userInfo = BuildUserInfo(session.User, fullName, role);
                await _supabaseService.EnrichUserInfoWithEmployeeRoleAsync(userInfo);

                return Ok(new AuthResponse
                {
                    AccessToken = session.AccessToken ?? string.Empty,
                    RefreshToken = session.RefreshToken ?? string.Empty,
                    User = userInfo
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Signin error");
                return Unauthorized(new { error = "Invalid email or password" });
            }
        }

        [HttpPost("create-device-user")]
        public async Task<ActionResult<UserInfo>> CreateDeviceUser([FromBody] CreateDeviceUserRequest request)
        {
            try
            {
                var currentUser = await GetCurrentUserFromRequestAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                if (!string.Equals(currentUser.Role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase))
                {
                    return StatusCode(StatusCodes.Status403Forbidden, new { error = "Admin access required" });
                }

                var normalizedRole = request.Role?.Trim().ToLowerInvariant() ?? string.Empty;
                var allowedDeviceRoles = new[]
                {
                    AppRoles.TruckEss01,
                    AppRoles.TruckEss02,
                    AppRoles.TruckEss03,
                };

                if (!allowedDeviceRoles.Contains(normalizedRole, StringComparer.OrdinalIgnoreCase))
                {
                    return BadRequest(new { error = "Truck device role must be one of: truck_ess01, truck_ess02, truck_ess03" });
                }

                var normalizedDeviceId = NormalizeDeviceId(request.DeviceId);
                if (string.IsNullOrWhiteSpace(normalizedDeviceId))
                {
                    return BadRequest(new { error = "Device ID is required" });
                }

                if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Trim().Length < 6)
                {
                    return BadRequest(new { error = "Password must be at least 6 characters" });
                }

                var fullName = string.IsNullOrWhiteSpace(request.FullName)
                    ? normalizedDeviceId
                    : request.FullName.Trim();

                var createdUser = await _supabaseService.CreateTruckDeviceUserAsync(
                    normalizedDeviceId,
                    fullName,
                    request.Password.Trim(),
                    normalizedRole);

                return Ok(createdUser);
            }
            catch (InvalidOperationException ex)
            {
                return Conflict(new { error = ex.Message });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Create truck device user error");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("invite")]
        public async Task<ActionResult> InviteUser([FromBody] InviteUserRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.Email))
                {
                    return BadRequest(new { error = "Email is required" });
                }

                var currentUser = await GetCurrentUserFromRequestAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                if (!string.Equals(currentUser.Role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase))
                {
                    return StatusCode(StatusCodes.Status403Forbidden, new { error = "Admin access required" });
                }

                await _emailService.SendUserInviteAsync(request.Email.Trim(), currentUser.FullName ?? currentUser.Email);
                return Ok(new { message = "Invite email sent successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Invite user error");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("invite-employee")]
        public async Task<ActionResult> InviteEmployee([FromBody] InviteEmployeeRequest request)
        {
            try
            {
                if (request.EmployeeId == Guid.Empty)
                {
                    return BadRequest(new { error = "Employee is required" });
                }

                var email = request.Email?.Trim().ToLowerInvariant() ?? string.Empty;
                if (string.IsNullOrWhiteSpace(email))
                {
                    return BadRequest(new { error = "Email is required" });
                }

                var currentUser = await GetCurrentUserFromRequestAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                if (!string.Equals(currentUser.Role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase))
                {
                    return StatusCode(StatusCodes.Status403Forbidden, new { error = "Admin access required" });
                }

                var employee = await _supabaseService.GetEmployeeAuthLinkInfoAsync(request.EmployeeId);
                if (employee == null)
                {
                    return NotFound(new { error = "Employee not found" });
                }

                await _supabaseService.UpdateEmployeeInviteAsync(request.EmployeeId, email);
                await _emailService.SendEmployeeInviteAsync(
                    email,
                    currentUser.FullName ?? currentUser.Email,
                    request.EmployeeId,
                    string.IsNullOrWhiteSpace(request.FirstName) ? employee.FirstName : request.FirstName.Trim(),
                    string.IsNullOrWhiteSpace(request.LastName) ? employee.LastName : request.LastName.Trim());

                return Ok(new { message = "Employee invite sent successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Invite employee error");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("link-employee")]
        public async Task<ActionResult> LinkEmployee([FromBody] LinkEmployeeRequest request)
        {
            try
            {
                if (request.EmployeeId == Guid.Empty)
                {
                    return BadRequest(new { error = "Employee is required" });
                }

                var currentUser = await GetCurrentUserFromRequestAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                var employee = await _supabaseService.GetEmployeeAuthLinkInfoAsync(request.EmployeeId);
                if (employee == null)
                {
                    return NotFound(new { error = "Employee not found" });
                }

                if (string.IsNullOrWhiteSpace(employee.Email))
                {
                    return BadRequest(new { error = "Employee does not have an email address." });
                }

                if (!string.Equals(employee.Email.Trim(), currentUser.Email.Trim(), StringComparison.OrdinalIgnoreCase))
                {
                    return BadRequest(new { error = "This signed-in user does not match the employee email address." });
                }

                await _supabaseService.LinkEmployeeAuthUserAsync(request.EmployeeId, currentUser.Email, currentUser.Id);
                return Ok(new { message = "Employee account linked successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Link employee error");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("sync-employee-links")]
        public async Task<ActionResult> SyncEmployeeLinks()
        {
            try
            {
                var currentUser = await GetCurrentUserFromRequestAsync();
                if (currentUser == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                if (!string.Equals(currentUser.Role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase))
                {
                    return StatusCode(StatusCodes.Status403Forbidden, new { error = "Admin access required" });
                }

                var synced = await _supabaseService.SyncEmployeeAuthLinksAsync();
                return Ok(new { synced });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Sync employee links error");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("signout")]
        public async Task<ActionResult> SignOut()
        {
            try
            {
                await _supabase.Auth.SignOut();
                return Ok(new { message = "Signed out successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Signout error");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("refresh")]
        public async Task<ActionResult<AuthResponse>> Refresh([FromBody] RefreshSessionRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.RefreshToken))
                {
                    return Unauthorized(new { error = "Refresh token is required" });
                }

                var session = await _supabaseService.RefreshAuthSessionAsync(request.RefreshToken);
                if (session == null)
                {
                    return Unauthorized(new { error = "Session refresh failed" });
                }

                if (!string.IsNullOrWhiteSpace(session.User.Email) && session.User.Email.Contains('@'))
                {
                    await _supabaseService.UpsertUserNameAsync(
                        session.User.Id,
                        session.User.Email,
                        session.User.FullName);
                    await _supabaseService.SyncEmployeeLinkForUserAsync(session.User.Id, session.User.Email);
                }

                await _supabaseService.EnrichUserInfoWithEmployeeRoleAsync(session.User);
                return Ok(session);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Refresh session error");
                return Unauthorized(new { error = "Session refresh failed" });
            }
        }

        [HttpGet("user")]
        public async Task<ActionResult<UserInfo>> GetCurrentUser()
        {
            try
            {
                var user = await GetCurrentUserFromRequestAsync();
                if (user == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                if (!string.IsNullOrWhiteSpace(user.Email) && user.Email.Contains('@'))
                {
                    await _supabaseService.UpsertUserNameAsync(user.Id, user.Email, user.FullName);
                    await _supabaseService.SyncEmployeeLinkForUserAsync(user.Id, user.Email);
                }

                await _supabaseService.EnrichUserInfoWithEmployeeRoleAsync(user);
                return Ok(user);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Get user error");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        private async Task<UserInfo?> GetCurrentUserFromRequestAsync()
        {
            var authorizationHeader = Request.Headers.Authorization.ToString();
            if (string.IsNullOrWhiteSpace(authorizationHeader) || !authorizationHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            var accessToken = authorizationHeader.Substring("Bearer ".Length).Trim();
            return await _supabaseService.GetAuthUserInfoFromAccessTokenAsync(accessToken);
        }

        private static UserInfo BuildUserInfo(User user, string? fallbackFullName, string role)
        {
            var fullName = !string.IsNullOrWhiteSpace(fallbackFullName)
                ? fallbackFullName
                : GetMetadataValue(user, "full_name");

            var publicIdentifier = ToPublicIdentifier(user.Email);

            return new UserInfo
            {
                Id = user.Id,
                Email = publicIdentifier,
                FullName = fullName ?? string.Empty,
                AvatarUrl =
                    GetMetadataValue(user, "avatar_url") ??
                    GetMetadataValue(user, "picture") ??
                    GetMetadataValue(user, "profile_image") ??
                    GetMetadataValue(user, "profile_image_url"),
                Role = role
            };
        }

        private static string? GetMetadataValue(User user, string key)
        {
            if (user.UserMetadata?.ContainsKey(key) == true)
            {
                return user.UserMetadata[key]?.ToString();
            }

            return null;
        }

        private static string NormalizeSignInIdentifier(string? identifier)
        {
            var trimmed = identifier?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(trimmed))
            {
                return string.Empty;
            }

            if (trimmed.Contains('@', StringComparison.Ordinal))
            {
                return trimmed.ToLowerInvariant();
            }

            return $"{NormalizeDeviceId(trimmed)}@{TruckDeviceEmailDomain}";
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
    }
}
