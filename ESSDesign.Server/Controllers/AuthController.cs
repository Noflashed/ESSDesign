using Microsoft.AspNetCore.Mvc;
using ESSDesign.Server.Models;
using ESSDesign.Server.Services;
using Supabase.Gotrue;

namespace ESSDesign.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly Supabase.Client _supabase;
        private readonly SupabaseService _supabaseService;
        private readonly ILogger<AuthController> _logger;

        public AuthController(Supabase.Client supabase, SupabaseService supabaseService, ILogger<AuthController> logger)
        {
            _supabase = supabase;
            _supabaseService = supabaseService;
            _logger = logger;
        }

        [HttpPost("signup")]
        public async Task<ActionResult<AuthResponse>> SignUp([FromBody] SignUpRequest request)
        {
            try
            {
                var session = await _supabase.Auth.SignUp(request.Email, request.Password, new SignUpOptions
                {
                    Data = new Dictionary<string, object>
                    {
                        { "full_name", request.FullName }
                    }
                });

                if (session?.User == null)
                {
                    return BadRequest(new { error = "Failed to create account" });
                }

                try
                {
                    await _supabaseService.UpsertUserNameAsync(session.User.Id, session.User.Email ?? request.Email, request.FullName);
                }
                catch (Exception nameEx)
                {
                    _logger.LogWarning(nameEx, "Failed to upsert user_names for {UserId} - trigger should handle it", session.User.Id);
                }

                return Ok(new AuthResponse
                {
                    AccessToken = session.AccessToken ?? string.Empty,
                    RefreshToken = session.RefreshToken ?? string.Empty,
                    User = BuildUserInfo(session.User, request.FullName)
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Signup error");
                return StatusCode(500, new { error = ex.Message });
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

                return Ok(new AuthResponse
                {
                    AccessToken = session.AccessToken ?? string.Empty,
                    RefreshToken = session.RefreshToken ?? string.Empty,
                    User = BuildUserInfo(session.User, fullName)
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Signin error");
                return Unauthorized(new { error = "Invalid email or password" });
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

        [HttpGet("user")]
        public ActionResult<UserInfo> GetCurrentUser()
        {
            try
            {
                var user = _supabase.Auth.CurrentUser;

                if (user == null)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                var fullName = user.UserMetadata?.ContainsKey("full_name") == true
                    ? user.UserMetadata["full_name"]?.ToString() ?? string.Empty
                    : string.Empty;

                return Ok(BuildUserInfo(user, fullName));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Get user error");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        private static UserInfo BuildUserInfo(User user, string? fallbackFullName = null)
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
                    GetMetadataValue(user, "profile_image_url")
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
