using Microsoft.AspNetCore.Mvc;
using ESSDesign.Server.Models;
using ESSDesign.Server.Services;
using Supabase.Gotrue;
using Supabase.Gotrue.Responses;

namespace ESSDesign.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
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
                var confirmationRedirect = $"{frontendUrl}/?auth=signup-success&email={Uri.EscapeDataString(request.Email)}";
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

                return Ok(new AuthResponse
                {
                    AccessToken = string.Empty,
                    RefreshToken = string.Empty,
                    User = BuildUserInfo(generatedLink, request.FullName, role)
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
                var session = await _supabase.Auth.SignIn(request.Email, request.Password);

                if (session?.User == null)
                {
                    return Unauthorized(new { error = "Invalid credentials" });
                }

                var fullName = session.User.UserMetadata?.ContainsKey("full_name") == true
                    ? session.User.UserMetadata["full_name"]?.ToString() ?? string.Empty
                    : string.Empty;
                var role = await _supabaseService.EnsureUserRoleAsync(session.User.Id);

                return Ok(new AuthResponse
                {
                    AccessToken = session.AccessToken ?? string.Empty,
                    RefreshToken = session.RefreshToken ?? string.Empty,
                    User = BuildUserInfo(session.User, fullName, role)
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Signin error");
                return Unauthorized(new { error = "Invalid email or password" });
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

            return new UserInfo
            {
                Id = user.Id,
                Email = user.Email ?? string.Empty,
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
    }
}
